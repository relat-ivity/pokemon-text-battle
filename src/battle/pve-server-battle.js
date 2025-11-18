#!/usr/bin/env node

/**
 * PokéChamp 本地对战客户端
 *
 * 玩家通过 WebSocket 连接到本地 Pokemon Showdown 服务器 (localhost:8000)
 * PokéChamp AI 也连接到同一服务器，使用真正的 choose_move() 方法
 */

const WebSocket = require('ws');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DEBUG_MODE = process.env.DEBUG_MODE === 'true'; // 在 .env 中设置 DEBUG_MODE=true 开启调试
const {
    BattleState
} = require('../battle_common/battle-state');
const {
    BattleMessageHandler
} = require('../battle_common/message-handler');
const {
    displayChoices,
    displaySwitchChoices,
    displayBattleTeamStatus,
    displayTeamFromRequest
} = require('../battle_common/ui-display');
const {
    Translator
} = require('../../dist/support/translator');

// 初始化翻译器
const translator = Translator.getInstance('cn');

// 配置
const SERVER_URL = 'ws://localhost:8000/showdown/websocket';
const PLAYER_USERNAME = 'Player';
const BATTLE_FORMAT = process.env.SERVER_BATTLE_FORMAT || 'gen9randombattle';

/**
 * 从队伍文件夹随机加载一个队伍并转换为打包格式
 * @returns {string|null} 打包格式的队伍字符串，如果加载失败则返回 null
 */
function loadRandomTeam() {
    try {
        // 队伍文件夹路径
        const teamsDir = path.join(__dirname, '../../pokechamp-ai/poke_env/data/static/teams/gen9ou');

        // 读取目录中的所有队伍文件
        const files = fs.readdirSync(teamsDir).filter(f => f.endsWith('.txt'));

        if (files.length === 0) {
            console.log('⚠️  未找到队伍文件');
            return null;
        }

        // 随机选择一个文件
        const randomFile = files[Math.floor(Math.random() * files.length)];
        const teamPath = path.join(teamsDir, randomFile);

        // 读取队伍内容
        const teamContent = fs.readFileSync(teamPath, 'utf-8');
        console.log(`📦 已加载队伍: ${randomFile}`);

        // 使用 pokemon-showdown 库将队伍转换为打包格式
        const Sim = require('pokemon-showdown');
        const team = Sim.Teams.import(teamContent);
        if (!team || team.length === 0) {
            console.error('⚠️  队伍解析失败');
            return null;
        }

        const packedTeam = Sim.Teams.pack(team);
        if (DEBUG_MODE) {
            console.log(`[DEBUG] 打包队伍: ${packedTeam.substring(0, 100)}...`);
        }

        return packedTeam;
    } catch (error) {
        console.error('⚠️  加载队伍失败:', error.message);
        return null;
    }
}

// 全局状态
let ws = null;
let battleState = null;
let messageHandler = null;
let currentBattleRoom = null;
let rl = null;
let waitingForInput = false;
let challengeSent = false; // 标志：是否已发送挑战
let teamDisplayed = false; // 标志：是否已展示队伍信息
let opponentPokemon = []; // 对手的宝可梦列表（用于队伍预览）

/**
 * 创建 readline 接口
 */
function createReadline() {
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

/**
 * 发送消息到服务器
 * Pokemon Showdown 协议：消息格式为 "room|message"
 * 如果 room 为空，则为 "|message"（全局命令）
 */
function sendMessage(message, room = '') {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.error('❌ WebSocket 未连接');
        return;
    }

    // Pokemon Showdown 协议：始终使用 "|" 分隔符
    const toSend = `${room}|${message}`;
    if (DEBUG_MODE) {
        console.log(`\x1b[94m\x1b[1m>>>\x1b[0m ${toSend}`);
    }
    ws.send(toSend);
}

/**
 * 处理 challstr 消息并登录
 */
function handleChallstr(parts) {
    console.log('🔐 收到认证挑战，正在登录...');
    // 对于本地服务器（noguestsecurity=true），需要手动发送 /trn 命令登录
    sendMessage(`/trn ${PLAYER_USERNAME}`);
}

/**
 * 处理 updateuser 消息（确认登录）
 */
function handleUpdateUser(parts) {
    const username = parts[2].trim(); // 去掉前后空格
    const loggedIn = parts[3] === '1'; // 检查是否已登录（1表示已登录）

    console.log(`✅ 已连接: ${username}`);

    // 如果已经发送过挑战，直接返回（避免重复）
    if (challengeSent) {
        return;
    }

    // 根据对战格式决定是否需要加载队伍
    if (BATTLE_FORMAT.includes('random')) {
        // 随机对战格式使用 null（服务器生成随机队伍）
        sendMessage('/utm null');
    } else {
        // 非随机对战格式需要加载队伍
        const team = loadRandomTeam();
        if (team) {
            sendMessage(`/utm ${team}`);
        } else {
            console.log('⚠️  将使用空队伍（可能导致对战失败）');
            sendMessage('/utm null');
        }
    }

    // 如果有 POKECHAMP_ID 环境变量，发送挑战；否则搜索对战
    const pokechampId = process.env.POKECHAMP_ID;
    if (pokechampId) {
        const opponentName = `pokechamp${pokechampId}`;
        console.log(`🎯 目标对手: ${opponentName}`);
        console.log(`⏳ 等待 5 秒让 PokéChamp AI 完全启动并准备接受挑战...\n`);

        // 标记已发送挑战（在定时器之前设置，防止多次触发）
        challengeSent = true;

        // 延迟发送挑战，确保 PokéChamp AI 已经完全启动并准备接受挑战
        setTimeout(() => {
            console.log(`📤 发送挑战给 ${opponentName}...\n`);
            sendMessage(`/challenge ${opponentName}, ${BATTLE_FORMAT}`);
        }, 5000);
    } else {
        console.log('🔍 正在搜索 gen9randombattle 对战...\n');
        sendMessage(`/search ${BATTLE_FORMAT}`);
        challengeSent = true;
    }
}

/**
 * 处理对战消息
 */
async function handleBattleMessage(message) {
    const lines = message.split('\n');
    const roomLine = lines[0];

    // 提取房间名
    if (roomLine.startsWith('>')) {
        currentBattleRoom = roomLine.substring(1);
    }

    // 标记是否检测到相关事件
    let playerFainted = false;      // 玩家宝可梦倒下
    let hasRequest = false;         // 当前消息块包含 forceSwitch 请求
    let playerMoveShown = false;    // 玩家的招式效果已显示

    // 处理每一行消息
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.trim() === '') continue;

        if (DEBUG_MODE) {
            console.log(`\x1b[92m\x1b[1m<<<\x1b[0m ${line}`);
        }

        // 检查是否是对战初始化消息
        if (line.startsWith('|init|battle')) {
            console.log('\n🎮 对战开始！\n');
            // 显示输入格式提示
            console.log('📝 输入格式:');
            console.log('   move 1 或 m1 (使用第1个招式)');
            console.log('   move 1 tera 或 m1 t (使用第1个招式并太晶化)');
            console.log('   switch 2 或 s2 (切换到第2个宝可梦)');
            console.log('   team (查看己方队伍状态)\n');
            // 初始化对战状态
            battleState = new BattleState();
            messageHandler = new BattleMessageHandler(battleState, translator);
            teamDisplayed = false; // 重置队伍展示标志
            continue;
        }

        // 使用消息处理器更新状态
        if (messageHandler && battleState) {
            messageHandler.handleMessage(line);
        }

        // 检测玩家宝可梦倒下
        if (line.startsWith('|faint|p1')) {
            playerFainted = true;
        }

        // 检测玩家使用招式（用于切换招式的情况）
        if (line.startsWith('|move|p1')) {
            playerMoveShown = true;
        }

        // 收集对手宝可梦信息（队伍预览阶段）
        // 格式: |poke|p2|Pokemon, L50, M|item
        if (line.startsWith('|poke|p2|')) {
            const parts = line.split('|');
            if (parts.length >= 4) {
                const pokemonInfo = parts[3].split(',')[0]; // 只取宝可梦名称
                opponentPokemon.push(pokemonInfo);
            }
        }

        // 处理请求消息
        if (line.startsWith('|request|')) {
            const requestJson = line.substring('|request|'.length);
            if (requestJson && requestJson !== 'null') {
                // 如果 battleState 还未初始化，先初始化它
                if (!battleState) {
                    battleState = new BattleState();
                    messageHandler = new BattleMessageHandler(battleState, translator);
                    teamDisplayed = false;
                }
                try {
                    const request = JSON.parse(requestJson);
                    battleState.setCurrentRequest(request);

                    // 判断请求类型
                    if (request.teamPreview) {
                        // 队伍预览 - 等待 |teampreview| 消息后再处理
                        // 不在这里处理，等待 |teampreview| 消息
                    } else if (request.forceSwitch) {
                        // 强制切换 - 标记有请求，等待消息块结束后处理
                        hasRequest = true;
                    } else if (request.active && !teamDisplayed) {
                        // 第一个 active 请求 - 展示队伍信息
                        displayTeamFromRequest(request, translator);
                        teamDisplayed = true;
                    }
                    // forceSwitch 和 active 请求会在消息块处理完毕后处理
                } catch (e) {
                    console.error('❌ 解析请求失败:', e.message);
                }
            }
        }

        // 处理队伍预览消息（在 |poke| 消息之后到达）
        if (line.startsWith('|teampreview')) {
            // 此时 opponentPokemon 已经收集完毕，可以显示选择界面
            if (battleState && battleState.currentRequest && battleState.currentRequest.teamPreview) {
                await handleTeamPreview(battleState.currentRequest);
            }
        }

        // 处理回合开始
        if (line.startsWith('|turn|')) {
            const turnNum = line.split('|')[2];

            // 在显示回合信息前等待用户按回车
            await new Promise(resolve => {
                rl.question('\n按回车开始第 ' + turnNum + ' 回合...', () => {
                    console.log('');
                    resolve();
                });
            });

            console.log(`${'='.repeat(60)}`);
            console.log(`\x1b[1m\x1b[36m第 ${turnNum} 回合\x1b[0m`);
            console.log('='.repeat(60));

            // 检查是否有待处理的请求
            if (battleState.currentRequest) {
                if (battleState.currentRequest.forceSwitch) {
                    await handleForceSwitch();
                } else if (battleState.currentRequest.active) {
                    await handleActiveRequest();
                }
            }
        }

        // 处理对战结束
        if (line.startsWith('|win|') || line === '|tie') {
            if (DEBUG_MODE) {
                console.log(`\n[DEBUG] 对战结束消息: ${line}`);
            }
            console.log('\n' + '='.repeat(60));
            if (line.startsWith('|win|')) {
                const winner = line.split('|')[2];
                if (winner === PLAYER_USERNAME) {
                    console.log('\x1b[1m\x1b[32m🎉 你赢了！\x1b[0m');
                } else {
                    console.log('\x1b[1m\x1b[31m💔 你输了！\x1b[0m');
                }
            } else {
                console.log('\x1b[1m\x1b[33m🤝 平局！\x1b[0m');
            }
            console.log('='.repeat(60) + '\n');

            // 关闭连接
            setTimeout(() => {
                console.log('正在关闭连接...');
                cleanup();
                process.exit(0);
            }, 2000);
        }
    }

    // 消息块处理完毕后，检查是否需要处理 forceSwitch
    // 必须满足以下条件之一：
    // 1. playerFainted - 当前消息块包含 |faint|p1（宝可梦倒下）
    // 2. playerMoveShown - 当前消息块包含 |move|p1（切换招式的效果已显示）
    if (battleState && battleState.currentRequest && battleState.currentRequest.forceSwitch && !waitingForInput) {
        // 检查是否是宝可梦倒下的情况
        const activePokemon = battleState.currentRequest.side?.pokemon?.find(p => p.active);
        const isFaintSituation = activePokemon && activePokemon.condition.endsWith(' fnt');

        if (isFaintSituation) {
            // 宝可梦倒下 - 必须等到 |faint|p1 消息显示后才处理
            if (playerFainted) {
                await handleForceSwitch();
            }
        } else if (playerMoveShown) {
            // 切换招式 - 必须等到 |move|p1 消息显示后才处理
            await handleForceSwitch();
        }
    }
}

/**
 * 处理队伍预览请求
 */
async function handleTeamPreview(request) {
    console.log('\n📋 队伍预览 - 选择首发宝可梦');
    console.log('='.repeat(50));

    // 将对手宝可梦信息添加到 battleState
    if (opponentPokemon.length > 0) {
        battleState.opponent.addFromTeamPreview(opponentPokemon);
    }

    // 显示对手的宝可梦
    pokeLog = '【对手队伍】';
    if (opponentPokemon.length > 0) {
        opponentPokemon.forEach((name, index) => {
            const translatedName = translator.translate(name, 'pokemon');
            pokeLog += `${translatedName} `;
        });
    } else {
        console.log('   (未知)');
    }

    console.log(pokeLog);

    // 显示己方队伍中的所有宝可梦
    pokeLog = '【你的队伍】';
    const pokemon = request.side.pokemon;
    pokemon.forEach((poke, index) => {
        const name = poke.details.split(',')[0];
        const translatedName = translator.translate(name, 'pokemon');
        pokeLog += `${translatedName} `;
    });
    console.log(pokeLog);
    console.log('输入格式: 1 (选择第1个宝可梦作为首发)');

    // 获取玩家选择
    const choice = await new Promise((resolve) => {
        const askForInput = () => {
            rl.question('请选择首发宝可梦: ', (answer) => {
                const num = parseInt(answer.trim());
                if (num >= 1 && num <= pokemon.length) {
                    resolve(num);
                } else {
                    console.log('❌ 无效的选择，请输入 1-' + pokemon.length);
                    askForInput();
                }
            });
        };
        askForInput();
    });

    // 构建队伍顺序：首发在前，其他按原顺序
    const teamOrder = [choice];
    for (let i = 1; i <= pokemon.length; i++) {
        if (i !== choice) {
            teamOrder.push(i);
        }
    }

    // 发送选择
    const orderStr = teamOrder.join('');
    console.log(`\n📤 发送队伍顺序: ${orderStr}`);
    sendMessage(`/choose team ${orderStr}`, currentBattleRoom);

    // 清除请求
    battleState.clearCurrentRequest();
}

/**
 * 处理强制切换请求
 */
async function handleForceSwitch() {
    if (waitingForInput) return;
    waitingForInput = true;

    const request = battleState.currentRequest;

    // 检查是否是因为宝可梦倒下（通过检查当前宝可梦的状态）
    const activePokemon = request.side?.pokemon?.find(p => p.active);
    if (activePokemon && activePokemon.condition.endsWith(' fnt')) {
        console.log('\n⚠️  你的宝可梦倒下了，必须切换！');
    } else {
        console.log('\n🔄 请选择要切换上场的宝可梦：');
    }

    // 显示可用的宝可梦
    displaySwitchChoices(request, translator);

    // 获取玩家输入
    const choice = await getPlayerChoice(request);

    // 发送选择
    console.log(`\n📤 发送选择: ${choice}`);
    sendMessage(`/choose ${choice}`, currentBattleRoom);

    // 清除请求
    battleState.clearCurrentRequest();
    waitingForInput = false;

    console.log('⏳ 等待服务器和对手响应...\n');
}

/**
 * 处理普通招式请求
 */
async function handleActiveRequest() {
    if (waitingForInput) return;
    waitingForInput = true;

    const request = battleState.currentRequest;

    // 显示可用选项（包括招式信息）
    displayChoices(battleState, request, translator);

    // 获取玩家输入
    const choice = await getPlayerChoice(request);

    // 发送选择
    console.log(`\n📤 发送选择: ${choice}`);
    sendMessage(`/choose ${choice}`, currentBattleRoom);

    // 清除请求
    battleState.clearCurrentRequest();
    waitingForInput = false;

    console.log('⏳ 等待服务器和对手响应...\n');
}

/**
 * 获取玩家输入
 */
function getPlayerChoice(request) {
    return new Promise((resolve) => {
        const askForInput = () => {
            rl.question('请输入你的选择: ', (answer) => {
                const choice = validateChoice(answer.trim(), request);
                if (choice === 'team') {
                    // 显示对手和己方队伍状态后继续等待输入
                    displayBattleTeamStatus(battleState, request, translator);
                    askForInput();
                } else if (choice) {
                    resolve(choice);
                } else {
                    console.log('❌ 无效的选择，请重新输入');
                    askForInput();
                }
            });
        };
        askForInput();
    });
}

/**
 * 验证玩家选择
 */
function validateChoice(input, request) {
    // 特殊命令：team - 查看队伍状态（返回 'team' 让上层处理）
    if (input.toLowerCase() === 'team') {
        return 'team';
    }

    // 解析输入 - 支持多种格式：
    // 1. "m1", "s2" (简写)
    // 2. "move 1", "switch 2" (完整)
    // 3. "m1 t", "m1 tera", "move 1 tera" (太晶化)
    let action, index, terastallize = false;

    // 匹配简写格式（m1, m1 t, m1 tera）
    const shortMatch = input.match(/^([ms])(\d+)(?:\s+(t|tera|terastallize))?$/i);
    // 匹配完整格式（move 1, move 1 tera, move 1 tera）
    const longMatch = input.match(/^(move|switch)\s+(\d+)(?:\s+(t|tera|terastallize))?$/i);

    if (shortMatch) {
        action = shortMatch[1].toLowerCase();
        index = parseInt(shortMatch[2]);
        terastallize = !!shortMatch[3];
    } else if (longMatch) {
        action = longMatch[1].toLowerCase() === 'move' ? 'm' : 's';
        index = parseInt(longMatch[2]);
        terastallize = !!longMatch[3];
    } else {
        return null;
    }

    if (action === 'm') {
        // 招式选择
        if (request.active && request.active[0]) {
            const moves = request.active[0].moves;
            if (index >= 1 && index <= moves.length) {
                const move = moves[index - 1];
                if (move.disabled) {
                    console.log('❌ 该招式不可用');
                    return null;
                }

                // 检查太晶化
                if (terastallize) {
                    if (!request.active[0].canTerastallize) {
                        console.log('❌ 无法太晶化（已使用或不可用）');
                        return null;
                    }
                    return `move ${index} terastallize`;
                }

                return `move ${index}`;
            }
        }
    } else if (action === 's') {
        // 切换选择
        if (request.side && request.side.pokemon) {
            const pokemon = request.side.pokemon;
            if (index >= 1 && index <= pokemon.length) {
                const poke = pokemon[index - 1];
                // 检查是否是当前宝可梦
                if (poke.active) {
                    console.log('❌ 该宝可梦已在场上');
                    return null;
                }
                // 检查是否倒下
                if (poke.condition.endsWith(' fnt')) {
                    console.log('❌ 该宝可梦已倒下');
                    return null;
                }
                return `switch ${index}`;
            }
        }
    }

    return null;
}

/**
 * 处理 WebSocket 消息
 */
function handleMessage(data) {
    const message = data.toString();
    if (DEBUG_MODE) {
        console.log(`[DEBUG] ${message}`);
    }

    // 分割消息（一个消息可能包含多行）
    const lines = message.split('\n');

    // 检查第一行，判断消息类型
    if (lines[0].startsWith('>battle-')) {
        // 对战消息
        handleBattleMessage(message);
    } else {
        // 全局消息
        for (const line of lines) {
            if (!line || line.trim() === '') continue;

            const parts = line.split('|');

            if (parts[1] === 'challstr') {
                handleChallstr(parts);
            } else if (parts[1] === 'updateuser') {
                handleUpdateUser(parts);
            } else if (parts[1] === 'updatesearch') {
                // 搜索更新 - 可以显示匹配状态
                if (parts[2] && parts[2] !== '{"searching":[]}') {
                    console.log('🔍 正在匹配...');
                }
            } else if (parts[1] === 'popup') {
                console.log(`\n⚠️  服务器消息: ${parts.slice(2).join('|')}\n`);
            } else {
                // 其他消息 - 静默处理或记录
                // console.log(`\x1b[90m${line}\x1b[0m`);
            }
        }
    }
}

/**
 * 清理资源
 */
function cleanup() {
    if (rl) {
        rl.close();
        rl = null;
    }
    if (ws) {
        ws.close();
        ws = null;
    }
}

/**
 * 启动客户端
 */
function startClient() {
    console.log('='.repeat(60));
    console.log(`📡 连接服务器: ${SERVER_URL}`);
    console.log(`👤 玩家名称: ${PLAYER_USERNAME}`);
    console.log(`🎯 对战格式: ${BATTLE_FORMAT}`);
    console.log('='.repeat(60) + '\n');

    // 创建 readline
    createReadline();

    // 连接 WebSocket
    ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
        console.log('✅ 已连接到服务器\n');
    });

    ws.on('message', handleMessage);

    ws.on('error', (error) => {
        console.error('❌ WebSocket 错误:', error.message);
    });

    ws.on('close', () => {
        console.log('\n📴 连接已关闭');
        cleanup();
        process.exit(0);
    });

    // 处理 Ctrl+C
    process.on('SIGINT', () => {
        console.log('\n\n正在退出...');
        cleanup();
        process.exit(0);
    });
}

// 启动
if (require.main === module) {
    startClient();
}

module.exports = {
    startClient
};