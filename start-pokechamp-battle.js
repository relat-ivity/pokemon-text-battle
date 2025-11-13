#!/usr/bin/env node
/**
 * PokéChamp AI 对战模式一键启动脚本
 *
 * 自动启动三个进程：
 * 1. Pokemon Showdown 本地服务器 (localhost:8000)
 * 2. PokéChamp Python 服务
 * 3. 玩家客户端
 */

const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

// ANSI 颜色代码
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

// 进程管理
let serverProcess = null;
let pythonProcess = null;
let clientProcess = null;

/**
 * 打印带颜色的日志
 */
function log(color, prefix, message) {
    console.log(`${color}${prefix}${colors.reset} ${message}`);
}

/**
 * 清理所有进程
 */
function cleanup() {
    log(colors.yellow, '\n[清理]', '正在关闭所有进程...');

    if (clientProcess && !clientProcess.killed) {
        clientProcess.kill();
    }
    if (pythonProcess && !pythonProcess.killed) {
        pythonProcess.kill();
    }
    if (serverProcess && !serverProcess.killed) {
        serverProcess.kill();
    }

    log(colors.green, '[清理]', '所有进程已关闭');
}

/**
 * 启动本地服务器
 */
function startServer() {
    return new Promise((resolve, reject) => {
        log(colors.cyan, '\n[1/3]', '正在启动 Pokemon Showdown 本地服务器...');

        serverProcess = spawn('node', ['start-local-server.js'], {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: true
        });

        let serverReady = false;

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`${colors.blue}[服务器]${colors.reset} ${output.trim()}`);

            // 检查服务器是否启动成功
            if (output.includes('listening on') || output.includes('Test your server')) {
                if (!serverReady) {
                    serverReady = true;
                    log(colors.green, '[服务器]', '✓ 服务器启动成功\n');
                    resolve();
                }
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error(`${colors.red}[服务器错误]${colors.reset} ${data.toString().trim()}`);
        });

        serverProcess.on('error', (error) => {
            reject(new Error(`服务器启动失败: ${error.message}`));
        });

        serverProcess.on('exit', (code) => {
            if (code !== 0 && code !== null) {
                log(colors.red, '[服务器]', `服务器异常退出，代码: ${code}`);
            }
        });

        // 超时检查
        setTimeout(() => {
            if (!serverReady) {
                resolve(); // 即使没有看到成功消息，也继续（服务器可能已经在运行）
            }
        }, 3000);
    });
}

/**
 * 启动 Python 服务
 */
function startPythonService() {
    return new Promise((resolve, reject) => {
        log(colors.magenta, '[2/3]', '正在启动 PokéChamp Python 服务...');

        // 尝试不同的 Python 命令
        const pythonCommands = ['python', 'python3', 'py'];
        let commandIndex = 0;

        function tryNextCommand() {
            if (commandIndex >= pythonCommands.length) {
                reject(new Error('无法找到 Python 解释器。请确保已安装 Python 3'));
                return;
            }

            const pythonCmd = pythonCommands[commandIndex];
            log(colors.magenta, '[Python]', `尝试使用命令: ${pythonCmd}`);

            pythonProcess = spawn(pythonCmd, ['pokechamp-service.py'], {
                stdio: ['ignore', 'pipe', 'pipe'],
                shell: true
            });

            let pythonReady = false;

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log(`${colors.magenta}[Python]${colors.reset} ${output.trim()}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                const output = data.toString();
                console.error(`${colors.magenta}[Python]${colors.reset} ${output.trim()}`);

                // 检查服务是否已经启动
                if (output.includes('[IMPORT]') || output.includes('[INIT]')) {
                    if (!pythonReady) {
                        pythonReady = true;
                        log(colors.green, '[Python]', '✓ Python 服务启动成功\n');
                        resolve();
                    }
                }
            });

            pythonProcess.on('error', (error) => {
                if (error.code === 'ENOENT') {
                    commandIndex++;
                    tryNextCommand();
                } else {
                    reject(error);
                }
            });

            pythonProcess.on('exit', (code) => {
                if (code !== 0 && code !== null && !pythonReady) {
                    commandIndex++;
                    tryNextCommand();
                } else if (code !== 0 && code !== null) {
                    log(colors.red, '[Python]', `Python 服务异常退出，代码: ${code}`);
                }
            });

            // 超时检查（Python 服务启动较慢）
            setTimeout(() => {
                if (!pythonReady) {
                    log(colors.yellow, '[Python]', '等待 Python 服务初始化中...');
                }
            }, 2000);

            setTimeout(() => {
                if (!pythonReady) {
                    log(colors.green, '[Python]', '✓ 继续启动客户端（Python 服务将在后台继续初始化）\n');
                    resolve();
                }
            }, 5000);
        }

        tryNextCommand();
    });
}

/**
 * 启动玩家客户端
 */
function startClient() {
    return new Promise((resolve, reject) => {
        log(colors.green, '[3/3]', '正在启动玩家客户端...\n');
        log(colors.bright, '', '='.repeat(60));
        log(colors.bright, '', '玩家客户端已启动，请开始游戏！');
        log(colors.bright, '', '='.repeat(60) + '\n');

        clientProcess = spawn('node', ['src/battle_on_server/pve-server-battle.js'], {
            stdio: 'inherit',
            shell: true
        });

        clientProcess.on('error', (error) => {
            reject(new Error(`客户端启动失败: ${error.message}`));
        });

        clientProcess.on('exit', (code) => {
            log(colors.yellow, '\n[客户端]', '客户端已退出');
            cleanup();
            resolve(code);
        });
    });
}

/**
 * 主函数
 */
async function main() {
    console.log(`
${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════╗
║                                                            ║
║        🎮 PokéChamp AI 对战模式 - 一键启动脚本 🎮          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);

    log(colors.yellow, '[提示]', '此脚本将启动三个进程：');
    log(colors.yellow, '      ', '1. Pokemon Showdown 本地服务器');
    log(colors.yellow, '      ', '2. PokéChamp Python AI 服务');
    log(colors.yellow, '      ', '3. 玩家对战客户端');
    log(colors.yellow, '\n[提示]', '按 Ctrl+C 可随时退出所有进程\n');

    try {
        // 依次启动三个进程
        await startServer();
        await startPythonService();
        await startClient();

        process.exit(0);
    } catch (error) {
        log(colors.red, '[错误]', error.message);
        cleanup();
        process.exit(1);
    }
}

// 处理退出信号
process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    log(colors.red, '[错误]', `未捕获的异常: ${error.message}`);
    cleanup();
    process.exit(1);
});

// 启动
main();
