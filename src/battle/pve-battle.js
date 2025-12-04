/**
 * PVE 对战脚本 - 玩家 vs AI
 * 使用 Pokemon Showdown 模拟器
 * 
 * 运行方式：npm start 或 node src/battle/pve-battle.js
 */

require('dotenv').config();
const Sim = require('pokemon-showdown');
const { AIPlayerFactory } = require('../../dist/ai/ai-player-factory');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { Translator } = require('../../dist/support/translator');

// 单打相关
const { BattleState } = require('../battle_common/battle-state');
const { BattleMessageHandler } = require('../battle_common/message-handler');
const {
	displayTeamInfo,
	displayChoices,
	displaySwitchChoices,
	displayBattleTeamStatus
} = require('../battle_common/ui-display');

// 双打相关（VGC）
const { BattleStateVGC } = require('../battle_common_vgc/battle-state-vgc');
const { MessageHandlerVGC } = require('../battle_common_vgc/message-handler-vgc');
const {
	displayChoicesVGC,
	displaySwitchChoicesVGC
} = require('../battle_common_vgc/ui-display-vgc');

// debug设置
let debug_mode = false;

// 翻译器
const translator = Translator.getInstance('cn');

// 创建命令行输入接口
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

/**
 * 提示输入的辅助函数
 */
function prompt(question) {
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			resolve(answer.trim());
		});
	});
}

/**
 * 从文件加载队伍
 * @param {string} format - 对战格式 (例如: gen9ou)
 * @param {string|null} teamFile - 指定的队伍文件 (例如: gen9ou/gen9ou1.txt)，null 表示随机选择
 * @returns {{ team: Array, fileName: string } | null}
 */
function loadTeamFromFile(format, teamFile = null) {
	const teamsDir = path.join(__dirname, '../../teams', format);

	if (!fs.existsSync(teamsDir)) {
		return null;
	}

	const teamFiles = fs.readdirSync(teamsDir).filter(f => f.endsWith('.txt'));
	if (teamFiles.length === 0) {
		return null;
	}

	let selectedFile;

	// 如果指定了队伍文件，尝试加载
	if (teamFile) {
		// 从 teamFile 中提取文件名（支持 gen9ou/gen9ou1.txt 格式）
		const fileName = teamFile.includes('/') ? teamFile.split('/').pop() : teamFile;
		const filePath = path.join(teamsDir, fileName);

		if (fs.existsSync(filePath)) {
			selectedFile = fileName;
		} else {
			console.log(`⚠️  指定的队伍文件 ${teamFile} 不存在，将随机选择`);
			selectedFile = teamFiles[Math.floor(Math.random() * teamFiles.length)];
		}
	} else {
		// 随机选择一个队伍文件
		selectedFile = teamFiles[Math.floor(Math.random() * teamFiles.length)];
	}

	const teamText = fs.readFileSync(path.join(teamsDir, selectedFile), 'utf-8');

	// 使用 Pokemon Showdown 解析队伍
	const team = Sim.Teams.import(teamText);
	return {
		team,
		fileName: selectedFile
	};
}

/**
 * 生成符合规则的队伍
 * @param {string} format - 对战格式
 * @param {string|null} teamFile - 指定的队伍文件，null 表示随机选择
 * @returns {{ team: Array, fileName: string | null }}
 */
function generateValidTeam(format, teamFile = null) {
	// 对于非随机对战格式，尝试从文件加载队伍
	if (!format.includes('random')) {
		const result = loadTeamFromFile(format, teamFile);
		if (result && result.team && result.team.length > 0) {
			return {
				team: result.team,
				fileName: result.fileName
			};
		}
		console.log(`⚠️  未找到 ${format} 的预设队伍，使用随机生成`);
	}

	// 根据格式判断是单打还是双打，使用对应的随机生成
	const isDoubles = format.includes('double') || format.includes('vgc');
	const randomFormat = isDoubles ? 'gen9randomdoublesbattle' : 'gen9randombattle';
	let team = Sim.Teams.generate(randomFormat);
	return {
		team: team,
		fileName: null
	};
}

/**
 * 选择对手
 */
async function selectOpponent() {
	console.log("\n请选择对手：\n    1. LLM AI (可配置硅基流动/DeepSeek/OpenRouter等API)\n    2. 本地大师AI\n    3. 本地智能AI\n    4. 随机行为AI");
	const opponentChoice = await prompt('请输入对手编号:');

	let opponent = '本地智能AI';
	let aiType = 'smart_ai';

	if (opponentChoice === '1') {
		opponent = 'LLM AI';
		aiType = 'llm_ai';
	} else if (opponentChoice === '2') {
		opponent = 'Master AI';
		aiType = 'master_ai';
	} else if (opponentChoice === '3') {
		opponent = '本地智能AI';
		aiType = 'smart_ai';
	} else if (opponentChoice === '4') {
		opponent = '随机AI';
		aiType = 'random_ai';
	} else {
		console.log("> 未知对手，将使用本地智能AI");
	}

	return {
		opponent,
		aiType
	};
}

/**
 * 选择首发宝可梦
 * @param {Array} team - 队伍
 * @param {boolean} isDoubles - 是否为双打格式
 * @param {boolean} isVGC - 是否为VGC格式（4选4）
 */
async function selectLeadPokemon(team, isDoubles = false, isVGC = false) {
	const teamSize = team.length;
	let teamOrder = null;

	if (isDoubles) {
		if (isVGC) {
			// VGC双打模式：从6只中选择4只参战，前两只是首发
			console.log('\nVGC双打模式：请从6只宝可梦中选择4只参战');
			console.log('例如输入 "1234" 表示选择1、2、3、4号，其中前两个是首发');

			while (!teamOrder) {
				const choice = await prompt(`\n请输入四个数字: `);
				if (!choice) {
					console.log('❌ 输入不能为空');
					continue;
				}

				// 支持空格分隔或连续输入
				const input = choice.trim().replace(/\s+/g, '');
				const digits = input.split('').map(n => parseInt(n));

				// 验证输入
				if (digits.length !== 4) {
					console.log('❌ 请输入四个数字');
					continue;
				}

				const hasInvalidDigit = digits.some(d => d < 1 || d > teamSize || isNaN(d));
				if (hasInvalidDigit) {
					console.log(`❌ 数字必须在 1-${teamSize} 之间`);
					continue;
				}

				// 检查是否有重复
				const uniqueDigits = new Set(digits);
				if (uniqueDigits.size !== 4) {
					console.log('❌ 四个数字不能重复');
					continue;
				}

				// 生成队伍顺序：选中的4只
				teamOrder = digits.join('');

				console.log(`✓ 首发: ${digits[0]}号和 ${digits[1]}号宝可梦，参战队伍顺序: ${teamOrder}`);
			}
		} else {
			// 其他双打模式：6v6，只选择前两只首发
			console.log('\n双打模式：请选择前两只首发宝可梦');
			console.log('例如输入 "12" 表示1号和2号宝可梦首发');

			while (!teamOrder) {
				const choice = await prompt(`\n请输入两个数字: `);
				if (!choice) {
					console.log('❌ 输入不能为空');
					continue;
				}

				// 支持空格分隔或连续输入
				const input = choice.trim().replace(/\s+/g, '');
				const digits = input.split('').map(n => parseInt(n));

				// 验证输入
				if (digits.length !== 2) {
					console.log('❌ 请输入两个数字');
					continue;
				}

				const hasInvalidDigit = digits.some(d => d < 1 || d > teamSize || isNaN(d));
				if (hasInvalidDigit) {
					console.log(`❌ 数字必须在 1-${teamSize} 之间`);
					continue;
				}

				// 检查是否有重复
				const uniqueDigits = new Set(digits);
				if (uniqueDigits.size !== 2) {
					console.log('❌ 两个数字不能重复');
					continue;
				}

				// 生成队伍顺序：所有6只，指定的前两只首发
				teamOrder = digits.join('') + [...Array(teamSize).keys()]
					.map(i => i + 1)
					.filter(n => !digits.includes(n))
					.join('');

				console.log(`✓ 首发: ${digits[0]}号和 ${digits[1]}号宝可梦`);
			}
		}
	} else {
		// 单打模式：选择一个首发宝可梦
		while (!teamOrder) {
			const choice = await prompt('\n请选择你的队伍首发(选择一个1-6的数字): ');
			if (choice) {
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
				console.log('❌ 输入不能为空');
			}
		}
	}

	return teamOrder;
}

/**
 * 转换简化指令为完整格式（单打）
 * @param {string} input - 用户输入
 * @returns {string} - 转换后的指令，如果是无效输入则返回原输入
 */
function normalizeChoice(input) {
	// 特殊命令直接返回
	if (input.toLowerCase() === 'team') {
		return 'team';
	}

	// 匹配简写格式（m1, m1 t, m1 tera）
	const shortMatch = input.match(/^([ms])(\d+)(?:\s+(t|tera|terastallize))?$/i);
	if (shortMatch) {
		const action = shortMatch[1].toLowerCase();
		const index = shortMatch[2];
		const terastallize = shortMatch[3];

		if (action === 'm') {
			return terastallize ? `move ${index} terastallize` : `move ${index}`;
		} else if (action === 's') {
			return `switch ${index}`;
		}
	}

	// 已经是完整格式或其他格式，直接返回
	return input;
}

/**
 * 转换双打指令为完整格式
 *
 * Pokemon Showdown 双打目标位置布局（从你的视角看）：
 *
 *   对手：  +2  +1
 *   己方：  -1  -2
 *
 * 双打格式示例：
 * - "move 1 +1,move 2 +2" 或 "m1 +1,m2 +2"：己方位置-1使用招式1攻击对手位置+1，己方位置-2使用招式2攻击对手位置+2
 * - "move 1 -2,switch 3" 或 "m1 -2,s3"：己方位置-1使用招式1攻击己方位置-2，己方位置-2切换到3号宝可梦
 * - "move 1 +1 tera,move 2 +2" 或 "m1 +1 t,m2 +2"：己方位置-1太晶化攻击对手位置+1，己方位置-2攻击对手位置+2
 *
 * 目标位置说明：
 * - +1 或 +2：对手的位置（+1=对手右侧，+2=对手左侧）
 * - -1 或 -2：己方的位置（-1=己方左侧，-2=己方右侧）
 * - 1 或 2：兼容简写，自动转换为 +1 或 +2（对手位置）
 * - 可以省略目标（对于自身增益、全场效果等不需要目标的招式）
 *
 * @param {string} input - 用户输入
 * @returns {string} - 转换后的指令
 */
function normalizeDoublesChoice(input) {
	// 特殊命令直接返回
	if (input.toLowerCase() === 'team') {
		return 'team';
	}

	// 按逗号分割两个位置的指令
	const parts = input.split(',').map(p => p.trim());

	if (parts.length !== 2) {
		// 如果不是两个部分，直接返回原输入（会在后续验证中报错）
		return input;
	}

	// 分别处理每个位置的指令
	const normalizedParts = parts.map((part, slotIndex) => {
		// 匹配简写格式（支持目标选择）
		// 格式: m1 +1 t 或 m1 -2 或 m1 1 或 m1 或 s3
		const shortMatch = part.match(/^([ms])(\d+)(?:\s+([+-]?\d+))?(?:\s+(t|tera|terastallize))?$/i);
		if (shortMatch) {
			const action = shortMatch[1].toLowerCase();
			const index = shortMatch[2];
			let target = shortMatch[3]; // 目标位置（可选）
			const terastallize = shortMatch[4];

			if (action === 'm') {
				let moveCmd = `move ${index}`;
				if (target) {
					// 如果目标没有 +/- 前缀，自动添加 +（对手位置）
					if (!target.startsWith('+') && !target.startsWith('-')) {
						target = '+' + target;
					}
					moveCmd += ` ${target}`;
				}
				if (terastallize) {
					moveCmd += ' terastallize';
				}
				return moveCmd;
			} else if (action === 's') {
				return `switch ${index}`;
			}
		}

		// 已经是完整格式，直接返回
		return part;
	});

	// 用逗号连接两个位置的指令
	return normalizedParts.join(',');
}

/**
 * 获取玩家选择
 * @param {boolean} isDoubles - 是否为双打格式
 */
async function getPlayerChoice(isDoubles = false) {
	let choice = await prompt('你的选择: ');
	while (!choice) {
		console.log('❌ 输入不能为空');
		choice = await prompt('你的选择: ');
	}
	// 根据格式转换简化指令
	return isDoubles ? normalizeDoublesChoice(choice) : normalizeChoice(choice);
}

/**
 * 创建玩家选择处理器
 * @param {boolean} isDoubles - 是否为双打格式
 */
function createPlayerChoiceHandler(battleState, streams, ai, isDoubles = false) {
	return async function handlePlayerChoice(isForceSwitch = false) {
		if (battleState.isProcessingChoice || battleState.battleEnded) return;
		battleState.startProcessingChoice();

		try {
			const choice = await getPlayerChoice(isDoubles);
			if (choice) {
				// 检查是否是特殊命令
				if (choice.toLowerCase() === 'team') {
					// 显示当前队伍状态
					const request = battleState.currentRequest || battleState.lastRequest;
					displayBattleTeamStatus(battleState, request, translator);
					// 递归调用，重新等待输入（保持 isForceSwitch 状态）
					battleState.endProcessingChoice();
					await handlePlayerChoice(isForceSwitch);
				} else {
					// 通知 AI 玩家的选择（用于作弊功能）
					// 注意：只在正常回合（非强制切换）时通知 AI，因为强制切换是被动的
					// 但是必须先通知 AI，否则 AI 可能在 waitForPlayerChoice() 处死锁
					if (!isForceSwitch && ai && typeof ai.setPlayerChoice === 'function') {
						ai.setPlayerChoice(choice);
					}
					// 直接写入选择，不需要 >p1 前缀
					streams.p1.write(choice);
					battleState.endProcessingChoice();
				}
			} else {
				battleState.endProcessingChoice();
			}
		} catch (err) {
			console.error('输入错误:', err);
			battleState.endProcessingChoice();
			// 出错后重新等待输入（保持 isForceSwitch 状态）
			await handlePlayerChoice(isForceSwitch);
		}
	};
}

/**
 * 启动消息处理循环
 * @param {boolean} isDoubles - 是否为双打格式
 */
async function startMessageLoop(battleState, streams, handlePlayerChoice, teamOrder, ai, isDoubles = false) {
	const messageHandler = isDoubles
		? new MessageHandlerVGC(battleState, translator, debug_mode)
		: new BattleMessageHandler(battleState, translator, debug_mode);

	try {
		for await (const chunk of streams.p1) {
			const lines = chunk.split('\n');

			for (const line of lines) {
				// 处理战斗消息
				if (line.startsWith('|')) {
					// 特殊处理回合消息（需要等待用户按回车）
					if (line.startsWith('|turn|')) {
						const turn = parseInt(line.split('|turn|')[1]);
						await prompt('\n[按回车进行下一回合]');
						battleState.startTurn(turn);

						// 单打模式显示回合标题（双打在 displayChoicesVGC 中显示）
						if (!isDoubles) {
							console.log('\n' + '='.repeat(50));
							console.log(`第 ${turn} 回合`);
							console.log('='.repeat(50));
						}

						// 在 turn 消息后处理待处理的请求
						// 这时当前 chunk 中的所有消息都已显示
						if (battleState.currentRequest && !battleState.isProcessingChoice) {
							if (battleState.currentRequest.forceSwitch) {
								if (isDoubles) {
									displaySwitchChoicesVGC(battleState.currentRequest, translator);
								} else {
									displaySwitchChoices(battleState.currentRequest, translator);
								}
								handlePlayerChoice(true); // 强制切换，传递 true
								battleState.clearCurrentRequest();
							} else if (battleState.currentRequest.active) {
								if (isDoubles) {
									displayChoicesVGC(battleState, battleState.currentRequest, translator, debug_mode);
								} else {
									displayChoices(battleState, battleState.currentRequest, translator, debug_mode);
								}
								handlePlayerChoice(false); // 正常回合，传递 false
								battleState.saveLastRequest();
								battleState.clearCurrentRequest();
							}
						}
					} else {
						// 使用消息处理器处理其他消息
						messageHandler.handleMessage(line);
					}
				}

				// 处理选择请求
				if (line.includes('|request|')) {
					const requestData = line.split('|request|')[1];
					if (requestData) {
						try {
							const request = JSON.parse(requestData);
							battleState.setCurrentRequest(request);

							if (request.wait) {
								// 等待对手
								console.log('\n等待对手行动...');
							} else if (request.teamPreview) {
								// 队伍预览请求立即处理
								// 对于非随机对战，使用玩家选择的队伍顺序
								// 对于随机对战，使用默认顺序（1,2,3,4,5,6）
								const finalTeamOrder = teamOrder || '123456';

								// 通知 AI 玩家的队伍顺序（用于作弊功能）
								if (ai && typeof ai.setPlayerTeamOrder === 'function') {
									ai.setPlayerTeamOrder(finalTeamOrder);
								}
								streams.p1.write(`team ${finalTeamOrder}`);
								if (debug_mode) console.log(`[Debug] 正在应用队伍顺序: ${finalTeamOrder}`);
								battleState.clearCurrentRequest();
							} else if (request.forceSwitch && !battleState.isProcessingChoice) {
								// 强制切换请求：保存请求，等待 |turn| 消息后处理
								// 如果没有 |turn| 消息（比如刚上场就倒下），使用延迟处理
								process.nextTick(async () => {
									if (battleState.currentRequest && battleState.currentRequest.forceSwitch && !battleState.isProcessingChoice) {
										if (isDoubles) {
											displaySwitchChoicesVGC(battleState.currentRequest, translator);
										} else {
											displaySwitchChoices(battleState.currentRequest, translator);
										}
										handlePlayerChoice(true); // 强制切换，传递 true
										battleState.clearCurrentRequest();
									}
								});
							} else if (request.active && !battleState.isProcessingChoice) {
								// 普通招式请求：保存请求，等待 |turn| 消息后处理
								// 不需要延迟，因为 |turn| 消息一定会到达
							}
						} catch (e) {
							console.error('解析请求失败:', e.message);
						}
					}
				}

				// 处理错误
				if (line.startsWith('|error|')) {
					const errorMsg = line.replace('|error|', '');
					console.log('错误:', errorMsg);
					battleState.setCurrentRequest(battleState.lastRequest);
					// 如果有无效选择错误，只提示错误，不重新显示对战信息
					if (errorMsg.includes('[Invalid choice]') && battleState.currentRequest) {
						console.log('请重新输入有效的指令');
						// 直接触发玩家选择处理（传递正确的 forceSwitch 状态）
						const isForceSwitch = battleState.currentRequest.forceSwitch || false;
						handlePlayerChoice(isForceSwitch);
					}
				}
			}
		}
	} catch (err) {
		console.error('玩家流错误:', err);
		battleState.endBattle();
	}
}

/**
 * 主战斗逻辑
 */
async function startPVEBattle() {
	console.log('=== Pokemon Showdown PVE 对战 ===\n');

	// 显示操作说明
	console.log('输入格式:');
	console.log('    使用招式: move 1 或 m1');
	console.log('    切换宝可梦: switch 2 或 s2');
	console.log('    太晶化攻击: move 1 tera 或 m1 t');
	console.log('    查看队伍: team (查看宝可梦状态)');
	console.log('    双打: m1 1 t,s3 （己方-1使用招式1太晶化攻击对手+1位置，己方-2切换到3号宝可梦）');

	// 选择对手
	const {
		opponent,
		aiType
	} = await selectOpponent();

	// 生成队伍
	const format = process.env.LOCAL_BATTLE_FORMAT || 'gen9ou';
	const playerName = 'Player';
	console.log(`\n✓ 对战格式: ${format}`);

	// 获取队伍配置
	const playerTeamFile = process.env.PLAYER_TEAM || null;
	const aiTeamFile = process.env.AI_TEAM || null;

	const p1result = generateValidTeam(format, playerTeamFile);
	const p2result = generateValidTeam(format, aiTeamFile);
	const p1team = p1result.team;
	const p2team = p2result.team;

	// 显示队伍文件名
	if (p1result.fileName) {
		console.log(`✓ 玩家队伍: ${p1result.fileName}`);
	}
	if (p2result.fileName) {
		console.log(`✓ AI队伍: ${p2result.fileName}`);
	}
	console.log('');

	// 创建战斗流
	const streams = Sim.getPlayerStreams(new Sim.BattleStream());

	// 创建 AI 对手
	// 创建AI时传递战斗格式，用于判断单打/双打
	const ai = AIPlayerFactory.createAI(aiType, streams.p2, debug_mode, p2team, p1team, format);

	// 获取实际的 AI 名字（如果降级会显示降级后的名字）
	let actualOpponentName = opponent;
	let warningMessage = '';

	// LLM AI 特殊处理：显示实际使用的 Provider
	if (aiType === 'llm_ai') {
		const llmProvider = (process.env.LLM_PROVIDER || 'siliconflow').toLowerCase();

		if (llmProvider === 'siliconflow' && process.env.SILICONFLOW_API_KEY) {
			const model = process.env.SILICONFLOW_MODEL || 'DeepSeek-V3.2-Exp';
			actualOpponentName = `LLM AI (硅基流动/${model.split('/').pop()})`;
		} else if (llmProvider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
			const model = process.env.OPENROUTER_MODEL || 'claude-3.5-sonnet';
			actualOpponentName = `LLM AI (OpenRouter/${model.split('/').pop()})`;
		} else if (llmProvider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
			actualOpponentName = 'LLM AI (DeepSeek)';
		} else {
			actualOpponentName = '本地智能AI (LLM降级)';
			warningMessage = '⚠️  未检测到有效的 LLM 配置，已降级到本地智能AI';
		}
	}

	// PokéChamp 特殊处理：检查 LLM 后端和 API 密钥
	if (aiType === 'pokechamp_ai') {
		const llmBackend = pokechampBackend;
		const requiresDeepSeekDirect = llmBackend === 'deepseek';
		const requiresOpenAI = llmBackend.startsWith('gpt');
		const requiresGemini = llmBackend.startsWith('gemini');
		const requiresOpenRouter = (llmBackend.startsWith('deepseek') && llmBackend !== 'deepseek') ||
			llmBackend.startsWith('openai/') ||
			llmBackend.startsWith('anthropic/') ||
			llmBackend.startsWith('meta/') ||
			llmBackend.startsWith('mistral/') ||
			llmBackend.startsWith('cohere/');

		let missingKey = null;
		if (requiresDeepSeekDirect && !process.env.DEEPSEEK_API_KEY) {
			missingKey = 'DEEPSEEK_API_KEY';
		} else if (requiresOpenAI && !process.env.OPENAI_API_KEY) {
			missingKey = 'OPENAI_API_KEY';
		} else if (requiresGemini && !process.env.GEMINI_API_KEY) {
			missingKey = 'GEMINI_API_KEY';
		} else if (requiresOpenRouter && !process.env.OPENROUTER_API_KEY) {
			missingKey = 'OPENROUTER_API_KEY';
		}

		if (missingKey) {
			actualOpponentName = 'Master AI (PokéChamp降级)';
			warningMessage = `⚠️  ${llmBackend} 需要 ${missingKey}，已降级到 Master AI`;
		}
	}

	console.log(`✓ 已创建对手: ${actualOpponentName}`);
	if (debug_mode && warningMessage) {
		console.log(warningMessage);
	}

	// 启动AI
	ai.start().catch(err => {
		console.error('❌ AI启动失败:', err);
	});
	console.log('✓ AI已启动');

	// 显示队伍信息
	await prompt('\n按回车开始生成队伍...');
	displayTeamInfo(p1team, playerName, translator);

	let p2teaminfo = "对手的宝可梦：";
	p2team.forEach((pokemon) => {
		const speciesCN = translator.translate(pokemon.species, 'pokemon');
		p2teaminfo += `${speciesCN} `;
	});
	console.log(p2teaminfo);

	// 检查是否为双打格式和VGC格式
	const isDoubles = format.includes('double') || format.includes('vgc');
	const isVGC = format.includes('vgc');

	// 选择首发宝可梦（仅非随机对战需要）
	let teamOrder = null;
	if (!format.includes('random')) {
		teamOrder = await selectLeadPokemon(p1team, isDoubles, isVGC);
	} else {
		console.log('\n✓ 随机对战模式，系统将自动选择首发宝可梦');
	}

	// 创建战斗状态（根据格式选择不同的实现）
	const battleState = isDoubles
		? new BattleStateVGC(p1team, p2team, format)
		: new BattleState(p1team, p2team);

	// 创建玩家选择处理器（传递 isDoubles 参数）
	const handlePlayerChoice = createPlayerChoiceHandler(battleState, streams, ai, isDoubles);

	// 设置战斗参数
	const spec = {
		formatid: format
	};
	const p1spec = {
		name: playerName,
		team: Sim.Teams.pack(p1team)
	};
	const p2spec = {
		name: "AI 对手",
		team: Sim.Teams.pack(p2team)
	};

	console.log('\n战斗开始！');

	// 启动战斗
	streams.omniscient.write(`>start ${JSON.stringify(spec)}\n>player p1 ${JSON.stringify(p1spec)}\n>player p2 ${JSON.stringify(p2spec)}`);

	// 启动消息处理循环（传递isDoubles标志）
	await startMessageLoop(battleState, streams, handlePlayerChoice, teamOrder, ai, isDoubles);

	// 等待战斗结束
	while (!battleState.battleEnded) {
		await new Promise(resolve => setTimeout(resolve, 1000));
	}

	console.log('\n感谢游玩！');
	rl.close();
	setTimeout(() => process.exit(0), 500);
}

// 运行 PVE 对战
startPVEBattle().catch(err => {
	console.error('发生错误:', err);
	rl.close();
	process.exit(1);
});