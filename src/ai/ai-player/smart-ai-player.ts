/**
 * 智能AI - 基于BasePlayerAI，会做出更聪明的决策
 * 实现策略：
 * 1. 评估招式威力和效果
 * 2. 考虑属性克制关系
 * 3. 智能选择切换时机
 * 4. 优先使用高威力招式
 */

import { AIPlayer } from '../ai-player';
import { Dex } from 'pokemon-showdown/dist/sim/dex';
import type { 
    SwitchRequest,
    TeamPreviewRequest,
    MoveRequest
} from 'pokemon-showdown/dist/sim/side';

interface AnyObject { [k: string]: any }

export class SmartAIPlayer extends AIPlayer {
    constructor(
        playerStream: any,
        debug = false
    ) {
        super(playerStream, debug);
    }

    /**
	 * 处理强制切换（宝可梦倒下时）
	 */
	protected override handleForceSwitchRequest(request: SwitchRequest): void {
		const pokemon = request.side.pokemon;
		const chosen: number[] = [];
		const choices = request.forceSwitch.map((mustSwitch, i) => {
			if (!mustSwitch) return `pass`;

			const canSwitch = this.range(1, 6).filter(j => (
				pokemon[j - 1] &&
				// 不是当前出场的
				j > request.forceSwitch.length &&
				// 没有被选中进行同时切换
				!chosen.includes(j) &&
				// 没有倒下（或者使用复活祝福时是倒下状态）
				!pokemon[j - 1].condition.endsWith(` fnt`) === !pokemon[i].reviving
			));

			if (!canSwitch.length) return `pass`;
			
			// 智能选择最佳切换目标
			const target = this.chooseBestSwitch(
				canSwitch.map(slot => ({ slot, pokemon: pokemon[slot - 1] })),
				request
			);
			chosen.push(target);
			return `switch ${target}`;
		});

		this.choose(choices.join(`, `));
	}
	
	/**
	 * 处理队伍预览
	 */
	protected override handleTeamPreviewRequest(request: TeamPreviewRequest): void {
		// 默认选择，保持原始顺序
		this.choose(`default`);
	}
	
	/**
	 * 处理正常回合
	 */
	protected override handleActiveTurnRequest(request: MoveRequest): void {
		let [canMegaEvo, canUltraBurst, canZMove, canDynamax, canTerastallize] = [true, true, true, true, true];
		const pokemon = request.side.pokemon;
		const chosen: number[] = [];
		
		const choices = request.active.map((active: AnyObject, i: number) => {
			// 跳过倒下或指挥中的宝可梦
			if (pokemon[i].condition.endsWith(` fnt`) || pokemon[i].commanding) return `pass`;

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

			// 添加Z招式
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

			// 过滤盟友招式
			const hasAlly = pokemon.length > 1 && !pokemon[i ^ 1].condition.endsWith(` fnt`);
			const filtered = canMove.filter(m => m.target !== `adjacentAlly` || hasAlly);
			canMove = filtered.length ? filtered : canMove;

			// 构建招式选项
			const moves = canMove.map(m => {
				let move = `move ${m.slot}`;
				if (request.active.length > 1) {
					if ([`normal`, `any`, `adjacentFoe`].includes(m.target)) {
						move += ` 1`; // 默认攻击第一个目标
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

			// 获取可切换的宝可梦
			const canSwitch = this.range(1, 6).filter(j => (
				pokemon[j - 1] &&
				!pokemon[j - 1].active &&
				!chosen.includes(j) &&
				!pokemon[j - 1].condition.endsWith(` fnt`)
			));

			// 评估是否应该切换
			const shouldSwitch = this.shouldSwitch(active, pokemon[i], canSwitch, pokemon, request);
			
			if (shouldSwitch && canSwitch.length && !active.trapped) {
				const target = this.chooseBestSwitch(
					canSwitch.map(slot => ({ slot, pokemon: pokemon[slot - 1] })),
					request
				);
				chosen.push(target);
				return `switch ${target}`;
			} else if (moves.length) {
				// 选择最佳招式
				const bestMove = this.chooseBestMove(active, moves, pokemon[i], request);
				
				// 考虑Mega进化、极巨化等
				const shouldTransform = this.shouldTransform(active, pokemon[i], request);
				
				if (bestMove.endsWith(` zmove`)) {
					canZMove = false;
					return bestMove;
				} else if (shouldTransform) {
					if (canTerastallize) {
						canTerastallize = false;
						return `${bestMove} terastallize`;
					} else if (canDynamax) {
						canDynamax = false;
						return `${bestMove} dynamax`;
					} else if (canMegaEvo) {
						canMegaEvo = false;
						return `${bestMove} mega`;
					} else if (canUltraBurst) {
						canUltraBurst = false;
						return `${bestMove} ultra`;
					}
				}
				return bestMove;
			} else {
				throw new Error(`${this.constructor.name} 无法做出选择`);
			}
		});

		this.choose(choices.join(`, `));
	}

	/**
	 * 选择最佳招式
	 */
	private chooseBestMove(
		active: AnyObject, 
		moves: { choice: string, move: AnyObject }[],
		currentPokemon: AnyObject,
		request: MoveRequest
	): string {
		let bestMove = moves[0];
		let bestScore = -Infinity;

		for (const moveOption of moves) {
			const move = Dex.moves.get(moveOption.move.move);
			let score = 0;

			// 基础威力评分
			if (move.basePower) {
				score += move.basePower;
			} else if (move.category !== 'Status') {
				score += 50; // 特殊攻击招式默认分数
			}

			// 优先度加分
			if (move.priority && move.priority > 0) {
				score += move.priority * 10;
			}

			// 状态招式评分
			if (move.category === 'Status') {
				if (move.boosts) {
					score += 40; // 能力提升
				}
				if (move.heal) {
					score += 30; // 治疗招式
				}
				if (move.status) {
					score += 35; // 异常状态
				}
			}

			// 命中率影响
			if (typeof move.accuracy === 'number' && move.accuracy < 100) {
				score *= (move.accuracy / 100);
			}

			// Z招式加分
			if (moveOption.move.zMove) {
				score += 50;
			}

			if (score > bestScore) {
				bestScore = score;
				bestMove = moveOption;
			}
		}

		return bestMove.choice;
	}

	/**
	 * 选择最佳切换目标
	 */
	private chooseBestSwitch(
		switches: { slot: number, pokemon: AnyObject }[],
		request: SwitchRequest | MoveRequest
	): number {
		let bestSwitch = switches[0];
		let bestScore = -Infinity;

		for (const switchOption of switches) {
			const mon = switchOption.pokemon;
			let score = 0;

			// 基于生命值评分
			const hpPercent = this.getHPPercent(mon.condition);
			score += hpPercent * 50;

			// 没有异常状态加分
			if (!mon.condition.includes('slp') && 
				!mon.condition.includes('par') && 
				!mon.condition.includes('brn') &&
				!mon.condition.includes('psn') &&
				!mon.condition.includes('frz')) {
				score += 20;
			}

			if (score > bestScore) {
				bestScore = score;
				bestSwitch = switchOption;
			}
		}

		return bestSwitch.slot;
	}

	/**
	 * 判断是否应该切换
	 */
	private shouldSwitch(
		active: AnyObject,
		currentPokemon: AnyObject,
		canSwitch: number[],
		allPokemon: AnyObject[],
		request: MoveRequest
	): boolean {
		// 如果被困住，不能切换
		if (active.trapped) return false;

		// 如果没有可用招式，尝试切换
		const hasUsableMoves = active.moves.some((m: AnyObject) => !m.disabled);
		if (!hasUsableMoves && canSwitch.length > 0) return true;

		// 如果生命值很低（<30%），考虑切换
		const hpPercent = this.getHPPercent(currentPokemon.condition);
		if (hpPercent < 30 && canSwitch.length > 0) {
			return true;
		}

		return false;
	}

	/**
	 * 判断是否应该变形（Mega进化/极巨化等）
	 */
	private shouldTransform(
		active: AnyObject,
		currentPokemon: AnyObject,
		request: MoveRequest
	): boolean {
		// 简单策略：如果生命值>50%，考虑变形
		const hpPercent = this.getHPPercent(currentPokemon.condition);
		return hpPercent > 50;
	}

	/**
	 * 获取生命值百分比
	 */
	private getHPPercent(condition: string): number {
		const match = condition.match(/^(\d+)\/(\d+)/);
		if (match) {
			return (parseInt(match[1]) / parseInt(match[2])) * 100;
		}
		return 100;
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