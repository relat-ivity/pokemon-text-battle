/**
 * VGC 双打规则专用 LLM AI 对战系统
 * 专门处理 VGC 双打格式的决策逻辑
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { AIPlayer } from '../ai-player';
import { Dex } from 'pokemon-showdown/dist/sim/dex';
import { Translator } from '../../support/translator';
import { DamageCalculator } from '../../support/damage-calculator';
import { LLMProvider } from './llm_provider';
import type {
	SwitchRequest,
	TeamPreviewRequest,
	MoveRequest
} from 'pokemon-showdown/dist/sim/side';

interface AnyObject { [k: string]: any }

interface OpponentPokemon {
	name: string;
	condition?: string;
	active?: boolean;
	boosts?: { [stat: string]: number };
	moves?: string[];
	ability?: string;
	item?: string;
	status?: string;
	terastallized?: boolean;
	teraType?: string;
	slot?: number; // 位置索引（0 或 1）
}

/**
 * VGC 双打专用 LLM AI Player
 * 与单打 LLMAIPlayer 分离，专门处理双打决策
 */
export class DoublesLLMAIPlayer extends AIPlayer {
	private readonly llmProvider: LLMProvider;
	private readonly translator: Translator;
	private lastRequest: SwitchRequest | TeamPreviewRequest | MoveRequest | null = null;
	private opponentTeamSlots: (OpponentPokemon | null)[] = [null, null]; // 对手场上两个位置
	private opponentTeam: { [name: string]: OpponentPokemon } = {}; // 按名称追踪
	private teamData: any[] | null = null;
	private opponentTeamData: any[] | null = null;

	// debug设置 (从环境变量读取)
	private debugmode: boolean;
	private aiResponseLogMode: boolean;

	// 场地状态跟踪
	private weather: string | null = null;
	private terrain: string | null = null;
	private pseudoWeather: Set<string> = new Set();
	private mySideConditions: Set<string> = new Set();
	private opponentSideConditions: Set<string> = new Set();

	// 太晶化状态跟踪
	private myTerastallizedPokemon: string | null = null;
	private myTeraType: string | null = null;
	private opponentTerastallizedPokemon: string | null = null;
	private opponentTeraType: string | null = null;

	// 作弊功能
	private cheatProbability: number = 0.5;
	private playerChoice: string | null = null;
	private playerTeamOrder: string | null = null;
	private playerChoiceResolver: (() => void) | null = null;
	private playerTeamOrderResolver: (() => void) | null = null;

	// 历史记录（只记录每回合的操作）
	private battleHistory: Array<{ turn: number; state: string }> = [];
	private currentTurn: number = 0;
	private maxHistoryTurns: number = 3; // 只保留最近3回合

	// 开场首发记录
	private myStartingPokemon: string[] = []; // 我方开场首发
	private opponentStartingPokemon: string[] = []; // 对手开场首发
	private hasRecordedStarting: boolean = false; // 是否已记录开场首发

	// 待处理的请求（等待 |turn| 消息后处理）
	private pendingRequest: MoveRequest | null = null;

	constructor(
		playerStream: any,
		llmProvider: LLMProvider,
		teamData: any[] | null = null,
		opponentTeamData: any[] | null = null,
		debug = false // 传给Showdown SDK调试参数
	) {
		super(playerStream, debug);
		this.llmProvider = llmProvider;
		this.translator = Translator.getInstance();
		this.teamData = teamData;
		this.opponentTeamData = opponentTeamData;

		const cheatProb = parseFloat(process.env.AI_CHEAT_PROBABILITY || '0.5');
		this.cheatProbability = isNaN(cheatProb) ? 0.5 : Math.max(0, Math.min(1, cheatProb));

		// 从环境变量读取调试设置
		this.debugmode = process.env.AI_DEBUG === 'true';
		this.aiResponseLogMode = process.env.AI_RESPONSE_LOG === 'true';
	}

	setPlayerChoice(choice: string): void {
		this.playerChoice = choice;
		if (this.playerChoiceResolver) {
			this.playerChoiceResolver();
			this.playerChoiceResolver = null;
		}
	}

	setPlayerTeamOrder(order: string): void {
		this.playerTeamOrder = order;

		if (this.opponentTeamData && order && order.length >= 1) {
			const originalTeamData = [...this.opponentTeamData];
			const reorderedTeamData: any[] = [];

			for (let i = 0; i < order.length; i++) {
				const digit = parseInt(order[i]);
				if (!isNaN(digit) && digit >= 1 && digit <= originalTeamData.length) {
					reorderedTeamData.push(originalTeamData[digit - 1]);
				}
			}

			if (reorderedTeamData.length === originalTeamData.length) {
				this.opponentTeamData = reorderedTeamData;
			}
		}

		if (this.playerTeamOrderResolver) {
			this.playerTeamOrderResolver();
			this.playerTeamOrderResolver = null;
		}
	}

	setCheatProbability(probability: number): void {
		this.cheatProbability = Math.max(0, Math.min(1, probability));
	}

	private shouldCheat(): boolean {
		return Math.random() < this.cheatProbability;
	}

	private waitForPlayerChoice(): Promise<void> {
		return new Promise(resolve => {
			if (this.playerChoice !== null) {
				resolve();
			} else {
				this.playerChoiceResolver = resolve;
			}
		});
	}

	private waitForPlayerTeamOrder(): Promise<void> {
		return new Promise(resolve => {
			if (this.playerTeamOrder !== null) {
				resolve();
			} else {
				this.playerTeamOrderResolver = resolve;
			}
		});
	}

	override receive(message: string): void {
		super.receive(message);
		const lines = message.split('\n');
		for (const line of lines) {
			this.parseFieldMessage(line);
		}
	}

	/**
	 * 添加回合历史记录
	 */
	private addToHistory(action: string): void {
		if (!action) return;

		// 如果当前回合已有记录，追加到 state；否则新建
		const existingIndex = this.battleHistory.findIndex(h => h.turn === this.currentTurn);
		if (existingIndex >= 0) {
			this.battleHistory[existingIndex].state += ` | ${action}`;
		} else {
			// 只在回合数大于0时才创建新记录（排除开场首发）
			if (this.currentTurn > 0) {
				this.battleHistory.push({
					turn: this.currentTurn,
					state: action
				});
			}
		}

		// 只保留最近 N 回合（保留开场首发，回合0）
		while (this.battleHistory.length > this.maxHistoryTurns + 1) {
			// 查找并删除最旧的非开场首发记录
			const oldestNonStartingIndex = this.battleHistory.findIndex(h => h.turn > 0);
			if (oldestNonStartingIndex >= 0) {
				this.battleHistory.splice(oldestNonStartingIndex, 1);
			} else {
				break;
			}
		}
	}

	/**
	 * 获取历史记录的文本描述
	 */
	private getHistoryText(): string {
		if (this.battleHistory.length === 0) {
			return '';
		}

		let historyText = '\n【对战历史】\n';
		this.battleHistory.forEach(h => {
			if (h.turn === 0) {
				// 开场首发显示
				historyText += `${h.state}\n`;
			} else {
				// 正常回合
				const stateText = h.state || '(未记录)';
				historyText += `回合${h.turn}: ${stateText}\n`;
			}
		});
		return historyText;
	}

	/**
	 * 解析战斗消息，更新场地状态（AI 是 p2，对手是 p1）
	 */
	private parseFieldMessage(line: string): void {
		const parts = line.split('|').filter(p => p);
		if (parts.length === 0) return;

		const cmd = parts[0];

		// 回合数更新
		if (cmd === 'turn') {
			this.currentTurn = parseInt(parts[1] || '0');
			return;
		}

		// 记录招式使用
		if (cmd === 'move') {
			const ident = parts[1];
			if (ident) {
				const moveName = parts[2];
				if (moveName) {
					const moveCN = this.translate(moveName, 'moves');
					const speciesName = ident.split(': ')[1];
					const speciesCN = this.translate(speciesName, 'pokemon');
					const slotName = ident.charAt(2) === 'a' ? '左侧' : '右侧';
					const player = ident.startsWith('p1') ? '对手的' : '我方的';
					const action = `${player}${slotName}${speciesCN}使用${moveCN}`;
					// 记录到历史
					this.addToHistory(action);
				}
			}
		}

		// 记录主动切换 (switch) 和被动换人 (drag)
		if (cmd === 'switch' || cmd === 'drag') {
			const ident = parts[1];
			if (ident) {
				const speciesName = ident.split(': ')[1];
				const speciesCN = this.translate(speciesName, 'pokemon');
				const slotName = ident.charAt(2) === 'a' ? '左侧' : '右侧';
				const player = ident.startsWith('p1') ? '对手的' : '我方的';
				const actionType = cmd === 'drag' ? '被迫换上' : '切换至';
				const action = `${player}${slotName}${actionType}${speciesCN}`;
				// 记录到历史
				this.addToHistory(action);
			}
		}

		// 记录宝可梦倒下
		if (cmd === 'faint') {
			const ident = parts[1];
			if (ident) {
				const speciesName = ident.split(': ')[1];
				const speciesCN = this.translate(speciesName, 'pokemon');
				const slotName = ident.charAt(2) === 'a' ? '左侧' : '右侧';
				const player = ident.startsWith('p1') ? '对手的' : '我方的';
				const action = `${player}${slotName}${speciesCN}倒下`;
				// 记录到历史
				this.addToHistory(action);
			}
		}

		// 天气
		if (cmd === '-weather') {
			const weather = parts[1];
			this.weather = (weather === 'none' || !weather) ? null : weather;
		}

		// 场地条件
		else if (cmd === '-fieldstart') {
			const condition = parts[1];
			if (condition) {
				const effectName = condition.startsWith('move: ') ? condition.substring(6) : condition;
				const terrainNames = ['Electric Terrain', 'Grassy Terrain', 'Misty Terrain', 'Psychic Terrain'];
				if (terrainNames.includes(effectName)) {
					this.terrain = effectName;
				} else {
					this.pseudoWeather.add(effectName);
				}
			}
		}

		else if (cmd === '-fieldend') {
			const condition = parts[1];
			if (condition) {
				const effectName = condition.startsWith('move: ') ? condition.substring(6) : condition;
				const terrainNames = ['Electric Terrain', 'Grassy Terrain', 'Misty Terrain', 'Psychic Terrain'];
				if (terrainNames.includes(effectName)) {
					this.terrain = null;
				} else {
					this.pseudoWeather.delete(effectName);
				}
			}
		}

		// 场地效果
		else if (cmd === '-sidestart') {
			const side = parts[1];
			const condition = parts[2];
			if (condition) {
				const conditionName = condition.startsWith('move: ') ? condition.substring(6) : condition;
				if (side === 'p2') {
					this.mySideConditions.add(conditionName);
				} else if (side === 'p1') {
					this.opponentSideConditions.add(conditionName);
				}
			}
		}

		else if (cmd === '-sideend') {
			const side = parts[1];
			const condition = parts[2];
			if (condition) {
				const conditionName = condition.startsWith('move: ') ? condition.substring(6) : condition;
				if (side === 'p2') {
					this.mySideConditions.delete(conditionName);
				} else if (side === 'p1') {
					this.opponentSideConditions.delete(conditionName);
				}
			}
		}

		// 对手宝可梦出战（双打：p1a 和 p1b）
		else if (cmd === 'switch' || cmd === 'drag') {
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const condition = parts[3] || '100/100';
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				// 记录开场首发（回合0或未开始时）
				if (!this.hasRecordedStarting && this.currentTurn === 0) {
					const speciesCN = this.translate(speciesName, 'pokemon');
					const slotName = slot === 0 ? '左侧' : '右侧';
					this.opponentStartingPokemon.push(`${slotName}${speciesCN}`);
				}

				// 更新按位置追踪
				this.opponentTeamSlots[slot] = {
					name: speciesName,
					condition: condition,
					active: true,
					boosts: {},
					slot: slot
				};

				// 更新按名称追踪
				if (!this.opponentTeam[this.normalizeSpeciesName(speciesName)]) {
					this.opponentTeam[this.normalizeSpeciesName(speciesName)] = {
						name: speciesName,
						condition: condition,
						active: true,
						boosts: {},
						slot: slot
					};
				} else {
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].condition = condition;
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].active = true;
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].boosts = {};
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].slot = slot;
				}
			}
			// 记录我方开场首发
			else if (ident && ident.startsWith('p2')) {
				const speciesName = ident.split(': ')[1];
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				// 记录开场首发（回合0或未开始时）
				if (!this.hasRecordedStarting && this.currentTurn === 0) {
					const speciesCN = this.translate(speciesName, 'pokemon');
					const slotName = slot === 0 ? '左侧' : '右侧';
					this.myStartingPokemon.push(`${slotName}${speciesCN}`);

					// 当收集齐双方开场首发后，创建历史记录
					if (this.myStartingPokemon.length === 2 && this.opponentStartingPokemon.length === 2) {
						const myStarting = this.myStartingPokemon.join(' + ');
						const opponentStarting = this.opponentStartingPokemon.join(' + ');
						this.battleHistory.push({
							turn: 0,
							state: `我方首发: ${myStarting} | 对方首发: ${opponentStarting}`
						});
						this.hasRecordedStarting = true;
					}
				}
			}
		}

		// HP 变化
		else if (cmd === '-damage' || cmd === '-heal') {
			const ident = parts[1];
			const condition = parts[2];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				if (this.opponentTeam[this.normalizeSpeciesName(speciesName)]) {
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].condition = condition;
				}
				if (this.opponentTeamSlots[slot]) {
					this.opponentTeamSlots[slot]!.condition = condition;
				}
			}
		}

		// 倒下
		else if (cmd === 'faint') {
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				if (this.opponentTeam[this.normalizeSpeciesName(speciesName)]) {
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].condition = '0 fnt';
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].active = false;
				}
				this.opponentTeamSlots[slot] = null;
			}
		}

		// 能力提升
		else if (cmd === '-boost') {
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const stat = parts[2];
				const amount = parseInt(parts[3] || '1');
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				if (this.opponentTeam[this.normalizeSpeciesName(speciesName)]) {
					if (!this.opponentTeam[this.normalizeSpeciesName(speciesName)].boosts) {
						this.opponentTeam[this.normalizeSpeciesName(speciesName)].boosts = {};
					}
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].boosts![stat] =
						(this.opponentTeam[this.normalizeSpeciesName(speciesName)].boosts![stat] || 0) + amount;
				}
				if (this.opponentTeamSlots[slot]) {
					if (!this.opponentTeamSlots[slot]!.boosts) {
						this.opponentTeamSlots[slot]!.boosts = {};
					}
					this.opponentTeamSlots[slot]!.boosts![stat] =
						(this.opponentTeamSlots[slot]!.boosts![stat] || 0) + amount;
				}
			}
		}

		// 能力下降
		else if (cmd === '-unboost') {
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const stat = parts[2];
				const amount = parseInt(parts[3] || '1');
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				if (this.opponentTeam[this.normalizeSpeciesName(speciesName)]) {
					if (!this.opponentTeam[this.normalizeSpeciesName(speciesName)].boosts) {
						this.opponentTeam[this.normalizeSpeciesName(speciesName)].boosts = {};
					}
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].boosts![stat] =
						(this.opponentTeam[this.normalizeSpeciesName(speciesName)].boosts![stat] || 0) - amount;
				}
				if (this.opponentTeamSlots[slot]) {
					if (!this.opponentTeamSlots[slot]!.boosts) {
						this.opponentTeamSlots[slot]!.boosts = {};
					}
					this.opponentTeamSlots[slot]!.boosts![stat] =
						(this.opponentTeamSlots[slot]!.boosts![slot] || 0) - amount;
				}
			}
		}

		// 能力清除
		else if (cmd === '-clearboost' || cmd === '-clearallboost') {
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				if (this.opponentTeam[this.normalizeSpeciesName(speciesName)]) {
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].boosts = {};
				}
				if (this.opponentTeamSlots[slot]) {
					this.opponentTeamSlots[slot]!.boosts = {};
				}
			}
		}

		// 状态异常
		else if (cmd === '-status') {
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const status = parts[2];
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				if (this.opponentTeam[this.normalizeSpeciesName(speciesName)]) {
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].status = status;
				}
				if (this.opponentTeamSlots[slot]) {
					this.opponentTeamSlots[slot]!.status = status;
				}
			}
		}

		// 治愈状态
		else if (cmd === '-curestatus') {
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				if (this.opponentTeam[this.normalizeSpeciesName(speciesName)]) {
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].status = undefined;
				}
				if (this.opponentTeamSlots[slot]) {
					this.opponentTeamSlots[slot]!.status = undefined;
				}
			}
		}

		// 道具丢失
		else if (cmd === '-enditem') {
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				if (this.opponentTeam[this.normalizeSpeciesName(speciesName)]) {
					this.opponentTeam[this.normalizeSpeciesName(speciesName)].item = undefined;
				}
				if (this.opponentTeamSlots[slot]) {
					this.opponentTeamSlots[slot]!.item = undefined;
				}
			}
		}

		// 太晶化
		else if (cmd === '-terastallize') {
			const ident = parts[1];
			const teraType = parts[2];

			if (ident && teraType) {
				const speciesName = ident.split(': ')[1];
				const slotChar = ident.charAt(2);
				const slot = slotChar === 'a' ? 0 : slotChar === 'b' ? 1 : 0;

				if (ident.startsWith('p1')) {
					// 对手太晶化
					if (this.opponentTeam[this.normalizeSpeciesName(speciesName)]) {
						this.opponentTeam[this.normalizeSpeciesName(speciesName)].terastallized = true;
						this.opponentTeam[this.normalizeSpeciesName(speciesName)].teraType = teraType;
					}
					if (this.opponentTeamSlots[slot]) {
						this.opponentTeamSlots[slot]!.terastallized = true;
						this.opponentTeamSlots[slot]!.teraType = teraType;
					}
					this.opponentTerastallizedPokemon = speciesName;
					this.opponentTeraType = teraType;
				} else if (ident.startsWith('p2')) {
					// 我方太晶化
					this.myTerastallizedPokemon = speciesName;
					this.myTeraType = teraType;
				}
			}
		}
	}

	protected override handleForceSwitchRequest(request: SwitchRequest): void {
		this.lastRequest = request;
		this.handleForceSwitchAsync(request).catch(error => {
			console.error('AI操作失败，使用默认操作。', error);
			this.choose('default');
		});
	}

	protected override handleTeamPreviewRequest(request: TeamPreviewRequest): void {
		this.lastRequest = request;
		this.handleTeamPreviewAsync(request).catch(error => {
			console.error('AI操作失败，使用默认操作。', error);
			this.choose('default');
		});
	}

	protected override handleActiveTurnRequest(request: MoveRequest): void {
		this.lastRequest = request;
		this.pendingRequest = request;

		// 延迟到下一个 tick 处理，确保 |turn| 消息先被处理
		process.nextTick(() => {
			if (this.pendingRequest) {
				const req = this.pendingRequest;
				this.pendingRequest = null;
				this.handleActiveAsync(req).catch(error => {
					console.error('AI操作失败，使用默认操作。', error);
					this.choose('default');
				});
			}
		});
	}

	private async handleTeamPreviewAsync(request: TeamPreviewRequest): Promise<void> {
		if (!request.side || !request.side.pokemon) {
			console.error('❌ 无法获取队伍信息，使用默认操作');
			this.choose('default');
			return;
		}

		const choice = await this.chooseTeamPreviewWithAI(request);
		if (choice) {
			this.choose(choice);
		} else {
			console.error('❌ AI选择首发失败，使用默认操作');
			this.choose('default');
		}
	}

	private async handleForceSwitchAsync(request: SwitchRequest): Promise<void> {
		const pokemon = request.side.pokemon;
		const chosen: number[] = [];
		const choices: string[] = [];

		// 计算需要切换的位置数量
		const needSwitchCount = request.forceSwitch.filter(s => s).length;

		// 获取所有可用的后备宝可梦
		const allAvailable = this.range(1, 6).filter(j => (
			pokemon[j - 1] &&
			j > request.forceSwitch.length &&
			!pokemon[j - 1].condition.endsWith(` fnt`)
		));

		// 优化：如果需要切换的数量等于可用宝可梦数量，直接按顺序分配，无需AI
		if (needSwitchCount === allAvailable.length && needSwitchCount > 0) {
			let availableIndex = 0;
			for (let i = 0; i < request.forceSwitch.length; i++) {
				if (request.forceSwitch[i]) {
					choices.push(`switch ${allAvailable[availableIndex]}`);
					availableIndex++;
				} else {
					choices.push('pass');
				}
			}
			this.choose(choices.join(', '));
			return;
		}

		// 串行处理每个切换请求，避免同时选择同一只宝可梦
		for (let i = 0; i < request.forceSwitch.length; i++) {
			const mustSwitch = request.forceSwitch[i];

			if (!mustSwitch) {
				choices.push('pass');
				continue;
			}

			const canSwitch = this.range(1, 6).filter(j => (
				pokemon[j - 1] &&
				j > request.forceSwitch.length &&
				!chosen.includes(j) &&
				!pokemon[j - 1].condition.endsWith(` fnt`) === !pokemon[i].reviving
			));

			if (!canSwitch.length) {
				choices.push('pass');
				continue;
			}

			// 优化：如果只有一个可选宝可梦，直接选择，不需要调用AI
			if (canSwitch.length === 1) {
				const target = canSwitch[0];
				chosen.push(target);
				choices.push(`switch ${target}`);
				continue;
			}

			// 需要AI决策
			const switchOptions = canSwitch.map(slot => ({ slot, pokemon: pokemon[slot - 1] }));
			const target = await this.chooseSwitchWithAI(switchOptions, request);
			chosen.push(target);
			choices.push(`switch ${target}`);
		}

		this.choose(choices.join(', '));
	}

	/**
	 * 双打专用：处理正常回合
	 * 同时为两个位置做决策
	 */
	private async handleActiveAsync(request: MoveRequest): Promise<void> {
		this.playerChoice = null;

		let [canMegaEvo, canUltraBurst, canZMove, canDynamax, canTerastallize] = [true, true, true, true, true];
		const pokemon = request.side.pokemon;

		// 作弊模式
		let playerChoiceInfo: string | null = null;
		if (this.cheatProbability > 0) {
			await this.waitForPlayerChoice();
			if (this.shouldCheat() && this.playerChoice !== null) {
				playerChoiceInfo = this.playerChoice;
			}
		}

		// 收集两个位置的选项
		const positionData: Array<{
			active: AnyObject;
			pokemon: AnyObject;
			moves: { choice: string, move: AnyObject }[];
			switches: { slot: number, pokemon: AnyObject }[];
			canTerastallize: boolean;
			positionIndex: number;
		}> = [];

		for (let i = 0; i < request.active.length; i++) {
			const active = request.active[i];
			if (pokemon[i].condition.endsWith(` fnt`) || pokemon[i].commanding) {
				positionData.push({
					active,
					pokemon: pokemon[i],
					moves: [],
					switches: [],
					canTerastallize: false,
					positionIndex: i
				});
				continue;
			}

			canMegaEvo = canMegaEvo && !!active.canMegaEvo;
			canUltraBurst = canUltraBurst && !!active.canUltraBurst;
			canZMove = canZMove && !!active.canZMove;
			canDynamax = canDynamax && !!active.canDynamax;
			canTerastallize = canTerastallize && !!active.canTerastallize;

			const useMaxMoves = (!active.canDynamax && active.maxMoves);
			const possibleMoves = useMaxMoves && active.maxMoves ? active.maxMoves.maxMoves : active.moves;

			let canMove = this.range(1, possibleMoves.length).filter(j => (
				!possibleMoves[j - 1].disabled
			)).map(j => ({
				slot: j,
				move: possibleMoves[j - 1].move,
				target: possibleMoves[j - 1].target,
				zMove: false,
			}));

			if (canZMove && active.canZMove) {
				canMove.push(...this.range(1, active.canZMove.length)
					.filter(j => active.canZMove && active.canZMove[j - 1])
					.map(j => ({
						slot: j,
						move: active.canZMove![j - 1].move,
						target: active.canZMove![j - 1].target,
						zMove: true,
					})));
			}

			const hasAlly = pokemon.length > 1 && !pokemon[i ^ 1].condition.endsWith(` fnt`);
			const filtered = canMove.filter(m => m.target !== `adjacentAlly` || hasAlly);
			canMove = filtered.length ? filtered : canMove;

			const moves = canMove.map(m => {
				let move = `move ${m.slot}`;
				if (request.active.length > 1) {
					if ([`normal`, `any`, `adjacentFoe`].includes(m.target)) {
						move += ` 1`;
					}
					if (m.target === `adjacentAlly`) {
						move += ` -${(i ^ 1) + 1}`;
					}
					if (m.target === `adjacentAllyOrSelf`) {
						if (hasAlly) {
							move += ` -1`;
						} else {
							move += ` -${i + 1}`;
						}
					}
				}
				if (m.zMove) move += ` zmove`;
				return { choice: move, move: m };
			});

			// 收集可切换的宝可梦，排除已经被其他位置选择的
			const usedSlots = positionData.map(p => p.switches.map(s => s.slot)).flat();
			const canSwitch = this.range(1, 6).filter(j => (
				pokemon[j - 1] &&
				!pokemon[j - 1].active &&
				!usedSlots.includes(j) &&
				!pokemon[j - 1].condition.endsWith(` fnt`)
			));

			const switchOptions = (active.trapped || canSwitch.length === 0) ? [] : canSwitch.map(slot => ({ slot, pokemon: pokemon[slot - 1] }));

			positionData.push({
				active,
				pokemon: pokemon[i],
				moves,
				switches: switchOptions,
				canTerastallize: !!active.canTerastallize && canTerastallize && this.myTerastallizedPokemon === null,
				positionIndex: i
			});
		}

		// 同时为两个位置做决策
		const choices = await this.chooseBothPositionsWithAI(positionData, request, playerChoiceInfo);
		this.choose(choices.join(', '));
	}

	private async chooseSwitchWithAI(
		switches: { slot: number, pokemon: AnyObject }[],
		request: SwitchRequest
	): Promise<number> {
		if (switches.length === 0) {
			throw new Error('没有可切换的宝可梦');
		}

		if (switches.length === 1) {
			return switches[0].slot;
		}

		try {
			const battleState = this.buildBattleState(request);
			let actions = '【可切换的宝可梦】\n';

			switches.forEach((s) => {
				const speciesName = s.pokemon.ident.split(': ')[1];
				const speciesCN = this.translate(speciesName, 'pokemon');
				const speciesData = Dex.species.get(speciesName);
				const condition = s.pokemon.condition || '未知';

				actions += `\n${s.slot}. ${speciesCN}`;
				if (speciesData.types) {
					const typesCN = speciesData.types.map((t: string) => this.translate(t, 'types'));
					actions += ` [${typesCN.join('/')}]`;
				}
				actions += ` HP:${condition}`;
				if (s.pokemon.status) actions += ` [${this.translate(s.pokemon.status, 'status')}]`;

				// 显示特性
				if (s.pokemon.baseAbility) {
					const abilityData = Dex.abilities.get(s.pokemon.baseAbility);
					const abilityCN = this.translate(abilityData.name, 'abilities');
					actions += ` 特性:${abilityCN}`;
					if (abilityData.shortDesc) {
						actions += ` (${abilityData.shortDesc})`;
					}
				}

				// 显示道具
				if (s.pokemon.item) {
					const itemData = Dex.items.get(s.pokemon.item);
					const itemCN = this.translate(itemData.name, 'items');
					actions += ` 道具:${itemCN}`;
				}

				// 显示所有招式
				if (s.pokemon.moves && s.pokemon.moves.length > 0) {
					actions += '\n  招式: ';
					const moveDescriptions = s.pokemon.moves.map((moveName: string) => {
						const moveData = Dex.moves.get(moveName);
						const moveCN = this.translate(moveData.name, 'moves');
						const typeCN = this.translate(moveData.type, 'types');
						const categoryCN = this.translate(moveData.category, 'category');
						let moveDesc = `${moveCN}[${typeCN}/${categoryCN}`;
						if (moveData.basePower) {
							moveDesc += `/威力:${moveData.basePower}`;
						}
						moveDesc += `]`;
						if (moveData.shortDesc) {
							moveDesc += ` (${moveData.shortDesc})`;
						}
						return moveDesc;
					});
					actions += '\n    • ' + moveDescriptions.join('\n    • ');
				}

				actions += '\n';
			});

			const historyText = this.getHistoryText();
			const prompt = `当前要切换宝可梦。指令格式：switch X（X为宝可梦编号）
【VGC双打考虑因素】
1. 【**关键**】属性克制：注意对手双方的属性和招式
2. 联防：能否与队友形成联防体系
3. 速度控制：能否抢到场面节奏
4. HP状况和异常状态
${battleState}${actions}${historyText}`;

			const systemPrompt = this.getVGCSystemPrompt();
			const aiResponse = await this.callLLM(prompt, systemPrompt);

			if (aiResponse) {
				const parsed = this.parseAIResponse(aiResponse);
				if (parsed && parsed.type === 'switch') {
					const targetSwitch = switches.find(s => s.slot === parsed.index + 1);
					if (targetSwitch) {
						return targetSwitch.slot;
					}
				}
			}

			console.error('❌ AI返回无效切换指令');
			throw new Error('AI返回无效切换指令');
		} catch (error) {
			console.error('❌ AI切换选择失败:', error);
			throw error;
		}
	}

	/**
	 * VGC 双打专用队伍预览
	 */
	private async chooseTeamPreviewWithAI(request: TeamPreviewRequest): Promise<string | null> {
		if (!this.lastRequest) return null;
		console.log('\n等待AI选择首发宝可梦（VGC双打）...');

		let playerTeamInfo: string | null = null;
		if (this.cheatProbability > 0) {
			await this.waitForPlayerTeamOrder();
			if (this.shouldCheat() && this.playerTeamOrder !== null) {
				playerTeamInfo = this.playerTeamOrder;
			}
		}

		try {
			const battleState = this.buildBattleState(request, true);

			// 生成队伍简要列表（单行显示）
			let teamSummary = '';
			if (request.side && request.side.pokemon) {
				const pokemonNames = request.side.pokemon.map((p: any, i: number) => {
					const speciesName = p.details ? p.details.split(',')[0].trim() : p.ident.split(': ')[1];
					const speciesCN = this.translate(speciesName, 'pokemon');
					return `${i + 1}.${speciesCN}`;
				});
				teamSummary = pokemonNames.join(' ');
			}

			let extraInfo = '';
			if (this.shouldCheat() && playerTeamInfo) {
				// 从 playerTeamInfo 中解析出对手的首发宝可梦（前两位数字）
				const firstPokemon = parseInt(playerTeamInfo.charAt(0));
				const secondPokemon = parseInt(playerTeamInfo.charAt(1));
				const back = playerTeamInfo.split('').slice(2).join(', ');
				extraInfo += `【重要情报】对方的选择是${firstPokemon}号和${secondPokemon}号宝可梦，后排宝可梦编号是：${back}！\n`;
			}

			const historyText = this.getHistoryText();
			const prompt = `当前要设置VGC双打队伍首发，请按出战顺序选择4只参战，前两只为双打首发，。指令格式：team 1234（示例中编号为1和2的两只是首发）。
${battleState}
【队伍选择】你的队伍编号是：${teamSummary}
${extraInfo}`;

			const systemPrompt = this.getVGCSystemPrompt();
			const aiResponse = await this.callLLM(prompt, systemPrompt);

			if (aiResponse) {
				const parsed = this.parseAIResponse(aiResponse);
				if (parsed && parsed.type === 'team' && parsed.team) {
					return `team ${parsed.team}`;
				}
			}
		} catch (error) {
			console.error('AI队伍预览失败:', error);
		}
		return null;
	}

	/**
	 * VGC 双打专用：同时为两个位置选择动作
	 */
	private async chooseBothPositionsWithAI(
		positionData: Array<{
			active: AnyObject;
			pokemon: AnyObject;
			moves: { choice: string, move: AnyObject }[];
			switches: { slot: number, pokemon: AnyObject }[];
			canTerastallize: boolean;
			positionIndex: number;
		}>,
		request: MoveRequest,
		playerChoiceInfo: string | null = null
	): Promise<string[]> {
		if (!this.lastRequest) {
			console.error('❌ 无法获取请求信息');
			return positionData.map(p => p.moves.length > 0 ? p.moves[0].choice : 'pass');
		}

		try {
			const battleState = this.buildBattleState(this.lastRequest);
			let prompt = '';

			// 首先显示对手在场宝可梦的详细信息
			const opponentActivePokemon = Object.values(this.opponentTeam).filter(p => p.active);
			if (opponentActivePokemon.length > 0) {
				prompt += '\n【对手当前在场宝可梦】\n';
				opponentActivePokemon.forEach((oppPokemon) => {
					const slotName = oppPokemon.slot === 0 ? '左侧' : '右侧';
					const oppSpeciesName = oppPokemon.name;
					const oppSpeciesCN = this.translate(oppSpeciesName, 'pokemon');
					const oppSpeciesData = Dex.species.get(oppSpeciesName);

					// 尝试从 opponentTeamData 获取完整数据
					let fullPokemonData = null;
					if (this.opponentTeamData) {
						fullPokemonData = this.opponentTeamData.find(mon =>
							this.isPokemonSame(mon.species, oppSpeciesName)
						);
					}

					prompt += `\n${slotName} - ${oppSpeciesCN}`;

					// 属性
					if (oppSpeciesData.types) {
						const typesCN = oppSpeciesData.types.map((t: string) => this.translate(t, 'types'));
						prompt += ` [${typesCN.join('/')}]`;
					}

					// HP 信息
					if (oppPokemon.condition) {
						prompt += ` HP:${oppPokemon.condition}`;
					}

					// 特性（优先使用完整数据，否则使用已知信息）
					const abilityName = fullPokemonData?.ability || oppPokemon.ability;
					if (abilityName) {
						const abilityData = Dex.abilities.get(abilityName);
						const abilityCN = this.translate(abilityData.name, 'abilities');
						prompt += ` 特性:${abilityCN}`;
						if (abilityData.shortDesc) {
							prompt += ` (${abilityData.shortDesc})`;
						}
					}

					// 道具（优先使用完整数据，否则使用已知信息）
					const itemName = fullPokemonData?.item || oppPokemon.item;
					if (itemName) {
						const itemData = Dex.items.get(itemName);
						const itemCN = this.translate(itemData.name, 'items');
						prompt += ` 道具:${itemCN}`;
					}

					// 太晶化状态
					if (oppPokemon.terastallized) {
						const teraTypeCN = oppPokemon.teraType ? this.translate(oppPokemon.teraType, 'types') : '未知';
						prompt += ` [已太晶化:${teraTypeCN}]`;
					}

					// 招式（优先显示完整数据，否则显示已知招式）
					const movesToShow = fullPokemonData?.moves || oppPokemon.moves;
					if (movesToShow && movesToShow.length > 0) {
						const moveLabel = fullPokemonData?.moves ? '招式' : '已知招式';
						prompt += `\n  ${moveLabel}:`;
						const movesList = movesToShow.map((moveName: string) => {
							const moveData = Dex.moves.get(moveName);
							const moveCN = this.translate(moveData.name, 'moves');
							const typeCN = this.translate(moveData.type, 'types');
							const categoryCN = this.translate(moveData.category, 'category');
							let moveDesc = `${moveCN}[${typeCN}/${categoryCN}`;
							if (moveData.basePower) {
								moveDesc += `/威力:${moveData.basePower}`;
							}
							if (moveData.accuracy !== true && moveData.accuracy) {
								moveDesc += `/命中:${moveData.accuracy}`;
							}
							moveDesc += `]`;
							if (moveData.shortDesc) {
								moveDesc += ` (${moveData.shortDesc})`;
							}
							return moveDesc;
						});
						prompt += '\n    • ' + movesList.join('\n    • ');
					}

					prompt += '\n';
				});
				prompt += '\n';
			}

			// 构建两个位置的选项
			prompt += '【我方当前在场宝可梦 - 可用操作】\n';
			positionData.forEach((data, index) => {
				const positionName = index === 0 ? '左侧位置' : '右侧位置';
				const speciesName = data.pokemon.ident.split(': ')[1];
				const speciesCN = this.translate(speciesName, 'pokemon');
				const speciesData = Dex.species.get(speciesName);

				prompt += `\n【${positionName} - ${speciesCN}】\n`;

				// 显示当前宝可梦的详细信息
				if (speciesData.types) {
					const typesCN = speciesData.types.map((t: string) => this.translate(t, 'types'));
					prompt += `  属性: [${typesCN.join('/')}]`;
				}

				const condition = data.pokemon.condition || '未知';
				if (condition.includes('fnt')) {
					prompt += ` [已倒下]`;
				} else {
					const hpMatch = condition.match(/(\d+)\/(\d+)/);
					if (hpMatch) {
						const current = parseInt(hpMatch[1]);
						const max = parseInt(hpMatch[2]);
						const percent = Math.round((current / max) * 100);
						prompt += ` HP:${percent}%`;
					}
				}

				if (data.pokemon.baseAbility) {
					const abilityData = Dex.abilities.get(data.pokemon.baseAbility);
					const abilityCN = this.translate(abilityData.name, 'abilities');
					prompt += ` 特性:${abilityCN}`;
					if (abilityData.shortDesc) {
						prompt += ` (${abilityData.shortDesc})`;
					}
				}

				if (data.pokemon.item) {
					const itemData = Dex.items.get(data.pokemon.item);
					const itemCN = this.translate(itemData.name, 'items');
					prompt += ` 道具:${itemCN}`;
				}

				// 显示所有招式及其详细描述
				if (data.pokemon.moves && data.pokemon.moves.length > 0) {
					prompt += `\n  持有招式:\n`;
					data.pokemon.moves.forEach((moveName: string) => {
						const moveData = Dex.moves.get(moveName);
						const moveCN = this.translate(moveData.name, 'moves');
						const typeCN = this.translate(moveData.type, 'types');
						const categoryCN = this.translate(moveData.category, 'category');
						prompt += `    • ${moveCN} [${typeCN}/${categoryCN}`;
						if (moveData.basePower) {
							prompt += `/威力:${moveData.basePower}`;
						}
						if (moveData.accuracy !== true && moveData.accuracy) {
							prompt += `/命中:${moveData.accuracy}`;
						}
						prompt += `]`;
						if (moveData.shortDesc) {
							prompt += ` - ${moveData.shortDesc}`;
						}
						prompt += '\n';
					});
				}

				prompt += '\n';

				if (data.moves.length === 0 && data.switches.length === 0) {
					prompt += '  无可用操作\n';
					return;
				}

				// 招式选项
				if (data.moves.length > 0) {
					prompt += '可用操作 - 使用招式（目标: 1=对手左侧, 2=对手右侧, -1=己方左侧, -2=己方右侧）:\n';
					data.moves.forEach((m) => {
						const moveData = Dex.moves.get(m.move.move);
						const moveCN = this.translate(moveData.name, 'moves');
						prompt += `  ${m.choice}: ${moveCN}`;
						if (m.move.zMove) {
							prompt += ' [Z招式]';
						}
						prompt += '\n';
					});
				}

				// 切换选项
				if (data.switches.length > 0) {
					prompt += '切换宝可梦:\n';
					data.switches.forEach((s) => {
						const switchSpeciesName = s.pokemon.ident.split(': ')[1];
						const switchSpeciesCN = this.translate(switchSpeciesName, 'pokemon');
						const speciesData = Dex.species.get(switchSpeciesName);
						const condition = s.pokemon.condition || '未知';

						prompt += `  switch ${s.slot}: ${switchSpeciesCN}`;
						if (speciesData.types) {
							const typesCN = speciesData.types.map((t: string) => this.translate(t, 'types'));
							prompt += ` [${typesCN.join('/')}]`;
						}
						prompt += ` HP:${condition}`;
						if (s.pokemon.status) prompt += ` [${s.pokemon.status}]`;
						prompt += '\n';
					});
				}

				if (data.canTerastallize) {
					prompt += '提示: 可以太晶化（在招式后加 terastallize）\n';
				}
			});

			let extraInfo = '';
			if (playerChoiceInfo) {
				const translatedChoice = this.translatePlayerChoice(playerChoiceInfo, request);
				extraInfo += `【重要情报】对手的操作：${translatedChoice}\n`;
			}

			const historyText = this.getHistoryText();

			// 计算伤害（传入作弊信息以预测对手换人）
			const damageCalculation = this.calculateAllDamagesForDoubles(request, playerChoiceInfo);

			const finalPrompt = `请同时为两个位置选择动作。格式：position1: <动作1>, position2: <动作2>
例如：position1: move 1 1, position2: switch 3

${battleState}${prompt}${historyText}
${extraInfo}`;

			const fullPrompt = damageCalculation ? `${finalPrompt}\n${damageCalculation}` : finalPrompt;
			const systemPrompt = this.getVGCSystemPrompt();
			const aiResponse = await this.callLLM(fullPrompt, systemPrompt);

			if (aiResponse) {
				const parsed = this.parseBothPositionsResponse(aiResponse);
				if (parsed && parsed.length === positionData.length) {
					const choices: string[] = [];
					for (let i = 0; i < positionData.length; i++) {
						const data = positionData[i];
						const decision = parsed[i];

						if (data.moves.length === 0 && data.switches.length === 0) {
							choices.push('pass');
							continue;
						}

						if (decision.type === 'move' && data.moves[decision.index]) {
							let choice = data.moves[decision.index].choice;
							if (decision.terastallize && data.canTerastallize) {
								choice += ' terastallize';
							}
							choices.push(choice);
						} else if (decision.type === 'switch' && data.switches.length > 0) {
							const targetSwitch = data.switches.find(s => s.slot === decision.index + 1);
							if (targetSwitch) {
								choices.push(`switch ${targetSwitch.slot}`);
							} else {
								choices.push(data.moves.length > 0 ? data.moves[0].choice : 'pass');
							}
						} else {
							choices.push(data.moves.length > 0 ? data.moves[0].choice : 'pass');
						}
					}
					return choices;
				}
			}

			console.error('❌ AI返回无效指令:', aiResponse);
			// 降级：使用第一个可用选项
			return positionData.map(p => p.moves.length > 0 ? p.moves[0].choice : 'pass');
		} catch (error) {
			console.error('❌ AI决策失败:', error);
			return positionData.map(p => p.moves.length > 0 ? p.moves[0].choice : 'pass');
		}
	}

	/**
	 * 构建战场状态描述（VGC双打专用）
	 */
	private buildBattleState(request: SwitchRequest | TeamPreviewRequest | MoveRequest, isTeamPreview: boolean = false): string {
		let state = isTeamPreview ? '=== VGC 双打队伍预览 ===\n' : '=== VGC 双打战场状态 ===\n';

		if (!('side' in request) || !request.side || !request.side.pokemon) {
			return state + '（无法获取战场信息）\n';
		}

		// 场地信息
		if (!isTeamPreview) {
			let fieldInfo = '';

			if (this.weather) {
				const weatherCN = this.translate(this.weather, 'weathers');
				fieldInfo += `   天气: ${weatherCN}\n`;
			}

			if (this.terrain) {
				const terrainCN = this.translate(this.terrain, 'terrains');
				fieldInfo += `   场地: ${terrainCN}\n`;
			}

			if (this.pseudoWeather.size > 0) {
				const effects = Array.from(this.pseudoWeather).map(e => this.translate(e, 'moves')).join(', ');
				fieldInfo += `   全场效果: ${effects}\n`;
			}

			if (this.mySideConditions.size > 0) {
				const effects = Array.from(this.mySideConditions).map(e => this.translate(e, 'moves')).join(', ');
				fieldInfo += `   我方场地: ${effects}\n`;
			}

			if (this.opponentSideConditions.size > 0) {
				const effects = Array.from(this.opponentSideConditions).map(e => this.translate(e, 'moves')).join(', ');
				fieldInfo += `   对手场地: ${effects}\n`;
			}

			if (fieldInfo) {
				state += '【场地状态】\n' + fieldInfo + '\n';
			}
		}

		// 我方队伍信息
		state += '【我方队伍】\n';
		request.side.pokemon.forEach((p: any, i: number) => {
			// 从 details 字段获取完整的种类名称（包含形态），格式：'Species-Form, L50, M/F'
			const speciesName = p.details ? p.details.split(',')[0].trim() : p.ident.split(': ')[1];
			const speciesCN = this.translate(speciesName, 'pokemon');
			const speciesData = Dex.species.get(speciesName);
			let pokemonData: AnyObject | undefined = undefined;
			if (this.teamData) {
				pokemonData = this.teamData.find(mon => this.isPokemonSame(mon.species, speciesName));
			}

			state += `${i + 1}.${speciesCN}`;

			if (!isTeamPreview && p.active) state += ' [当前出战]';

			if (speciesData.types) {
				const typesCN = speciesData.types.map((t: string) => this.translate(t, 'types'));
				state += ` ${isTeamPreview ? '' : '属性:'}[${typesCN.join('/')}]`;
			}

			if (!isTeamPreview && p.condition) {
				const condition = p.condition.toString();
				if (condition.includes('fnt')) {
					state += ' [已倒下]';
				} else {
					const hpMatch = condition.match(/(\d+)\/(\d+)/);
					if (hpMatch) {
						const current = parseInt(hpMatch[1]);
						const max = parseInt(hpMatch[2]);
						const percent = Math.round((current / max) * 100);
						state += ` HP:${percent}%`;

						const statusMatch = condition.match(/\s+(\w+)$/);
						if (statusMatch) {
							const status = statusMatch[1];
							state += ` [${this.translate(status, 'status') || status}]`;
						}
					}
				}
			}

			if (p.baseAbility) {
				const abilityData = Dex.abilities.get(p.baseAbility);
				const abilityCN = this.translate(abilityData.name, 'abilities');
				state += ` 特性:${abilityCN}`;
			}

			if (p.item) {
				const itemData = Dex.items.get(p.item);
				const itemCN = this.translate(itemData.name, 'items');
				state += ` 道具:${itemCN}`;
			}

			if (pokemonData && speciesData.baseStats && pokemonData.ivs && pokemonData.evs) {
				const speedStat = this.calculateSpeedStat(
					speciesData.baseStats.spe,
					pokemonData.level || 100,
					pokemonData.ivs.spe || 31,
					pokemonData.evs.spe || 0,
					pokemonData.nature || 'hardy'
				);
				state += ` 速度:${speedStat}`;
			}

			if (!isTeamPreview && p.teraType) {
				const teraTypeCN = this.translate(p.teraType, 'types');
				state += ` 太晶:${teraTypeCN}`;

				if (this.myTerastallizedPokemon === speciesName) {
					state += ` [已太晶化]`;
				}
			}

			if (p.moves && p.moves.length > 0) {
				state += ` 招式: `;
				const moveNames = p.moves.slice(0, isTeamPreview ? 4 : undefined).map((moveName: string) => {
					const moveData = Dex.moves.get(moveName);
					const moveCN = this.translate(moveData.name, 'moves');
					return `${moveCN}`;
				});
				state += moveNames.join(', ') + '\n';
			}
		});

		// 对手队伍信息
		state += '【对手队伍】\n';
		if (this.opponentTeamData && this.opponentTeamData.length > 0) {
			this.opponentTeamData.forEach((p: any, i: number) => {
				const speciesName = p.species;
				const speciesCN = this.translate(speciesName, 'pokemon');
				const speciesData = Dex.species.get(speciesName);

				state += `${i + 1}.${speciesCN}`;

				if (!isTeamPreview) {
					const trackedPokemon = this.opponentTeam[this.normalizeSpeciesName(speciesName)];
					if (trackedPokemon && trackedPokemon.active) {
						const slotName = trackedPokemon.slot === 0 ? '左侧' : '右侧';
						state += ` [当前出战-${slotName}]`;
					}
				}

				if (speciesData.types) {
					const typesCN = speciesData.types.map((t: string) => this.translate(t, 'types'));
					state += ` ${isTeamPreview ? '' : '属性:'}[${typesCN.join('/')}]`;
				}

				if (!isTeamPreview) {
					const trackedPokemon = this.opponentTeam[this.normalizeSpeciesName(speciesName)];
					if (trackedPokemon && trackedPokemon.condition) {
						if (trackedPokemon.condition.includes('fnt')) {
							state += ' [已倒下]';
						} else {
							const hpMatch = trackedPokemon.condition.match(/(\d+)\/(\d+)/);
							if (hpMatch) {
								const current = parseInt(hpMatch[1]);
								const max = parseInt(hpMatch[2]);
								const percent = Math.round((current / max) * 100);
								state += ` HP:${percent}%`;
							}
						}
					} else {
						state += ` HP:100%`;
					}

					if (trackedPokemon && trackedPokemon.status) {
						state += ` [${this.translate(trackedPokemon.status, 'status') || trackedPokemon.status}]`;
					}
				}

				if (p.ability) {
					const abilityData = Dex.abilities.get(p.ability);
					const abilityCN = this.translate(abilityData.name, 'abilities');
					state += ` 特性:${abilityCN}`;
				}

				if (p.item) {
					const itemData = Dex.items.get(p.item);
					const itemCN = this.translate(itemData.name, 'items');
					state += ` 道具:${itemCN}`;
				}

				if (speciesData.baseStats && p.ivs && p.evs) {
					const speedStat = this.calculateSpeedStat(
						speciesData.baseStats.spe,
						p.level || 100,
						p.ivs.spe || 31,
						p.evs.spe || 0,
						p.nature || 'hardy'
					);
					state += ` 速度:${speedStat}`;
				}

				if (!isTeamPreview && p.teraType) {
					const teraTypeCN = this.translate(p.teraType, 'types');
					state += ` 太晶:${teraTypeCN}`;

					const trackedPokemon = this.opponentTeam[this.normalizeSpeciesName(speciesName)];
					if (trackedPokemon && trackedPokemon.terastallized) {
						state += ` [已太晶化]`;
					}
				}

				if (p.moves && p.moves.length > 0) {
					state += ` 招式: `;
					const moveNames = p.moves.slice(0, isTeamPreview ? 4 : undefined).map((moveName: string) => {
						const moveData = Dex.moves.get(moveName);
						const moveCN = this.translate(moveData.name, 'moves');
						return `${moveCN}`;
					});
					state += moveNames.join(', ') + '\n';
				}
			});
		} else {
			state += '（暂无对手信息）\n';
		}

		return state;
	}

	/**
	 * VGC 双打专用系统提示词
	 */
	private getVGCSystemPrompt(): string {
		let debugInfo = '';
		if (this.debugmode || this.aiResponseLogMode) {
			debugInfo = '，并在后面加上一句解释这个选择的原因';
		}
		return `你是一名宝可梦VGC双打对战专家，精通双打策略。
【任务】
现在是VGC全球总决赛，你的目标是夺得世界冠军。这是你最后一次参加比赛，每一步都务必谨慎思考。
你需要根据双打战术、克制关系、伤害计算、情报，选择胜率最高的行动方案。
【VGC双打核心策略】
1. 威吓：利用威吓降低对手攻击，压制物攻宝可梦。
2. 保护：预判对手操作进行保护，注意连续保护成功率只有三分之一。广域防守可以让对方的群体伤害技能无效，且可以连续使用，注意无法保护单体伤害技能。
3. 天气和场地：注意天气和场地会影响双方宝可梦伤害，且电场不能睡眠，精神场地先制攻击无效。需要获得场地和天气的控制权。
4. 速度控制：顺风速度翻倍、戏法空间速度慢的先手。
5. 击掌奇袭：击掌奇袭**只有登场的第一回合有效**，注意看历史操作记录，是否为上场的第一回合。
6. 异常状态：麻痹降低对手速度，烧伤削弱物攻宝可梦。
【输出格式】只输出一句指令${debugInfo}
【重要】你有时候可以获得对手的操作，请根据对手的操作信息做出压制。
【对战历史】对战历史可以分析出我方和对方的策略倾向，一定要合理利用。
【伤害计算】我会提供精确的伤害计算结果（满血百分比），**必须使用这些数据**做决策。
`;
	}

	private calculateSpeedStat(baseSpeed: number, level: number, iv: number, ev: number, nature: string): number {
		let stat = Math.floor((Math.floor(0.01 * (2 * baseSpeed + iv + Math.floor(ev / 4)) * level) + 5));

		const natureLower = nature.toLowerCase();
		if (['timid', 'hasty', 'jolly', 'naive'].includes(natureLower)) {
			stat = Math.floor(stat * 1.1);
		} else if (['brave', 'relaxed', 'quiet', 'sassy'].includes(natureLower)) {
			stat = Math.floor(stat * 0.9);
		}

		return stat;
	}

	private async callLLM(prompt: string, systemPrompt: string): Promise<string | null> {
		if (this.debugmode) {
			console.log(`Call ${this.llmProvider.getName()} (VGC): `, systemPrompt, '\n', prompt);
		}

		if (!this.llmProvider.isAvailable()) {
			console.error(`❌ ${this.llmProvider.getName()} API 不可用`);
			return null;
		}

		try {
			const response = await this.llmProvider.callAPI(prompt, systemPrompt);

			if (!response.success) {
				if (this.debugmode) {
					console.error(`${this.llmProvider.getName()} API 调用失败:`, response.error);
				}
				return null;
			}

			return response.content;
		} catch (error) {
			if (this.debugmode) {
				console.error(`${this.llmProvider.getName()} API 调用异常:`, error);
			}
			return null;
		}
	}

	/**
	 * 解析双位置的AI响应
	 * 格式：position1: move 1 1, position2: switch 3
	 */
	private parseBothPositionsResponse(response: string): Array<{ type: string; index: number; terastallize?: boolean }> | null {
		if (this.debugmode || this.aiResponseLogMode) console.log('ParseBothPositionsResponse: ', response);
		if (!response) return null;

		try {
			// 尝试解析格式: position1: <action1>, position2: <action2>
			const position1Match = response.match(/position1:\s*([^,]+)/i);
			const position2Match = response.match(/position2:\s*(.+)/i);

			if (!position1Match || !position2Match) {
				// 如果不是双位置格式，尝试解析为单个动作并用于两个位置
				const singleParsed = this.parseAIResponse(response);
				if (singleParsed) {
					return [singleParsed, singleParsed];
				}
				return null;
			}

			const action1 = position1Match[1].trim();
			const action2 = position2Match[1].trim().replace(/,$/, ''); // 移除可能的末尾逗号

			const parsed1 = this.parseAIResponse(action1);
			const parsed2 = this.parseAIResponse(action2);

			if (!parsed1 || !parsed2) {
				return null;
			}

			return [parsed1, parsed2];
		} catch (error) {
			console.error('解析双位置响应失败:', error);
			return null;
		}
	}

	private parseAIResponse(response: string): { type: string; index: number; terastallize?: boolean; team?: string } | null {
		if (this.debugmode || this.aiResponseLogMode) console.log('ParseAIResponse (VGC): ', response);
		if (!response) return null;

		const moveMatch = response.match(/move\s+(\d+)(\s+\d+)?(\s+terastallize)?/i);
		if (moveMatch) {
			return {
				type: 'move',
				index: parseInt(moveMatch[1]) - 1,
				terastallize: !!moveMatch[3]
			};
		}

		const switchMatch = response.match(/switch\s+(\d+)/i);
		if (switchMatch) {
			return {
				type: 'switch',
				index: parseInt(switchMatch[1]) - 1
			};
		}

		const teamMatch = response.match(/team\s*(\d{1,6})/i);
		if (teamMatch) {
			return {
				type: 'team',
				index: 0,
				team: teamMatch[1]
			};
		}

		return null;
	}

	private translatePlayerChoice(choice: string, request: MoveRequest): string {
		if (!choice) return '未知操作';

		// 检查是否是双打格式（包含逗号分隔的两个动作）
		const doubleChoices = choice.split(',').map(c => c.trim()).filter(c => c);
		if (doubleChoices.length === 2) {
			const translated1 = this.translateSingleChoice(doubleChoices[0], 0);
			const translated2 = this.translateSingleChoice(doubleChoices[1], 1);
			return `【左侧】${translated1} 【右侧】${translated2}`;
		}

		// 单个动作（可能是强制切换时）
		return this.translateSingleChoice(choice, 0);
	}

	private translateSingleChoice(choice: string, positionIndex: number): string {
		if (!choice) return '未知操作';

		const moveMatch = choice.match(/move\s+(\d+)(\s+[+-]?\d+)?(\s+terastallize)?/i);
		if (moveMatch) {
			const moveIndex = parseInt(moveMatch[1]) - 1;
			const target = moveMatch[2] ? moveMatch[2].trim() : '';
			const withTera = !!moveMatch[3];

			// 获取该位置的对手宝可梦和招式详细信息
			let pokemonName = '';
			let moveDetails = '';

			if (this.opponentTeamData && this.opponentTeamData.length > 0) {
				// 从 opponentTeamSlots 获取该位置的宝可梦
				const activePokemon = this.opponentTeamSlots[positionIndex];
				if (activePokemon && activePokemon.name) {
					const pokemonData = this.opponentTeamData.find(p => this.isPokemonSame(p.species, activePokemon.name));
					if (pokemonData) {
						pokemonName = this.translate(activePokemon.name, 'pokemon');
						if (pokemonData.moves && pokemonData.moves[moveIndex]) {
							const moveData = Dex.moves.get(pokemonData.moves[moveIndex]);
							const moveCN = this.translate(moveData.name, 'moves');
							const typeCN = this.translate(moveData.type, 'types');
							const categoryCN = this.translate(moveData.category, 'category');
							moveDetails = `【${moveCN}】（${typeCN}/${categoryCN}`;
							if (moveData.basePower) moveDetails += `/威力${moveData.basePower}`;
							moveDetails += '）';
						}
					}
				}
			}

			let result = pokemonName ? `${pokemonName}` : '对手';
			result += `使用第 ${moveIndex + 1} 个招式`;
			if (moveDetails) result += moveDetails;

			if (target) {
				const targetNum = parseInt(target);
				if (targetNum === 1) result += ' 攻击对手左侧';
				else if (targetNum === 2) result += ' 攻击对手右侧';
				else if (targetNum === -1) result += ' 目标队友';
				else if (targetNum === -2) result += ' 目标自己';
				else result += ` 攻击目标${target}`;
			}
			if (withTera) result += ' 并太晶化';
			return result;
		}

		const switchMatch = choice.match(/switch\s+(\d+)/i);
		if (switchMatch) {
			const switchIndex = parseInt(switchMatch[1]) - 1;
			// 尝试获取要换上的宝可梦名称
			let pokemonName = '';
			if (this.opponentTeamData && this.opponentTeamData[switchIndex]) {
				pokemonName = this.translate(this.opponentTeamData[switchIndex].species, 'pokemon');
			}
			return pokemonName ? `换上${pokemonName}（第 ${switchIndex + 1} 号）` : `换上第 ${switchIndex + 1} 号宝可梦`;
		}

		return `${choice}（无法识别的操作）`;
	}

	/**
	 * 计算双打的伤害
	 * 我方6只对对手在场2只的伤害，对手在场2只对我方6只的伤害
	 * @param playerChoiceInfo 作弊信息，可能包含对手的换人信息
	 */
	private calculateAllDamagesForDoubles(request: MoveRequest, playerChoiceInfo: string | null = null): string | null {
		try {
			// 检查是否有必要的数据
			if (!this.teamData || this.teamData.length === 0) {
				console.log('[Error] calculateAllDamagesForDoubles: 我方队伍数据为空');
				return null;
			}

			if (!this.opponentTeamData || this.opponentTeamData.length === 0) {
				console.log('[Error] calculateAllDamagesForDoubles: 对手队伍数据为空');
				return null;
			}

			// 解析对手的换人信息（如果有作弊信息）
			const switchInfo: Array<{ position: number; slot: number } | null> = [null, null];
			if (playerChoiceInfo) {
				// 双打格式：move 1 1, switch 3 或者 switch 2, switch 4
				const choices = playerChoiceInfo.split(',').map(c => c.trim());
				choices.forEach((choice, index) => {
					const switchMatch = choice.match(/switch\s+(\d+)/i);
					if (switchMatch) {
						const switchSlot = parseInt(switchMatch[1]) - 1;
						switchInfo[index] = { position: index, slot: switchSlot };
					}
				});
			}

			// 获取对手在场的宝可梦（最多2只），如果有换人信息则使用即将上场的宝可梦
			let opponentActivePokemon = Object.values(this.opponentTeam).filter(p => p.active);
			if (opponentActivePokemon.length === 0) {
				console.log('[Error] calculateAllDamagesForDoubles: 没有找到对手在场的宝可梦');
				return null;
			}

			// 替换即将换上的宝可梦
			const opponentTargetPokemon: Array<{ name: string; data: any; slot: number; isSwitch: boolean }> = [];
			for (let i = 0; i < opponentActivePokemon.length; i++) {
				const activePokemon = opponentActivePokemon[i];
				const slot = activePokemon.slot !== undefined ? activePokemon.slot : i;
				const switchData = switchInfo[slot];

				if (switchData && this.opponentTeamData) {
					// 对手在这个位置要换人
					const switchSlot = switchData.slot;
					if (switchSlot >= 0 && switchSlot < this.opponentTeamData.length) {
						const switchPokemonData = this.opponentTeamData[switchSlot];
						opponentTargetPokemon.push({
							name: switchPokemonData.species,
							data: switchPokemonData,
							slot: slot,
							isSwitch: true
						});
						continue;
					}
				}

				// 不换人，使用当前在场的宝可梦
				const pokemonData = this.opponentTeamData.find(mon =>
					this.isPokemonSame(mon.species, activePokemon.name)
				);
				if (pokemonData) {
					opponentTargetPokemon.push({
						name: activePokemon.name,
						data: pokemonData,
						slot: slot,
						isSwitch: false
					});
				}
			}

			// 场地条件
			const baseConditions = {
				weather: this.weather || undefined,
				terrain: this.terrain || undefined
			};

			let result = '=== 伤害计算结果 ===\n';

			// 1. 计算我方所有宝可梦对对手在场的每只宝可梦的伤害
			const hasSwitch = opponentTargetPokemon.some(p => p.isSwitch);
			if (hasSwitch) {
				result += '【我方全队 → 对手宝可梦（包含即将上场的）】\n';
			} else {
				result += '【我方全队 → 对手当前在场的宝可梦】\n';
			}

			const allMyPokemon = request.side.pokemon;
			// 对每只对手在场的宝可梦计算伤害
			for (const targetPokemon of opponentTargetPokemon) {
				for (let i = 0; i < allMyPokemon.length; i++) {
					const pokemon = allMyPokemon[i];
					const pokemonSpeciesName = pokemon.ident.split(': ')[1];
					const pokemonData = this.teamData.find(mon => this.isPokemonSame(mon.species, pokemonSpeciesName));

					if (!pokemonData) continue;

					// 检查是否已倒下
					const isFainted = pokemon.condition && pokemon.condition.toString().includes('fnt');
					if (isFainted) continue;

					const attackerData = {
						species: pokemonData.species,
						level: pokemonData.level || 100,
						nature: pokemonData.nature || 'hardy',
						ivs: pokemonData.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
						evs: pokemonData.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
						ability: pokemonData.ability,
						item: pokemonData.item,
						teraType: pokemon.teraType,
						isTerastallized: this.myTerastallizedPokemon === pokemonSpeciesName,
						boosts: (pokemon as any).boosts,
						status: (pokemon as any).status
					};

					const moves = pokemonData.moves || [];
					if (moves.length === 0) continue;

					const pokemonCN = this.translate(pokemonSpeciesName, 'pokemon');
					const isActive = pokemon.active ? ' [当前出战]' : '';

					
					const defenderData = {
						species: targetPokemon.data.species,
						level: targetPokemon.data.level || 100,
						nature: targetPokemon.data.nature || 'hardy',
						ivs: targetPokemon.data.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
						evs: targetPokemon.data.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
						ability: targetPokemon.data.ability,
						item: targetPokemon.data.item,
						teraType: targetPokemon.data.teraType,
						// 如果是换人，新上场的宝可梦没有太晶化和能力变化
						isTerastallized: targetPokemon.isSwitch ? false : (this.opponentTeam[this.normalizeSpeciesName(targetPokemon.name)]?.terastallized || false),
						boosts: targetPokemon.isSwitch ? undefined : this.opponentTeam[this.normalizeSpeciesName(targetPokemon.name)]?.boosts,
						status: targetPokemon.isSwitch ? undefined : this.opponentTeam[this.normalizeSpeciesName(targetPokemon.name)]?.status
					};

					const opponentPokemonCN = this.translate(targetPokemon.name, 'pokemon');
					const slotName = targetPokemon.slot === 0 ? '左侧' : '右侧';
					const switchTag = targetPokemon.isSwitch ? '[即将上场]' : '';

					const calculations = DamageCalculator.calculateAllMoves(
						attackerData,
						defenderData,
						moves,
						{
							...baseConditions,
							isReflect: this.opponentSideConditions.has('Reflect'),
							isLightScreen: this.opponentSideConditions.has('Light Screen')
						}
					);
					if (i === 0) {
						result += `对${slotName}${opponentPokemonCN}${switchTag}:\n`;
					}	
					result += `  ${i + 1}.${pokemonCN}${isActive}`;

					let calculationResults = DamageCalculator.formatCalculationResults(calculations);
					result += calculationResults === '' ? ' 无伤害招式' : calculationResults;
					result += '\n';
				}
			}

			// 2. 计算对手在场的宝可梦对我方所有宝可梦的伤害
			if (hasSwitch) {
				result += '【对手宝可梦（包含即将上场的） → 我方全队】\n';
			} else {
				result += '【对手当前在场的宝可梦 → 我方全队】\n';
			}

			for (const targetPokemon of opponentTargetPokemon) {
				const attackerData = {
					species: targetPokemon.data.species,
					level: targetPokemon.data.level || 100,
					nature: targetPokemon.data.nature || 'hardy',
					ivs: targetPokemon.data.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
					evs: targetPokemon.data.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
					ability: targetPokemon.data.ability,
					item: targetPokemon.data.item,
					teraType: targetPokemon.data.teraType,
					// 如果是换人，新上场的宝可梦没有太晶化和能力变化
					isTerastallized: targetPokemon.isSwitch ? false : (this.opponentTeam[this.normalizeSpeciesName(targetPokemon.name)]?.terastallized || false),
					boosts: targetPokemon.isSwitch ? undefined : this.opponentTeam[this.normalizeSpeciesName(targetPokemon.name)]?.boosts,
					status: targetPokemon.isSwitch ? undefined : this.opponentTeam[this.normalizeSpeciesName(targetPokemon.name)]?.status
				};

				const moves = targetPokemon.data.moves || [];
				if (moves.length === 0) continue;

				const opponentPokemonCN = this.translate(targetPokemon.name, 'pokemon');
				const slotName = targetPokemon.slot === 0 ? '左侧' : '右侧';
				const switchTag = targetPokemon.isSwitch ? '[即将上场]' : '';

				for (let i = 0; i < allMyPokemon.length; i++) {
					const pokemon = allMyPokemon[i];
					const pokemonSpeciesName = pokemon.ident.split(': ')[1];
					const pokemonData = this.teamData.find(mon => this.isPokemonSame(mon.species, pokemonSpeciesName));

					if (!pokemonData) continue;

					// 检查是否已倒下
					const isFainted = pokemon.condition && pokemon.condition.toString().includes('fnt');
					if (isFainted) continue;

					const defenderData = {
						species: pokemonData.species,
						level: pokemonData.level || 100,
						nature: pokemonData.nature || 'hardy',
						ivs: pokemonData.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
						evs: pokemonData.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
						ability: pokemonData.ability,
						item: pokemonData.item,
						teraType: pokemon.teraType,
						isTerastallized: this.myTerastallizedPokemon === pokemonSpeciesName,
						boosts: (pokemon as any).boosts,
						status: (pokemon as any).status
					};

					const pokemonCN = this.translate(pokemonSpeciesName, 'pokemon');
					const isActive = pokemon.active ? ' [当前出战]' : '';

					if (i === 0) {
						// 第一个宝可梦时显示对手信息
						result += `${slotName}${opponentPokemonCN}${switchTag}:\n`;
					}

					result += `  ${i + 1}.对${pokemonCN}${isActive}`;

					const calculations = DamageCalculator.calculateAllMoves(
						attackerData,
						defenderData,
						moves,
						{
							...baseConditions,
							isReflect: this.mySideConditions.has('Reflect'),
							isLightScreen: this.mySideConditions.has('Light Screen')
						}
					);

					let calculationResults = DamageCalculator.formatCalculationResults(calculations);
					result += calculationResults === '' ? ' 无伤害招式' : calculationResults;
					result += '\n';
				}
			}

			return result;
		} catch (error) {
			console.error('[Error] calculateAllDamagesForDoubles:', error);
			return null;
		}
	}

	private translate(text: string, category: string = 'pokemon'): string {
		if (!text) return text;
		return this.translator.translate(String(text), category);
	}

	private range(start: number, end?: number, step = 1): number[] {
		if (end === undefined) {
			end = start;
			start = 0;
		}
		const result = [];
		for (; start <= end; start += step) {
			result.push(start);
		}
		return result;
	}

	private normalizeSpeciesName(name: string): string {
		if (!name) return name;

		const bracketMatch = name.match(/\(([^)]+)\)/);
		if (bracketMatch) {
			return bracketMatch[1].trim();
		}

		if (name.includes('-')) {
			return name.split('-')[0];
		}

		return name;
	}

	private isPokemonSame(name1: string, name2: string): boolean {
		const normalized1 = this.normalizeSpeciesName(name1);
		const normalized2 = this.normalizeSpeciesName(name2);
		return normalized1 === normalized2;
	}
}
