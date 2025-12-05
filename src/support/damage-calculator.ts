/**
 * 宝可梦伤害计算器
 * 使用 @smogon/calc 官方库进行准确的伤害计算
 */

import { calculate, Generations, Pokemon, Move, Field } from '@smogon/calc';
import { Translator } from './translator';

const translator = Translator.getInstance();

interface PokemonStats {
	hp: number;
	atk: number;
	def: number;
	spa: number;
	spd: number;
	spe: number;
}

interface PokemonData {
	species: string;
	level: number;
	nature: string;
	ivs: PokemonStats;
	evs: PokemonStats;
	ability?: string;
	item?: string;
	teraType?: string;
	isTerastallized?: boolean;
	boosts?: Partial<PokemonStats>;
	status?: string;
}

interface BattleConditions {
	weather?: string;
	terrain?: string;
	isReflect?: boolean;
	isLightScreen?: boolean;
	isCriticalHit?: boolean;
}

interface DamageResult {
	minDamage: number;
	maxDamage: number;
	minPercent: number;
	maxPercent: number;
	isOHKO: boolean;
	description: string;
}

interface MoveCalculation {
	moveName: string;
	result: DamageResult;
}

export class DamageCalculator {
	/**
	 * 获取 Smogon Calc 的世代对象
	 */
	private static getGeneration(): any {
		return Generations.get(9); // 第九世代
	}

	/**
	 * 标准化特性/道具名称（去掉空格、连字符等）
	 */
	private static normalizeId(name: string): string {
		if (!name) return '';
		return name.toLowerCase().replace(/[\s-:.']+/g, '');
	}

	/**
	 * 将我们的 PokemonData 转换为 @smogon/calc 的 Pokemon 对象
	 */
	private static createPokemon(data: PokemonData): any {
		const gen = this.getGeneration();

		// 验证 species 是否有效
		if (!data.species) {
			throw new Error('Pokemon species is undefined or empty');
		}

		// 构建 Pokemon 配置
		const config: any = {
			level: data.level || 100,
			nature: data.nature || 'Serious', // @smogon/calc 的默认值
			ivs: data.ivs || { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
			evs: data.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
		};

		// 特性
		if (data.ability) {
			config.ability = data.ability;
		}

		// 道具
		if (data.item) {
			config.item = data.item;
		}

		// 太晶化：只有在已太晶化时才设置 teraType
		// @smogon/calc 通过 teraType 的存在来判断是否太晶化
		// 如果设置了 teraType，Pokemon 的 hasType() 会优先返回 teraType
		if (data.isTerastallized && data.teraType) {
			config.teraType = data.teraType;
		}

		// 能力变化（boosts）
		if (data.boosts) {
			config.boosts = {
				hp: data.boosts.hp || 0,  // HP 通常不会变化，但为了完整性还是加上
				atk: data.boosts.atk || 0,
				def: data.boosts.def || 0,
				spa: data.boosts.spa || 0,
				spd: data.boosts.spd || 0,
				spe: data.boosts.spe || 0
			};
		}

		// 状态异常
		if (data.status) {
			config.status = data.status;
		}

		return new Pokemon(gen, data.species, config);
	}

	/**
	 * 创建 Field 对象
	 */
	private static createField(conditions: BattleConditions = {}): any {
		const fieldConfig: any = {};

		// 天气
		if (conditions.weather) {
			const weatherMap: { [key: string]: string } = {
				'sunnyday': 'Sun',
				'raindance': 'Rain',
				'sandstorm': 'Sand',
				'snow': 'Snow',
				'hail': 'Hail',
				'desolateland': 'Harsh Sunshine',
				'primordialsea': 'Heavy Rain',
				'deltastream': 'Strong Winds'
			};
			const weatherId = this.normalizeId(conditions.weather);
			fieldConfig.weather = weatherMap[weatherId] || conditions.weather;
		}

		// 场地
		if (conditions.terrain) {
			const terrainMap: { [key: string]: string } = {
				'electricterrain': 'Electric',
				'grassyterrain': 'Grassy',
				'mistyterrain': 'Misty',
				'psychicterrain': 'Psychic'
			};
			const terrainId = this.normalizeId(conditions.terrain);
			fieldConfig.terrain = terrainMap[terrainId] || conditions.terrain;
		}

		// 场地效果（反射壁、光墙）
		const attackerSide: any = {};
		const defenderSide: any = {};

		if (conditions.isReflect) {
			defenderSide.isReflect = true;
		}

		if (conditions.isLightScreen) {
			defenderSide.isLightScreen = true;
		}

		if (Object.keys(defenderSide).length > 0) {
			fieldConfig.defenderSide = defenderSide;
		}

		if (Object.keys(attackerSide).length > 0) {
			fieldConfig.attackerSide = attackerSide;
		}

		return new Field(fieldConfig);
	}

	/**
	 * 计算招式伤害
	 */
	static calculateDamage(
		attacker: PokemonData,
		defender: PokemonData,
		moveName: string,
		conditions: BattleConditions = {}
	): DamageResult {
		try {
			const gen = this.getGeneration();

			// 创建攻击方和防守方
			const attackerPokemon = this.createPokemon(attacker);
			const defenderPokemon = this.createPokemon(defender);

			// 创建招式
			const move = new Move(gen, moveName);

			// 创建场地
			const field = this.createField(conditions);

			// 计算伤害
			const result = calculate(gen, attackerPokemon, defenderPokemon, move, field);

			// 获取伤害范围
			const damage = result.damage as number | number[];
			let minDamage: number = 0;
			let maxDamage: number = 0;

			if (typeof damage === 'number') {
				// 固定伤害
				minDamage = maxDamage = damage;
			} else if (Array.isArray(damage)) {
				// 伤害范围
				minDamage = damage[0] as number;
				maxDamage = damage[damage.length - 1] as number;
			}

			// 计算百分比
			const defenderHP = defenderPokemon.maxHP();
			const minPercent = (minDamage / defenderHP) * 100;
			const maxPercent = (maxDamage / defenderHP) * 100;

			// 判断是否一击必杀
			const isOHKO = minDamage >= defenderHP;

			// 检查是否免疫（伤害为0且不是固定伤害招式）
			if (maxDamage === 0 && move.category !== 'Status') {
				// 可能是特性免疫、属性免疫等
				return {
					minDamage: 0,
					maxDamage: 0,
					minPercent: 0,
					maxPercent: 0,
					isOHKO: false,
					description: `${translator.translate(moveName, 'moves')}：无效`
				};
			}

			// 变化招式
			if (move.category === 'Status') {
				return {
					minDamage: 0,
					maxDamage: 0,
					minPercent: 0,
					maxPercent: 0,
					isOHKO: false,
					description: `变化招式`
				};
			}

			// 生成描述
			let description = `${translator.translate(moveName, 'moves')}：${minPercent.toFixed(1)}%-${maxPercent.toFixed(1)}%`;
			if (isOHKO) {
				description += ' [一击必杀!]';
			}

			return {
				minDamage,
				maxDamage,
				minPercent,
				maxPercent,
				isOHKO,
				description
			};
		} catch (error) {
			// 如果计算失败（例如招式不存在），返回默认值
			console.error(`伤害计算失败: ${moveName}`, error);
			return {
				minDamage: 0,
				maxDamage: 0,
				minPercent: 0,
				maxPercent: 0,
				isOHKO: false,
				description: `${translator.translate(moveName, 'moves')}：计算失败`
			};
		}
	}

	/**
	 * 计算攻击方所有招式对防守方的伤害
	 */
	static calculateAllMoves(
		attacker: PokemonData,
		defender: PokemonData,
		moves: string[],
		conditions: BattleConditions = {}
	): MoveCalculation[] {
		return moves.map(moveName => ({
			moveName,
			result: this.calculateDamage(attacker, defender, moveName, conditions)
		}));
	}

	/**
	 * 格式化伤害计算结果为文本（供 AI 调用）
	 */
	static formatCalculationResults(calculations: MoveCalculation[]): string {
		let output = '';
		calculations.forEach((calc, index) => {
			if (calc.result.description !== '变化招式') {
				output += ` ${calc.result.description}`;
			}
		});
		return output;
	}
}
