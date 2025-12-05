/**
 * 双打战斗状态管理
 * 专门用于VGC双打对战的状态管理
 */

const { normalizeSpeciesName } = require('../battle_common/battle-state');

/**
 * 双打玩家状态
 */
class DoublesPlayerState {
	constructor(team) {
		this.team = team;
		// 双打同时有两个活跃宝可梦
		this.activePokemon = [null, null]; // [位置1, 位置2]
		this.terastallizedPokemon = null;
		this.teraType = null;
	}

	/**
	 * 切换指定位置的宝可梦
	 * @param {number} slot - 位置 (0 或 1)
	 * @param {string} species - 基础种类名
	 * @param {string} name - 完整名称
	 * @param {string} hp - HP状态
	 * @param {string} details - 详细信息
	 */
	switchPokemon(slot, species, name, hp, details = null) {
		// 提取等级信息
		let level = 50;
		if (details) {
			const levelMatch = details.match(/L(\d+)/);
			if (levelMatch) {
				level = parseInt(levelMatch[1]);
			}
		}

		// 提取状态
		let status = null;
		if (hp && hp.includes(' ')) {
			const hpParts = hp.split(' ');
			if (hpParts.length > 1) {
				status = hpParts[1];
			}
		}

		this.activePokemon[slot] = {
			species,
			name,
			condition: hp,
			status,
			boosts: {},
			level
		};
	}

	/**
	 * 获取指定位置的宝可梦
	 */
	getPokemon(slot) {
		return this.activePokemon[slot];
	}

	/**
	 * 太晶化
	 */
	terastallize(species, teraType) {
		this.terastallizedPokemon = species;
		this.teraType = teraType;
	}

	/**
	 * 检查是否已太晶化
	 */
	isTerastallized(species) {
		return this.terastallizedPokemon === species;
	}

	/**
	 * 设置指定位置宝可梦的状态
	 */
	setStatus(slot, status) {
		if (this.activePokemon[slot]) {
			this.activePokemon[slot].status = status;
		}
	}

	/**
	 * 清除指定位置宝可梦的状态
	 */
	clearStatus(slot) {
		if (this.activePokemon[slot]) {
			this.activePokemon[slot].status = null;
		}
	}

	/**
	 * 增加能力等级
	 */
	boost(slot, stat, amount) {
		if (this.activePokemon[slot]) {
			const boosts = this.activePokemon[slot].boosts;
			boosts[stat] = (boosts[stat] || 0) + amount;
		}
	}

	/**
	 * 降低能力等级
	 */
	unboost(slot, stat, amount) {
		if (this.activePokemon[slot]) {
			const boosts = this.activePokemon[slot].boosts;
			boosts[stat] = (boosts[stat] || 0) - amount;
		}
	}

	/**
	 * 设置能力等级
	 */
	setBoost(slot, stat, amount) {
		if (this.activePokemon[slot]) {
			this.activePokemon[slot].boosts[stat] = amount;
		}
	}

	/**
	 * 清除指定位置宝可梦的所有能力变化
	 */
	clearBoosts(slot) {
		if (this.activePokemon[slot]) {
			this.activePokemon[slot].boosts = {};
		}
	}
}

/**
 * 双打对手状态
 */
class DoublesOpponentState {
	constructor() {
		this.activePokemon = [null, null];
		this.faintedPokemon = new Set();
		this.terastallizedPokemon = null;
		this.teraType = null;
		this.seenPokemon = new Map();
		this.totalPokemonCount = 4; // VGC默认4只
	}

	/**
	 * 切换指定位置的宝可梦
	 */
	switchPokemon(slot, species, name, hp, details = null) {
		let level = 50;
		if (details) {
			const levelMatch = details.match(/L(\d+)/);
			if (levelMatch) {
				level = parseInt(levelMatch[1]);
			}
		}

		let status = null;
		if (hp && hp.includes(' ')) {
			const hpParts = hp.split(' ');
			if (hpParts.length > 1) {
				status = hpParts[1];
			}
		}

		this.activePokemon[slot] = {
			species,
			name,
			condition: hp,
			status,
			boosts: {},
			level
		};

		// 记录见过的宝可梦
		const normalizedSpecies = normalizeSpeciesName(species);
		if (!this.seenPokemon.has(normalizedSpecies)) {
			this.seenPokemon.set(normalizedSpecies, {
				species: species,
				level: level,
				hp: 100,
				maxhp: 100,
				condition: hp || '100/100',
				active: true,
				fainted: false
			});
		} else {
			const pokemon = this.seenPokemon.get(normalizedSpecies);
			pokemon.condition = hp || pokemon.condition;
			pokemon.active = true;
			pokemon.fainted = false;
			if (level) pokemon.level = level;
		}
	}

	/**
	 * 获取指定位置的宝可梦
	 */
	getPokemon(slot) {
		return this.activePokemon[slot];
	}

	/**
	 * 标记宝可梦昏厥
	 */
	markFainted(species) {
		const normalizedSpecies = normalizeSpeciesName(species);
		this.faintedPokemon.add(normalizedSpecies);

		if (this.seenPokemon.has(normalizedSpecies)) {
			const pokemon = this.seenPokemon.get(normalizedSpecies);
			pokemon.fainted = true;
			pokemon.active = false;
		}
	}

	/**
	 * 太晶化
	 */
	terastallize(species, teraType) {
		this.terastallizedPokemon = species;
		this.teraType = teraType;
	}

	/**
	 * 检查是否已太晶化
	 */
	isTerastallized(species) {
		return this.terastallizedPokemon === species;
	}

	/**
	 * 设置状态
	 */
	setStatus(slot, status) {
		if (this.activePokemon[slot]) {
			this.activePokemon[slot].status = status;
		}
	}

	/**
	 * 清除状态
	 */
	clearStatus(slot) {
		if (this.activePokemon[slot]) {
			this.activePokemon[slot].status = null;
		}
	}

	/**
	 * 能力变化方法
	 */
	boost(slot, stat, amount) {
		if (this.activePokemon[slot]) {
			const boosts = this.activePokemon[slot].boosts;
			boosts[stat] = (boosts[stat] || 0) + amount;
		}
	}

	unboost(slot, stat, amount) {
		if (this.activePokemon[slot]) {
			const boosts = this.activePokemon[slot].boosts;
			boosts[stat] = (boosts[stat] || 0) - amount;
		}
	}

	setBoost(slot, stat, amount) {
		if (this.activePokemon[slot]) {
			this.activePokemon[slot].boosts[stat] = amount;
		}
	}

	clearBoosts(slot) {
		if (this.activePokemon[slot]) {
			this.activePokemon[slot].boosts = {};
		}
	}

	/**
	 * 获取剩余存活数量
	 */
	getRemainingCount() {
		return this.totalPokemonCount - this.faintedPokemon.size;
	}

	/**
	 * 从队伍预览添加宝可梦
	 */
	addFromTeamPreview(pokemonNames) {
		pokemonNames.forEach(name => {
			const normalizedSpecies = normalizeSpeciesName(name);
			if (!this.seenPokemon.has(normalizedSpecies)) {
				this.seenPokemon.set(normalizedSpecies, {
					species: name,
					level: 50,
					hp: 100,
					maxhp: 100,
					condition: '100/100',
					active: false,
					fainted: false
				});
			}
		});
		this.totalPokemonCount = pokemonNames.length;
	}
}

/**
 * 双打战斗场地状态（复用单打的BattleField）
 */
const { BattleField } = require('../battle_common/battle-state');

/**
 * 双打战斗总状态
 */
class DoublesBattleState {
	constructor(playerTeam, opponentTeam, formatId) {
		this.currentTurn = 0;
		this.battleEnded = false;
		this.battleInitialized = false;
		this.isProcessingChoice = false;

		this.currentRequest = null;
		this.lastRequest = null;
		this.pendingTeamPreviewRequest = null;

		this.field = new BattleField();
		this.player = new DoublesPlayerState(playerTeam);
		this.opponent = new DoublesOpponentState();
		this.opponentTeam = opponentTeam;

		this.lastWeather = null;
		this.lastTerrain = null;

		this.formatId = formatId;
	}

	/**
	 * 开始新回合
	 */
	startTurn(turnNumber) {
		this.currentTurn = turnNumber;
		this.lastTerrain = this.field.terrain;
	}

	/**
	 * 结束战斗
	 */
	endBattle() {
		this.battleEnded = true;
	}

	/**
	 * 请求管理
	 */
	setCurrentRequest(request) {
		this.currentRequest = request;
	}

	saveLastRequest() {
		if (this.currentRequest) {
			this.lastRequest = this.currentRequest;
		}
	}

	clearCurrentRequest() {
		this.currentRequest = null;
	}

	/**
	 * 选择处理标志
	 */
	startProcessingChoice() {
		this.isProcessingChoice = true;
	}

	endProcessingChoice() {
		this.isProcessingChoice = false;
	}

	/**
	 * 获取对手剩余存活的宝可梦
	 */
	getOpponentAlivePokemon() {
		if (!this.opponentTeam) return [];
		return this.opponentTeam.filter(p => {
			const normalizedSpecies = normalizeSpeciesName(p.species);
			return !this.opponent.faintedPokemon.has(normalizedSpecies);
		});
	}
}

module.exports = {
	BattleStateVGC: DoublesBattleState,
	PlayerStateVGC: DoublesPlayerState,
	OpponentStateVGC: DoublesOpponentState
};
