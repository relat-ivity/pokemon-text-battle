/**
 * PVE 对战脚本 - 玩家 vs AI
 * 使用 Pokemon Showdown 模拟器
 * 
 * 运行方式：npm start 或 node src/battle/pve-battle.js
 */

const Sim = require('pokemon-showdown');
const {
	AIPlayerFactory
} = require('../../dist/ai/ai-player-factory');
const readline = require('readline');
const {
	Translator
} = require('../../dist/support/translator');
const fs = require('fs');
const path = require('path');

// debug设置
let debug_mode = true;

// 翻译器
let translator = Translator.getInstance('cn');

// 创建命令行输入接口
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

// 主战斗逻辑
async function startPVEBattle() {
	console.log('=== Pokemon Showdown PVE 对战 ===\n');

	// 选择世代和格式 - 50级单打对战
	const format = 'gen9ou';
	const playerName = 'Player';

	console.log('输入格式:');
	console.log('    使用招式: move 1');
	console.log('    切换宝可梦: switch 2');
	console.log('    太晶化攻击: move 1 terastallize  (使用第1个招式并太晶化)');
	console.log('    查看队伍: team  (查看所有宝可梦状态)');

	console.log("\n请选择对手：\n    1. DeepSeek AI\n    2. 本地智能AI\n    3. 随机AI");
	const opponentChoice = await prompt('请输入对手编号:');
	let opponent = '本地智能AI';
	let aiType = 'smart_ai';
	if (opponentChoice === '1') {
		opponent = 'DeepSeek AI';
		aiType = 'deepseek_ai';
	} else if (opponentChoice === '2') {
		opponent = '本地智能AI';
		aiType = 'smart_ai';
	} else if (opponentChoice === '3') {
		opponent = '随机AI';
		aiType = 'random_ai';
	} else {
		console.log("未知对手，将使用本地智能AI")
	}

	// 创建战斗流
	const streams = Sim.getPlayerStreams(new Sim.BattleStream());

	// 生成随机队伍 - 使用 gen9randombattle 生成满足ou规则的队伍，然后设置为50级
	const validator = new Sim.TeamValidator('gen9ou');
	let p1team = Sim.Teams.generate('gen9randombattle');
	while (validator.validateTeam(p1team) != null) {
		p1team = Sim.Teams.generate('gen9randombattle');
	}

	// 将所有宝可梦设置为50级，并设置努力值每项为85，性格统一为Hardy（勤奋）
	p1team = p1team.map(pokemon => ({
		...pokemon,
		level: 50,
		nature: 'Hardy',
		evs: {
			hp: 85,
			atk: 85,
			def: 85,
			spa: 85,
			spd: 85,
			spe: 85
		}
	}));

	// 设置战斗参数
	const spec = {
		formatid: format,
	};

	const p1spec = {
		name: playerName,
		team: Sim.Teams.pack(p1team),
	};

	let p2team = Sim.Teams.generate('gen9randombattle');
	while (validator.validateTeam(p2team) != null) {
		p2team = Sim.Teams.generate('gen9randombattle');
	}
	// 将所有宝可梦设置为50级，并设置努力值每项为85，性格统一为Hardy（勤奋）
	p2team = p2team.map(pokemon => ({
		...pokemon,
		level: 50,
		nature: 'Hardy',
		evs: {
			hp: 85,
			atk: 85,
			def: 85,
			spa: 85,
			spd: 85,
			spe: 85
		}
	}));

	// 通过工厂创建 AI 对手（必须在 p2team 和 streams 创建之后）
	const ai = AIPlayerFactory.createAI(aiType, streams.p2, debug_mode, p1team);
	console.log(`✓ 已创建对手: ${opponent}`);

	// 启动AI的异步流监听
	ai.start().catch(err => {
		console.error('❌ AI启动失败:', err);
		battleEnded = true;
	});
	console.log('✓ AI已启动\n');

	const p2spec = {
		name: "AI 对手",
		team: Sim.Teams.pack(p2team),
	};

	// 显示你的队伍信息
	displayTeamInfo(p1team, playerName);

	let teamOrder = null;
	const teamSize = p1team.length;
	while (!teamOrder) {
		const choice = await prompt('\n请选择你的队伍首发(1-6的数字): ');
		if (choice) {
			// 检查是否是有效数字
			const digit = parseInt(choice);
			const hasInvalidDigit = digit < 1 || digit > teamSize || isNaN(digit);
			if (hasInvalidDigit) {
				console.log(`❌ 数字必须在 1-${teamSize} 之间`);
				continue;
			}

			// teamOrder让digits为第一个，剩下的数字在后面，例如 213456
			teamOrder = [digit, ...Array.from({
				length: teamSize
			}, (_, i) => i + 1).filter(n => n !== digit)].join('');
			console.log(`\n✓ 首发已确定为${digit}号宝可梦`);
		} else {
			console.log('❌ ');
		}
	}

	let waitingForChoice = false;
	let currentRequest = null;
	let battleEnded = false;
	let playerTeam = p1team; // 保存队伍信息供查看
	let currentTurn = 0; // 追踪当前回合数
	let battleInitialized = false; // 追踪战斗是否已初始化
	let pendingTeamPreviewRequest = null; // 暂存提前到达的team preview request

	// 追踪场地信息
	let battleField = {
		weather: null,
		terrain: null,
		p1Side: [], // 我方场地效果
		p2Side: [] // 对手场地效果
	};

	// 追踪对手当前宝可梦
	let opponentActive = {
		species: null,
		condition: null,
		status: null,
		boosts: {} // 追踪对手的能力变化
	};

	// 追踪玩家当前宝可梦的能力变化和状态
	let playerBoosts = {};
	let playerStatus = null;

	// 处理 p1 的消息
	(async () => {
		try {
			for await (const chunk of streams.p1) {
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (debug_mode) console.log("[Debug] " + line);

					// 检测战斗初始化完成标志
					if (line === '|start' || line === '|teampreview') {
						battleInitialized = true;
						// 如果有暂存的team preview request，现在处理它
						if (pendingTeamPreviewRequest) {
							streams.p1.write(`team ${teamOrder}`);
							if (debug_mode) console.log('[Debug] 已发送team命令，等待AI选择...');
							pendingTeamPreviewRequest = null;
						}
					}

					// 检测战斗结束
					if (line.startsWith('|win|')) {
						battleEnded = true;
						const winner = line.split('|win|')[1];
						console.log('\n战斗结束！');
						console.log(`胜者: ${winner}`);
					} else if (line === '|tie') {
						battleEnded = true;
						console.log('\n战斗结束！平局！');
					}

					// 显示战斗消息（过滤部分冗余信息）
					if (line.startsWith('|')) {
						// 格式化显示重要的战斗信息
						if (line.startsWith('|turn|')) {
							const turn = parseInt(line.split('|turn|')[1]);

							// 如果不是第一回合，等待用户按回车继续
							if (turn > 1) {
								await prompt('\n[按回车查看下一回合]');
							}

							currentTurn = turn;
							console.log('\n' + '='.repeat(50));
							console.log(`第 ${turn} 回合`);
							console.log('='.repeat(50));
						} else if (line.startsWith('|switch|')) {
							const parts = line.split('|');
							const playerTag = parts[2];
							const pokemon = parts[3];
							const hp = parts[4] || '';
							const isPlayer = playerTag.startsWith('p1');
							const player = isPlayer ? '【你】' : '【对手】';
							const pokemonName = pokemon.split(',')[0];
							const pokemonCN = translate(pokemonName, 'pokemon');
							console.log(`\n${player} 派出了 ${pokemonCN} ${hp ? '(HP: ' + hp + ')' : ''}`);

							// 更新宝可梦信息
							if (isPlayer) {
								// 玩家切换宝可梦，重置能力变化和状态
								playerBoosts = {};
								// 从HP字符串中提取状态
								if (hp && hp.includes(' ')) {
									const hpParts = hp.split(' ');
									if (hpParts.length > 1) {
										playerStatus = hpParts[1];
									} else {
										playerStatus = null;
									}
								} else {
									playerStatus = null;
								}
							} else {
								// 更新对手宝可梦信息
								opponentActive.species = pokemonName;
								opponentActive.condition = hp;
								opponentActive.status = null; // 重置状态
								opponentActive.boosts = {}; // 重置能力变化
							}
						} else if (line.startsWith('|move|')) {
							const parts = line.split('|');
							const attacker = parts[2];
							const move = parts[3];
							const target = parts[4];
							const isPlayer = attacker.startsWith('p1');
							const player = isPlayer ? '【你】' : '【对手】';
							const attackerName = attacker.split(': ')[1];
							const attackerCN = translate(attackerName, 'pokemon');
							// 通过 Dex 获取标准招式名称
							const moveData = Sim.Dex.moves.get(move);
							const moveName = moveData.name || move;
							const moveCN = translate(moveName, 'moves');
							console.log(`\n${player} ${attackerCN} 使用了 ${moveCN}`);
						} else if (line.startsWith('|-damage|')) {
							const parts = line.split('|');
							const target = parts[2];
							const hp = parts[3];
							const isPlayer = target.startsWith('p1');
							const player = isPlayer ? '【你】' : '【对手】';
							const targetName = target.split(': ')[1];
							const targetCN = translate(targetName, 'pokemon');
							console.log(`  → ${player} ${targetCN} 受到伤害! (HP: ${hp})`);

							// 更新对手宝可梦HP
							if (!isPlayer && opponentActive.species === targetName) {
								opponentActive.condition = hp;
							}
						} else if (line.startsWith('|-heal|')) {
							const parts = line.split('|');
							const target = parts[2];
							const hp = parts[3];
							const from = parts[4] ? parts[4].replace('[from] item: ', '').replace('[from] ', '') : '';
							const isPlayer = target.startsWith('p1');
							const player = isPlayer ? '【你】' : '【对手】';
							const targetName = target.split(': ')[1];
							const targetCN = translate(targetName, 'pokemon');
							let fromCN = '';
							if (from) {
								// 通过 Dex 获取标准道具名称
								const itemData = Sim.Dex.items.get(from);
								const itemName = itemData.name || from;
								fromCN = translate(itemName, 'items');
							}
							const fromText = fromCN ? ` (${fromCN})` : '';
							console.log(`  → ${player} ${targetCN} 恢复了HP!${fromText} (HP: ${hp})`);

							// 更新对手宝可梦HP
							if (!isPlayer && opponentActive.species === targetName) {
								opponentActive.condition = hp;
							}
						} else if (line.startsWith('|-status|')) {
							const parts = line.split('|');
							const target = parts[2];
							const status = parts[3];
							const isPlayer = target.startsWith('p1');
							const targetName = target.split(': ')[1];

							// 更新宝可梦状态
							if (isPlayer) {
								playerStatus = status;
							} else if (opponentActive.species === targetName) {
								opponentActive.status = status;
							}
						} else if (line.startsWith('|-curestatus|')) {
							const parts = line.split('|');
							const target = parts[2];
							const isPlayer = target.startsWith('p1');
							const targetName = target.split(': ')[1];

							// 清除宝可梦状态
							if (isPlayer) {
								playerStatus = null;
							} else if (opponentActive.species === targetName) {
								opponentActive.status = null;
							}
						} else if (line.startsWith('|faint|')) {
							const parts = line.split('|');
							const pokemon = parts[2];
							const isPlayer = pokemon.startsWith('p1');
							const player = isPlayer ? '【你】' : '【对手】';
							const pokemonName = pokemon.split(': ')[1];
							const pokemonCN = translate(pokemonName, 'pokemon');
							console.log(`  → ${player} ${pokemonCN} 倒下了!`);
						} else if (line.startsWith('|-supereffective')) {
							console.log('  → 效果拔群!');
						} else if (line.startsWith('|-resisted')) {
							console.log('  → 效果不理想...');
						} else if (line.startsWith('|-crit')) {
							console.log('  → 会心一击!');
						} else if (line.startsWith('|-immune')) {
							console.log('  → 没有效果!');
						} else if (line.startsWith('|-miss')) {
							console.log('  → 攻击没有命中!');
						} else if (line.startsWith('|-terastallize|')) {
							const parts = line.split('|');
							const pokemon = parts[2];
							const teraType = parts[3];
							const isPlayer = pokemon.startsWith('p1');
							const player = isPlayer ? '【你】' : '【对手】';
							const pokemonName = pokemon.split(': ')[1];
							const pokemonCN = translate(pokemonName, 'pokemon');
							console.log(`  → ${player} ${pokemonCN} 太晶化了! 属性变为: ${teraType}`);
						} else if (line.startsWith('|-boost|')) {
							const parts = line.split('|');
							const pokemon = parts[2];
							const stat = parts[3];
							const amount = parseInt(parts[4]);
							const isPlayer = pokemon.startsWith('p1');
							const player = isPlayer ? '【你】' : '【对手】';
							const pokemonName = pokemon.split(': ')[1];
							const pokemonCN = translate(pokemonName, 'pokemon');
							const statCN = translate(stat, 'boosts');
							console.log(`  → ${player} ${pokemonCN} 的${statCN}上升了 ${amount} 级!`);

							// 更新能力变化
							if (isPlayer) {
								// 更新玩家能力变化
								playerBoosts[stat] = (playerBoosts[stat] || 0) + amount;
							} else if (opponentActive.species === pokemonName) {
								// 更新对手能力变化
								opponentActive.boosts[stat] = (opponentActive.boosts[stat] || 0) + amount;
							}
						} else if (line.startsWith('|-unboost|')) {
							const parts = line.split('|');
							const pokemon = parts[2];
							const stat = parts[3];
							const amount = parseInt(parts[4]);
							const isPlayer = pokemon.startsWith('p1');
							const player = isPlayer ? '【你】' : '【对手】';
							const pokemonName = pokemon.split(': ')[1];
							const pokemonCN = translate(pokemonName, 'pokemon');
							const statCN = translate(stat, 'boosts');
							console.log(`  → ${player} ${pokemonCN} 的${statCN}下降了 ${amount} 级!`);

							// 更新能力变化
							if (isPlayer) {
								// 更新玩家能力变化
								playerBoosts[stat] = (playerBoosts[stat] || 0) - amount;
							} else if (opponentActive.species === pokemonName) {
								// 更新对手能力变化
								opponentActive.boosts[stat] = (opponentActive.boosts[stat] || 0) - amount;
							}
						} else if (line.startsWith('|-clearboost|') || line.startsWith('|-clearallboost|')) {
							const parts = line.split('|');
							const pokemon = parts[2];
							const isPlayer = pokemon.startsWith('p1');
							const pokemonName = pokemon.split(': ')[1];

							// 清除能力变化
							if (isPlayer) {
								// 清除玩家能力变化
								playerBoosts = {};
							} else if (opponentActive.species === pokemonName) {
								// 清除对手能力变化
								opponentActive.boosts = {};
							}
						} else if (line.startsWith('|-sidestart|')) {
							const parts = line.split('|');
							const side = parts[2];
							const effect = parts[3].replace('move: ', '');
							const isPlayer = side.startsWith('p1');
							const player = isPlayer ? '【你】' : '【对手】';
							// 通过 Dex 获取标准招式名称
							const effectData = Sim.Dex.moves.get(effect);
							const effectName = effectData.name || effect;
							const effectCN = translate(effectName, 'moves');
							console.log(`  → ${player} 的场地上散布了 ${effectCN}!`);
							// 更新场地信息
							if (isPlayer) {
								if (!battleField.p1Side.includes(effectName)) {
									battleField.p1Side.push(effectName);
								}
							} else {
								if (!battleField.p2Side.includes(effectName)) {
									battleField.p2Side.push(effectName);
								}
							}
						} else if (line.startsWith('|-sideend|')) {
							const parts = line.split('|');
							const side = parts[2];
							const effect = parts[3].replace('move: ', '');
							const isPlayer = side.startsWith('p1');
							const player = isPlayer ? '【你】' : '【对手】';
							const effectData = Sim.Dex.moves.get(effect);
							const effectName = effectData.name || effect;
							const effectCN = translate(effectName, 'moves');
							console.log(`  → ${player} 的 ${effectCN} 消失了!`);
							// 更新场地信息
							if (isPlayer) {
								battleField.p1Side = battleField.p1Side.filter(e => e !== effectName);
							} else {
								battleField.p2Side = battleField.p2Side.filter(e => e !== effectName);
							}
						} else if (line.startsWith('|-weather|')) {
							const parts = line.split('|');
							const weather = parts[2];
							if (weather && weather !== 'none') {
								const weatherCN = translate(weather, 'weathers');
								console.log(`  → 天气变为: ${weatherCN}`);
								battleField.weather = weather;
							} else {
								battleField.weather = null;
							}
						} else if (line.startsWith('|-fieldstart|')) {
							const parts = line.split('|');
							const field = parts[2].replace('move: ', '');
							// 判断是场地还是全场效果
							const terrainNames = ['Electric Terrain', 'Grassy Terrain', 'Misty Terrain', 'Psychic Terrain'];
							if (terrainNames.includes(field)) {
								const fieldCN = translate(field, 'terrains');
								console.log(`  → 场地变为: ${fieldCN}`);
								battleField.terrain = field;
							} else {
								const fieldCN = translate(field, 'moves');
								console.log(`  → ${fieldCN} 开始了!`);
							}
						} else if (line.startsWith('|-fieldend|')) {
							const parts = line.split('|');
							const field = parts[2].replace('move: ', '');
							const terrainNames = ['Electric Terrain', 'Grassy Terrain', 'Misty Terrain', 'Psychic Terrain'];
							if (terrainNames.includes(field)) {
								const fieldCN = translate(field, 'terrains');
								console.log(`  → ${fieldCN} 消失了!`);
								battleField.terrain = null;
							} else {
								const fieldCN = translate(field, 'moves');
								console.log(`  → ${fieldCN} 结束了!`);
							}
						}
					}

					// 处理选择请求
					if (line.includes('|request|')) {
						const requestData = line.split('|request|')[1];
						if (requestData) {
							try {
								currentRequest = JSON.parse(requestData);
								if (currentRequest.wait) {
									// 等待对手
									console.log('\n等待对手行动...');
								} else if (currentRequest.teamPreview) {
									// Team Preview阶段：自动发送之前选择的队伍顺序
									if (battleInitialized) {
										// 战斗已初始化，立即发送
										console.log(`\n正在应用队伍顺序: ${teamOrder}`);
										streams.p1.write(`team ${teamOrder}`);
										if (debug_mode) console.log('[Debug] 已发送team命令，等待AI选择...');
									} else {
										// 战斗还未初始化，暂存request等待
										if (debug_mode) console.log('[Debug] 收到提前的team preview request，等待战斗初始化...');
										pendingTeamPreviewRequest = currentRequest;
									}
								} else if (currentRequest.forceSwitch) {
									waitingForChoice = true;
									displaySwitchChoices(currentRequest);
								} else if (currentRequest.active) {
									waitingForChoice = true;
									displayChoices(currentRequest, battleField, opponentActive, playerBoosts, playerStatus);
								}
							} catch (e) {
								console.error('解析请求失败:', e.message);
							}
						}
					}

					// 处理错误
					if (line.startsWith('|error|')) {
						const errorMsg = line.replace('|error|', '');
						console.log('\n错误:', errorMsg);
						// 如果有无效选择错误，只提示错误，不重新显示对战信息
						if (errorMsg.includes('[Invalid choice]') && currentRequest) {
							waitingForChoice = true;
							console.log('请重新输入有效的指令');
						}
					}
				}
			}
		} catch (err) {
			console.error('玩家流错误:', err);
			battleEnded = true;
		}
	})();

	// 等待用户确认后启动战斗
	const continueGame = await prompt('\n按回车开始对战...');
	console.log('\n战斗开始！\n');

	// 启动战斗 - gen9ou格式自带Team Preview
	streams.omniscient.write(`>start ${JSON.stringify(spec)}\n>player p1 ${JSON.stringify(p1spec)}\n>player p2 ${JSON.stringify(p2spec)}`);

	// 等待玩家输入
	while (!battleEnded) {
		await new Promise(resolve => setTimeout(resolve, 100));

		if (waitingForChoice) {
			waitingForChoice = false;
			try {
				const choice = await getPlayerChoice();
				if (choice) {
					// 检查是否是特殊命令
					if (choice.toLowerCase() === 'team') {
						// 显示当前队伍状态
						displayBattleTeamStatus(currentRequest, playerStatus);
						waitingForChoice = true; // 重新等待输入
					} else {
						// 直接写入选择，不需要 >p1 前缀
						streams.p1.write(choice);
					}
				}
			} catch (err) {
				console.error('输入错误:', err);
				waitingForChoice = true; // 重新等待输入
			}
		}
	}

	console.log('\n感谢游玩！');
	rl.close();
	setTimeout(() => process.exit(0), 500);
}

// 显示可用的选择
function displayChoices(request, battleField, opponentActive, playerBoosts, playerStatus) {
	if (request.active && request.active[0]) {
		const active = request.active[0];
		const pokemon = request.side.pokemon;

		// 显示场地信息
		if (battleField.weather || battleField.terrain || battleField.p1Side.length > 0 || battleField.p2Side.length > 0) {
			console.log('\n' + '='.repeat(50));
			console.log('场地状态:');

			if (battleField.weather) {
				const weatherCN = translate(battleField.weather, 'weathers');
				console.log(`   天气: ${weatherCN}`);
			}

			if (battleField.terrain) {
				const terrainCN = translate(battleField.terrain, 'terrains');
				console.log(`   场地: ${terrainCN}`);
			}

			if (battleField.p1Side.length > 0) {
				const effects = battleField.p1Side.map(e => translate(e, 'moves')).join(', ');
				console.log(`   我方场地: ${effects}`);
			}

			if (battleField.p2Side.length > 0) {
				const effects = battleField.p2Side.map(e => translate(e, 'moves')).join(', ');
				console.log(`   对手场地: ${effects}`);
			}
			console.log('='.repeat(50));
		}

		// 显示对手宝可梦状态
		if (opponentActive.species) {
			const oppSpeciesData = Sim.Dex.species.get(opponentActive.species);
			const oppSpeciesCN = translate(opponentActive.species, 'pokemon');
			speciesLog = `对手出战: ${oppSpeciesCN}`
			// 显示属性
			if (oppSpeciesData.types) {
				const types = oppSpeciesData.types.join('/');
				speciesLog += ` 属性:${types}`;
			}

			speciesLog += ` HP(%):${opponentActive.condition || '未知'}`;

			console.log(speciesLog);

			if (opponentActive.status) {
				const statusCN = translate(opponentActive.status, 'status');
				console.log(`   状态: ${statusCN}`);
			}

			// 显示对手能力等级变化
			if (opponentActive.boosts) {
				const boosts = [];
				for (const stat in opponentActive.boosts) {
					const boost = opponentActive.boosts[stat];
					// 只有非零的能力变化才显示
					if (typeof boost === 'number' && boost !== 0) {
						const statCN = translate(stat, 'boosts');
						const sign = boost > 0 ? '+' : '';
						boosts.push(`${statCN}${sign}${boost}`);
					}
				}
				if (boosts.length > 0) {
					console.log(`   能力变化: ${boosts.join(' ')}`);
				}
			}
		}

		// 显示当前宝可梦
		const currentPokemon = pokemon[0];
		const speciesName = currentPokemon.ident.split(': ')[1];
		const speciesData = Sim.Dex.species.get(speciesName);
		const speciesCN = translate(speciesName, 'pokemon');
		speciesLog = `当前出战: ${speciesCN}`

		// 显示属性
		if (speciesData.types) {
			const types = speciesData.types.join('/');
			speciesLog += ` 属性:${types}`;
		}
		speciesLog += ` HP:${currentPokemon.condition}`;
		console.log(speciesLog);

		// 显示携带物品（如果已知）
		if (currentPokemon.item) {
			// 先通过 Dex 获取标准名称，再翻译
			const itemData = Sim.Dex.items.get(currentPokemon.item);
			const itemName = itemData.name || currentPokemon.item;
			const itemCN = translate(itemName, 'items');
			console.log(`   携带物品: ${itemCN}`);
		}

		// 显示特性（如果已知）
		if (currentPokemon.ability || currentPokemon.baseAbility) {
			const ability = currentPokemon.ability || currentPokemon.baseAbility;
			// 先通过 Dex 获取标准名称，再翻译
			const abilityData = Sim.Dex.abilities.get(ability);
			const abilityName = abilityData.name || ability;
			const abilityCN = translate(abilityName, 'abilities');
			abilityInfo = `   特性: ${abilityCN}`;
			if (abilityData.shortDesc || abilityData.desc) {
				console.log(abilityInfo + ` 描述：${abilityData.shortDesc || abilityData.desc}`);
			}
		}

		// 显示状态异常
		if (playerStatus) {
			const statusCN = translate(playerStatus, 'status');
			console.log(`   状态: ${statusCN}`);
		}

		// 显示能力等级变化
		if (playerBoosts && Object.keys(playerBoosts).length > 0) {
			const boosts = [];
			for (const stat in playerBoosts) {
				const boost = playerBoosts[stat];
				// 只有非零的能力变化才显示
				if (typeof boost === 'number' && boost !== 0) {
					const statCN = translate(stat, 'boosts');
					const sign = boost > 0 ? '+' : '';
					boosts.push(`${statCN}${sign}${boost}`);
				}
			}
			if (boosts.length > 0) {
				console.log(`   能力变化: ${boosts.join(' ')}`);
			}
		}

		// 显示太晶化信息
		if (active.canTerastallize) {
			const teraTypeCN = currentPokemon.teraType ? translate(currentPokemon.teraType, 'types') : '未知';
			console.log(`   太晶属性: ${teraTypeCN}（可以太晶化！）`);
		}

		// 显示可用招式
		console.log('可用招式:');
		active.moves.forEach((move, index) => {
			const moveData = Sim.Dex.moves.get(move.move);
			const moveName = moveData.name || move.move;
			const moveCN = translate(moveName, 'moves');

			if (!move.disabled) {
				const ppInfo = move.pp !== undefined ? ` (PP: ${move.pp}/${move.maxpp})` : '';
				let moveInfo = `   ${index + 1}.${moveCN}`;

				// 添加属性
				if (moveData.type) {
					const typeCN = translate(moveData.type, 'types');
					moveInfo += ` [${typeCN}]`;
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
}

// 显示换人选择
function displaySwitchChoices(request) {
	console.log('\n' + '='.repeat(50));
	console.log('请选择下一个出战的宝可梦：');
	console.log('='.repeat(50));

	const pokemon = request.side.pokemon;

	console.log('\n可用的宝可梦:');
	pokemon.forEach((poke, index) => {
		if (!poke.condition.endsWith(' fnt') && !poke.active) {
			const speciesName = poke.ident.split(': ')[1];
			console.log(`   ${index + 1}. ${translate(speciesName, 'pokemon')} (HP: ${poke.condition})`);
		}
	});

	console.log('\n输入格式: switch 2');
}

// 获取玩家选择
async function getPlayerChoice() {
	const choice = await prompt('Your choice: ');
	return choice || 'move 1'; // 默认使用第一个招式
}

// 显示队伍信息
function displayTeamInfo(team, trainerName) {
	console.log('='.repeat(60));
	console.log(`${trainerName} 的队伍`);
	console.log('='.repeat(60));

	team.forEach((pokemon, index) => {
		const speciesCN = translate(pokemon.species, 'pokemon');
		const gender = pokemon.gender ? ` (${pokemon.gender})` : '';
		// 如果 name 不同于 species，翻译 name（可能包含括号格式）
		const nameStr = pokemon.name && pokemon.name !== pokemon.species ? ` (${translate(pokemon.name, 'pokemon')})` : '';
		logInfo = `\n[${index + 1}] ${speciesCN}${nameStr}${gender}`;

		// 获取宝可梦数据
		const speciesData = Sim.Dex.species.get(pokemon.species);

		// 显示属性
		if (speciesData.types) {
			const typesCN = speciesData.types.map(t => translate(t, 'types')).join('/');
			logInfo += ` 属性:${typesCN}`;
		}

		// 太晶属性（如果是第9代）
		if (pokemon.teraType) {
			const teraTypeCN = translate(pokemon.teraType, 'types');
			logInfo += ` 太晶属性: ${teraTypeCN}`;
		}
		// 性格（优先显示）
		if (pokemon.nature) {
			const natureCN = translate(pokemon.nature, 'natures');
			logInfo += ` 性格: ${natureCN}`;
		}
		console.log(logInfo)



		// 特性
		if (pokemon.ability) {
			const abilityCN = translate(pokemon.ability, 'abilities');
			const abilityData = Sim.Dex.abilities.get(pokemon.ability);
			logInfo = `    特性: ${abilityCN}`;
			if (abilityData.desc || abilityData.shortDesc) {
				logInfo += ` 描述: ${abilityData.shortDesc || abilityData.desc}`;
			}
			console.log(logInfo);
		}

		// 携带物品
		if (pokemon.item) {
			const itemCN = translate(pokemon.item, 'items');
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
				const moveCN = translate(moveName, 'moves');
				let moveInfo = `       ${i + 1}.${moveCN}`;

				// 添加属性
				if (moveData.type) {
					const typeCN = translate(moveData.type, 'types');
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

		// 个体值（如果不是全31）
		if (pokemon.ivs) {
			const hasNonMaxIV = Object.values(pokemon.ivs).some(iv => iv !== 31);
			if (hasNonMaxIV) {
				const ivStr = `HP:${pokemon.ivs.hp || 31} Atk:${pokemon.ivs.atk || 31} Def:${pokemon.ivs.def || 31} SpA:${pokemon.ivs.spa || 31} SpD:${pokemon.ivs.spd || 31} Spe:${pokemon.ivs.spe || 31}`;
			}
		}
	});

	console.log('\n' + '='.repeat(60));
}

// 显示战斗中的队伍状态
function displayBattleTeamStatus(request, playerStatus) {
	if (!request || !request.side || !request.side.pokemon) {
		console.log('无法获取队伍信息');
		return;
	}

	console.log('\nYour team: ');

	const pokemon = request.side.pokemon;

	pokemon.forEach((poke, index) => {
		const speciesName = poke.ident.split(': ')[1];
		const speciesData = Sim.Dex.species.get(speciesName);
		const speciesCN = translate(speciesName, 'pokemon');
		const isActive = poke.active ? ' [出战中]' : '';
		const isFainted = poke.condition.endsWith(' fnt') ? ' [已昏厥]' : '';

		logInfo = `【${index + 1}】${speciesCN}${isActive}${isFainted}`;
		logInfo += ` HP:${poke.condition}`;

		// 显示状态异常
		const displayStatus = poke.active ? playerStatus : poke.status;
		if (displayStatus) {
			const statusCN = translate(displayStatus, 'status');
			logInfo += ` 状态:${statusCN}`;
		}
		console.log(logInfo);
	});
}

// 提示输入的辅助函数
function prompt(question) {
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			resolve(answer.trim());
		});
	});
}

function translate(text, category = 'pokemon') {
	if (!text) return text;
	return translator.translate(String(text), category);
}

// 运行 PVE 对战
startPVEBattle().catch(err => {
	console.error('发生错误:', err);
	rl.close();
	process.exit(1);
});