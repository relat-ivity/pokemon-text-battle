#!/usr/bin/env node
/**
 * PokéChamp 本地对战客户端
 *
 * 玩家通过 WebSocket 连接到本地 Pokemon Showdown 服务器 (localhost:8000)
 * PokéChamp AI 也连接到同一服务器，使用真正的 choose_move() 方法
 */

const WebSocket = require('ws');
const readline = require('readline');
const { BattleState } = require('../battle_common/battle-state');
const { BattleMessageHandler } = require('../battle_common/message-handler');
const { displayChoices, displaySwitchChoices, displayBattleTeamStatus, displayTeamInfo } = require('../battle_common/ui-display');
const { Translator } = require('../../dist/support/translator');

// 初始化翻译器
const translator = Translator.getInstance('cn');

// 配置
const SERVER_URL = 'ws://localhost:8000/showdown/websocket';
const PLAYER_USERNAME = 'Player';
const BATTLE_FORMAT = 'gen9randombattle';

// 全局状态
let ws = null;
let battleState = null;
let messageHandler = null;
let currentBattleRoom = null;
let rl = null;
let waitingForInput = false;

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
    console.log(`\x1b[94m\x1b[1m>>>\x1b[0m ${toSend}`);
    ws.send(toSend);
}

/**
 * 处理 challstr 消息并登录
 */
function handleChallstr(parts) {
    console.log('\n🔐 收到认证挑战，正在登录...');
    // 对于本地服务器（noguestsecurity=true），需要手动发送 /trn 命令登录
    sendMessage(`/trn ${PLAYER_USERNAME}`);
}

/**
 * 处理 updateuser 消息（确认登录）
 */
function handleUpdateUser(parts) {
    const username = parts[2].trim(); // 去掉前后空格
    const loggedIn = parts[3] === '1'; // 检查是否已登录（1表示已登录）

    console.log(`\n✅ 已连接: ${username}`);

    // 设置队伍为 null（随机队伍）
    sendMessage('/utm null');

    // 如果有 POKECHAMP_ID 环境变量，发送挑战；否则搜索对战
    const pokechampId = process.env.POKECHAMP_ID;
    if (pokechampId) {
        const opponentName = `pokechamp${pokechampId}`;
        console.log(`🎯 目标对手: ${opponentName}`);
        console.log(`⏳ 等待 5 秒让 PokéChamp AI 完全启动并准备接受挑战...\n`);

        // 延迟发送挑战，确保 PokéChamp AI 已经完全启动并准备接受挑战
        setTimeout(() => {
            console.log(`📤 发送挑战给 ${opponentName}...\n`);
            sendMessage(`/challenge ${opponentName}, ${BATTLE_FORMAT}`);
        }, 5000);
    } else {
        console.log('🔍 正在搜索 gen9randombattle 对战...\n');
        sendMessage(`/search ${BATTLE_FORMAT}`);
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

    // 处理每一行消息
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.trim() === '') continue;

        console.log(`\x1b[92m\x1b[1m<<<\x1b[0m ${line}`);

        // 检查是否是对战初始化消息
        if (line.startsWith('|init|battle')) {
            console.log('\n🎮 对战开始！\n');
            // 初始化对战状态
            battleState = new BattleState();
            messageHandler = new BattleMessageHandler(battleState, translator);
            continue;
        }

        // 使用消息处理器更新状态
        if (messageHandler && battleState) {
            messageHandler.handleMessage(line);
        }

        // 处理请求消息
        if (line.startsWith('|request|')) {
            const requestJson = line.substring('|request|'.length);
            if (requestJson && requestJson !== 'null' && battleState) {
                try {
                    const request = JSON.parse(requestJson);
                    battleState.setCurrentRequest(request);

                    // 判断请求类型
                    if (request.teamPreview) {
                        // 队伍预览 - 立即发送默认队伍顺序
                        console.log('\n📋 队伍预览（gen9randombattle 随机对战）');
                        const teamOrder = `/choose default`;
                        sendMessage(teamOrder, currentBattleRoom);
                    } else if (request.forceSwitch) {
                        // 强制切换 - 使用 process.nextTick 延迟处理
                        process.nextTick(async () => {
                            if (battleState.currentRequest && !waitingForInput) {
                                await handleForceSwitch();
                            }
                        });
                    }
                    // active 请求会在 |turn| 消息后处理
                } catch (e) {
                    console.error('❌ 解析请求失败:', e.message);
                }
            }
        }

        // 处理回合开始
        if (line.startsWith('|turn|')) {
            const turnNum = line.split('|')[2];
            console.log(`\n${'='.repeat(60)}`);
            console.log(`\x1b[1m\x1b[36m第 ${turnNum} 回合\x1b[0m`);
            console.log('='.repeat(60));

            // 显示双方队伍状态（使用适合服务器模式的显示方式）
            if (battleState.player && battleState.opponent && battleState.currentRequest) {
                displayBattleTeamStatus(battleState, battleState.currentRequest, translator);
            }

            // 等待用户按回车继续
            await new Promise(resolve => {
                rl.question('\n按回车键继续...', () => {
                    console.log('');
                    resolve();
                });
            });

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
            console.log(`\n[DEBUG] 对战结束消息: ${line}`);
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
}

/**
 * 处理强制切换请求
 */
async function handleForceSwitch() {
    if (waitingForInput) return;
    waitingForInput = true;

    const request = battleState.currentRequest;
    console.log('\n⚠️  你的宝可梦倒下了，必须切换！');

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
    console.log('\n💭 轮到你了！请选择行动：');

    // 显示可用选项
    displayChoices(request, battleState);

    // 显示输入格式提示
    console.log('\n📝 输入格式: move 1 或 m1 (使用第1个招式)');
    console.log('           move 1 tera 或 m1 t (使用第1个招式并太晶化)');
    console.log('           switch 2 或 s2 (切换到第2个宝可梦)');
    console.log('           team (查看对手剩余宝可梦)');

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
                if (choice) {
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
 * 显示对手剩余宝可梦
 */
function displayOpponentTeam() {
    console.log('\n' + '='.repeat(60));
    console.log('对手剩余宝可梦:');
    console.log('='.repeat(60));

    const opponentPokemon = battleState.opponentState.pokemon;

    if (!opponentPokemon || opponentPokemon.length === 0) {
        console.log('  无信息');
    } else {
        opponentPokemon.forEach((poke, index) => {
            const status = poke.fainted ? '[已昏厥]' :
                          poke.active ? '[出战中]' :
                          poke.hp > 0 ? `[HP: ${Math.round((poke.hp / poke.maxhp) * 100)}%]` : '';

            const pokemonName = translator.translate(poke.species, 'pokemon');
            const displayName = poke.details ? `${pokemonName} (${poke.details})` : pokemonName;

            console.log(`  ${index + 1}. ${displayName} ${status}`);
        });
    }

    console.log('='.repeat(60) + '\n');
}

/**
 * 验证玩家选择
 */
function validateChoice(input, request) {
    // 特殊命令：team - 查看对手剩余宝可梦
    if (input.toLowerCase() === 'team') {
        displayOpponentTeam();
        return null; // 返回 null 让玩家继续输入
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
    console.log(`[DEBUG] ${message}`);

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
    console.log('🚀 PokéChamp 本地对战客户端');
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

module.exports = { startClient };
