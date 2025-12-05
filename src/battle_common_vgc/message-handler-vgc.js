/**
 * 双打战斗消息处理器
 * 专门用于处理VGC双打对战的消息
 */

const Sim = require('pokemon-showdown');

class DoublesMessageHandler {
	constructor(battleState, translator, debugMode = false) {
		this.state = battleState;
		this.translator = translator;
		this.debugMode = debugMode;
	}

	/**
	 * 解析宝可梦位置标签 (p1a, p1b, p2a, p2b)
	 * @returns {{ isPlayer: boolean, slot: number, player: string }}
	 */
	parsePlayerTag(playerTag) {
		const isPlayer = playerTag.startsWith('p1');
		const slot = playerTag.includes('b:') ? 1 : 0;
		const player = isPlayer ? '【你】' : '【对手】';
		return { isPlayer, slot, player };
	}

	/**
	 * 格式化位置显示
	 * 对手：位置0(p1a,左侧) -> +1, 位置1(p1b,右侧) -> +2
	 * 己方：位置0(p2a,左侧) -> -1, 位置1(p2b,右侧) -> -2
	 */
	formatPosition(slot, isPlayer) {
		return slot === 0 ? '左' : '右';
	}

	/**
	 * 翻译辅助方法
	 */
	translate(text, type) {
		return this.translator.translate(text, type);
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

		// 宝可梦切换
		if (line.startsWith('|switch|')) {
			this.handleSwitch(line);
			return;
		}

		// 强制切换
		if (line.startsWith('|drag|')) {
			this.handleDrag(line);
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

		// 治疗
		if (line.startsWith('|-heal|')) {
			this.handleHeal(line);
			return;
		}

		// 倒下
		if (line.startsWith('|faint|')) {
			this.handleFaint(line);
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

		// 状态异常
		if (line.startsWith('|-status|')) {
			this.handleStatus(line);
			return;
		}

		if (line.startsWith('|-curestatus|')) {
			this.handleCureStatus(line);
			return;
		}

		// 天气
		if (line.startsWith('|-weather|')) {
			this.handleWeather(line);
			return;
		}

		// 场地效果
		if (line.startsWith('|-fieldstart|')) {
			this.handleFieldStart(line);
			return;
		}

		if (line.startsWith('|-fieldend|')) {
			this.handleFieldEnd(line);
			return;
		}

		// 单方场地效果
		if (line.startsWith('|-sidestart|')) {
			this.handleSideStart(line);
			return;
		}

		if (line.startsWith('|-sideend|')) {
			this.handleSideEnd(line);
			return;
		}

		// 太晶化
		if (line.startsWith('|-terastallize|')) {
			this.handleTerastallize(line);
			return;
		}

		// ==================== 回合开始 ====================
		if (line.startsWith('|turn|')) {
			this.handleTurn(line);
			return;
		}

		// ==================== 招式效果 ====================

		// 招式失败
		if (line.startsWith('|-fail|')) {
			this.handleFail(line);
			return;
		}

		// 效果被阻挡
		if (line.startsWith('|-block|')) {
			this.handleBlock(line);
			return;
		}

		// 没有目标
		if (line.startsWith('|-notarget|')) {
			this.handleNoTarget(line);
			return;
		}

		// 未命中
		if (line.startsWith('|-miss|')) {
			this.handleMiss(line);
			return;
		}

		// 设置HP
		if (line.startsWith('|-sethp|')) {
			this.handleSetHP(line);
			return;
		}

		// 治愈队伍
		if (line.startsWith('|-cureteam|')) {
			this.handleCureTeam(line);
			return;
		}

		// 效果拔群/不理想/会心/免疫
		if (line.startsWith('|-supereffective')) {
			console.log('    → 效果拔群!');
			return;
		}
		if (line.startsWith('|-resisted')) {
			console.log('    → 效果不理想...');
			return;
		}
		if (line.startsWith('|-crit')) {
			console.log('    → 会心一击!');
			return;
		}
		if (line.startsWith('|-immune')) {
			this.handleImmune(line);
			return;
		}

		// ==================== 能力变化（补充缺失的） ====================

		if (line.startsWith('|-setboost|')) {
			this.handleSetBoost(line);
			return;
		}
		if (line.startsWith('|-swapboost|')) {
			this.handleSwapBoost(line);
			return;
		}
		if (line.startsWith('|-invertboost|')) {
			this.handleInvertBoost(line);
			return;
		}
		if (line.startsWith('|-clearboost|')) {
			this.handleClearBoost(line);
			return;
		}
		if (line.startsWith('|-clearallboost')) {
			this.handleClearAllBoost(line);
			return;
		}
		if (line.startsWith('|-clearpositiveboost|')) {
			this.handleClearPositiveBoost(line);
			return;
		}
		if (line.startsWith('|-clearnegativeboost|')) {
			this.handleClearNegativeBoost(line);
			return;
		}
		if (line.startsWith('|-copyboost|')) {
			this.handleCopyBoost(line);
			return;
		}

		// ==================== 场地效果（补充） ====================

		if (line.startsWith('|-swapsideconditions')) {
			this.handleSwapSideConditions(line);
			return;
		}

		// ==================== 异常状态效果 ====================

		if (line.startsWith('|-start|')) {
			this.handleStart(line);
			return;
		}
		if (line.startsWith('|-end|')) {
			this.handleEnd(line);
			return;
		}

		// ==================== 道具/特性 ====================

		if (line.startsWith('|-item|')) {
			this.handleItem(line);
			return;
		}
		if (line.startsWith('|-enditem|')) {
			this.handleEndItem(line);
			return;
		}
		if (line.startsWith('|-ability|')) {
			this.handleAbility(line);
			return;
		}
		if (line.startsWith('|-endability|')) {
			this.handleEndAbility(line);
			return;
		}

		// ==================== 特殊形态 ====================

		if (line.startsWith('|detailschange|')) {
			this.handleDetailsChange(line);
			return;
		}
		if (line.startsWith('|-formechange|')) {
			this.handleFormeChange(line);
			return;
		}
		if (line.startsWith('|replace|')) {
			this.handleReplace(line);
			return;
		}
		if (line.startsWith('|swap|')) {
			this.handleSwap(line);
			return;
		}
		if (line.startsWith('|cant|')) {
			this.handleCant(line);
			return;
		}
		if (line.startsWith('|-transform|')) {
			this.handleTransform(line);
			return;
		}
		if (line.startsWith('|-mega|')) {
			this.handleMega(line);
			return;
		}
		if (line.startsWith('|-primal|')) {
			this.handlePrimal(line);
			return;
		}
		if (line.startsWith('|-burst|')) {
			this.handleBurst(line);
			return;
		}
		if (line.startsWith('|-zpower|')) {
			this.handleZPower(line);
			return;
		}
		if (line.startsWith('|-zbroken|')) {
			this.handleZBroken(line);
			return;
		}

		// ==================== 杂项效果 ====================

		if (line.startsWith('|-activate|')) {
			this.handleActivate(line);
			return;
		}
		if (line.startsWith('|-hint|')) {
			this.handleHint(line);
			return;
		}
		if (line.startsWith('|-center')) {
			this.handleCenter(line);
			return;
		}
		if (line.startsWith('|-message|')) {
			this.handleMessageText(line);
			return;
		}
		if (line.startsWith('|-combine')) {
			this.handleCombine(line);
			return;
		}
		if (line.startsWith('|-waiting|')) {
			this.handleWaiting(line);
			return;
		}
		if (line.startsWith('|-prepare|')) {
			this.handlePrepare(line);
			return;
		}
		if (line.startsWith('|-mustrecharge|')) {
			this.handleMustRecharge(line);
			return;
		}
		if (line.startsWith('|-hitcount|')) {
			this.handleHitCount(line);
			return;
		}
		if (line.startsWith('|-singlemove|')) {
			this.handleSingleMove(line);
			return;
		}
		if (line.startsWith('|-singleturn|')) {
			this.handleSingleTurn(line);
			return;
		}
	}

	/**
	 * 处理宝可梦切换
	 */
	handleSwitch(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const details = parts[3];
		const hp = parts[4] || '';

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const species = playerTag.split(': ')[1];
		const name = details.split(',')[0];
		const nameCN = this.translate(name, 'pokemon');

		console.log(`\n${player} 派出了 ${nameCN} ${hp ? '(HP: ' + hp + ')' : ''}`);

		if (isPlayer) {
			this.state.player.switchPokemon(slot, species, name, hp, details);
			if (this.debugMode) {
				console.log(`[Debug] 玩家切换: slot=${slot}, name='${name}', species='${species}'`);
			}
		} else {
			this.state.opponent.switchPokemon(slot, species, name, hp, details);
			if (this.debugMode) {
				console.log(`[Debug] 对手切换: slot=${slot}, name='${name}', species='${species}', hp='${hp}'`);
			}
		}
	}

	/**
	 * 处理强制切换
	 */
	handleDrag(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const details = parts[3];
		const hp = parts[4] || '';

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const species = playerTag.split(': ')[1];
		const name = details.split(',')[0];
		const nameCN = this.translate(name, 'pokemon');

		console.log(`\n${player} ${nameCN} 被强制拖入战斗! ${hp ? '(HP: ' + hp + ')' : ''}`);

		if (isPlayer) {
			this.state.player.switchPokemon(slot, species, name, hp, details);
		} else {
			this.state.opponent.switchPokemon(slot, species, name, hp, details);
		}
	}

	/**
	 * 处理招式使用
	 */
	handleMove(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const move = parts[3];
		const target = parts[4];

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const pokemon = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemon, 'pokemon');
		const moveCN = this.translate(move, 'moves');

		let targetInfo = '';
		if (target) {
			const targetName = target.split(': ')[1];
			const targetCN = this.translate(targetName, 'pokemon');
			targetInfo = ` 目标: ${targetCN}`;
		}

		console.log(`${player} ${pokemonCN} 使用了 ${moveCN}${targetInfo}`);
	}

	/**
	 * 处理伤害
	 */
	handleDamage(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const hp = parts[3];

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const pokemon = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemon, 'pokemon');

		console.log(`    → ${player} ${pokemonCN} 受到伤害! (HP: ${hp})`);

		if (isPlayer) {
			const activePokemon = this.state.player.getPokemon(slot);
			if (activePokemon) {
				activePokemon.condition = hp;
			}
		} else {
			const activePokemon = this.state.opponent.getPokemon(slot);
			if (activePokemon) {
				activePokemon.condition = hp;
			}
		}
	}

	/**
	 * 处理治疗
	 */
	handleHeal(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const hp = parts[3];

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const pokemon = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemon, 'pokemon');

		console.log(`    → ${player} ${pokemonCN} 恢复了HP! (HP: ${hp})`);

		if (isPlayer) {
			const activePokemon = this.state.player.getPokemon(slot);
			if (activePokemon) {
				activePokemon.condition = hp;
			}
		} else {
			const activePokemon = this.state.opponent.getPokemon(slot);
			if (activePokemon) {
				activePokemon.condition = hp;
			}
		}
	}

	/**
	 * 处理倒下
	 */
	handleFaint(line) {
		const parts = line.split('|');
		const playerTag = parts[2];

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const pokemon = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemon, 'pokemon');

		console.log(`    → ${player} ${pokemonCN} 倒下了!`);

		if (!isPlayer) {
			this.state.opponent.markFainted(pokemon);
		}
	}

	/**
	 * 处理能力提升
	 */
	handleBoost(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const stat = parts[3];
		const amount = parseInt(parts[4]);

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const pokemon = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemon, 'pokemon');
		const statCN = this.translate(stat, 'boosts');

		console.log(`    → ${player} ${pokemonCN} 的 ${statCN} 提升了 ${amount} 级!`);

		if (isPlayer) {
			this.state.player.boost(slot, stat, amount);
		} else {
			this.state.opponent.boost(slot, stat, amount);
		}
	}

	/**
	 * 处理能力下降
	 */
	handleUnboost(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const stat = parts[3];
		const amount = parseInt(parts[4]);

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const pokemon = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemon, 'pokemon');
		const statCN = this.translate(stat, 'boosts');

		console.log(`    → ${player} ${pokemonCN} 的 ${statCN} 下降了 ${amount} 级!`);

		if (isPlayer) {
			this.state.player.unboost(slot, stat, amount);
		} else {
			this.state.opponent.unboost(slot, stat, amount);
		}
	}

	/**
	 * 处理状态异常
	 */
	handleStatus(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const status = parts[3];

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const pokemon = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemon, 'pokemon');
		const statusCN = this.translate(status, 'status');

		console.log(`    → ${player} ${pokemonCN} 陷入了 ${statusCN} 状态!`);

		if (isPlayer) {
			this.state.player.setStatus(slot, status);
		} else {
			this.state.opponent.setStatus(slot, status);
		}
	}

	/**
	 * 处理状态治愈
	 */
	handleCureStatus(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const status = parts[3];

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const pokemon = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemon, 'pokemon');
		const statusCN = this.translate(status, 'status');

		console.log(`    → ${player} ${pokemonCN} 的 ${statusCN} 状态解除了!`);

		if (isPlayer) {
			this.state.player.clearStatus(slot);
		} else {
			this.state.opponent.clearStatus(slot);
		}
	}

	/**
	 * 处理天气
	 */
	handleWeather(line) {
		const parts = line.split('|');
		const weather = parts[2];

		if (weather && weather !== 'none') {
			const weatherCN = this.translate(weather, 'weathers');
			console.log(`    → 天气变为: ${weatherCN}`);
			this.state.field.setWeather(weather);
		} else {
			this.state.field.setWeather(null);
		}
	}

	/**
	 * 处理场地效果开始
	 */
	handleFieldStart(line) {
		const parts = line.split('|');
		const field = parts[2];

		const fieldName = field.replace('move: ', '');

		// 判断是场地还是全场效果
		const terrainNames = ['Electric Terrain', 'Grassy Terrain', 'Misty Terrain', 'Psychic Terrain'];
		if (terrainNames.includes(fieldName)) {
			// 场地效果：互斥的，新场地会替换旧场地
			const oldTerrain = this.state.field.terrain;
			if (fieldName !== oldTerrain) {
				// 只有当场地与上一回合不同时才显示消息
				if (fieldName !== this.state.lastTerrain) {
					const fieldCN = this.translate(fieldName, 'terrains');
					if (oldTerrain) {
						// 如果有旧场地，显示替换消息
						const oldTerrainCN = this.translate(oldTerrain, 'terrains');
						console.log(`    → 场地从 ${oldTerrainCN} 变为 ${fieldCN}!`);
					} else {
						console.log(`    → 场地变为: ${fieldCN}`);
					}
				}
				this.state.field.setTerrain(fieldName);
			}
		} else {
			// 全场效果：可以叠加（戏法空间、重力等）
			this.state.field.addFieldEffect(fieldName);
			const fieldCN = this.translate(fieldName, 'moves');
			console.log(`    → ${fieldCN} 开始了!`);
		}
	}

	/**
	 * 处理场地效果结束
	 */
	handleFieldEnd(line) {
		const parts = line.split('|');
		const field = parts[2];

		const fieldName = field.replace('move: ', '');

		const terrainNames = ['Electric Terrain', 'Grassy Terrain', 'Misty Terrain', 'Psychic Terrain'];
		if (terrainNames.includes(fieldName)) {
			// 场地效果结束
			if (this.state.field.terrain === fieldName) {
				this.state.field.removeTerrain(fieldName);
				const fieldCN = this.translate(fieldName, 'terrains');
				console.log(`    → ${fieldCN} 结束了!`);
			}
		} else {
			// 全场效果结束
			this.state.field.removeFieldEffect(fieldName);
			const fieldCN = this.translate(fieldName, 'moves');
			console.log(`    → ${fieldCN} 结束了!`);
		}
	}

	/**
	 * 处理单方场地效果开始
	 */
	handleSideStart(line) {
		const parts = line.split('|');
		const side = parts[2];
		const effect = parts[3];

		const effectName = effect.replace('move: ', '');
		const effectCN = this.translate(effectName, 'moves');

		if (side.startsWith('p1:')) {
			console.log(`    → 【你】 的场地上散布了 ${effectCN}!`);
			this.state.field.addP1SideEffect(effectName);
		} else {
			console.log(`    → 【对手】 的场地上散布了 ${effectCN}!`);
			this.state.field.addP2SideEffect(effectName);
		}
	}

	/**
	 * 处理单方场地效果结束
	 */
	handleSideEnd(line) {
		const parts = line.split('|');
		const side = parts[2];
		const effect = parts[3];

		const effectName = effect.replace('move: ', '');
		const effectCN = this.translate(effectName, 'moves');

		if (side.startsWith('p1:')) {
			console.log(`    → 【你】 的 ${effectCN} 消失了!`);
			this.state.field.removeP1SideEffect(effectName);
		} else {
			console.log(`    → 【对手】 的 ${effectCN} 消失了!`);
			this.state.field.removeP2SideEffect(effectName);
		}
	}

	/**
	 * 处理太晶化
	 */
	handleTerastallize(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const teraType = parts[3];

		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
		const pokemon = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemon, 'pokemon');
		const teraTypeCN = this.translate(teraType, 'types');

		console.log(`\n${player} ${pokemonCN} 太晶化了! 属性变为: ${teraTypeCN}`);

		if (isPlayer) {
			this.state.player.terastallize(pokemon, teraType);
		} else {
			this.state.opponent.terastallize(pokemon, teraType);
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
	 * 处理招式失败
	 */
	handleFail(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const action = parts[3] || '';
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		let actionText = '';
		if (action) {
			if (action.startsWith('move: ')) {
				const moveName = action.replace('move: ', '');
				actionText = this.translate(moveName, 'moves');
			} else {
				actionText = action;
			}
		}

		if (actionText) {
			if (actionText === "unboost") {
				console.log(`    → ${player} ${speciesCN} 的能力没有下降!`);
			} else {
				console.log(`    → ${player} ${speciesCN} 的${actionText}效果失败了!`);
			}
		} else {
			console.log(`    → ${player} ${speciesCN} 的攻击失败了!`);
		}
	}

	/**
	 * 处理效果被阻挡
	 */
	handleBlock(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const effect = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		let effectCN = effect;
		if (effect.startsWith('ability: ')) {
			const abilityName = effect.replace('ability: ', '');
			effectCN = this.translate(abilityName, 'abilities');
		} else if (effect.startsWith('move: ')) {
			const moveName = effect.replace('move: ', '');
			effectCN = this.translate(moveName, 'moves');
		}

		console.log(`    → ${player} ${speciesCN} 的效果被${effectCN}阻挡了!`);
	}

	/**
	 * 处理没有目标
	 */
	handleNoTarget(line) {
		const parts = line.split('|');
		const playerTag = parts[2];

		if (playerTag) {
			const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
			const species = playerTag.split(': ')[1];
			const speciesCN = this.translate(species, 'pokemon');
			console.log(`    → ${player} ${speciesCN} 的攻击没有目标!`);
		} else {
			console.log('    → 攻击没有目标!');
		}
	}

	/**
	 * 处理未命中
	 */
	handleMiss(line) {
		const parts = line.split('|');
		const source = parts[2];
		const target = parts[3] || '';

		if (target) {
			const { isPlayer, slot, player } = this.parsePlayerTag(target);
			const targetName = target.split(': ')[1];
			const targetCN = this.translate(targetName, 'pokemon');
			console.log(`    → 攻击没有命中 ${player} ${targetCN}!`);
		} else {
			console.log('    → 攻击没有命中!');
		}
	}

	/**
	 * 处理设置HP
	 */
	handleSetHP(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const hp = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`    → ${player} ${speciesCN} 的HP变为 ${hp}!`);

		if (isPlayer) {
			const activePokemon = this.state.player.getPokemon(slot);
			if (activePokemon) {
				activePokemon.condition = hp;
			}
		} else {
			const activePokemon = this.state.opponent.getPokemon(slot);
			if (activePokemon) {
				activePokemon.condition = hp;
			}
		}
	}

	/**
	 * 处理治愈队伍
	 */
	handleCureTeam(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`    → ${player} ${speciesCN} 治愈了队伍的异常状态!`);
	}

	/**
	 * 处理免疫
	 */
	handleImmune(line) {
		const parts = line.split('|');
		const playerTag = parts[2];

		if (playerTag && playerTag.includes(': ')) {
			const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
			const species = playerTag.split(': ')[1];
			const speciesCN = this.translate(species, 'pokemon');
			console.log(`    → ${player} ${speciesCN} 完全没有效果!`);
		} else {
			console.log('    → 没有效果!');
		}
	}

	/**
	 * 处理设置能力变化
	 */
	handleSetBoost(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const stat = parts[3];
		const amount = parseInt(parts[4]);
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const pokemonName = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');
		const statCN = this.translate(stat, 'boosts');

		console.log(`    → ${player} ${pokemonCN} 的${statCN}变为 ${amount} 级!`);

		// 设置能力变化到特定值
		if (isPlayer) {
			this.state.player.setBoost(slot, stat, amount);
		} else {
			this.state.opponent.setBoost(slot, stat, amount);
		}
	}

	/**
	 * 处理交换能力变化
	 */
	handleSwapBoost(line) {
		const parts = line.split('|');
		const source = parts[2];
		const target = parts[3];
		const stats = parts[4] || '';

		const { isPlayer: sourceIsPlayer, slot: sourceSlot, player: sourcePlayer } = this.parsePlayerTag(source);
		const sourceName = source.split(': ')[1];
		const sourceCN = this.translate(sourceName, 'pokemon');

		const { isPlayer: targetIsPlayer, slot: targetSlot, player: targetPlayer } = this.parsePlayerTag(target);
		const targetName = target.split(': ')[1];
		const targetCN = this.translate(targetName, 'pokemon');

		console.log(`    → ${sourcePlayer} ${sourceCN} 和 ${targetPlayer} ${targetCN} 交换了能力变化!`);
	}

	/**
	 * 处理反转能力变化
	 */
	handleInvertBoost(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const pokemonName = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');

		console.log(`    → ${player} ${pokemonCN} 的能力变化被反转了!`);
	}

	/**
	 * 处理清除能力变化
	 */
	handleClearBoost(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const pokemonName = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');

		console.log(`    → ${player} ${pokemonCN} 的能力变化被清除了!`);

		if (isPlayer) {
			this.state.player.clearBoosts(slot);
		} else {
			this.state.opponent.clearBoosts(slot);
		}
	}

	/**
	 * 处理清除所有能力变化（白雾）
	 */
	handleClearAllBoost(line) {
		console.log('    → 所有宝可梦的能力变化被清除了!');
		// 双打模式需要清除所有位置的能力变化
		for (let slot = 0; slot < 2; slot++) {
			this.state.player.clearBoosts(slot);
			this.state.opponent.clearBoosts(slot);
		}
	}

	/**
	 * 处理清除正面能力变化
	 */
	handleClearPositiveBoost(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const targetName = playerTag.split(': ')[1];
		const targetCN = this.translate(targetName, 'pokemon');

		console.log(`    → ${player} ${targetCN} 的正面能力变化被清除了!`);
	}

	/**
	 * 处理清除负面能力变化
	 */
	handleClearNegativeBoost(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const pokemonName = playerTag.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');

		console.log(`    → ${player} ${pokemonCN} 的负面能力变化被清除了!`);
	}

	/**
	 * 处理复制能力变化
	 */
	handleCopyBoost(line) {
		const parts = line.split('|');
		const source = parts[2];
		const target = parts[3];

		const { isPlayer: sourceIsPlayer, slot: sourceSlot, player: sourcePlayer } = this.parsePlayerTag(source);
		const sourceName = source.split(': ')[1];
		const sourceCN = this.translate(sourceName, 'pokemon');

		const { isPlayer: targetIsPlayer, slot: targetSlot, player: targetPlayer } = this.parsePlayerTag(target);
		const targetName = target.split(': ')[1];
		const targetCN = this.translate(targetName, 'pokemon');

		console.log(`    → ${targetPlayer} ${targetCN} 复制了 ${sourcePlayer} ${sourceCN} 的能力变化!`);
	}

	/**
	 * 处理交换场地效果（场地互换）
	 */
	handleSwapSideConditions(line) {
		console.log('    → 双方的场地效果互换了!');
		// 交换双方的场地效果
		const temp = [...this.state.field.p1SideEffects];
		this.state.field.p1SideEffects = [...this.state.field.p2SideEffects];
		this.state.field.p2SideEffects = temp;
	}

	/**
	 * 处理异常状态开始
	 */
	handleStart(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const effect = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		let effectCN = effect;
		if (effect.startsWith('move: ')) {
			const moveName = effect.replace('move: ', '');
			effectCN = this.translate(moveName, 'moves');
		} else if (effect.startsWith('ability: ')) {
			const abilityName = effect.replace('ability: ', '');
			effectCN = this.translate(abilityName, 'abilities');
			console.log(`    → ${player} ${speciesCN}的 ${effectCN} 发动了!`);
			return;
		} else if (effect === 'confusion') {
			effectCN = '混乱';
		} else if (effect === 'Substitute') {
			effectCN = '替身';
		} else if (effect.startsWith('perish')) {
			effectCN = '灭亡之歌';
		} else if (effect === 'typechange') {
			effectCN = '属性变化';
		} else if (effect === 'Disable') {
			effectCN = '定身法';
		} else if (effect === 'Encore') {
			effectCN = '再来一次';
		} else if (effect === 'Taunt') {
			effectCN = '挑衅';
		} else if (effect === 'Torment') {
			effectCN = '无理取闹';
		} else if (effect.startsWith('quarkdrive') || effect.startsWith('protosynthesis')) {
			// 夸克充能(Quark Drive)和古代活性(Protosynthesis)
			const statMap = {
				'atk': '攻击',
				'def': '防御',
				'spa': '特攻',
				'spd': '特防',
				'spe': '速度'
			};
			// 提取能力值（最后3个字符）
			const stat = effect.slice(-3);
			const statCN = statMap[stat] || stat;
			console.log(`    → ${player} ${speciesCN} 的 ${statCN} 提升了!`);
			return;
		}

		console.log(`    → ${player} ${speciesCN} 陷入了 ${effectCN} 状态!`);
	}

	/**
	 * 处理异常状态结束
	 */
	handleEnd(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const effect = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		let effectCN = effect;
		if (effect.startsWith('move: ')) {
			const moveName = effect.replace('move: ', '');
			effectCN = this.translate(moveName, 'moves');
		} else if (effect === 'confusion') {
			effectCN = '混乱';
		} else if (effect === 'Substitute') {
			effectCN = '替身';
		} else if (effect === 'Disable') {
			effectCN = '定身法';
		} else if (effect === 'Encore') {
			effectCN = '再来一次';
		} else if (effect === 'Taunt') {
			effectCN = '挑衅';
		} else if (effect === 'Quark Drive') {
			effectCN = '夸克充能';
		} else if (effect === 'Protosynthesis') {
			effectCN = '古代活性';
		}

		console.log(`\n${player} ${speciesCN} 的 ${effectCN} 状态结束了!`);
	}

	/**
	 * 处理道具显示/变化
	 */
	handleItem(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const item = parts[3];
		const from = parts[4] || '';
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const itemData = Sim.Dex.items.get(item);
		const itemName = itemData.name || item;
		const itemCN = this.translate(itemName, 'items');

		if (from) {
			console.log(`    → ${player} ${speciesCN} 的${itemCN}被发现了!`);
		} else {
			console.log(`    → ${player} ${speciesCN} 携带着${itemCN}!`);
		}
	}

	/**
	 * 处理道具消耗/破坏
	 */
	handleEndItem(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const item = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const itemData = Sim.Dex.items.get(item);
		const itemName = itemData.name || item;
		const itemCN = this.translate(itemName, 'items');

		// 检查是否是吃掉树果
		if (line.includes('[eat]')) {
			console.log(`\n${player} ${speciesCN} 吃掉了 ${itemCN} !`);
		} else {
			console.log(`\n${player} ${speciesCN} 的 ${itemCN} 消失了!`);
		}
	}

	/**
	 * 处理特性显示/变化
	 */
	handleAbility(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const ability = parts[3];
		const from = parts[4] || '';
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const abilityData = Sim.Dex.abilities.get(ability);
		const abilityName = abilityData.name || ability;
		const abilityCN = this.translate(abilityName, 'abilities');

		if (from && from !== 'boost') {
			let fromCN = from;
			if (from.startsWith('[from] ability: ')) {
				const fromAbility = from.replace('[from] ability: ', '');
				fromCN = this.translate(fromAbility, 'abilities');
			}
			console.log(`    → ${player} ${speciesCN} 的特性变为 ${abilityCN} ! (${fromCN})`);
		} else {
			console.log(`    → ${player} ${speciesCN} 的特性 ${abilityCN} 发动了!`);
		}
	}

	/**
	 * 处理特性被压制
	 */
	handleEndAbility(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`    → ${player} ${speciesCN} 的特性被压制了!`);
	}

	/**
	 * 处理形态变化（永久，如超级进化）
	 */
	handleDetailsChange(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const details = parts[3];
		const hp = parts[4] || '';
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const name = details.split(',')[0];
		const nameCN = this.translate(name, 'pokemon');

		console.log(`\n${player} ${this.translate(species, 'pokemon')} 变成了 ${nameCN}!`);

		if (isPlayer) {
			this.state.player.switchPokemon(slot, species, name, hp, details);
		} else {
			this.state.opponent.switchPokemon(slot, species, name, hp, details);
		}
	}

	/**
	 * 处理形态变化（临时）
	 */
	handleFormeChange(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const newSpecies = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');
		const newSpeciesCN = this.translate(newSpecies, 'pokemon');

		console.log(`    → ${player} ${speciesCN} 变成了 ${newSpeciesCN} 形态!`);
	}

	/**
	 * 处理幻觉结束
	 */
	handleReplace(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const details = parts[3];
		const hp = parts[4] || '';
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const name = details.split(',')[0];
		const nameCN = this.translate(name, 'pokemon');

		console.log(`\n${player} 的幻觉结束了! 真正的宝可梦是 ${nameCN}!`);

		if (isPlayer) {
			this.state.player.switchPokemon(slot, species, name, hp, details);
		} else {
			this.state.opponent.switchPokemon(slot, species, name, hp, details);
		}
	}

	/**
	 * 处理位置交换
	 */
	handleSwap(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const position = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`    → ${player} ${speciesCN} 移动到了位置 ${position}!`);
	}

	/**
	 * 处理无法行动
	 */
	handleCant(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const reason = parts[3];
		const move = parts[4] || '';
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		// 翻译原因
		let reasonCN = reason;
		if (reason === 'par') reasonCN = '麻痹';
		else if (reason === 'slp') reasonCN = '睡眠';
		else if (reason === 'frz') reasonCN = '冰冻';
		else if (reason === 'flinch') reasonCN = '畏缩';
		else if (reason === 'nopp') reasonCN = 'PP不足';
		else if (reason === 'recharge') reasonCN = '蓄力中';
		else if (reason.startsWith('move: ')) {
			const moveName = reason.replace('move: ', '');
			reasonCN = this.translate(moveName, 'moves');
		} else if (reason.startsWith('ability: ')) {
			const abilityName = reason.replace('ability: ', '');
			reasonCN = this.translate(abilityName, 'abilities');
		}

		let moveText = '';
		if (move) {
			const moveCN = this.translate(move, 'moves');
			moveText = ` (${moveCN})`;
		}

		console.log(`    → ${player} ${speciesCN} 因为${reasonCN}无法行动!${moveText}`);
	}

	/**
	 * 处理变身
	 */
	handleTransform(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const target = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');
		const targetCN = this.translate(target, 'pokemon');

		console.log(`    → ${player} ${speciesCN} 变身成了 ${targetCN}!`);
	}

	/**
	 * 处理超级进化
	 */
	handleMega(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const megaStone = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');
		const megaStoneCN = this.translate(megaStone, 'items');

		console.log(`\n${player} ${speciesCN} 使用 ${megaStoneCN} 进行了超级进化!`);
	}

	/**
	 * 处理原始回归
	 */
	handlePrimal(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`\n${player} ${speciesCN} 进行了原始回归!`);
	}

	/**
	 * 处理究极爆发
	 */
	handleBurst(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const newSpecies = parts[3];
		const item = parts[4];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');
		const newSpeciesCN = this.translate(newSpecies, 'pokemon');
		const itemCN = this.translate(item, 'items');

		console.log(`\n${player} ${speciesCN} 使用 ${itemCN} 进行了究极爆发变成了 ${newSpeciesCN}!`);
	}

	/**
	 * 处理Z招式
	 */
	handleZPower(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`\n${player} ${speciesCN} 释放了Z力量!`);
	}

	/**
	 * 处理Z招式突破守住
	 */
	handleZBroken(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`    → ${player} ${speciesCN} 的守住被Z招式突破了!`);
	}

	/**
	 * 处理杂项效果激活
	 */
	handleActivate(line) {
		const parts = line.split('|');
		const effect = parts[2];

		// 尝试解析效果
		let effectCN = effect;
		// 首先检查是否是宝可梦标签（p1a: Name 或 p2a: Name）
		if (effect && effect.startsWith('p')) {
			// 是宝可梦标签
			const playerTag = effect;
			const effectName = parts[3] || '';
			const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);
			const species = playerTag.split(': ')[1];
			const speciesCN = this.translate(species, 'pokemon');

			let effectText = effectName;
			if (effectName.startsWith('ability: ')) {
				effectText = this.translate(effectName.replace('ability: ', ''), 'abilities');
			} else if (effectName.startsWith('move: ')) {
				effectText = this.translate(effectName.replace('move: ', ''), 'moves');
			} else if (effectName.startsWith('item: ')) {
				effectText = this.translate(effectName.replace('item: ', ''), 'items');
			}

			if (effectText) {
				console.log(`    → ${player} ${speciesCN} 的 ${effectText} 发动了!`);
			}
		} else if (effect && effect.includes(': ')) {
			// 不是宝可梦标签，但包含 ': ' 的其他效果
			const [prefix, name] = effect.split(': ');
			if (prefix.includes('ability')) {
				effectCN = this.translate(name, 'abilities');
			} else if (prefix.includes('move')) {
				effectCN = this.translate(name, 'moves');
			} else if (prefix.includes('item')) {
				effectCN = this.translate(name, 'items');
			}
			console.log(`    → ${effectCN} 发动了!`);
		}
	}

	/**
	 * 处理提示消息
	 */
	handleHint(line) {
		const parts = line.split('|');
		const message = parts[2];
		console.log(`  (${message})`);
	}

	/**
	 * 处理三打居中
	 */
	handleCenter(line) {
		console.log('    → 宝可梦自动居中了!');
	}

	/**
	 * 处理杂项消息
	 */
	handleMessageText(line) {
		const parts = line.split('|');
		const message = parts[2];
		console.log(`  ${message}`);
	}

	/**
	 * 处理招式合体
	 */
	handleCombine(line) {
		console.log('    → 招式合体了!');
	}

	/**
	 * 处理等待目标
	 */
	handleWaiting(line) {
		const parts = line.split('|');
		const source = parts[2];
		const target = parts[3];

		const { isPlayer: sourceIsPlayer, slot: sourceSlot, player: sourcePlayer } = this.parsePlayerTag(source);
		const sourceName = source.split(': ')[1];
		const sourceCN = this.translate(sourceName, 'pokemon');

		const { isPlayer: targetIsPlayer, slot: targetSlot, player: targetPlayer } = this.parsePlayerTag(target);
		const targetName = target.split(': ')[1];
		const targetCN = this.translate(targetName, 'pokemon');

		console.log(`    → ${sourcePlayer} ${sourceCN} 正在等待 ${targetPlayer} ${targetCN}!`);
	}

	/**
	 * 处理准备蓄力招式
	 */
	handlePrepare(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const move = parts[3];
		const defender = parts[4] || '';
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const moveData = Sim.Dex.moves.get(move);
		const moveName = moveData.name || move;
		const moveCN = this.translate(moveName, 'moves');

		if (defender) {
			const { isPlayer: defenderIsPlayer, slot: defenderSlot, player: defenderPlayer } = this.parsePlayerTag(defender);
			const defenderName = defender.split(': ')[1];
			const defenderCN = this.translate(defenderName, 'pokemon');
			console.log(`    → ${player} ${speciesCN} 正在准备${moveCN}对付 ${defenderPlayer} ${defenderCN}!`);
		} else {
			console.log(`    → ${player} ${speciesCN} 正在准备${moveCN}!`);
		}
	}

	/**
	 * 处理必须蓄力
	 */
	handleMustRecharge(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`    → ${player} ${speciesCN} 必须休息一回合!`);
	}

	/**
	 * 处理多段攻击计数
	 */
	handleHitCount(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const count = parts[3];

		console.log(`    → 击中了 ${count} 次!`);
	}

	/**
	 * 处理单招式效果
	 */
	handleSingleMove(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const move = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const moveData = Sim.Dex.moves.get(move);
		const moveName = moveData.name || move;
		const moveCN = this.translate(moveName, 'moves');

		console.log(`    → ${player} ${speciesCN} 使用了${moveCN}!`);
	}

	/**
	 * 处理单回合效果
	 */
	handleSingleTurn(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const move = parts[3];
		const { isPlayer, slot, player } = this.parsePlayerTag(playerTag);

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const moveData = Sim.Dex.moves.get(move);
		const moveName = moveData.name || move;
		const moveCN = this.translate(moveName, 'moves');

		console.log(`    → ${player} ${speciesCN} 使用了${moveCN}!`);
	}
}

module.exports = {
	MessageHandlerVGC: DoublesMessageHandler
};
