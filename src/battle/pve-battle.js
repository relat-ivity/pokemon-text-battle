/**
 * PVE 对战脚本 - 玩家 vs AI
 * 使用 Pokemon Showdown 模拟器
 * 
 * 运行方式：npm run battle 或 node src/battle/pve-battle.js
 */

require('dotenv').config();
const Sim = require('pokemon-showdown');
const { AIPlayerFactory } = require('../../dist/ai/ai-player-factory');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { Translator } = require('../../dist/support/translator');
const { BattleState } = require('../battle_common/battle-state');
const { BattleMessageHandler } = require('../battle_common/message-handler');
const {
	displayTeamInfo,
	displayChoices,
	displaySwitchChoices,
	displayBattleTeamStatus
} = require('../battle_common/ui-display');

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
 * @returns {{ team: Array, fileName: string } | null}
 */
function loadTeamFromFile(format) {
	const teamsDir = path.join(__dirname, '../../pokechamp-ai/poke_env/data/static/teams', format);

	if (!fs.existsSync(teamsDir)) {
		return null;
	}

	const teamFiles = fs.readdirSync(teamsDir).filter(f => f.endsWith('.txt'));
	if (teamFiles.length === 0) {
		return null;
	}

	// 随机选择一个队伍文件
	const randomFile = teamFiles[Math.floor(Math.random() * teamFiles.length)];
	const teamText = fs.readFileSync(path.join(teamsDir, randomFile), 'utf-8');

	// 使用 Pokemon Showdown 解析队伍
	const team = Sim.Teams.import(teamText);
	return { team, fileName: randomFile };
}

/**
 * 生成符合规则的队伍
 * @returns {{ team: Array, fileName: string | null }}
 */
function generateValidTeam(format) {
	// 对于非随机对战格式，尝试从文件加载队伍
	if (!format.includes('random')) {
		const result = loadTeamFromFile(format);
		if (result && result.team && result.team.length > 0) {
			return { team: result.team, fileName: result.fileName };
		}
		console.log(`⚠️  未找到 ${format} 的预设队伍，使用随机生成`);
	}

	const validator = new Sim.TeamValidator(format);
	let team = Sim.Teams.generate('gen9randombattle');

	// 重试直到生成有效队伍
	while (validator.validateTeam(team) != null) {
		team = Sim.Teams.generate('gen9randombattle');
	}

	return { team: team, fileName: null };
}

/**
 * 选择对手
 */
async function selectOpponent() {
	console.log("\n请选择对手：\n    1. DeepSeek AI\n    2. 本地大师AI\n    3. 本地智能AI\n    4. 随机行为AI");
	const opponentChoice = await prompt('请输入对手编号:');

	let opponent = '本地智能AI';
	let aiType = 'smart_ai';

	if (opponentChoice === '1') {
		opponent = 'DeepSeek AI';
		aiType = 'deepseek_ai';
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
		console.log("未知对手，将使用本地智能AI");
	}

	return { opponent, aiType };
}

/**
 * 选择首发宝可梦
 */
async function selectLeadPokemon(team) {
	const teamSize = team.length;
	let teamOrder = null;

	while (!teamOrder) {
		const choice = await prompt('\n请选择你的队伍首发(1-6的数字): ');
		if (choice) {
			const digit = parseInt(choice);
			const hasInvalidDigit = digit < 1 || digit > teamSize || isNaN(digit);
			if (hasInvalidDigit) {
				console.log(`❌ 数字必须在 1-${teamSize} 之间`);
				continue;
			}

			// teamOrder让digits为第一个，剩下的数字在后面，例如 213456
			teamOrder = [digit, ...Array.from({ length: teamSize }, (_, i) => i + 1).filter(n => n !== digit)].join('');
			console.log(`\n✓ 首发已确定为${digit}号宝可梦`);
		} else {
			console.log('❌ 输入不能为空');
		}
	}

	return teamOrder;
}

/**
 * 转换简化指令为完整格式
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
 * 获取玩家选择
 */
async function getPlayerChoice() {
	let choice = await prompt('你的选择: ');
	while (!choice) {
		console.log('❌ 输入不能为空');
		choice = await prompt('你的选择: ');
	}
	// 转换简化指令
	return normalizeChoice(choice);
}

/**
 * 创建玩家选择处理器
 */
function createPlayerChoiceHandler(battleState, streams, ai) {
	return async function handlePlayerChoice(isForceSwitch = false) {
		if (battleState.isProcessingChoice || battleState.battleEnded) return;
		battleState.startProcessingChoice();

		try {
			const choice = await getPlayerChoice();
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
 */
async function startMessageLoop(battleState, streams, handlePlayerChoice, teamOrder, ai) {
	const messageHandler = new BattleMessageHandler(battleState, translator, debug_mode);

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
							console.log('\n' + '='.repeat(50));
							console.log(`第 ${turn} 回合`);
							console.log('='.repeat(50));

						// 在 turn 消息后处理待处理的请求
						// 这时当前 chunk 中的所有消息都已显示
						if (battleState.currentRequest && !battleState.isProcessingChoice) {
							if (battleState.currentRequest.forceSwitch) {
								displaySwitchChoices(battleState.currentRequest, translator);
									handlePlayerChoice(true);  // 强制切换，传递 true
								battleState.clearCurrentRequest();
							} else if (battleState.currentRequest.active) {
								displayChoices(battleState, battleState.currentRequest, translator, debug_mode);
									handlePlayerChoice(false);  // 正常回合，传递 false
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
								// 通知 AI 玩家的队伍顺序（用于作弊功能）
								if (ai && typeof ai.setPlayerTeamOrder === 'function') {
									ai.setPlayerTeamOrder(teamOrder);
								}
									streams.p1.write(`team ${teamOrder}`);
									if (debug_mode) console.log(`[Debug] 正在应用队伍顺序: ${teamOrder}`);
								battleState.clearCurrentRequest();
							} else if (request.forceSwitch && !battleState.isProcessingChoice) {
								// 强制切换请求：保存请求，等待 |turn| 消息后处理
								// 如果没有 |turn| 消息（比如刚上场就倒下），使用延迟处理
								process.nextTick(async () => {
									if (battleState.currentRequest && battleState.currentRequest.forceSwitch && !battleState.isProcessingChoice) {
										displaySwitchChoices(battleState.currentRequest, translator);
										handlePlayerChoice(true);  // 强制切换，传递 true
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
	console.log('    使用招式: move 1');
	console.log('    切换宝可梦: switch 2');
	console.log('    太晶化攻击: move 1 tera  (使用第1个招式并太晶化)');
	console.log('    查看队伍: team  (查看所有宝可梦状态)');

	// 选择对手
	const { opponent, aiType } = await selectOpponent();

	// 生成队伍
	const format = process.env.LOCAL_BATTLE_FORMAT || 'gen9ou';
	const playerName = 'Player';
	console.log(`\n✓ 对战格式: ${format}`);
	const p1result = generateValidTeam(format);
	const p2result = generateValidTeam(format);
	const p1team = p1result.team;
	const p2team = p2result.team;

	// 显示队伍文件名
	if (p1result.fileName) {
		console.log(`✓ 玩家队伍: ${p1result.fileName}`);
	}
	if (p2result.fileName) {
		console.log(`✓ AI队伍: ${p2result.fileName}`);
	}

	// 创建战斗流
	const streams = Sim.getPlayerStreams(new Sim.BattleStream());

	// 创建 AI 对手
	// 获取 PokéChamp LLM 后端配置
	const pokechampBackend = process.env.POKECHAMP_LLM_BACKEND || 'deepseek/deepseek-chat-v3.1:free';
	const ai = AIPlayerFactory.createAI(aiType, streams.p2, debug_mode,p2team, p1team, pokechampBackend);

	// 获取实际的 AI 名字（如果降级会显示降级后的名字）
	let actualOpponentName = opponent;
	let warningMessage = '';

	// DeepSeek 特殊处理：检查是否降级
	if (aiType === 'deepseek_ai' && !process.env.DEEPSEEK_API_KEY) {
		actualOpponentName = '本地智能AI (DeepSeek降级)';
		warningMessage = '⚠️  未检测到 DEEPSEEK_API_KEY，已降级到本地智能AI';
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

	console.log(`\n✓ 已创建对手: ${actualOpponentName}`);
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

	// 选择首发宝可梦
	const teamOrder = await selectLeadPokemon(p1team);

	// 创建战斗状态
	const battleState = new BattleState(p1team, p2team);

	// 创建玩家选择处理器
	const handlePlayerChoice = createPlayerChoiceHandler(battleState, streams, ai);

	// 设置战斗参数
	const spec = { formatid: format };
	const p1spec = { name: playerName, team: Sim.Teams.pack(p1team) };
	const p2spec = { name: "AI 对手", team: Sim.Teams.pack(p2team) };

	console.log('\n战斗开始！');

	// 启动战斗
	streams.omniscient.write(`>start ${JSON.stringify(spec)}\n>player p1 ${JSON.stringify(p1spec)}\n>player p2 ${JSON.stringify(p2spec)}`);

	// 启动消息处理循环
	await startMessageLoop(battleState, streams, handlePlayerChoice, teamOrder, ai);

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
