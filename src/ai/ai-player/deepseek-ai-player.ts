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
		opponentTeamData: any[] | null = null,
		debug = false
	) {
		super(playerStream, debug);
		this.apiKey = process.env.DEEPSEEK_API_KEY || '';
		this.translator = Translator.getInstance();
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

			const prompt = `${battleState}\n\n${actions}\n\n你的宝可梦倒下了，请选择下一个出战的宝可梦。考虑属性克制、HP状况、特性和场上局势。只输出指令，不要解释。格式：switch X（X为宝可梦编号）`;

			const systemPrompt = `你是一个宝可梦对战专家。根据当前战况，选择胜率最高的宝可梦出战。

${this.getBaseSystemPrompt()}

【考虑因素】
1. 属性克制和速度优势（比较种族值）
2. HP状况和异常状态
3. 特性和道具配合
4. 队伍配合和场上局势

请只回答 switch X 格式，X为宝可梦编号`;

			const aiResponse = await this.callDeepSeek(prompt, systemPrompt);

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
			if (playerTeamInfo) {
				extraInfo = `\n\n【重要情报】对手选择的首发顺序是: ${playerTeamInfo}\n请根据对手的首发选择做出最优反制！\n`;
			}

			const prompt = `${battleState}${extraInfo}\n\n请分析双方队伍，选择最优的首发宝可梦顺序。考虑属性克制、速度、特性和招式配合。请直接回答顺序，格式：team 123456（数字为宝可梦编号，首发在最前）`;

			const systemPrompt = `你是一个宝可梦对战专家。根据双方队伍信息，选择胜率最高的出战顺序。

${this.getBaseSystemPrompt()}

【考虑因素】
1. 首发宝可梦的队伍配合能力
2. 速度优势（速度种族值+26）
3. 属性克制和招式威力
4. 特性和道具配合
5. 攻守平衡

请只回答 team 后面跟6个数字的顺序，如：team 123456。不许返回空值，也不要返回任何解释`;

			const aiResponse = await this.callDeepSeek(prompt, systemPrompt);
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
					if (moveData.basePower) actions += ` 威力:${moveData.basePower}`;
					if (moveData.accuracy === true) {
						actions += ` 命中:必中`;
					} else if (typeof moveData.accuracy === 'number') {
						actions += ` 命中:${moveData.accuracy}%`;
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
				extraInfo += `\n【重要情报】对手选择了: ${playerChoiceInfo}\n请根据对手的选择做出最优反制！\n`;
			}

			const prompt = `${battleState}${extraInfo}\n\n${actions}\n\n请分析当前战况，选择最佳行动。只输出指令，不要解释。指令格式：move X（使用第X个招式）、move X terastallize（使用第X个招式并太晶化）、switch X（切换到第X个宝可梦）`;

			const systemPrompt = `你是一个宝可梦对战专家。现在你要进行六六单打，你需要根据当前战场状态，选择胜率最高的操作。

${this.getBaseSystemPrompt()}

【考虑因素】
1. 队友配合：考虑谁辅助谁输出
2. 伤害计算：根据种族值、威力、属性克制精确计算伤害
3. 速度判断：比较双方速度种族值，判断先后手
4. 剩余宝可梦状态和HP
5. 场地效果和天气影响
6. 太晶化时机
7. 预判对手行为
8. 换人时机

请务必只回答指令格式（X是数字）：招式指令为move X 或 move X terastallize，交换宝可梦指令为switch X`;

			const aiResponse = await this.callDeepSeek(prompt, systemPrompt);

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

			state += `${i + 1}. ${speciesCN}`;

			// 队伍预览时不显示出战状态
			if (!isTeamPreview && p.active) state += ' [当前出战]';

			if (speciesData.types) {
				const typesCN = speciesData.types.map((t: string) => this.translate(t, 'types'));
				state += ` ${isTeamPreview ? '' : '属性:'}[${typesCN.join('/')}]`;
			}

			// 添加种族值信息
			if (speciesData.baseStats) {
				const stats = speciesData.baseStats;
				state += ` 种族值:[HP${stats.hp}/攻${stats.atk}/防${stats.def}/特攻${stats.spa}/特防${stats.spd}/速${stats.spe}]`;
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
					let moveStr = `${moveCN}[${typeCN}/${categoryCN}]`;
					if (!isTeamPreview && moveData.basePower) moveStr += `威力${moveData.basePower}`;
					return moveStr;
				});
				state += moveNames.join(', ') + '\n';
			}
		});

		// 当前出战宝可梦详情（仅战斗中显示）
		if (!isTeamPreview && 'active' in request && request.active && request.active[0]) {
			const active = request.active[0];
			const currentPokemon = request.side.pokemon.find((p: any) => p.active);

			if (currentPokemon) {
				const speciesName = currentPokemon.ident.split(': ')[1];
				const speciesCN = this.translate(speciesName, 'pokemon');

				state += `\n【当前出战详情】${speciesCN}\n`;

				if (active.moves) {
					state += '可用招式:\n';
					active.moves.forEach((move: any, index: number) => {
						if (!move.disabled) {
							const moveData = Dex.moves.get(move.move);
							const moveCN = this.translate(moveData.name, 'moves');
							const typeCN = this.translate(moveData.type, 'types');
							const categoryCN = this.translate(moveData.category, 'category');
							state += `  ${index + 1}. ${moveCN} [${typeCN}/${categoryCN}]`;
							if (moveData.basePower) state += ` 威力:${moveData.basePower}`;
							if (moveData.accuracy === true) {
								state += ` 命中:必中`;
							} else if (typeof moveData.accuracy === 'number') {
								state += ` 命中:${moveData.accuracy}%`;
							}
							if (move.pp !== undefined) state += ` PP:${move.pp}/${move.maxpp}`;
							state += '\n';
						}
					});
				}

				// 显示太晶化状态
				if (currentPokemon.teraType) {
					const teraTypeCN = this.translate(currentPokemon.teraType, 'types');
					if (this.myTerastallizedPokemon === speciesName) {
						// 当前宝可梦已经太晶化
						state += `\n已太晶化！太晶属性: ${teraTypeCN}\n`;
					} else if (active.canTerastallize && this.myTerastallizedPokemon === null) {
						// 只有在队伍里还没有宝可梦太晶化时，才能太晶化
						state += `\n可太晶化！太晶属性: ${teraTypeCN}\n`;
					} else if (this.myTerastallizedPokemon !== null && this.myTerastallizedPokemon !== speciesName) {
						// 队伍里已经有其他宝可梦太晶化了
						state += `\n太晶属性: ${teraTypeCN} (队伍已使用太晶化)\n`;
					}
				}
			}
		}

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

				// 添加种族值信息
				if (speciesData.baseStats) {
					const stats = speciesData.baseStats;
					state += ` 种族值:[HP${stats.hp}/攻${stats.atk}/防${stats.def}/特攻${stats.spa}/特防${stats.spd}/速${stats.spe}]`;
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
						let moveStr = `${moveCN}[${typeCN}/${categoryCN}]`;
						if (!isTeamPreview && moveData.basePower) moveStr += `威力${moveData.basePower}`;
						return moveStr;
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
	 * 获取通用的系统提示词基础部分
	 */
	private getBaseSystemPrompt(): string {
		return `【对战规则】
- 所有宝可梦等级50级
- 性格：勤奋（无属性加成/减成）
- 个体值(IV)每项31
- 努力值(EV)每项85

【能力值计算公式(根据宝可梦规则)】
HP = 种族值 + 86
其他能力 = 种族值 + 31

【伤害计算公式(根据宝可梦规则)】
伤害 = ((等级×2÷5+2) × 威力 × (特)攻击÷(特)防御 ÷50 + 2) × 修正值
修正值包括：
- 属性一致加成(STAB)：×1.5
- 属性克制：×2(效果绝佳) ×0.5(效果不好) ×0.25(双重抗性) ×0(无效)
- 随机数：0.85~1.0
- 天气/场地加成：×1.5或×0.5
- 太晶化：属性一致时×2.0，非一致时×1.5

【属性克制关系】
效果绝佳(×2)：
- 火→草/冰/虫/钢  水→火/地/岩  草→水/地/岩  电→水/飞
- 冰→草/地/飞/龙  格斗→普/冰/岩/恶/钢  毒→草/妖  地→火/电/毒/岩/钢
- 飞→草/格斗/虫  超能→格斗/毒  虫→草/超能/恶  岩→火/冰/飞/虫
- 幽灵→超能/幽灵  龙→龙  恶→超能/幽灵  钢→冰/岩/妖  妖→格斗/龙/恶

效果不好(×0.5)：
- 火→火/水/岩/龙  水→水/草/龙  草→火/草/毒/飞/虫/龙/钢
- 电→电/草/龙  冰→火/水/冰/钢  格斗→毒/飞/超能/虫/妖
- 毒→毒/地/岩/幽灵  地→草/虫  飞→电/岩/钢  超能→超能/钢
- 虫→火/格斗/毒/飞/幽灵/钢/妖  岩→格斗/地/钢  幽灵→恶
- 龙→钢  恶→格斗/恶/妖  钢→火/水/电/钢  妖→毒/钢

无效(×0)：
- 普/格斗→幽灵  地→飞  幽灵→普  电→地  超能→恶  龙→妖`;
	}

	/**
	 * 调用 DeepSeek API
	 */
	private async callDeepSeek(prompt: string, systemPrompt: string): Promise<string | null> {
		if (this.debugmode) console.log('CallDeepSeek: ', prompt, systemPrompt);
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
					temperature: 0.7,
					max_tokens: 500
				},
				{
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${this.apiKey}`
					},
					timeout: 10000
				}
			);

			const aiResponse = response.data.choices[0].message.content;

			this.conversationHistory.push(
				{ role: 'user', content: prompt },
				{ role: 'assistant', content: aiResponse }
			);

			return aiResponse;
		} catch (error) {
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
}
