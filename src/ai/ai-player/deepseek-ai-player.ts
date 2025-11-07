/**
 * DeepSeek AI 对战系统
 * 使用 DeepSeek API 进行智能对战决策
 */

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
}

export class DeepSeekAIPlayer extends AIPlayer {
	private readonly apiKey: string;
	private readonly apiUrl: string = 'https://api.deepseek.com/v1/chat/completions';
	private readonly translator: Translator;
	private conversationHistory: Array<{ role: string; content: string }> = [];
	private lastRequest: SwitchRequest | TeamPreviewRequest | MoveRequest | null = null;
	private opponentTeam: { [name: string]: OpponentPokemon } = {};
	private opponentTeamData: any[] | null = null;

    constructor(
        playerStream: any,
		opponentTeamData: any[] | null = null,
        debug = false
    ) {
        super(playerStream, debug);
		this.apiKey = process.env.DEEPSEEK_API_KEY || '';
		this.translator = Translator.getInstance();
		this.opponentTeamData = opponentTeamData;
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
					return await this.chooseMoveWithAI(active, moves, [], pokemon[i], request, canTerastallize);
				} else {
					return 'pass';
				}
			} else {
				// 让AI决定是使用招式还是切换
				const switchOptions = canSwitch.map(slot => ({ slot, pokemon: pokemon[slot - 1] }));
				return await this.chooseMoveOrSwitchWithAI(active, moves, switchOptions, pokemon[i], request, canTerastallize);
			}
		});

		const choices = await Promise.all(choicePromises);
		this.choose(choices.join(', '));
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
			
			const systemPrompt = `你是一个宝可梦对战专家。根据当前战况，选择胜率最高的宝可梦出战。考虑：
				1. 我方队伍的配合状态
				2. HP状况和异常状态，以及属性克制
				3. 特性和道具配合
				4. 场上局势和对手状态
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

		try {
			const battleState = this.buildBattleState(request, true);
			const prompt = `${battleState}\n\n请分析双方队伍，选择最优的首发宝可梦顺序。考虑属性克制、速度、特性和招式配合。请直接回答顺序，格式：team 123456（数字为宝可梦编号，首发在最前）`;

			const systemPrompt = `你是一个宝可梦对战专家。根据双方队伍信息，选择胜率最高的出战顺序。考虑：
				1. 首发宝可梦应该有利于整个队伍的配合
				2. 考虑速度优势
				3. 考虑特性和道具的配合
				4. 平衡队伍的攻守
				请只回答 team 后面跟6个数字的顺序，如：team 123456`;

			const aiResponse = await this.callDeepSeek(prompt, systemPrompt);

			if (aiResponse) {
				const match = aiResponse.match(/team\s*(\d{1,6})/i);
				if (match) {
					return `team ${match[1]}`;
				}
			}
		} catch (error) {
			console.error('AI队伍预览失败:', error);
		}

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
		canTerastallize: boolean
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
					actions += `  move ${i + 1}: ${moveCN} [${typeCN}]`;
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
			if (active.canTerastallize && canTerastallize) {
				extraInfo += '\n提示: 可以在使用招式时同时太晶化（例如：move 1 terastallize）\n';
			}

			const prompt = `${battleState}${extraInfo}\n\n${actions}\n\n请分析当前战况，选择最佳行动。只输出指令，不要解释。指令格式：move X（使用第X个招式）、move X terastallize（使用第X个招式并太晶化）、switch X（切换到第X个宝可梦）`;

			const systemPrompt = `你是一个宝可梦对战专家。现在你要进行六六单打，你需要根据当前战场状态，选择胜率最高的操作：
				考虑因素包括：
				1. 如何和队友进行配合进攻以及防守，考虑谁辅助谁输出
				2. 考虑双方在场宝可梦招式的威力、属性克制、命中率、当前HP状况和能力变化
				3. 考虑双方剩余宝可梦的状态
				4. 场地效果和天气影响
				5. 是否需要太晶化
				6. 必要时，需要预判对手会做出的行为
				7. 是否需要交换宝可梦（考虑换人时机）
				请务必只回答指令格式（X是数字）：招式指令为move X 或 move X terastallize，交换宝可梦指令为switch X`;

			const aiResponse = await this.callDeepSeek(prompt, systemPrompt);

			if (aiResponse) {
				const parsed = this.parseAIResponse(aiResponse);

				if (parsed && parsed.type === 'move' && moves[parsed.index]) {
					let choice = moves[parsed.index].choice;
					if (parsed.terastallize && active.canTerastallize && canTerastallize) {
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
		canTerastallize: boolean
	): Promise<string> {
		return await this.chooseMoveOrSwitchWithAI(active, moves, switches, currentPokemon, request, canTerastallize);
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
							const statusMap: { [key: string]: string } = {
								'psn': '中毒', 'tox': '剧毒', 'brn': '灼伤',
								'par': '麻痹', 'slp': '睡眠', 'frz': '冰冻'
							};
							state += ` [${statusMap[status] || status}]`;
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
			}

			state += '\n';

			if (p.moves && p.moves.length > 0) {
				state += `   招式: `;
				const moveNames = p.moves.slice(0, isTeamPreview ? 4 : undefined).map((moveName: string) => {
					const moveData = Dex.moves.get(moveName);
					const moveCN = this.translate(moveData.name, 'moves');
					const typeCN = this.translate(moveData.type, 'types');
					let moveStr = `${moveCN}[${typeCN}]`;
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
							state += `  ${index + 1}. ${moveCN} [${typeCN}]`;
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

				if (active.canTerastallize) {
					const teraTypeCN = currentPokemon.teraType ? this.translate(currentPokemon.teraType, 'types') : '未知';
					state += `\n可太晶化！太晶属性: ${teraTypeCN}\n`;
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
						const statusMap: { [key: string]: string } = {
							'psn': '中毒', 'tox': '剧毒', 'brn': '灼伤',
							'par': '麻痹', 'slp': '睡眠', 'frz': '冰冻'
						};
						state += ` [${statusMap[trackedPokemon.status] || trackedPokemon.status}]`;
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
				}

				state += '\n';

				if (p.moves && p.moves.length > 0) {
					state += `   招式: `;
					const moveNames = p.moves.slice(0, isTeamPreview ? 4 : undefined).map((moveName: string) => {
						const moveData = Dex.moves.get(moveName);
						const moveCN = this.translate(moveData.name, 'moves');
						const typeCN = this.translate(moveData.type, 'types');
						let moveStr = `${moveCN}[${typeCN}]`;
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
	 * 调用 DeepSeek API
	 */
	private async callDeepSeek(prompt: string, systemPrompt: string): Promise<string | null> {
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
	private parseAIResponse(response: string): { type: string; index: number; terastallize?: boolean } | null {
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
