/**
 * 双打 UI 显示模块
 * 专门用于VGC双打对战的界面显示
 */

const Sim = require('pokemon-showdown');

/**
 * 显示队伍信息（复用单打的）
 */
const { displayTeamInfo, displayBattleTeamStatus } = require('../battle_common/ui-display');

/**
 * 格式化位置显示
 * 对手：位置0 -> +2, 位置1 -> +1
 * 己方：位置0 -> -1, 位置1 -> -2
 */
function formatPosition(slot, isPlayer) {
	return slot === 0 ? '左' : '右';
}

/**
 * 显示双打可用选择
 */
function displayDoublesChoices(battleState, request, translator, debugMode = false) {
	if (!request.active || request.active.length === 0) return;

	const pokemon = request.side.pokemon;

	// 显示回合标题
	console.log('==================================================');
	console.log(`第 ${battleState.currentTurn} 回合`);
	console.log('==================================================');

	// 显示场地信息
	if (battleState.field.hasEffects()) {
		console.log('场地状态:');

		if (battleState.field.weather) {
			const weatherCN = translator.translate(battleState.field.weather, 'weathers');
			console.log(`   天气: ${weatherCN}`);
		}

		if (battleState.field.terrain) {
			const terrainCN = translator.translate(battleState.field.terrain, 'terrains');
			console.log(`   场地: ${terrainCN}`);
		}

		if (battleState.field.fieldEffects.length > 0) {
			const effectsCN = battleState.field.fieldEffects.map(e => translator.translate(e, 'moves')).join(', ');
			console.log(`   全场效果: ${effectsCN}`);
		}

		if (battleState.field.p1Side.length > 0) {
			const effects = battleState.field.p1Side.map(e => translator.translate(e, 'moves')).join(', ');
			console.log(`   我方场地: ${effects}`);
		}

		if (battleState.field.p2Side.length > 0) {
			const effects = battleState.field.p2Side.map(e => translator.translate(e, 'moves')).join(', ');
			console.log(`   对手场地: ${effects}`);
		}
		console.log('');
	}

	// 显示对手两个活跃宝可梦
	console.log('对手出战');
	for (let slot = 0; slot < 2; slot++) {
		const oppPokemon = battleState.opponent.getPokemon(slot);
		if (!oppPokemon) continue;

		const oppSpeciesData = Sim.Dex.species.get(oppPokemon.name || oppPokemon.species);
		const oppSpeciesCN = translator.translate(oppPokemon.name || oppPokemon.species, 'pokemon');
		const position = formatPosition(slot, false);
		let speciesLog = `[${position}] ${oppSpeciesCN}`;

		if (oppPokemon.level) {
			speciesLog += ` Lv.${oppPokemon.level}`;
		}

		if (oppSpeciesData.types) {
			const typesCN = oppSpeciesData.types.map(t => translator.translate(t, 'types')).join('/');
			speciesLog += ` 属性:${typesCN}`;
		}

		speciesLog += ` HP:${oppPokemon.condition || '未知'}`;

		if (battleState.opponent.isTerastallized(oppPokemon.species)) {
			const teraTypeCN = translator.translate(battleState.opponent.teraType, 'types');
			speciesLog += ` [已太晶化:${teraTypeCN}]`;
		}

		console.log(speciesLog);

		// 显示状态异常和能力变化
		const statusEffects = [];

		if (oppPokemon.status) {
			const statusCN = translator.translate(oppPokemon.status, 'status');
			statusEffects.push(`状态:${statusCN}`);
		}

		if (oppPokemon.boosts) {
			const boostsArr = Object.entries(oppPokemon.boosts).filter(([_, v]) => v !== 0);
			if (boostsArr.length > 0) {
				const boostsStr = boostsArr.map(([stat, boost]) => {
					const statCN = translator.translate(stat, 'boosts');
					const sign = boost > 0 ? '+' : '';
					return `${statCN}${sign}${boost}`;
				}).join(' ');
				statusEffects.push(`能力:${boostsStr}`);
			}
		}

		if (statusEffects.length > 0) {
			console.log(`     ${statusEffects.join(' ')}`);
		}
	}

	// 显示玩家两个活跃宝可梦
	console.log('我方出战');
	const activeSlotsCount = Math.min(request.active.length, 2);

	for (let slotIndex = 0; slotIndex < activeSlotsCount; slotIndex++) {
		const active = request.active[slotIndex];
		if (!active) continue;

		const currentPokemon = pokemon[slotIndex];
		if (!currentPokemon) continue;

		const species = currentPokemon.ident.split(': ')[1];
		const name = currentPokemon.details ? currentPokemon.details.split(',')[0] : species;
		const speciesData = Sim.Dex.species.get(name);
		const nameCN = translator.translate(name, 'pokemon');

		const position = formatPosition(slotIndex, true);
		let speciesLog = `[${position}] ${nameCN}`;

		// 显示等级
		const detailsParts = currentPokemon.details.split(',');
		const levelPart = detailsParts.find(part => /^\s*L\d+/.test(part));
		if (levelPart) {
			const level = levelPart.trim().substring(1);
			speciesLog += ` Lv.${level}`;
		}

		// 显示属性
		if (speciesData.types) {
			const typesCN = speciesData.types.map(t => translator.translate(t, 'types')).join('/');
			speciesLog += ` 属性:${typesCN}`;
		}

		// 显示太晶化信息
		if (active.canTerastallize) {
			const teraTypeCN = currentPokemon.teraType ? translator.translate(currentPokemon.teraType, 'types') : '未知';
			speciesLog += ` 可太晶化:${teraTypeCN}`;
		}

		// 显示太晶化状态
		if (battleState.player.isTerastallized(species)) {
			const teraTypeCN = translator.translate(battleState.player.teraType, 'types');
			speciesLog += ` [已太晶化:${teraTypeCN}]`;
		}

		speciesLog += ` HP:${currentPokemon.condition}`;
		console.log(speciesLog);

		// 状态异常和能力变化
		const playerActiveSlot = battleState.player.getPokemon(slotIndex);
		const statusEffects = [];

	//    if (currentPokemon.item) {
	// 		const itemData = Sim.Dex.items.get(currentPokemon.item);
	// 		const itemName = itemData.name || currentPokemon.item;
	// 		const itemCN = translator.translate(itemName, 'items');
	// 		statusEffects.push(`携带物品: ${itemCN}`);
	// 	}

	// 	if (currentPokemon.ability || currentPokemon.baseAbility) {
	// 		const ability = currentPokemon.ability || currentPokemon.baseAbility;
	// 		const abilityData = Sim.Dex.abilities.get(ability);
	// 		const abilityName = abilityData.name || ability;
	// 		const abilityCN = translator.translate(abilityName, 'abilities');
	// 		statusEffects.push(`特性: ${abilityCN}`);
	// 	}

		if (playerActiveSlot && playerActiveSlot.status) {
			const statusCN = translator.translate(playerActiveSlot.status, 'status');
			statusEffects.push(`状态:${statusCN}`);
		}

		if (playerActiveSlot && playerActiveSlot.boosts) {
			const boostsArr = Object.entries(playerActiveSlot.boosts).filter(([_, v]) => v !== 0);
			if (boostsArr.length > 0) {
				const boostsStr = boostsArr.map(([stat, boost]) => {
					const statCN = translator.translate(stat, 'boosts');
					const sign = boost > 0 ? '+' : '';
					return `${statCN}${sign}${boost}`;
				}).join(' ');
				statusEffects.push(`能力:${boostsStr}`);
			}
		}

		if (statusEffects.length > 0) {
			console.log(`     ${statusEffects.join(' ')}`);
		}
	}

	console.log(`\n可用招式：`);

	// 显示可用招式（每个位置）
	for (let slotIndex = 0; slotIndex < activeSlotsCount; slotIndex++) {
		const active = request.active[slotIndex];
		if (!active) continue;

		const position = formatPosition(slotIndex, true);

		// 每行显示2个招式
		for (let i = 0; i < active.moves.length; i += 2) {
			let lineStr = i == 0 ? '>  ' : '   ';

			// 第一个招式
			const move1 = active.moves[i];
			const moveData1 = Sim.Dex.moves.get(move1.move);
			const moveName1 = moveData1.name || move1.move;
			const moveCN1 = translator.translate(moveName1, 'moves');

			if (!move1.disabled) {
				const ppInfo1 = move1.pp !== undefined ? `(PP:${move1.pp}/${move1.maxpp})` : '';
				let moveInfo1 = `${i + 1}.${moveCN1}`;

				if (moveData1.type) {
					const typeCN1 = translator.translate(moveData1.type, 'types');
					const categoryCN1 = translator.translate(moveData1.category, 'category');
					moveInfo1 += ` [${typeCN1}/${categoryCN1}]`;
				}

				if (moveData1.basePower) {
					moveInfo1 += ` 威力：${moveData1.basePower}`;
				}

				moveInfo1 += ` ${ppInfo1}`;
				lineStr += moveInfo1;
			} else {
				lineStr += `${i + 1}.${moveCN1} [已禁用]`;
			}

			// 第二个招式（如果存在）
			if (i + 1 < active.moves.length) {
				lineStr += '  '; // 两个招式之间用两个空格分隔

				const move2 = active.moves[i + 1];
				const moveData2 = Sim.Dex.moves.get(move2.move);
				const moveName2 = moveData2.name || move2.move;
				const moveCN2 = translator.translate(moveName2, 'moves');

				if (!move2.disabled) {
					const ppInfo2 = move2.pp !== undefined ? `(PP:${move2.pp}/${move2.maxpp})` : '';
					let moveInfo2 = `${i + 2}.${moveCN2}`;

					if (moveData2.type) {
						const typeCN2 = translator.translate(moveData2.type, 'types');
						const categoryCN2 = translator.translate(moveData2.category, 'category');
						moveInfo2 += ` [${typeCN2}/${categoryCN2}]`;
					}

					if (moveData2.basePower) {
						moveInfo2 += ` 威力：${moveData2.basePower}`;
					}

					moveInfo2 += ` ${ppInfo2}`;
					lineStr += moveInfo2;
				} else {
					lineStr += `${i + 2}.${moveCN2} [已禁用]`;
				}
			}

			console.log(lineStr);
		}
	}

	console.log('');

	// 显示可切换的宝可梦
	console.log('可切换宝可梦:');
	const canSwitch = pokemon.filter((p, i) =>
		i >= activeSlotsCount && p.condition && !p.condition.endsWith(' fnt')
	);

	if (canSwitch.length > 0) {
		canSwitch.forEach((p, i) => {
			const pName = p.details.split(',')[0];
			const pNameCN = translator.translate(pName, 'pokemon');
			console.log(`   ${activeSlotsCount + i + 1}. ${pNameCN} (HP: ${p.condition})`);
		});
	} else {
		console.log('   (无可用宝可梦)');
	}
}

/**
 * 显示双打换人选择
 */
function displayDoublesSwitchChoices(request, translator) {
	console.log('\n' + '='.repeat(50));
	console.log('请选择下一个出战的宝可梦：');
	console.log('='.repeat(50));

	const pokemon = request.side.pokemon;

	pokemon.forEach((p, index) => {
		if (!p.active && p.condition && !p.condition.endsWith(' fnt')) {
			const name = p.details.split(',')[0];
			const nameCN = translator.translate(name, 'pokemon');
			const hp = p.condition;
			console.log(`${index + 1}. ${nameCN} (HP: ${hp})`);
		}
	});

	console.log('='.repeat(50));
}

module.exports = {
	displayTeamInfo,
	displayChoicesVGC: displayDoublesChoices,
	displaySwitchChoicesVGC: displayDoublesSwitchChoices,
	displayBattleTeamStatus
};