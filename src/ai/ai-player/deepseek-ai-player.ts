/**
 * DeepSeek AI 对战系统
 * 使用 DeepSeek API 进行智能对战决策
 */

import * as dotenv from 'dotenv';
// 加载 .env 文件中的环境变量
dotenv.config();

import { AIPlayer } from '../ai-player';
import { Dex } from 'pokemon-showdown/dist/sim/dex';
import { Translator } from '../../support/translator';
import { DamageCalculator } from '../../support/damage-calculator';
import axios from 'axios';
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
	terastallized?: boolean; // 是否已太晶化
	teraType?: string; // 太晶化属性
}

export class DeepSeekAIPlayer extends AIPlayer {
	private readonly apiKey: string;
	private readonly apiUrl: string = 'https://api.deepseek.com/v1/chat/completions';
	private readonly translator: Translator;
	private conversationHistory: Array<{ role: string; content: string }> = [];
	private lastRequest: SwitchRequest | TeamPreviewRequest | MoveRequest | null = null;
	private opponentTeam: { [name: string]: OpponentPokemon } = {};
	private teamData: any[] | null = null;
	private opponentTeamData: any[] | null = null;

	// debug设置
	private debugmode: boolean = false;

	// 场地状态跟踪
	private weather: string | null = null;
	private terrain: string | null = null;
	private pseudoWeather: Set<string> = new Set();
	private mySideConditions: Set<string> = new Set();
	private opponentSideConditions: Set<string> = new Set();

	// 太晶化状态跟踪 - 一支队伍只能太晶化一只宝可梦
	private myTerastallizedPokemon: string | null = null; // 我方太晶化的宝可梦名称
	private myTeraType: string | null = null; // 我方太晶化的属性

	// 作弊功能 - 80%概率获取用户操作
	private cheatProbability: number = 0.8; // 作弊概率
	private playerChoice: string | null = null; // 用户的招式/切换选择
	private playerTeamOrder: string | null = null; // 用户的队伍预览顺序
	private playerChoiceResolver: (() => void) | null = null; // 用于等待用户选择的resolver
	private playerTeamOrderResolver: (() => void) | null = null; // 用于等待用户队伍顺序的resolver

	constructor(
		playerStream: any,
		teamData: any[] | null = null,
		opponentTeamData: any[] | null = null,
		debug = false
	) {
		super(playerStream, debug);
		this.apiKey = process.env.DEEPSEEK_API_KEY || '';
		this.translator = Translator.getInstance();
		this.teamData = teamData;
		this.opponentTeamData = opponentTeamData;

		// 从环境变量读取作弊概率配置
		const cheatProb = parseFloat(process.env.DEEPSEEK_CHEAT_PROBABILITY || '0.8');
		this.cheatProbability = isNaN(cheatProb) ? 0.8 : Math.max(0, Math.min(1, cheatProb));
	}

	/**
	 * 设置用户的招式/切换选择（供外部调用）
	 */
	setPlayerChoice(choice: string): void {
		this.playerChoice = choice;
		// 如果有等待中的resolver，触发它
		if (this.playerChoiceResolver) {
			this.playerChoiceResolver();
			this.playerChoiceResolver = null;
		}
	}

	/**
	 * 设置用户的队伍预览顺序（供外部调用）
	 */
	setPlayerTeamOrder(order: string): void {
		this.playerTeamOrder = order;

		// 根据队伍顺序重新排列 opponentTeamData，使其与游戏中的实际编号一致
		if (this.opponentTeamData && order && order.length >= 1) {
			const originalTeamData = [...this.opponentTeamData];
			const reorderedTeamData: any[] = [];

			for (let i = 0; i < order.length; i++) {
				const digit = parseInt(order[i]);
				if (!isNaN(digit) && digit >= 1 && digit <= originalTeamData.length) {
					reorderedTeamData.push(originalTeamData[digit - 1]);
				}
			}

			// 如果重新排序成功，更新 opponentTeamData
			if (reorderedTeamData.length === originalTeamData.length) {
				this.opponentTeamData = reorderedTeamData;
				if (this.debugmode) console.log(`[Debug] 对手队伍已根据顺序 ${order} 重新排列`);
			}
		}

		// 如果有等待中的resolver，触发它
		if (this.playerTeamOrderResolver) {
			this.playerTeamOrderResolver();
			this.playerTeamOrderResolver = null;
		}
	}

	/**
	 * 设置作弊概率（0-1之间，0表示不作弊，1表示必定作弊）
	 */
	setCheatProbability(probability: number): void {
		this.cheatProbability = Math.max(0, Math.min(1, probability));
	}

	/**
	 * 检查是否触发作弊（基于概率）
	 */
	private shouldCheat(): boolean {
		return Math.random() < this.cheatProbability;
	}

	/**
	 * 等待用户选择完成
	 */
	private waitForPlayerChoice(): Promise<void> {
		return new Promise(resolve => {
			if (this.playerChoice !== null) {
				resolve();
			} else {
				this.playerChoiceResolver = resolve;
			}
		});
	}

	/**
	 * 等待用户队伍顺序选择完成
	 */
	private waitForPlayerTeamOrder(): Promise<void> {
		return new Promise(resolve => {
			if (this.playerTeamOrder !== null) {
				resolve();
			} else {
				this.playerTeamOrderResolver = resolve;
			}
		});
	}

	/**
	 * 重写接收消息方法，监听战斗消息流以跟踪场地状态
	 */
	override receive(message: string): void {
		super.receive(message);

		// 解析消息流，更新场地状态
		const lines = message.split('\n');
		for (const line of lines) {
			this.parseFieldMessage(line);
		}
	}

	/**
	 * 解析战斗消息，更新场地状态
	 * AI 是 p2，对手是 p1
	 */
	private parseFieldMessage(line: string): void {
		const parts = line.split('|').filter(p => p);
		if (parts.length === 0) return;

		const cmd = parts[0];

		// ========== 场地状态 ==========

		// 天气相关
		if (cmd === '-weather') {
			// |-weather|RainDance 或 |-weather|none
			const weather = parts[1];
			this.weather = (weather === 'none' || !weather) ? null : weather;
		}

		// 场地条件开始（包括场地和全场效果）
		else if (cmd === '-fieldstart') {
			// |-fieldstart|move: Electric Terrain
			// |-fieldstart|move: Trick Room
			const condition = parts[1];
			if (condition) {
				const effectName = condition.startsWith('move: ') ? condition.substring(6) : condition;

				// 判断是场地还是全场效果
				const terrainNames = ['Electric Terrain', 'Grassy Terrain', 'Misty Terrain', 'Psychic Terrain'];
				if (terrainNames.includes(effectName)) {
					this.terrain = effectName;
				} else {
					this.pseudoWeather.add(effectName);
				}
			}
		}

		// 场地条件结束
		else if (cmd === '-fieldend') {
			// |-fieldend|move: Electric Terrain
			// |-fieldend|move: Trick Room
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

		// 场地效果开始
		else if (cmd === '-sidestart') {
			// |-sidestart|SIDE|CONDITION
			// 例如: |-sidestart|p1|move: Stealth Rock
			// 例如: |-sidestart|p2|Spikes
			const side = parts[1];
			const condition = parts[2];

			if (condition) {
				// 移除 'move: ' 前缀（如果有的话）
				const conditionName = condition.startsWith('move: ') ? condition.substring(6) : condition;

				if (side === 'p2') {
					this.mySideConditions.add(conditionName);
				} else if (side === 'p1') {
					this.opponentSideConditions.add(conditionName);
				}
			}
		}

		// 场地效果结束
		else if (cmd === '-sideend') {
			// |-sideend|SIDE|CONDITION
			// 例如: |-sideend|p2|move: Light Screen
			// 例如: |-sideend|p1|Reflect
			const side = parts[1];
			const condition = parts[2];

			if (condition) {
				// 移除 'move: ' 前缀（如果有的话）
				const conditionName = condition.startsWith('move: ') ? condition.substring(6) : condition;

				if (side === 'p2') {
					this.mySideConditions.delete(conditionName);
				} else if (side === 'p1') {
					this.opponentSideConditions.delete(conditionName);
				}
			}
		}

		// ========== 对手宝可梦追踪（p1）==========

		// 对手宝可梦出战
		else if (cmd === 'switch' || cmd === 'drag') {
			// |switch|p1a: Pikachu|Pikachu, L50, M|100/100
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const condition = parts[3] || '100/100';

				// 更新 opponentTeamData 的顺序（切换时与第一位交换）
				if (this.opponentTeamData && this.opponentTeamData.length > 0) {
					// 查找切换上场的宝可梦在队伍中的索引
					const switchIndex = this.opponentTeamData.findIndex(mon =>
						this.isPokemonSame(mon.species, speciesName)
					);

					// 如果找到且不在第一位，则与第一位交换
					if (switchIndex > 0) {
						const temp = this.opponentTeamData[0];
						this.opponentTeamData[0] = this.opponentTeamData[switchIndex];
						this.opponentTeamData[switchIndex] = temp;

						if (this.debugmode) {
							const pokemon1CN = this.translate(this.opponentTeamData[0].species, 'pokemon');
							const pokemon2CN = this.translate(temp.species, 'pokemon');
							console.log(`[Debug] 对手队伍顺序更新：${pokemon1CN} ↔ ${pokemon2CN} （位置 1 ↔ ${switchIndex + 1}）`);
						}
					}
				}

				// 标记所有对手宝可梦为非出战
				Object.keys(this.opponentTeam).forEach(key => {
					this.opponentTeam[key].active = false;
				});

				// 更新当前出战的宝可梦
				if (!this.opponentTeam[speciesName]) {
					this.opponentTeam[speciesName] = {
						name: speciesName,
						condition: condition,
						active: true,
						boosts: {}
					};
				} else {
					this.opponentTeam[speciesName].condition = condition;
					this.opponentTeam[speciesName].active = true;
					this.opponentTeam[speciesName].boosts = {}; // 重置能力变化
				}
			}
		}

		// 对手宝可梦HP变化
		else if (cmd === '-damage' || cmd === '-heal') {
			// |-damage|p1a: Pikachu|50/100
			const ident = parts[1];
			const condition = parts[2];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				if (this.opponentTeam[speciesName]) {
					this.opponentTeam[speciesName].condition = condition;
				}
			}
		}

		// 对手宝可梦倒下
		else if (cmd === 'faint') {
			// |faint|p1a: Pikachu
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				if (this.opponentTeam[speciesName]) {
					this.opponentTeam[speciesName].condition = '0 fnt';
					this.opponentTeam[speciesName].active = false;
				}
			}
		}

		// 对手的能力提升
		else if (cmd === '-boost') {
			// |-boost|p1a: Pikachu|atk|1
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const stat = parts[2];
				const amount = parseInt(parts[3] || '1');

				if (this.opponentTeam[speciesName]) {
					if (!this.opponentTeam[speciesName].boosts) {
						this.opponentTeam[speciesName].boosts = {};
					}
					this.opponentTeam[speciesName].boosts![stat] =
						(this.opponentTeam[speciesName].boosts![stat] || 0) + amount;
				}
			}
		}

		// 对手的能力下降
		else if (cmd === '-unboost') {
			// |-unboost|p1a: Pikachu|def|1
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const stat = parts[2];
				const amount = parseInt(parts[3] || '1');

				if (this.opponentTeam[speciesName]) {
					if (!this.opponentTeam[speciesName].boosts) {
						this.opponentTeam[speciesName].boosts = {};
					}
					this.opponentTeam[speciesName].boosts![stat] =
						(this.opponentTeam[speciesName].boosts![stat] || 0) - amount;
				}
			}
		}

		// 对手能力变化清除
		else if (cmd === '-clearboost' || cmd === '-clearallboost') {
			// |-clearboost|p1a: Pikachu
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];

				if (this.opponentTeam[speciesName]) {
					this.opponentTeam[speciesName].boosts = {};
				}
			}
		}

		// 对手状态异常
		else if (cmd === '-status') {
			// |-status|p1a: Pikachu|par
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];
				const status = parts[2];

				if (this.opponentTeam[speciesName]) {
					this.opponentTeam[speciesName].status = status;
				}
			}
		}

		// 对手治愈状态
		else if (cmd === '-curestatus') {
			// |-curestatus|p1a: Pikachu|par
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];

				if (this.opponentTeam[speciesName]) {
					this.opponentTeam[speciesName].status = undefined;
				}
			}
		}

		// 道具丢失/破坏（气球破裂、道具被击落等）
		else if (cmd === '-enditem') {
			// |-enditem|p1a: Garchomp|Air Balloon
			const ident = parts[1];
			if (ident && ident.startsWith('p1')) {
				const speciesName = ident.split(': ')[1];

				if (this.opponentTeam[speciesName]) {
					this.opponentTeam[speciesName].item = undefined;
				}
			}
		}

		// 太晶化
		else if (cmd === '-terastallize') {
			// |-terastallize|p1a: Pikachu|Electric
			// |-terastallize|p2a: Garchomp|Ground
			const ident = parts[1];
			const teraType = parts[2];

			if (ident && teraType) {
				const speciesName = ident.split(': ')[1];

				if (ident.startsWith('p1')) {
					// 对手太晶化
					if (this.opponentTeam[speciesName]) {
						this.opponentTeam[speciesName].terastallized = true;
						this.opponentTeam[speciesName].teraType = teraType;
					}
				} else if (ident.startsWith('p2')) {
					// 我方太晶化 (AI是p2)
					this.myTerastallizedPokemon = speciesName;
					this.myTeraType = teraType;
				}
			}
		}
	}

	/**
	 * 处理强制切换（宝可梦倒下时）
	 */
	protected override handleForceSwitchRequest(request: SwitchRequest): void {
		this.lastRequest = request;
		this.handleForceSwitchAsync(request).catch(error => {
			console.error('AI操作失败，使用默认操作。\nhandleForceSwitchRequest error:', error);
			this.choose('default');
		});
	}

	/**
	 * 处理队伍预览
	 */
	protected override handleTeamPreviewRequest(request: TeamPreviewRequest): void {
		this.lastRequest = request;
		this.handleTeamPreviewAsync(request).catch(error => {
			console.error('AI操作失败，使用默认操作。\nhandleTeamPreviewRequest error:', error);
			this.choose('default');
		});
	}

	/**
	 * 处理正常回合
	 */
	protected override handleActiveTurnRequest(request: MoveRequest): void {
		this.lastRequest = request;
		this.handleActiveAsync(request).catch(error => {
			console.error('AI操作失败，使用默认操作。\nhandleActiveTurnRequest error:', error);
			this.choose('default');
		});
	}

	/**
	 * 处理队伍预览（异步版本）
	 */
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

	/**
	 * 处理强制切换（异步版本）
	 */
	private async handleForceSwitchAsync(request: SwitchRequest): Promise<void> {
		const pokemon = request.side.pokemon;
		const chosen: number[] = [];

		const choicePromises = request.forceSwitch.map(async (mustSwitch, i) => {
			if (!mustSwitch) return 'pass';

			const canSwitch = this.range(1, 6).filter(j => (
				pokemon[j - 1] &&
				j > request.forceSwitch.length &&
				!chosen.includes(j) &&
				!pokemon[j - 1].condition.endsWith(` fnt`) === !pokemon[i].reviving
			));

			if (!canSwitch.length) return 'pass';

			// 让AI选择切换目标
			const switchOptions = canSwitch.map(slot => ({ slot, pokemon: pokemon[slot - 1] }));
			const target = await this.chooseSwitchWithAI(switchOptions, request);
			chosen.push(target);
			return `switch ${target}`;
		});

		const choices = await Promise.all(choicePromises);
		this.choose(choices.join(', '));
	}

	/**
	 * 处理正常回合（异步版本）
	 */
	private async handleActiveAsync(request: MoveRequest): Promise<void> {
		let [canMegaEvo, canUltraBurst, canZMove, canDynamax, canTerastallize] = [true, true, true, true, true];
		const pokemon = request.side.pokemon;
		const chosen: number[] = [];

		// 如果作弊概率大于0，等待用户选择完成
		let playerChoiceInfo: string | null = null;
		if (this.cheatProbability > 0) {
			await this.waitForPlayerChoice();
			// 检查是否触发作弊
			if (this.shouldCheat() && this.playerChoice !== null) {
				playerChoiceInfo = this.playerChoice;
			}
		}

		const choicePromises = request.active.map(async (active: AnyObject, i: number) => {
			if (pokemon[i].condition.endsWith(` fnt`) || pokemon[i].commanding) return 'pass';

			canMegaEvo = canMegaEvo && active.canMegaEvo;
			canUltraBurst = canUltraBurst && active.canUltraBurst;
			canZMove = canZMove && !!active.canZMove;
			canDynamax = canDynamax && !!active.canDynamax;
			canTerastallize = canTerastallize && !!active.canTerastallize;

			// 获取可用招式
			const useMaxMoves = (!active.canDynamax && active.maxMoves);
			const possibleMoves = useMaxMoves ? active.maxMoves.maxMoves : active.moves;

			let canMove = this.range(1, possibleMoves.length).filter(j => (
				!possibleMoves[j - 1].disabled
			)).map(j => ({
				slot: j,
				move: possibleMoves[j - 1].move,
				target: possibleMoves[j - 1].target,
				zMove: false,
			}));

			if (canZMove) {
				canMove.push(...this.range(1, active.canZMove.length)
					.filter(j => active.canZMove[j - 1])
					.map(j => ({
						slot: j,
						move: active.canZMove[j - 1].move,
						target: active.canZMove[j - 1].target,
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

			const canSwitch = this.range(1, 6).filter(j => (
				pokemon[j - 1] &&
				!pokemon[j - 1].active &&
				!chosen.includes(j) &&
				!pokemon[j - 1].condition.endsWith(` fnt`)
			));

			// 如果被困住或没有可切换的，只能使用招式
			if (active.trapped || canSwitch.length === 0) {
				if (moves.length > 0) {
					return await this.chooseMoveWithAI(active, moves, [], pokemon[i], request, canTerastallize, playerChoiceInfo);
				} else {
					return 'pass';
				}
			} else {
				// 让AI决定是使用招式还是切换
				const switchOptions = canSwitch.map(slot => ({ slot, pokemon: pokemon[slot - 1] }));
				return await this.chooseMoveOrSwitchWithAI(active, moves, switchOptions, pokemon[i], request, canTerastallize, playerChoiceInfo);
			}
		});

		const choices = await Promise.all(choicePromises);
		this.choose(choices.join(', '));

		// 清除已使用的用户选择
		this.playerChoice = null;
	}

	/**
	 * 使用AI选择切换的宝可梦
	 */
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
			let actions = '可切换的宝可梦:\n';

			switches.forEach((s) => {
				const speciesName = s.pokemon.ident.split(': ')[1];
				const speciesCN = this.translate(speciesName, 'pokemon');
				const speciesData = Dex.species.get(speciesName);
				const condition = s.pokemon.condition || '未知';

				actions += `  ${s.slot}. ${speciesCN}`;
				if (speciesData.types) {
					const typesCN = speciesData.types.map((t: string) => this.translate(t, 'types'));
					actions += ` [${typesCN.join('/')}]`;
				}
				actions += ` HP:${condition}`;
				if (s.pokemon.status) actions += ` [${s.pokemon.status}]`;
				actions += '\n';
			});

			const prompt = `当前要切换宝可梦。指令格式：switch X（X为宝可梦编号）
【考虑因素】
0. 【**关键**】属性克制和招式威力 - **必须严格执行以下步骤**：
   ① 先确认对手宝可梦的属性（从上方信息中查看，如"火/钢"表示火+钢双属性）
   ② 对双属性宝可梦，必须分别查表计算对两个属性的倍率，然后相乘
   ③ 例如：冰招式→火/钢 = (冰→火:0.5) × (冰→钢:0.5) = 0.25倍（四倍抵抗）
   ④ 禁止臆测宝可梦的属性，只能使用上方明确列出的属性信息
1. 注意对手有没有克制自己的招式，以及自己有没有克制对手的招式，和速度优势
2. HP状况和异常状态
3. 特性和道具配合
4. 队伍配合和场上局势

下面是当前双方状态：
${battleState}

下面是可选操作
${actions}`;

			const systemPrompt = this.getBaseSystemPrompt();

			// 在 prompt 中添加伤害计算结果
			const damageCalculation = this.calculateAllDamages(request);
			const fullPrompt = damageCalculation ? `${prompt}\n${damageCalculation}` : prompt;

			const aiResponse = await this.callDeepSeek(fullPrompt, systemPrompt);

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
	 * 使用AI选择队伍预览顺序
	 */
	private async chooseTeamPreviewWithAI(request: TeamPreviewRequest): Promise<string | null> {
		if (!this.lastRequest) return null;
		console.log('\n等待DeepSeek选择首发宝可梦...');

		// 如果作弊概率大于0，等待用户队伍顺序选择完成
		let playerTeamInfo: string | null = null;
		if (this.cheatProbability > 0) {
			await this.waitForPlayerTeamOrder();
			// 检查是否触发作弊
			if (this.shouldCheat() && this.playerTeamOrder !== null) {
				playerTeamInfo = this.playerTeamOrder;
			}
		}

		try {
			const battleState = this.buildBattleState(request, true);

			let extraInfo = '';
			let damageCalcForFirstPokemon = '';
			if (playerTeamInfo) {
				const firstPokemonIndex = 0; // 用户队伍顺序的首发宝可梦是第一只

				// 如果知道对手首发，计算我方所有宝可梦对其的伤害
				if (this.opponentTeamData && this.opponentTeamData[firstPokemonIndex]) {
					damageCalcForFirstPokemon = this.calculateDamageForTeamPreview(request, firstPokemonIndex);
				}
			}
			extraInfo += "【重要情报】对方的首发是1号宝可梦！";

			const prompt = `当前要设置队伍首发。指令格式：team 123456（数字为宝可梦编号，首发在最前）
【考虑因素】
0. 【**重要**】根据重要情报，请优先通过克制对方的出场顺序、使用针对对手首发的宝可梦或者抓住时机强化来反制对手的选择
1. 【**关键**】属性克制和招式威力 - **必须严格执行以下步骤**：
   ① 先确认对手宝可梦的属性（从上方信息中查看，如"火/钢"表示火+钢双属性）
   ② 对双属性宝可梦，必须分别查表计算对两个属性的倍率，然后相乘
   ③ 例如：冰招式→火/钢 = (冰→火:0.5) × (冰→钢:0.5) = 0.25倍（四倍抵抗）
   ④ 禁止臆测宝可梦的属性，只能使用上方明确列出的属性信息
2. 首发宝可梦的队伍配合能力
3. 特性和道具配合
4. 攻守平衡

下面是当前双方宝可梦情报：
${battleState}

${extraInfo}`;

			const systemPrompt = this.getBaseSystemPrompt();

			// 如果有伤害计算，添加到 prompt
			const fullPrompt = damageCalcForFirstPokemon ? `${prompt}\n${damageCalcForFirstPokemon}` : prompt;

			const aiResponse = await this.callDeepSeek(fullPrompt, systemPrompt);
			if (aiResponse) {
				const parsed = this.parseAIResponse(aiResponse);
				if (parsed && parsed.type === 'team' && parsed.team) {
					// 清除已使用的用户队伍顺序
					this.playerTeamOrder = null;
					return `team ${parsed.team}`;
				}
			}
		} catch (error) {
			console.error('AI队伍预览失败:', error);
		}

		// 清除已使用的用户队伍顺序
		this.playerTeamOrder = null;
		return null;
	}

	/**
	 * AI选择：招式或切换
	 */
	private async chooseMoveOrSwitchWithAI(
		active: AnyObject,
		moves: { choice: string, move: AnyObject }[],
		switches: { slot: number, pokemon: AnyObject }[],
		currentPokemon: AnyObject,
		request: MoveRequest,
		canTerastallize: boolean,
		playerChoiceInfo: string | null = null
	): Promise<string> {
		if (!this.lastRequest) {
			console.error('❌ 无法获取请求信息');
			return moves.length > 0 ? moves[0].choice : 'pass';
		}

		try {
			const battleState = this.buildBattleState(this.lastRequest);
			let actions = '【可选动作】\n\n';

			// 招式选项
			if (moves.length > 0) {
				actions += '使用招式:\n';
				moves.forEach((m, i) => {
					const moveData = Dex.moves.get(m.move.move);
					const moveCN = this.translate(moveData.name, 'moves');
					const typeCN = this.translate(moveData.type, 'types');
					const categoryCN = this.translate(moveData.category, 'category');
					actions += `  move ${i + 1}: ${moveCN} [${typeCN}/${categoryCN}]`;

					// 添加招式描述
					if (moveData.shortDesc) {
						actions += ` - ${moveData.shortDesc}`;
					}

					actions += '\n';
				});
			}

			// 切换选项
			if (switches.length > 0) {
				actions += '\n切换宝可梦:\n';
				switches.forEach((s) => {
					const speciesName = s.pokemon.ident.split(': ')[1];
					const speciesCN = this.translate(speciesName, 'pokemon');
					const speciesData = Dex.species.get(speciesName);
					const condition = s.pokemon.condition || '未知';

					actions += `  switch ${s.slot}: ${speciesCN}`;
					if (speciesData.types) {
						const typesCN = speciesData.types.map((t: string) => this.translate(t, 'types'));
						actions += ` [${typesCN.join('/')}]`;
					}
					actions += ` HP:${condition}`;
					if (s.pokemon.status) actions += ` [${s.pokemon.status}]`;
					actions += '\n';
				});
			}

			let extraInfo = '';
			if (active.canTerastallize && canTerastallize && this.myTerastallizedPokemon === null) {
				extraInfo += '\n提示: 可以在使用招式时同时太晶化（例如：move 1 tera）\n';
			} else if (this.myTerastallizedPokemon !== null) {
				const terastallizedCN = this.translate(this.myTerastallizedPokemon, 'pokemon');
				extraInfo += `\n注意: 队伍已有宝可梦太晶化（${terastallizedCN}），无法再次太晶化\n`;
			}

			// 如果有用户选择信息（作弊模式），加入提示
			if (playerChoiceInfo) {
				const translatedChoice = this.translatePlayerChoice(playerChoiceInfo, request);
				extraInfo += `【重要情报】对手的操作：${translatedChoice}\n`;
			}

			const prompt = `当前要选择下一回合的操作。指令格式：move X（使用第X个招式）、move X terastallize（使用第X个招式并太晶化）、switch X（切换到第X个宝可梦）
【考虑因素】
0. 【**重要**】如果获得了对手的这回合的操作信息，请优先通过太晶化反制、换人联攻联防、使用针对招式或者抓住时机强化来反制对手的选择
1. 注意伤害计算：根据上面的伤害公式计算伤害和承受伤害
2. 【**关键**】属性克制和招式威力 - **必须严格执行以下步骤**：
   ① 先确认对手宝可梦的属性（从上方信息中查看，如"火/钢"表示火+钢双属性）
   ② 对双属性宝可梦，必须分别查表计算对两个属性的倍率，然后相乘
   ③ 例如：冰招式→火/钢 = (冰→火:0.5) × (冰→钢:0.5) = 0.25倍（四倍抵抗）
   ④ 禁止臆测宝可梦的属性，只能使用上方明确列出的属性信息
3. 注意根据双方速度个体值判断先后手，考虑会不会被对方先手击败
4. 剩余宝可梦状态和HP
5. 注意场地效果和天气影响
6. 判断是否需要使用太晶化进攻或者防守
7. 预判对手行为
下面是当前双方状态：
${battleState}

下面是可选操作
${actions}

${extraInfo}`;

			const systemPrompt = this.getBaseSystemPrompt();
			// 在 prompt 中添加伤害计算结果（包含对手切换预测）
			const damageCalculation = this.calculateAllDamages(request, playerChoiceInfo);
			const fullPrompt = damageCalculation ? `${prompt}\n${damageCalculation}` : prompt;
			const aiResponse = await this.callDeepSeek(fullPrompt, systemPrompt);

			if (aiResponse) {
				const parsed = this.parseAIResponse(aiResponse);

				if (parsed && parsed.type === 'move' && moves[parsed.index]) {
					let choice = moves[parsed.index].choice;
					// 只有在队伍还没有太晶化宝可梦时才能太晶化
					if (parsed.terastallize && active.canTerastallize && canTerastallize && this.myTerastallizedPokemon === null) {
						choice += ' terastallize';
					}
					return choice;
				}

				if (parsed && parsed.type === 'switch') {
					const targetSwitch = switches.find(s => s.slot === parsed.index + 1);
					if (targetSwitch) {
						return `switch ${targetSwitch.slot}`;
					}
				}
			}

			// AI未返回有效结果
			console.error('❌ AI返回无效指令');
			throw new Error('AI返回无效指令');
		} catch (error) {
			console.error('❌ AI决策失败:', error);
			throw error;
		}
	}

	/**
	 * AI选择招式（仅招式，无切换）
	 */
	private async chooseMoveWithAI(
		active: AnyObject,
		moves: { choice: string, move: AnyObject }[],
		switches: { slot: number, pokemon: AnyObject }[],
		currentPokemon: AnyObject,
		request: MoveRequest,
		canTerastallize: boolean,
		playerChoiceInfo: string | null = null
	): Promise<string> {
		return await this.chooseMoveOrSwitchWithAI(active, moves, switches, currentPokemon, request, canTerastallize, playerChoiceInfo);
	}

	/**
	 * 构建战场状态描述
	 * @param request 请求对象
	 * @param isTeamPreview 是否为队伍预览模式（true时只显示基础信息，不显示HP/状态等战斗细节）
	 */
	private buildBattleState(request: SwitchRequest | TeamPreviewRequest | MoveRequest, isTeamPreview: boolean = false): string {
		let state = isTeamPreview ? '=== 队伍预览 ===\n\n' : '=== 当前战场状态 ===\n\n';

		if (!('side' in request) || !request.side || !request.side.pokemon) {
			return state + '（无法获取战场信息）\n';
		}

		// 场地信息（仅战斗中显示）
		if (!isTeamPreview) {
			let fieldInfo = '';

			// 天气信息
			if (this.weather) {
				const weatherCN = this.translate(this.weather, 'weathers');
				fieldInfo += `   天气: ${weatherCN}\n`;
			}

			// 场地信息
			if (this.terrain) {
				const terrainCN = this.translate(this.terrain, 'terrains');
				fieldInfo += `   场地: ${terrainCN}\n`;
			}

			// 全场效果（伪天气）
			if (this.pseudoWeather.size > 0) {
				const effects = Array.from(this.pseudoWeather).map(e => this.translate(e, 'moves')).join(', ');
				fieldInfo += `   全场效果: ${effects}\n`;
			}

			// 我方场地效果
			if (this.mySideConditions.size > 0) {
				const effects = Array.from(this.mySideConditions).map(e => this.translate(e, 'moves')).join(', ');
				fieldInfo += `   我方场地: ${effects}\n`;
			}

			// 对手场地效果
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
			const speciesName = p.ident.split(': ')[1];
			const speciesCN = this.translate(speciesName, 'pokemon');
			const speciesData = Dex.species.get(speciesName);
			let pokemonData: AnyObject | undefined = undefined;
			if(this.teamData) {	
				pokemonData = this.teamData.find(mon => {
					return this.isPokemonSame(mon.species, speciesName);
				});
			}

			state += `${i + 1}. ${speciesCN}`;

			// 队伍预览时不显示出战状态
			if (!isTeamPreview && p.active) state += ' [当前出战]';

			if (speciesData.types) {
				const typesCN = speciesData.types.map((t: string) => this.translate(t, 'types'));
				state += ` ${isTeamPreview ? '' : '属性:'}[${typesCN.join('/')}]`;
			}

			// 队伍预览时不显示HP和状态
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

			// 计算并显示速度能力值
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

				// 显示是否已太晶化
				if (this.myTerastallizedPokemon === speciesName) {
					state += ` [已太晶化]`;
				}
			}



			state += '\n';

			if (p.moves && p.moves.length > 0) {
				state += `   招式: `;
				const moveNames = p.moves.slice(0, isTeamPreview ? 4 : undefined).map((moveName: string) => {
					const moveData = Dex.moves.get(moveName);
					const moveCN = this.translate(moveData.name, 'moves');
					const typeCN = this.translate(moveData.type, 'types');
					const categoryCN = this.translate(moveData.category, 'category');
					let moveStr = `${moveCN}`;
					return moveStr;
				});
				state += moveNames.join(', ') + '\n';
			}
		});

		// 对手队伍信息
		state += '\n【对手队伍】\n';
		if (this.opponentTeamData && this.opponentTeamData.length > 0) {
			this.opponentTeamData.forEach((p: any, i: number) => {
				const speciesName = p.species;
				const speciesCN = this.translate(speciesName, 'pokemon');
				const speciesData = Dex.species.get(speciesName);

				state += `${i + 1}. ${speciesCN}`;

				// 队伍预览时不显示追踪状态
				if (!isTeamPreview) {
					const trackedPokemon = this.opponentTeam[speciesName];
					if (trackedPokemon && trackedPokemon.active) state += ' [当前出战]';
				}

				if (speciesData.types) {
					const typesCN = speciesData.types.map((t: string) => this.translate(t, 'types'));
					state += ` ${isTeamPreview ? '' : '属性:'}[${typesCN.join('/')}]`;
				}

				// 队伍预览时不显示HP和状态
				if (!isTeamPreview) {
					const trackedPokemon = this.opponentTeam[speciesName];
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

				// 计算并显示速度能力值
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

					// 显示是否已太晶化（从追踪的对手队伍信息中获取）
					const trackedPokemon = this.opponentTeam[speciesName];
					if (trackedPokemon && trackedPokemon.terastallized) {
						state += ` [已太晶化]`;
					}
				}

				state += '\n';

				if (p.moves && p.moves.length > 0) {
					state += `   招式: `;
					const moveNames = p.moves.slice(0, isTeamPreview ? 4 : undefined).map((moveName: string) => {
						const moveData = Dex.moves.get(moveName);
						const moveCN = this.translate(moveData.name, 'moves');
						const typeCN = this.translate(moveData.type, 'types');
						const categoryCN = this.translate(moveData.category, 'category');
						let moveStr = `${moveCN}`;
						return moveStr;
					});
					state += moveNames.join(', ') + '\n';
				}
			});
		} else {
			state += '（暂无对手信息）\n';
		}

		// 当前出战宝可梦详情（仅战斗中显示）
		if (!isTeamPreview && 'active' in request && request.active && request.active[0]) {
			const active = request.active[0];
			const currentPokemon = request.side.pokemon.find((p: any) => p.active);

			if (currentPokemon) {
				const speciesName = currentPokemon.ident.split(': ')[1];
				const speciesCN = this.translate(speciesName, 'pokemon');

				state += `\n【当前出战】\n${speciesCN}\n`;

				// 显示太晶化状态
				if (currentPokemon.teraType) {
					const teraTypeCN = this.translate(currentPokemon.teraType, 'types');
					if (this.myTerastallizedPokemon === speciesName) {
						// 当前宝可梦已经太晶化
						state += `\n已太晶化: ${teraTypeCN}\n`;
					} else if (active.canTerastallize && this.myTerastallizedPokemon === null) {
						// 只有在队伍里还没有宝可梦太晶化时，才能太晶化
						state += `\n可太晶化: ${teraTypeCN}\n`;
					} else if (this.myTerastallizedPokemon !== null && this.myTerastallizedPokemon !== speciesName) {
						// 队伍里已经有其他宝可梦太晶化了
						state += `\n队伍已使用太晶化`;
					}
				}
			}
		}

		return state;
	}

	/**
	 * 获取通用的系统提示词基础部分
	 */
	private getBaseSystemPrompt(): string {
		let debugInfo = '';
		if (this.debugmode) {
			debugInfo = '，并在后面加上一句解释，后面再加一句话翻译一下对手的操作是什么';
		}
		return `你是一名宝可梦对战专家，精通单打对战策略。
【任务】
现在是宝可梦全球对战的决赛现场，你的目标是夺得冠军。这是你最后一次参加比赛，每一步都务必谨慎思考，如果输掉这场比赛你就再也没机会参加了。
你需要根据计算公式和克制关系、现有的情报以及各种列出的考虑因素，选择胜率最高的行动方案。
【输出格式】只输出一句指令${debugInfo}
【重要】你有时候可以获得对手的操作，请你根据对手的操作信息做出压制。
【伤害计算】我会在提示词中提供精确的伤害计算结果，伤害用满血的百分比表示（包括我方全队对对手的伤害、对手对我方的伤害）。**必须使用这些精确数据**做决策。
伤害计算已考虑所有修正值（STAB、属性克制、天气、能力变化等）。
`;
	}

	/**
	 * 计算速度能力值
	 * Stat = ⌊(⌊0.01×(2×Base+IV+⌊EV÷4⌋)×Level⌋+5)×Nature⌋
	 */
	private calculateSpeedStat(baseSpeed: number, level: number, iv: number, ev: number, nature: string): number {
		// 基础计算
		let stat = Math.floor((Math.floor(0.01 * (2 * baseSpeed + iv + Math.floor(ev / 4)) * level) + 5));

		// 性格修正
		const natureLower = nature.toLowerCase();
		// 加速度的性格
		if (['timid', 'hasty', 'jolly', 'naive'].includes(natureLower)) {
			stat = Math.floor(stat * 1.1);
		}
		// 减速度的性格
		else if (['brave', 'relaxed', 'quiet', 'sassy'].includes(natureLower)) {
			stat = Math.floor(stat * 0.9);
		}

		return stat;
	}

	/**
	 * 为队伍预览计算伤害（当知道对手首发时）
	 */
	private calculateDamageForTeamPreview(request: TeamPreviewRequest, opponentFirstPokemonIndex: number): string {
		try {
			if (!this.opponentTeamData || !this.teamData) return '';

			const opponentPokemonData = this.opponentTeamData[opponentFirstPokemonIndex];
			if (!opponentPokemonData) return '';

			// 构建对手宝可梦数据（初始状态，无能力变化）
			const opponentData = {
				species: opponentPokemonData.species,
				level: opponentPokemonData.level || 100,
				nature: opponentPokemonData.nature || 'hardy',
				ivs: opponentPokemonData.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
				evs: opponentPokemonData.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
				ability: opponentPokemonData.ability,
				item: opponentPokemonData.item,
				teraType: opponentPokemonData.teraType,
				isTerastallized: false,
				boosts: undefined,
				status: undefined
			};

			const baseConditions = {
				weather: undefined,
				terrain: undefined,
				isReflect: false,
				isLightScreen: false
			};

			let result = '\n=== 针对对手首发宝可梦的伤害计算 ===\n\n';
			result += `【我方全队 → 对手首发${this.translate(opponentPokemonData.species, 'pokemon')}】\n\n`;

			// 遍历我方所有宝可梦
			for (let i = 0; i < this.teamData.length; i++) {
				const myPokemonData = this.teamData[i];

				const attackerData = {
					species: myPokemonData.species,
					level: myPokemonData.level || 100,
					nature: myPokemonData.nature || 'hardy',
					ivs: myPokemonData.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
					evs: myPokemonData.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
					ability: myPokemonData.ability,
					item: myPokemonData.item,
					teraType: myPokemonData.teraType,
					isTerastallized: false,
					boosts: undefined,
					status: undefined
				};

				const moves = myPokemonData.moves || [];
				if (moves.length === 0) continue;

				const pokemonCN = this.translate(myPokemonData.species, 'pokemon');
				result += `${i + 1}. ${pokemonCN}\n`;

				const calculations = DamageCalculator.calculateAllMoves(
					attackerData,
					opponentData,
					moves,
					baseConditions
				);

				result += DamageCalculator.formatCalculationResults(calculations);
				result += '\n';
			}

			// 计算对手首发宝可梦对我方所有宝可梦的伤害
			const opponentMoves = opponentPokemonData.moves || [];
			if (opponentMoves.length > 0) {
				const opponentPokemonCN = this.translate(opponentPokemonData.species, 'pokemon');
				result += `【对手首发${opponentPokemonCN} → 我方全队】\n\n`;

				for (let i = 0; i < this.teamData.length; i++) {
					const myPokemonData = this.teamData[i];

					const defenderData = {
						species: myPokemonData.species,
						level: myPokemonData.level || 100,
						nature: myPokemonData.nature || 'hardy',
						ivs: myPokemonData.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
						evs: myPokemonData.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
						ability: myPokemonData.ability,
						item: myPokemonData.item,
						teraType: myPokemonData.teraType,
						isTerastallized: false,
						boosts: undefined,
						status: undefined
					};

					const pokemonCN = this.translate(myPokemonData.species, 'pokemon');
					result += `${i + 1}. 对${pokemonCN}\n`;

					const opponentCalculations = DamageCalculator.calculateAllMoves(
						opponentData,
						defenderData,
						opponentMoves,
						baseConditions
					);

					let calculationResults = DamageCalculator.formatCalculationResults(opponentCalculations);
					result += calculationResults==='' ? '无伤害招式\n' : calculationResults;
					result += '\n';
				}
			}

			return result;
		} catch (error) {
			if (this.debugmode) console.error('队伍预览伤害计算失败:', error);
			return '';
		}
	}

	/**
	 * 计算所有伤害（直接返回字符串，不使用工具调用）
	 * @param playerChoiceInfo 玩家的选择信息（如果有的话），用于预测切换后的伤害计算
	 */
	private calculateAllDamages(request: SwitchRequest | TeamPreviewRequest | MoveRequest, playerChoiceInfo: string | null = null): string | null {
		try {
			// 获取当前出战的我方宝可梦
			const myActivePokemon = request.side.pokemon.find((p: any) => p.active);
			if (!myActivePokemon) return null;

			// 检查玩家是否选择切换
			let opponentTargetPokemonData: any = null;
			let opponentTargetSpeciesName: string | null = null;
			const switchMatch = playerChoiceInfo?.match(/switch\s+(\d+)/i);

			if (switchMatch && this.opponentTeamData) {
				// 玩家选择切换，使用即将上场的宝可梦
				const switchIndex = parseInt(switchMatch[1]) - 1;
				if (switchIndex >= 0 && switchIndex < this.opponentTeamData.length) {
					opponentTargetPokemonData = this.opponentTeamData[switchIndex];
					opponentTargetSpeciesName = opponentTargetPokemonData.species;
				}
			}

			// 如果没有切换信息，使用当前出战的对手宝可梦
			if (!opponentTargetPokemonData) {
				const opponentActivePokemon = Object.values(this.opponentTeam).find(p => p.active);
				if (!opponentActivePokemon) return null;

				opponentTargetSpeciesName = opponentActivePokemon.name;
				opponentTargetPokemonData = this.opponentTeamData?.find(mon =>
					this.isPokemonSame(mon.species, opponentActivePokemon.name)
				);
				if (!opponentTargetPokemonData) return null;
			}

			// 构建我方当前出战宝可梦数据
			const mySpeciesName = myActivePokemon.ident.split(': ')[1];
			const myPokemonData = this.teamData?.find(mon => this.isPokemonSame(mon.species, mySpeciesName));
			if (!myPokemonData) return null;

			const myData = {
				species: myPokemonData.species,
				level: myPokemonData.level || 100,
				nature: myPokemonData.nature || 'hardy',
				ivs: myPokemonData.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
				evs: myPokemonData.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
				ability: myPokemonData.ability,
				item: myPokemonData.item,
				teraType: myActivePokemon.teraType,
				isTerastallized: this.myTerastallizedPokemon === mySpeciesName,
				boosts: (myActivePokemon as any).boosts,
				status: (myActivePokemon as any).status
			};

			// 构建对手宝可梦数据（可能是当前在场的，也可能是即将上场的）
			const opponentData = {
				species: opponentTargetPokemonData.species,
				level: opponentTargetPokemonData.level || 100,
				nature: opponentTargetPokemonData.nature || 'hardy',
				ivs: opponentTargetPokemonData.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
				evs: opponentTargetPokemonData.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
				ability: opponentTargetPokemonData.ability,
				item: opponentTargetPokemonData.item,
				teraType: opponentTargetPokemonData.teraType,
				// 如果是切换，新上场的宝可梦没有太晶化和能力变化
				isTerastallized: switchMatch ? false : (this.opponentTeam[opponentTargetSpeciesName!]?.terastallized || false),
				boosts: switchMatch ? undefined : this.opponentTeam[opponentTargetSpeciesName!]?.boosts,
				status: switchMatch ? undefined : this.opponentTeam[opponentTargetSpeciesName!]?.status
			};

			// 自动从本地状态获取场地信息
			const baseConditions = {
				weather: this.weather || undefined,
				terrain: this.terrain || undefined
			};

			let result = '=== 伤害计算结果 ===\n';

			// 1. 计算我方所有宝可梦对对手宝可梦的伤害
			const opponentPokemonCN = this.translate(opponentTargetSpeciesName!, 'pokemon');
			if (switchMatch) {
				result += `【我方全队 → 对手即将上场的${opponentPokemonCN}】\n`;
			} else {
				result += `【我方全队 → 对手当前在场的${opponentPokemonCN}】\n`;
			}

			const allMyPokemon = request.side.pokemon;
			for (let i = 0; i < allMyPokemon.length; i++) {
				const pokemon = allMyPokemon[i];
				const pokemonSpeciesName = pokemon.ident.split(': ')[1];
				const pokemonData = this.teamData?.find(mon => this.isPokemonSame(mon.species, pokemonSpeciesName));

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
				result += `${i + 1}. ${pokemonCN}${isActive}\n`;

				const calculations = DamageCalculator.calculateAllMoves(
					attackerData,
					opponentData,
					moves,
					{
						...baseConditions,
						isReflect: this.opponentSideConditions.has('Reflect'),
						isLightScreen: this.opponentSideConditions.has('Light Screen')
					}
				);

				result += DamageCalculator.formatCalculationResults(calculations);
			}

			// 2. 计算对手宝可梦对我方所有存活宝可梦的伤害
			const opponentMoves = opponentTargetPokemonData.moves || [];
			if (opponentMoves.length > 0) {
				if (switchMatch) {
					result += `【对手即将上场的${opponentPokemonCN} → 我方全队】\n`;
				} else {
					result += `【对手当前在场的${opponentPokemonCN} → 我方全队】\n`;
				}

				// 遍历我方所有宝可梦
				for (let i = 0; i < allMyPokemon.length; i++) {
					const pokemon = allMyPokemon[i];
					const pokemonSpeciesName = pokemon.ident.split(': ')[1];
					const pokemonData = this.teamData?.find(mon => this.isPokemonSame(mon.species, pokemonSpeciesName));

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
					result += `${i + 1}. 对${pokemonCN}${isActive}\n`;

					const opponentCalculations = DamageCalculator.calculateAllMoves(
						opponentData,
						defenderData,
						opponentMoves,
						{
							...baseConditions,
							isReflect: this.mySideConditions.has('Reflect'),
							isLightScreen: this.mySideConditions.has('Light Screen')
						}
					);
					result += DamageCalculator.formatCalculationResults(opponentCalculations);
				}
			}

			return result;
		} catch (error) {
			if (this.debugmode) console.error('伤害计算失败:', error);
			return null;
		}
	}

	/**
	 * 调用 DeepSeek API
	 */
	private async callDeepSeek(prompt: string, systemPrompt: string): Promise<string | null> {
		if (this.debugmode) console.log('CallDeepSeek: ', systemPrompt , '\n', prompt);
		if (!this.apiKey) {
			return null;
		}

		try {
			const messages = [
				{ role: 'system', content: systemPrompt },
				...this.conversationHistory.slice(-6),
				{ role: 'user', content: prompt }
			];

			const response = await axios.post(
				this.apiUrl,
				{
					model: 'deepseek-chat',
					messages: messages,
					temperature: 0,
					max_tokens: 500
				},
				{
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${this.apiKey}`
					},
					timeout: 60000
				}
			);

			const aiResponse = response.data.choices[0].message.content;

			this.conversationHistory.push(
				{ role: 'user', content: prompt },
				{ role: 'assistant', content: aiResponse }
			);

			return aiResponse;
		} catch (error) {
			if (this.debugmode) console.error('DeepSeek API 调用失败:', error);
			return null;
		}
	}

	/**
	 * 解析 AI 响应
	 */
	private parseAIResponse(response: string): { type: string; index: number; terastallize?: boolean; team?: string } | null {
		if (this.debugmode) console.log('ParseAIResponse: ', response);
		if (!response) return null;

		const moveMatch = response.match(/move\s+(\d+)(\s+terastallize)?/i);
		if (moveMatch) {
			return {
				type: 'move',
				index: parseInt(moveMatch[1]) - 1,
				terastallize: !!moveMatch[2]
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

	/**
	 * 翻译玩家选择信息为中文
	 * @param choice 玩家选择（如 "move 1", "switch 3", "move 2 terastallize"）
	 * @param request 当前请求对象，用于获取对手的招式和宝可梦信息
	 * @returns 翻译后的中文描述
	 */
	private translatePlayerChoice(choice: string, request: MoveRequest): string {
		if (!choice) return '未知操作';

		// 解析 move 指令
		const moveMatch = choice.match(/move\s+(\d+)(\s+terastallize)?/i);
		if (moveMatch) {
			const moveIndex = parseInt(moveMatch[1]) - 1;
			const withTera = !!moveMatch[2];

			// 尝试从对手队伍数据中获取当前出战宝可梦的招式
			if (this.opponentTeamData && this.opponentTeamData.length > 0) {
				// 查找当前出战的对手宝可梦
				const activePokemon = Object.values(this.opponentTeam).find(p => p.active);
				if (activePokemon && activePokemon.name) {
					const pokemonData = this.opponentTeamData.find(p => this.isPokemonSame(p.species, activePokemon.name));
					if (pokemonData && pokemonData.moves && pokemonData.moves[moveIndex]) {
						const moveData = Dex.moves.get(pokemonData.moves[moveIndex]);
						const moveCN = this.translate(moveData.name, 'moves');
						const typeCN = this.translate(moveData.type, 'types');
						const categoryCN = this.translate(moveData.category, 'category');

						let result = `使用第 ${moveIndex + 1} 个招式【${moveCN}】（${typeCN}/${categoryCN}`;
						if (moveData.basePower) result += `/威力${moveData.basePower}`;
						result += '）';
						if (withTera) result += ' 并太晶化';
						return result;
					}
				}
			}

			// 如果无法获取具体招式信息，返回基本描述
			let result = `使用第 ${moveIndex + 1} 个招式`;
			if (withTera) result += ' 并太晶化';
			return result;
		}

		// 解析 switch 指令
		const switchMatch = choice.match(/switch\s+(\d+)/i);
		if (switchMatch) {
			const switchIndex = parseInt(switchMatch[1]) - 1;

			// 尝试从对手队伍数据中获取宝可梦信息
			if (this.opponentTeamData && this.opponentTeamData[switchIndex]) {
				const pokemonData = this.opponentTeamData[switchIndex];
				const speciesName = pokemonData.species;
				const speciesCN = this.translate(speciesName, 'pokemon');
				const speciesInfo = Dex.species.get(speciesName);

				let result = `换上第 ${switchIndex + 1} 号宝可梦【${speciesCN}】`;
				if (speciesInfo.types) {
					const typesCN = speciesInfo.types.map((t: string) => this.translate(t, 'types'));
					result += `（${typesCN.join('/')}）`;
				}
				return result;
			}

			// 如果无法获取具体宝可梦信息，返回基本描述
			return `换上第 ${switchIndex + 1} 号宝可梦`;
		}

		// 无法解析的选择
		return `${choice}（无法识别的操作）`;
	}

	/**
	 * 翻译函数
	 */
	private translate(text: string, category: string = 'pokemon'): string {
		if (!text) return text;
		return this.translator.translate(String(text), category);
	}

	/**
	 * 创建数字范围数组
	 */
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

		// 首先尝试从括号中提取基础种类名
		const bracketMatch = name.match(/\(([^)]+)\)/);
		if (bracketMatch) {
			// 如果有括号，使用括号内的名称作为基础种类
			return bracketMatch[1].trim();
		}

		// 如果没有括号，去掉地区形态后缀
		// 常见的后缀模式：-Hisui, -Alola, -Galar, -Paldea, -Yellow, -Red, -Blue, -* 等
		// 只要名称包含 -，就取第一部分作为基础名称
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
