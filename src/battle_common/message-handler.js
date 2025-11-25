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

		// ==================== Major Actions ====================

		// 宝可梦切换
		if (line.startsWith('|switch|')) {
			this.handleSwitch(line);
			return;
		}

		// 强制切换（龙卷风、吼叫等）
		if (line.startsWith('|drag|')) {
			this.handleDrag(line);
			return;
		}

		// 形态变化（永久）
		if (line.startsWith('|detailschange|')) {
			this.handleDetailsChange(line);
			return;
		}

		// 形态变化（临时）
		if (line.startsWith('|-formechange|')) {
			this.handleFormeChange(line);
			return;
		}

		// 幻觉结束
		if (line.startsWith('|replace|')) {
			this.handleReplace(line);
			return;
		}

		// 位置交换
		if (line.startsWith('|swap|')) {
			this.handleSwap(line);
			return;
		}

		// 招式使用
		if (line.startsWith('|move|')) {
			this.handleMove(line);
			return;
		}

		// 无法行动
		if (line.startsWith('|cant|')) {
			this.handleCant(line);
			return;
		}

		// 昏厥
		if (line.startsWith('|faint|')) {
			this.handleFaint(line);
			return;
		}

		// ==================== Minor Actions ====================

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

		// 设置HP
		if (line.startsWith('|-sethp|')) {
			this.handleSetHP(line);
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

		// 治愈队伍
		if (line.startsWith('|-cureteam|')) {
			this.handleCureTeam(line);
			return;
		}

		// 效果拔群/不理想/会心/免疫
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
			this.handleImmune(line);
			return;
		}

		// 太晶化
		if (line.startsWith('|-terastallize|')) {
			this.handleTerastallize(line);
			return;
		}

		// ==================== 能力变化 ====================

		if (line.startsWith('|-boost|')) {
			this.handleBoost(line);
			return;
		}
		if (line.startsWith('|-unboost|')) {
			this.handleUnboost(line);
			return;
		}
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

		// ==================== 场地效果 ====================

		if (line.startsWith('|-sidestart|')) {
			this.handleSideStart(line);
			return;
		}
		if (line.startsWith('|-sideend|')) {
			this.handleSideEnd(line);
			return;
		}
		if (line.startsWith('|-swapsideconditions')) {
			this.handleSwapSideConditions(line);
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
	 * 处理强制切换（龙卷风、吼叫等）
	 */
	handleDrag(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const details = parts[3];
		const hp = parts[4] || '';
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const name = details.split(',')[0];
		const nameCN = this.translate(name, 'pokemon');

		console.log(`\n${player} ${nameCN} 被强制拖入战斗! ${hp ? '(HP: ' + hp + ')' : ''}`);

		if (isPlayer) {
			this.state.player.switchPokemon(species, name, hp, details);
		} else {
			this.state.opponent.switchPokemon(species, name, hp, details);
		}
	}

	/**
	 * 处理形态变化（永久，如超级进化）
	 */
	handleDetailsChange(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const details = parts[3];
		const hp = parts[4] || '';
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const name = details.split(',')[0];
		const nameCN = this.translate(name, 'pokemon');

		console.log(`\n${player} ${this.translate(species, 'pokemon')} 变成了 ${nameCN}!`);

		if (isPlayer) {
			this.state.player.switchPokemon(species, name, hp, details);
		} else {
			this.state.opponent.switchPokemon(species, name, hp, details);
		}
	}

	/**
	 * 处理形态变化（临时）
	 */
	handleFormeChange(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const newSpecies = parts[3];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');
		const newSpeciesCN = this.translate(newSpecies, 'pokemon');

		console.log(`  → ${player} ${speciesCN} 变成了 ${newSpeciesCN} 形态!`);
	}

	/**
	 * 处理幻觉结束
	 */
	handleReplace(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const details = parts[3];
		const hp = parts[4] || '';
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const name = details.split(',')[0];
		const nameCN = this.translate(name, 'pokemon');

		console.log(`\n${player} 的幻觉结束了! 真正的宝可梦是 ${nameCN}!`);

		if (isPlayer) {
			this.state.player.switchPokemon(species, name, hp, details);
		} else {
			this.state.opponent.switchPokemon(species, name, hp, details);
		}
	}

	/**
	 * 处理位置交换
	 */
	handleSwap(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const position = parts[3];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`  → ${player} ${speciesCN} 移动到了位置 ${position}!`);
	}

	/**
	 * 处理无法行动
	 */
	handleCant(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const reason = parts[3];
		const move = parts[4] || '';
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

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

		console.log(`  → ${player} ${speciesCN} 因为${reasonCN}无法行动!${moveText}`);
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

	// ==================== Minor Actions - 失败/阻挡类 ====================

	/**
	 * 处理招式失败
	 */
	handleFail(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const action = parts[3] || '';
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

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
			console.log(`  → ${player} ${speciesCN} 的${actionText}失败了!`);
		} else {
			console.log(`  → ${player} ${speciesCN} 的攻击失败了!`);
		}
	}

	/**
	 * 处理效果被阻挡
	 */
	handleBlock(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const effect = parts[3];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

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

		console.log(`  → ${player} ${speciesCN} 的效果被${effectCN}阻挡了!`);
	}

	/**
	 * 处理没有目标
	 */
	handleNoTarget(line) {
		const parts = line.split('|');
		const playerTag = parts[2];

		if (playerTag) {
			const isPlayer = playerTag.startsWith('p1');
			const player = isPlayer ? '【你】' : '【对手】';
			const species = playerTag.split(': ')[1];
			const speciesCN = this.translate(species, 'pokemon');
			console.log(`  → ${player} ${speciesCN} 的攻击没有目标!`);
		} else {
			console.log('  → 攻击没有目标!');
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
			const isPlayer = target.startsWith('p1');
			const player = isPlayer ? '【你】' : '【对手】';
			const targetName = target.split(': ')[1];
			const targetCN = this.translate(targetName, 'pokemon');
			console.log(`  → 攻击没有命中 ${player} ${targetCN}!`);
		} else {
			console.log('  → 攻击没有命中!');
		}
	}

	/**
	 * 处理免疫
	 */
	handleImmune(line) {
		const parts = line.split('|');
		const playerTag = parts[2];

		if (playerTag && playerTag.includes(': ')) {
			const isPlayer = playerTag.startsWith('p1');
			const player = isPlayer ? '【你】' : '【对手】';
			const species = playerTag.split(': ')[1];
			const speciesCN = this.translate(species, 'pokemon');
			console.log(`  → ${player} ${speciesCN} 完全没有效果!`);
		} else {
			console.log('  → 没有效果!');
		}
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
	 * 处理设置HP
	 */
	handleSetHP(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const hp = parts[3];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`  → ${player} ${speciesCN} 的HP变为 ${hp}!`);

		// 更新对手宝可梦HP
		if (!isPlayer && this.isPokemonSame(this.state.opponent.species, species)) {
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
	 * 处理治愈队伍
	 */
	handleCureTeam(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`  → ${player} ${speciesCN} 治愈了队伍的异常状态!`);
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
		const player = isPlayer ? '【你】' : '【对手】';
		const pokemonName = pokemon.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');

		console.log(`  → ${player} ${pokemonCN} 的能力变化被清除了!`);

		if (isPlayer) {
			this.state.player.clearBoosts();
		} else if (this.isPokemonSame(this.state.opponent.species, pokemonName)) {
			this.state.opponent.clearBoosts();
		}
	}

	/**
	 * 处理清除所有能力变化（白雾）
	 */
	handleClearAllBoost(line) {
		console.log('  → 所有宝可梦的能力变化被清除了!');
		this.state.player.clearBoosts();
		this.state.opponent.clearBoosts();
	}

	/**
	 * 处理设置能力变化
	 */
	handleSetBoost(line) {
		const parts = line.split('|');
		const pokemon = parts[2];
		const stat = parts[3];
		const amount = parseInt(parts[4]);
		const isPlayer = pokemon.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const pokemonName = pokemon.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');
		const statCN = this.translate(stat, 'boosts');

		console.log(`  → ${player} ${pokemonCN} 的${statCN}变为 ${amount} 级!`);

		// 设置能力变化到特定值
		if (isPlayer) {
			this.state.player.setBoost(stat, amount);
		} else if (this.isPokemonSame(this.state.opponent.species, pokemonName)) {
			this.state.opponent.setBoost(stat, amount);
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

		const sourceIsPlayer = source.startsWith('p1');
		const sourcePlayer = sourceIsPlayer ? '【你】' : '【对手】';
		const sourceName = source.split(': ')[1];
		const sourceCN = this.translate(sourceName, 'pokemon');

		const targetIsPlayer = target.startsWith('p1');
		const targetPlayer = targetIsPlayer ? '【你】' : '【对手】';
		const targetName = target.split(': ')[1];
		const targetCN = this.translate(targetName, 'pokemon');

		console.log(`  → ${sourcePlayer} ${sourceCN} 和 ${targetPlayer} ${targetCN} 交换了能力变化!`);
	}

	/**
	 * 处理反转能力变化
	 */
	handleInvertBoost(line) {
		const parts = line.split('|');
		const pokemon = parts[2];
		const isPlayer = pokemon.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const pokemonName = pokemon.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');

		console.log(`  → ${player} ${pokemonCN} 的能力变化被反转了!`);
	}

	/**
	 * 处理清除正面能力变化
	 */
	handleClearPositiveBoost(line) {
		const parts = line.split('|');
		const target = parts[2];
		const isPlayer = target.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const targetName = target.split(': ')[1];
		const targetCN = this.translate(targetName, 'pokemon');

		console.log(`  → ${player} ${targetCN} 的正面能力变化被清除了!`);
	}

	/**
	 * 处理清除负面能力变化
	 */
	handleClearNegativeBoost(line) {
		const parts = line.split('|');
		const pokemon = parts[2];
		const isPlayer = pokemon.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';
		const pokemonName = pokemon.split(': ')[1];
		const pokemonCN = this.translate(pokemonName, 'pokemon');

		console.log(`  → ${player} ${pokemonCN} 的负面能力变化被清除了!`);
	}

	/**
	 * 处理复制能力变化
	 */
	handleCopyBoost(line) {
		const parts = line.split('|');
		const source = parts[2];
		const target = parts[3];

		const sourceIsPlayer = source.startsWith('p1');
		const sourcePlayer = sourceIsPlayer ? '【你】' : '【对手】';
		const sourceName = source.split(': ')[1];
		const sourceCN = this.translate(sourceName, 'pokemon');

		const targetIsPlayer = target.startsWith('p1');
		const targetPlayer = targetIsPlayer ? '【你】' : '【对手】';
		const targetName = target.split(': ')[1];
		const targetCN = this.translate(targetName, 'pokemon');

		console.log(`  → ${targetPlayer} ${targetCN} 复制了 ${sourcePlayer} ${sourceCN} 的能力变化!`);
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
	 * 处理交换场地效果（场地互换）
	 */
	handleSwapSideConditions(line) {
		console.log('  → 双方的场地效果互换了!');
		// 交换双方的场地效果
		const temp = [...this.state.field.p1SideEffects];
		this.state.field.p1SideEffects = [...this.state.field.p2SideEffects];
		this.state.field.p2SideEffects = temp;
	}

	// ==================== 异常状态效果 ====================

	/**
	 * 处理异常状态开始
	 */
	handleStart(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const effect = parts[3];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		let effectCN = effect;
		if (effect.startsWith('move: ')) {
			const moveName = effect.replace('move: ', '');
			effectCN = this.translate(moveName, 'moves');
		} else if (effect.startsWith('ability: ')) {
			const abilityName = effect.replace('ability: ', '');
			effectCN = this.translate(abilityName, 'abilities');
			console.log(`  → ${player} ${speciesCN}的${effectCN}发动了!`);
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
		}

		console.log(`  → ${player} ${speciesCN} 陷入了${effectCN}状态!`);
	}

	/**
	 * 处理异常状态结束
	 */
	handleEnd(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const effect = parts[3];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

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
		}

		console.log(`  → ${player} ${speciesCN} 的${effectCN}状态结束了!`);
	}

	// ==================== 道具/特性 ====================

	/**
	 * 处理道具显示/变化
	 */
	handleItem(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const item = parts[3];
		const from = parts[4] || '';
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const itemData = Sim.Dex.items.get(item);
		const itemName = itemData.name || item;
		const itemCN = this.translate(itemName, 'items');

		if (from) {
			console.log(`  → ${player} ${speciesCN} 的${itemCN}被发现了!`);
		} else {
			console.log(`  → ${player} ${speciesCN} 携带着${itemCN}!`);
		}
	}

	/**
	 * 处理道具消耗/破坏
	 */
	handleEndItem(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const item = parts[3];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const itemData = Sim.Dex.items.get(item);
		const itemName = itemData.name || item;
		const itemCN = this.translate(itemName, 'items');

		// 检查是否是吃掉树果
		if (line.includes('[eat]')) {
			console.log(`  → ${player} ${speciesCN} 吃掉了${itemCN}!`);
		} else {
			console.log(`  → ${player} ${speciesCN} 的${itemCN}消失了!`);
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
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

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
			console.log(`  → ${player} ${speciesCN} 的特性变为${abilityCN}! (${fromCN})`);
		} else {
			console.log(`  → ${player} ${speciesCN} 的特性 ${abilityCN} 发动了!`);
		}
	}

	/**
	 * 处理特性被压制
	 */
	handleEndAbility(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`  → ${player} ${speciesCN} 的特性被压制了!`);
	}

	// ==================== 特殊形态 ====================

	/**
	 * 处理变身
	 */
	handleTransform(line) {
		const parts = line.split('|');
		const pokemon = parts[2];
		const target = parts[3];
		const isPlayer = pokemon.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = pokemon.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');
		const targetCN = this.translate(target, 'pokemon');

		console.log(`  → ${player} ${speciesCN} 变身成了 ${targetCN}!`);
	}

	/**
	 * 处理超级进化
	 */
	handleMega(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const megaStone = parts[3];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');
		const megaStoneCN = this.translate(megaStone, 'items');

		console.log(`\n${player} ${speciesCN} 使用${megaStoneCN}进行了超级进化!`);
	}

	/**
	 * 处理原始回归
	 */
	handlePrimal(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

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
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');
		const newSpeciesCN = this.translate(newSpecies, 'pokemon');
		const itemCN = this.translate(item, 'items');

		console.log(`\n${player} ${speciesCN} 使用${itemCN}进行了究极爆发变成了 ${newSpeciesCN}!`);
	}

	/**
	 * 处理Z招式
	 */
	handleZPower(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

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
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`  → ${player} ${speciesCN} 的守住被Z招式突破了!`);
	}

	// ==================== 杂项效果 ====================

	/**
	 * 处理杂项效果激活
	 */
	handleActivate(line) {
		const parts = line.split('|');
		const effect = parts[2];

		// 尝试解析效果
		let effectCN = effect;
		if (effect && effect.includes(': ')) {
			const [prefix, name] = effect.split(': ');
			if (prefix.includes('ability')) {
				effectCN = this.translate(name, 'abilities');
			} else if (prefix.includes('move')) {
				effectCN = this.translate(name, 'moves');
			} else if (prefix.includes('item')) {
				effectCN = this.translate(name, 'items');
			}
			console.log(`  → ${effectCN}发动了!`);
		} else if (effect && effect.startsWith('p')) {
			// 是宝可梦标签
			const playerTag = effect;
			const effectName = parts[3] || '';
			const isPlayer = playerTag.startsWith('p1');
			const player = isPlayer ? '【你】' : '【对手】';
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
				console.log(`  → ${player} ${speciesCN} 的${effectText}发动了!`);
			}
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
		console.log('  → 宝可梦自动居中了!');
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
		console.log('  → 招式合体了!');
	}

	/**
	 * 处理等待目标
	 */
	handleWaiting(line) {
		const parts = line.split('|');
		const source = parts[2];
		const target = parts[3];

		const sourceIsPlayer = source.startsWith('p1');
		const sourcePlayer = sourceIsPlayer ? '【你】' : '【对手】';
		const sourceName = source.split(': ')[1];
		const sourceCN = this.translate(sourceName, 'pokemon');

		const targetIsPlayer = target.startsWith('p1');
		const targetPlayer = targetIsPlayer ? '【你】' : '【对手】';
		const targetName = target.split(': ')[1];
		const targetCN = this.translate(targetName, 'pokemon');

		console.log(`  → ${sourcePlayer} ${sourceCN} 正在等待 ${targetPlayer} ${targetCN}!`);
	}

	/**
	 * 处理准备蓄力招式
	 */
	handlePrepare(line) {
		const parts = line.split('|');
		const attacker = parts[2];
		const move = parts[3];
		const defender = parts[4] || '';
		const isPlayer = attacker.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = attacker.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const moveData = Sim.Dex.moves.get(move);
		const moveName = moveData.name || move;
		const moveCN = this.translate(moveName, 'moves');

		if (defender) {
			const defenderIsPlayer = defender.startsWith('p1');
			const defenderPlayer = defenderIsPlayer ? '【你】' : '【对手】';
			const defenderName = defender.split(': ')[1];
			const defenderCN = this.translate(defenderName, 'pokemon');
			console.log(`  → ${player} ${speciesCN} 正在准备${moveCN}对付 ${defenderPlayer} ${defenderCN}!`);
		} else {
			console.log(`  → ${player} ${speciesCN} 正在准备${moveCN}!`);
		}
	}

	/**
	 * 处理必须蓄力
	 */
	handleMustRecharge(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		console.log(`  → ${player} ${speciesCN} 必须休息一回合!`);
	}

	/**
	 * 处理多段攻击计数
	 */
	handleHitCount(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const count = parts[3];

		console.log(`  → 击中了 ${count} 次!`);
	}

	/**
	 * 处理单招式效果
	 */
	handleSingleMove(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const move = parts[3];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const moveData = Sim.Dex.moves.get(move);
		const moveName = moveData.name || move;
		const moveCN = this.translate(moveName, 'moves');

		console.log(`  → ${player} ${speciesCN} 使用了${moveCN}!`);
	}

	/**
	 * 处理单回合效果
	 */
	handleSingleTurn(line) {
		const parts = line.split('|');
		const playerTag = parts[2];
		const move = parts[3];
		const isPlayer = playerTag.startsWith('p1');
		const player = isPlayer ? '【你】' : '【对手】';

		const species = playerTag.split(': ')[1];
		const speciesCN = this.translate(species, 'pokemon');

		const moveData = Sim.Dex.moves.get(move);
		const moveName = moveData.name || move;
		const moveCN = this.translate(moveName, 'moves');

		console.log(`  → ${player} ${speciesCN} 使用了${moveCN}!`);
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
