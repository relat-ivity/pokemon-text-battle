/**
 * UI 显示模块
 * 负责所有的命令行界面显示
 */

const Sim = require('pokemon-showdown');

/**
 * 显示队伍信息
 */
function displayTeamInfo(team, trainerName, translator) {
	console.log('='.repeat(60));
	console.log(`${trainerName} 的队伍`);
	console.log('='.repeat(60));

	team.forEach((pokemon, index) => {
		const speciesCN = translator.translate(pokemon.species, 'pokemon');
		const gender = pokemon.gender ? ` (${pokemon.gender})` : '';
		let logInfo = `[${index + 1}] ${speciesCN}${gender}`;

		// 获取宝可梦数据
		const speciesData = Sim.Dex.species.get(pokemon.species);

		// 显示等级
		if (pokemon.level) {
			logInfo += ` Lv.${pokemon.level}`;
		} else {
			logInfo += ` Lv.100`;
		}

		// 显示属性
		if (speciesData.types) {
			const typesCN = speciesData.types.map(t => translator.translate(t, 'types')).join('/');
			logInfo += ` 属性:${typesCN}`;
		}

		// 太晶属性
		if (pokemon.teraType) {
			const teraTypeCN = translator.translate(pokemon.teraType, 'types');
			logInfo += ` 太晶属性: ${teraTypeCN}`;
		}

		// 性格
		if (pokemon.nature) {
			const natureCN = translator.translate(pokemon.nature, 'natures');
			logInfo += ` 性格: ${natureCN}`;
		}
		console.log(logInfo);

		// 特性
		if (pokemon.ability) {
			const abilityCN = translator.translate(pokemon.ability, 'abilities');
			const abilityData = Sim.Dex.abilities.get(pokemon.ability);
			let logInfo = `    特性: ${abilityCN}`;
			if (abilityData.desc || abilityData.shortDesc) {
				logInfo += ` 描述: ${abilityData.shortDesc || abilityData.desc}`;
			}
			console.log(logInfo);
		}

		// 携带物品
		if (pokemon.item) {
			const itemCN = translator.translate(pokemon.item, 'items');
			console.log(`    携带物品: ${itemCN}`);
		}

		// 种族值
		if (speciesData.baseStats) {
			const baseStats = [];
			baseStats.push(`HP:${speciesData.baseStats.hp}`);
			baseStats.push(`攻击:${speciesData.baseStats.atk}`);
			baseStats.push(`防御:${speciesData.baseStats.def}`);
			baseStats.push(`特攻:${speciesData.baseStats.spa}`);
			baseStats.push(`特防:${speciesData.baseStats.spd}`);
			baseStats.push(`速度:${speciesData.baseStats.spe}`);
			console.log(`    种族值: ${baseStats.join(' ')}`);
		}

		// 招式
		if (pokemon.moves && pokemon.moves.length > 0) {
			console.log(`    招式:`);
			pokemon.moves.forEach((move, i) => {
				const moveData = Sim.Dex.moves.get(move);
				const moveName = moveData.name || move;
				const moveCN = translator.translate(moveName, 'moves');
				let moveInfo = `       ${i + 1}.${moveCN}`;

				// 添加属性
				if (moveData.type) {
					const typeCN = translator.translate(moveData.type, 'types');
					moveInfo += ` [${typeCN}]`;
				}

				// 添加威力
				if (moveData.basePower) {
					moveInfo += ` 威力:${moveData.basePower}`;
				}

				// 添加命中率
				if (moveData.accuracy === true) {
					moveInfo += ` 命中:--`;
				} else if (moveData.accuracy) {
					moveInfo += ` 命中:${moveData.accuracy}%`;
				}

				// 添加技能描述
				if (moveData.shortDesc || moveData.desc) {
					moveInfo += ` 描述:${moveData.shortDesc || moveData.desc}`;
				}
				console.log(moveInfo);
			});
		}

		console.log('');
	});

	console.log('='.repeat(60));
}

/**
 * 显示可用的选择（重构后的版本，参数大幅减少）
 */
function displayChoices(battleState, request, translator, debugMode = false) {
	if (!request.active || !request.active[0]) return;

	const active = request.active[0];
	const pokemon = request.side.pokemon;

	// 显示场地信息
	if (battleState.field.hasEffects()) {
		console.log('场地状态:');

		if (battleState.field.weather) {
			const weatherCN = translator.translate(battleState.field.weather, 'weathers');
			console.log(`   天气: ${weatherCN}`);
		}

		if (battleState.field.terrain.length > 0) {
			const terrainsCN = battleState.field.terrain.map(t => translator.translate(t, 'terrains')).join(', ');
			console.log(`   场地: ${terrainsCN}`);
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

	// 显示对手宝可梦状态
	if (battleState.opponent.species) {
		const oppSpeciesData = Sim.Dex.species.get(battleState.opponent.name || battleState.opponent.species);
		const oppSpeciesCN = translator.translate(battleState.opponent.name || battleState.opponent.species, 'pokemon');
		let speciesLog = `对手出战: ${oppSpeciesCN}`;

		// 显示等级
		if (battleState.opponent.level) {
			speciesLog += ` Lv.${battleState.opponent.level}`;
		} else {
			speciesLog += ` Lv.100`;
		}

		// 显示属性
		if (oppSpeciesData.types) {
			const typesCN = oppSpeciesData.types.map(t => translator.translate(t, 'types')).join('/');
			speciesLog += ` 属性:${typesCN}`;
		}

		speciesLog += ` HP(%):${battleState.opponent.condition || '未知'}`;

		// 显示太晶化状态
		if (debugMode) {
			console.log(`[Debug] 检查太晶: opponentTerastallizedPokemon='${battleState.opponent.terastallizedPokemon}', opponentActive.species='${battleState.opponent.species}'`);
		}
		if (battleState.opponent.isTerastallized(battleState.opponent.species)) {
			const teraTypeCN = translator.translate(battleState.opponent.teraType, 'types');
			speciesLog += ` [已太晶化:${teraTypeCN}]`;
		}

		console.log(speciesLog);

		// 显示异常状态
		if (battleState.opponent.status) {
			const statusCN = translator.translate(battleState.opponent.status, 'status');
			console.log(`   状态: ${statusCN}`);
		}

		// 显示对手能力等级变化
		const opponentBoosts = battleState.opponent.getNonZeroBoosts();
		if (opponentBoosts.length > 0) {
			const boostsStr = opponentBoosts.map(({stat, boost}) => {
				const statCN = translator.translate(stat, 'boosts');
				const sign = boost > 0 ? '+' : '';
				return `${statCN}${sign}${boost}`;
			}).join(' ');
			console.log(`   能力变化: ${boostsStr}`);
		}
	}

	// 显示当前宝可梦
	const currentPokemon = pokemon[0];
	const species = currentPokemon.ident.split(': ')[1];
	const name = currentPokemon.details ? currentPokemon.details.split(',')[0] : species;
	const speciesData = Sim.Dex.species.get(name);
	const nameCN = translator.translate(name, 'pokemon');
	let speciesLog = `当前出战: ${nameCN}`;

	// 显示等级
	if (battleState.player.level) {
		speciesLog += ` Lv.${battleState.player.level}`;
	}

	// 显示属性
	if (speciesData.types) {
		const typesCN = speciesData.types.map(t => translator.translate(t, 'types')).join('/');
		speciesLog += ` 属性:${typesCN}`;
	}
	speciesLog += ` HP:${currentPokemon.condition}`;

	// 显示太晶化状态
	if (battleState.player.isTerastallized(species)) {
		const teraTypeCN = translator.translate(battleState.player.teraType, 'types');
		speciesLog += ` [已太晶化:${teraTypeCN}]`;
	}

	console.log(speciesLog);

	// 显示携带物品
	if (currentPokemon.item) {
		const itemData = Sim.Dex.items.get(currentPokemon.item);
		const itemName = itemData.name || currentPokemon.item;
		const itemCN = translator.translate(itemName, 'items');
		console.log(`   携带物品: ${itemCN}`);
	}

	// 显示特性
	if (currentPokemon.ability || currentPokemon.baseAbility) {
		const ability = currentPokemon.ability || currentPokemon.baseAbility;
		const abilityData = Sim.Dex.abilities.get(ability); 
		const abilityName = abilityData.name || ability;
		const abilityCN = translator.translate(abilityName, 'abilities');
			abilityInfo = `   特性: ${abilityCN}`;
			if (abilityData.shortDesc || abilityData.desc) {
			abilityInfo += ` 描述：${abilityData.shortDesc || abilityData.desc}`;
			}
			console.log(abilityInfo);
	}

	// 显示状态异常
	if (battleState.player.status) {
		const statusCN = translator.translate(battleState.player.status, 'status');
		console.log(`   状态: ${statusCN}`);
	}

	// 显示能力等级变化
	const playerBoosts = battleState.player.getNonZeroBoosts();
	if (playerBoosts.length > 0) {
		const boostsStr = playerBoosts.map(({stat, boost}) => {
			const statCN = translator.translate(stat, 'boosts');
			const sign = boost > 0 ? '+' : '';
			return `${statCN}${sign}${boost}`;
		}).join(' ');
		console.log(`   能力变化: ${boostsStr}`);
	}

	// 显示太晶化信息
	if (active.canTerastallize) {
		const teraTypeCN = currentPokemon.teraType ? translator.translate(currentPokemon.teraType, 'types') : '未知';
		console.log(`   太晶属性: ${teraTypeCN}（可以太晶化！）`);
	}

	// 显示可用招式
	console.log('\n可用招式:');
	active.moves.forEach((move, index) => {
		const moveData = Sim.Dex.moves.get(move.move);
		const moveName = moveData.name || move.move;
		const moveCN = translator.translate(moveName, 'moves');

		if (!move.disabled) {
			const ppInfo = move.pp !== undefined ? ` (PP: ${move.pp}/${move.maxpp})` : '';
			let moveInfo = `   ${index + 1}.${moveCN}`;

			// 添加属性和类别
			if (moveData.type) {
				const typeCN = translator.translate(moveData.type, 'types');
				const categoryCN = translator.translate(moveData.category, 'category');
				moveInfo += ` [${typeCN}/${categoryCN}]`;
			}

			// 添加威力
			if (moveData.basePower) {
				moveInfo += ` 威力：${moveData.basePower}`;
			}

			// 添加命中率
			if (moveData.accuracy === true) {
				moveInfo += ` 命中：--`;
			} else if (moveData.accuracy) {
				moveInfo += ` 命中：${moveData.accuracy}%`;
			}

			moveInfo += ppInfo;

			// 添加技能描述
			if (moveData.shortDesc || moveData.desc) {
				moveInfo += ` 描述：${moveData.shortDesc || moveData.desc}`;
			}
			console.log(moveInfo);
		} else {
			console.log(`   ${index + 1}. ${moveCN} [已禁用]`);
		}
	});
}

/**
 * 显示换人选择
 */
function displaySwitchChoices(request, translator) {
	console.log('\n' + '='.repeat(50));
	console.log('请选择下一个出战的宝可梦：');
	console.log('='.repeat(50));

	const pokemon = request.side.pokemon;

	console.log('可用的宝可梦:');
	pokemon.forEach((poke, index) => {
		if (!poke.condition.endsWith(' fnt') && !poke.active) {
			const speciesName = poke.ident.split(': ')[1];
			console.log(`   ${index + 1}. ${translator.translate(speciesName, 'pokemon')} (HP: ${poke.condition})`);
		}
	});

	console.log('输入格式: switch 2');
}

/**
 * 显示战斗中的队伍状态（重构后的版本，参数大幅减少）
 */
function displayBattleTeamStatus(battleState, request, translator) {
	if (!request || !request.side || !request.side.pokemon) {
		console.log('无法获取队伍信息');
		return;
	}

	// 显示对手剩余存活的宝可梦
	const alivePokemon = battleState.getOpponentAlivePokemon();
	let p2teamlog = '\n对手剩余宝可梦: ';

	// 判断是否是本地模式（有 opponentTeam）还是服务器模式（没有 opponentTeam）
	const isLocalMode = battleState.opponentTeam && battleState.opponentTeam.length > 0;

	if (isLocalMode) {
		// 本地模式：显示所有存活的宝可梦
		if (alivePokemon.length === 0) {
			p2teamlog += '全部昏厥';
		} else {
			alivePokemon.forEach((pokemon) => {
				const speciesCN = translator.translate(pokemon.species, 'pokemon');
				p2teamlog += `${speciesCN} `;
			});
		}
	} else {
		// 服务器模式：使用见过的宝可梦信息
		const seenPokemon = battleState.opponent.getSeenPokemon();
		const remainingCount = battleState.opponent.getRemainingCount();

		if (seenPokemon.length > 0) {
			p2teamlog += `剩余 ${remainingCount} 只 \n    已知: `;
			seenPokemon.forEach((pokemon, index) => {
				const speciesCN = translator.translate(pokemon.species, 'pokemon');
				const status = pokemon.fainted ? '[已昏厥]' :
				              pokemon.active ? '[出战中]' : '';
				p2teamlog += `${speciesCN}${status}`;
				if (index < seenPokemon.length - 1) p2teamlog += ' ';
			});
		} else {
			p2teamlog += `剩余 ${remainingCount} 只 (暂无信息)`;
		}
	}
	console.log(p2teamlog);

	console.log('你的宝可梦: ');

	const pokemon = request.side.pokemon;

	pokemon.forEach((poke, index) => {
		const species = poke.ident.split(': ')[1];
		const name = poke.details ? poke.details.split(',')[0] : species;
		const nameCN = translator.translate(name, 'pokemon');
		const isActive = poke.active ? ' [出战中]' : '';
		const isFainted = poke.condition.endsWith(' fnt') ? ' [已昏厥]' : '';

		let logInfo = `[${index + 1}] ${nameCN}${isActive}${isFainted}`;
		logInfo += ` HP:${poke.condition}`;

		// 显示太晶化状态
		if (battleState.player.isTerastallized(species)) {
			const teraTypeCN = translator.translate(battleState.player.teraType, 'types');
			logInfo += ` [已太晶化:${teraTypeCN}]`;
		}

		// 显示状态异常
		const displayStatus = poke.active ? battleState.player.status : poke.status;
		if (displayStatus) {
			const statusCN = translator.translate(displayStatus, 'status');
			logInfo += ` 状态:${statusCN}`;
		}
		console.log(logInfo);
	});

	console.log('');
}

/**
 * 显示从 request 中获取的完整队伍信息（对战开始时）
 */
function displayTeamFromRequest(request, translator) {
	if (!request || !request.side || !request.side.pokemon) {
		console.log('❌ 无法获取队伍信息');
		return;
	}

	console.log('='.repeat(60));
	console.log('📋 你的队伍信息');
	console.log('='.repeat(60));

	const pokemon = request.side.pokemon;

	pokemon.forEach((poke, index) => {
		const species = poke.ident.split(': ')[1];
		const name = poke.details ? poke.details.split(',')[0] : species;
		const speciesData = Sim.Dex.species.get(name);
		const nameCN = translator.translate(name, 'pokemon');
		const isActive = poke.active ? ' [出战中]' : '';

		// 提取等级信息
		let level = '';
		if (poke.details) {
			const levelMatch = poke.details.match(/L(\d+)/);
			if (levelMatch) {
				level = ` Lv.${levelMatch[1]}`;
			}
		}

		pokelog = `[${index + 1}] ${nameCN}${level}${isActive}`;
		pokelog += ` HP:${poke.condition}`;

		// 显示属性
		if (speciesData.types) {
			const typesCN = speciesData.types.map(t => translator.translate(t, 'types')).join('/');
			pokelog += ` 属性:${typesCN}`;
		}

		// 显示太晶属性
		if (poke.teraType) {
			const teraTypeCN = translator.translate(poke.teraType, 'types');
			pokelog += ` 太晶属性:${teraTypeCN}`;
		}
		console.log(pokelog);

		// 显示携带物品
		if (poke.item) {
			const itemData = Sim.Dex.items.get(poke.item);
			const itemName = itemData.name || poke.item;
			const itemCN = translator.translate(itemName, 'items');
			console.log(`    携带物品:${itemCN}`);
		}

		// 显示特性
		if (poke.ability || poke.baseAbility) {
			const ability = poke.ability || poke.baseAbility;
			const abilityData = Sim.Dex.abilities.get(ability);
			const abilityName = abilityData.name || ability;
			const abilityCN = translator.translate(abilityName, 'abilities');
			abilityInfo = `    特性:${abilityCN}`;
			if (abilityData.shortDesc || abilityData.desc) {
			abilityInfo += ` 描述${abilityData.shortDesc || abilityData.desc}`;
			}
			console.log(abilityInfo);
		}

		// 显示招式
		if (poke.moves && poke.moves.length > 0) {
			console.log(`    招式:`);
			poke.moves.forEach((moveId, i) => {
				const moveData = Sim.Dex.moves.get(moveId);
				const moveName = moveData.name || moveId;
				const moveCN = translator.translate(moveName, 'moves');
				let moveInfo = `       ${i + 1}. ${moveCN}`;

				// 添加属性
				if (moveData.type) {
					const typeCN = translator.translate(moveData.type, 'types');
					const categoryCN = translator.translate(moveData.category, 'category');
					moveInfo += `[${typeCN}/${categoryCN}]`;
				}

				// 添加威力
				if (moveData.basePower) {
					moveInfo += ` 威力:${moveData.basePower}`;
				}

				// 添加命中率
				if (moveData.accuracy === true) {
					moveInfo += ` 命中:--`;
				} else if (moveData.accuracy) {
					moveInfo += ` 命中:${moveData.accuracy}%`;
				}

				// 添加技能描述
				if (moveData.shortDesc || moveData.desc) {
					moveInfo += ` 描述:${moveData.shortDesc || moveData.desc}`;
				}

				console.log(moveInfo);
			});
		}
	});

	console.log('='.repeat(60));
}

module.exports = {
	displayTeamInfo,
	displayChoices,
	displaySwitchChoices,
	displayBattleTeamStatus,
	displayTeamFromRequest
};
