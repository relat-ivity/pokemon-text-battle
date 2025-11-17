/**
 * 战斗消息处理器
 * 负责解析和处理 Pokemon Showdown 的战斗消息
 */

const Sim = require('pokemon-showdown');
const { isPokemonSame } = require('./battle-state');

class BattleMessageHandler {
	constructor(battleState, translator, debugMode = false) {
		this.state = battleState;
		this.translator = translator;
		this.debugMode = debugMode;
		this.isPokemonSame = isPokemonSame;
	}

	/**
	 * 处理单行消息
	 */
	handleMessage(line) {
		if (this.debugMode) {
			console.log("[Debug] " + line);
		}

		// 战斗初始化
		if (line === '|start') {
			this.state.battleInitialized = true;
			return;
		}

		// 战斗结束
		if (line.startsWith('|win|')) {
			const winner = line.split('|win|')[1];
			this.state.endBattle();
			console.log('\n战斗结束！');
			console.log(`胜者: ${winner}`);
			return;
		}

		if (line === '|tie') {
			this.state.endBattle();
			console.log('\n战斗结束！平局！');
			return;
		}

		// 回合开始
		if (line.startsWith('|turn|')) {
			this.handleTurn(line);
			return;
		}

		// 宝可梦切换
		if (line.startsWith('|switch|')) {
			this.handleSwitch(line);
			return;
		}

		// 招式使用
		if (line.startsWith('|move|')) {
			this.handleMove(line);
			return;
		}

		// 伤害
		if (line.startsWith('|-damage|')) {
			this.handleDamage(line);
			return;
		}

		// 恢复
		if (line.startsWith('|-heal|')) {
			this.handleHeal(line);
			return;
		}

		// 异常状态
		if (line.startsWith('|-status|')) {
			this.handleStatus(line);
			return;
		}

		// 解除异常状态
		if (line.startsWith('|-curestatus|')) {
			this.handleCureStatus(line);
			return;
		}

		// 昏厥
		if (line.startsWith('|faint|')) {
			this.handleFaint(line);
			return;
		}

		// 效果拔群/不理想/会心/免疫/未命中
		if (line.startsWith('|-supereffective')) {
			console.log('  → 效果拔群!');
			return;
		}
		if (line.startsWith('|-resisted')) {
			console.log('  → 效果不理想...');
			return;
		}
		if (line.startsWith('|-crit')) {
			console.log('  → 会心一击!');
			return;
		}
		if (line.startsWith('|-immune')) {
			console.log('  → 没有效果!');
			return;
		}
		if (line.startsWith('|-miss')) {
			console.log('  → 攻击没有命中!');
			return;
		}

		// 太晶化
		if (line.startsWith('|-terastallize|')) {
			this.handleTerastallize(line);
			return;
		}

		// 能力变化
		if (line.startsWith('|-boost|')) {
			this.handleBoost(line);
			return;
		}
		if (line.startsWith('|-unboost|')) {
			this.handleUnboost(line);
			return;
		}
		if (line.startsWith('|-clearboost|') || line.startsWith('|-clearallboost|')) {
			this.handleClearBoost(line);
			return;
		}

		// 场地效果
		if (line.startsWith('|-sidestart|')) {
			this.handleSideStart(line);
			return;
		}
		if (line.startsWith('|-sideend|')) {
			this.handleSideEnd(line);
			return;
		}

		// 天气
		if (line.startsWith('|-weather|')) {
			this.handleWeather(line);
			return;
		}

		// 场地
		if (line.startsWith('|-fieldstart|')) {
			this.handleFieldStart(line);
			return;
		}
		if (line.startsWith('|-fieldend|')) {
			this.handleFieldEnd(line);
			return;
		}
	}

	/**
	 * 处理回合开始
	 */
	handleTurn(line) {
		const turn = parseInt(line.split('|turn|')[1]);
		this.state.startTurn(turn);
		// 注意：这里不打印回合信息，由主函数控制
	}

	/**
	 * 处理宝可梦切换
	 */
	handleSwitch(line) {
		const parts = line.split('|');
		const playerTag = parts[2]; // "p2a: Indeedee"
		const details = parts[3]; // "Indeedee-F, L50, F"
		const hp = parts[4] || '';
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		// 从 playerTag 提取 species（基础名称，用于太晶化比较）
		const species = playerTag.split(': ')[1]; // "Indeedee"
		// 从 details 提取 name（完整名称，用于显示）
		const name = details.split(',')[0]; // "Indeedee-F"
		const nameCN = this.translate(name, 'pokemon');

		console.log(`\n${player} 派出了 ${nameCN} ${hp ? '(HP: ' + hp + ')' : ''}`);

		if (isPlayer) {
			this.state.player.switchPokemon(species, name, hp, details);
			if (this.debugMode) {
				console.log(`[Debug] 玩家切换: name='${name}', species='${species}'`);
			}
		} else {
			this.state.opponent.switchPokemon(species, name, hp, details);
			if (this.debugMode) {
				console.log(`[Debug] 对手切换: name='${name}', species='${species}', hp='${hp}'`);
			}
		}
	}

	/**
	 * 处理招式使用
	 */
	handleMove(line) {
		const parts = line.split('|');
		const attacker = parts[2];
		const move = parts[3];
		const isPlayer = attacker.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const attackerName = attacker.split(': ')[1];
		const attackerCN = this.translate(attackerName, 'pokemon');

		// 通过 Dex 获取标准招式名称
		const moveData = Sim.Dex.moves.get(move);
		const moveName = moveData.name || move;
		const moveCN = this.translate(moveName, 'moves');

		console.log(`\n${player} ${attackerCN} 使用了 ${moveCN}`);
	}

	/**
	 * 处理伤害
	 */
	handleDamage(line) {
		const parts = line.split('|');
		const target = parts[2];
		const hp = parts[3];
		const isPlayer = target.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const targetName = target.split(': ')[1];
		const targetCN = this.translate(targetName, 'pokemon');

		console.log(`  → ${player} ${targetCN} 受到伤害! (HP: ${hp})`);

		// 更新对手宝可梦HP
		if (!isPlayer && this.isPokemonSame(this.state.opponent.species, targetName)) {
			this.state.opponent.setCondition(hp);
		}
	}

	/**
	 * 处理恢复
	 */
	handleHeal(line) {
		const parts = line.split('|');
		const target = parts[2];
		const hp = parts[3];
		const from = parts[4] ? parts[4].replace('[from] item: ', '').replace('[from] ', '') : '';
		const isPlayer = target.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const targetName = target.split(': ')[1];
		const targetCN = this.translate(targetName, 'pokemon');

		let fromCN = '';
		if (from) {
			const itemData = Sim.Dex.items.get(from);
			const itemName = itemData.name || from;
			fromCN = this.translate(itemName, 'items');
		}
		const fromText = fromCN ? ` (${fromCN})` : '';

		console.log(`  → ${player} ${targetCN} 恢复了HP!${fromText} (HP: ${hp})`);

		// 更新对手宝可梦HP
		if (!isPlayer && this.isPokemonSame(this.state.opponent.species, targetName)) {
			this.state.opponent.setCondition(hp);
		}
	}

	/**
	 * 处理异常状态
	 */
	handleStatus(line) {
		const parts = line.split('|');
		const target = parts[2];
		const status = parts[3];
		const isPlayer = target.startsWith('p1');
		const targetName = target.split(': ')[1];

		if (isPlayer) {
			this.state.player.setStatus(status);
		} else if (this.isPokemonSame(this.state.opponent.species, targetName)) {
			this.state.opponent.setStatus(status);
		}
	}

	/**
	 * 处理解除异常状态
	 */
	handleCureStatus(line) {
		const parts = line.split('|');
		const target = parts[2];
		const isPlayer = target.startsWith('p1');
		const targetName = target.split(': ')[1];

		if (isPlayer) {
			this.state.player.clearStatus();
		} else if (this.isPokemonSame(this.state.opponent.species, targetName)) {
			this.state.opponent.clearStatus();
		}
	}

	/**
	 * 处理昏厥
	 */
	handleFaint(line) {
		const parts = line.split('|');
		const pokemon = parts[2];
		const isPlayer = pokemon.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const pokemonName = pokemon.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');

		console.log(`  → ${player} ${pokemonCN} 倒下了!`);

		// 追踪对手宝可梦的昏厥状态
		if (!isPlayer) {
			this.state.opponent.markFainted(pokemonName);
		}
	}

	/**
	 * 处理太晶化
	 */
	handleTerastallize(line) {
		const parts = line.split('|');
		const pokemon = parts[2]; // "p2a: Indeedee"
		const teraType = parts[3];
		const isPlayer = pokemon.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const species = pokemon.split(': ')[1]; // "Indeedee" (species)
		const speciesCN = this.translate(species, 'pokemon');
		const teraTypeCN = this.translate(teraType, 'types');

		console.log(`\n${player} ${speciesCN} 太晶化了! 属性变为: ${teraTypeCN}`);

		if (isPlayer) {
			this.state.player.terastallize(species, teraType);
			if (this.debugMode) {
				console.log(`[Debug] 玩家太晶化: species='${species}'`);
			}
		} else {
			this.state.opponent.terastallize(species, teraType);
			if (this.debugMode) {
				console.log(`[Debug] 对手太晶化: species='${species}'`);
			}
		}
	}

	/**
	 * 处理能力上升
	 */
	handleBoost(line) {
		const parts = line.split('|');
		const pokemon = parts[2];
		const stat = parts[3];
		const amount = parseInt(parts[4]);
		const isPlayer = pokemon.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const pokemonName = pokemon.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');
		const statCN = this.translate(stat, 'boosts');

		console.log(`  → ${player} ${pokemonCN} 的${statCN}上升了 ${amount} 级!`);

		if (isPlayer) {
			this.state.player.boost(stat, amount);
		} else if (this.isPokemonSame(this.state.opponent.species, pokemonName)) {
			this.state.opponent.boost(stat, amount);
		}
	}

	/**
	 * 处理能力下降
	 */
	handleUnboost(line) {
		const parts = line.split('|');
		const pokemon = parts[2];
		const stat = parts[3];
		const amount = parseInt(parts[4]);
		const isPlayer = pokemon.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const pokemonName = pokemon.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');
		const statCN = this.translate(stat, 'boosts');

		console.log(`  → ${player} ${pokemonCN} 的${statCN}下降了 ${amount} 级!`);

		if (isPlayer) {
			this.state.player.unboost(stat, amount);
		} else if (this.isPokemonSame(this.state.opponent.species, pokemonName)) {
			this.state.opponent.unboost(stat, amount);
		}
	}

	/**
	 * 处理清除能力变化
	 */
	handleClearBoost(line) {
		const parts = line.split('|');
		const pokemon = parts[2];
		const isPlayer = pokemon.startsWith('p1');
		const pokemonName = pokemon.split(': ')[1];

		if (isPlayer) {
			this.state.player.clearBoosts();
		} else if (this.isPokemonSame(this.state.opponent.species, pokemonName)) {
			this.state.opponent.clearBoosts();
		}
	}

	/**
	 * 处理场地效果开始
	 */
	handleSideStart(line) {
		const parts = line.split('|');
		const side = parts[2];
		const effect = parts[3].replace('move: ', '');
		const isPlayer = side.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		// 通过 Dex 获取标准招式名称
		const effectData = Sim.Dex.moves.get(effect);
		const effectName = effectData.name || effect;
		const effectCN = this.translate(effectName, 'moves');

		console.log(`  → ${player} 的场地上散布了 ${effectCN}!`);

		if (isPlayer) {
			this.state.field.addP1SideEffect(effectName);
		} else {
			this.state.field.addP2SideEffect(effectName);
		}
	}

	/**
	 * 处理场地效果结束
	 */
	handleSideEnd(line) {
		const parts = line.split('|');
		const side = parts[2];
		const effect = parts[3].replace('move: ', '');
		const isPlayer = side.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const effectData = Sim.Dex.moves.get(effect);
		const effectName = effectData.name || effect;
		const effectCN = this.translate(effectName, 'moves');

		console.log(`  → ${player} 的 ${effectCN} 消失了!`);

		if (isPlayer) {
			this.state.field.removeP1SideEffect(effectName);
		} else {
			this.state.field.removeP2SideEffect(effectName);
		}
	}

	/**
	 * 处理天气
	 */
	handleWeather(line) {
		const parts = line.split('|');
		const weather = parts[2];
		const newWeather = (weather && weather !== 'none') ? weather : null;

		// 只有当天气与上一回合不同时才显示
		if (newWeather !== this.state.lastWeather) {
			if (newWeather) {
				const weatherCN = this.translate(newWeather, 'weathers');
				console.log(`  → 天气变为: ${weatherCN}`);
			} else if (this.state.lastWeather) {
				const weatherCN = this.translate(this.state.lastWeather, 'weathers');
				console.log(`  → ${weatherCN} 结束了!`);
			}
			this.state.lastWeather = newWeather;
		}
		this.state.field.setWeather(newWeather);
	}

	/**
	 * 处理场地开始
	 */
	handleFieldStart(line) {
		const parts = line.split('|');
		const field = parts[2].replace('move: ', '');

		// 判断是场地还是全场效果
		const terrainNames = ['Electric Terrain', 'Grassy Terrain', 'Misty Terrain', 'Psychic Terrain'];
		if (terrainNames.includes(field)) {
			// 检查是否是新场地（不在当前场地数组中）
			if (!this.state.field.terrain.includes(field)) {
				// 检查是否与上一回合不同
				if (!this.state.lastTerrains.has(field)) {
					const fieldCN = this.translate(field, 'terrains');
					console.log(`  → 场地变为: ${fieldCN}`);
				}
				this.state.field.addTerrain(field);
			}
		} else {
			const fieldCN = this.translate(field, 'moves');
			console.log(`  → ${fieldCN} 开始了!`);
		}
	}

	/**
	 * 处理场地结束
	 */
	handleFieldEnd(line) {
		const parts = line.split('|');
		const field = parts[2].replace('move: ', '');

		const terrainNames = ['Electric Terrain', 'Grassy Terrain', 'Misty Terrain', 'Psychic Terrain'];
		if (terrainNames.includes(field)) {
			if (this.state.field.terrain.includes(field)) {
				this.state.field.removeTerrain(field);
				const fieldCN = this.translate(field, 'terrains');
				console.log(`  → ${fieldCN} 结束了!`);
			}
		} else {
			const fieldCN = this.translate(field, 'moves');
			console.log(`  → ${fieldCN} 结束了!`);
		}
	}

	/**
	 * 翻译辅助函数
	 */
	translate(text, category = 'pokemon') {
		if (!text) return text;
		return this.translator.translate(String(text), category);
	}
}

module.exports = { BattleMessageHandler };
