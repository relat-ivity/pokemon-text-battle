/**
 * PokéChamp AI Player
 * 原汁原味的 PokéChamp Minimax + LLM 对战 AI
 *
 * 特性:
 * - Minimax 树搜索 (深度 K=2)
 * - LLM 辅助决策和状态评估
 * - 对战胜率: 84% (vs 规则类AI)
 * - Elo评分: 1300-1500
 */

import { AIPlayer } from '../ai-player';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import type {
	SwitchRequest,
	TeamPreviewRequest,
	MoveRequest
} from 'pokemon-showdown/dist/sim/side';

interface AnyObject { [k: string]: any }

export class PokéChampAIPlayer extends AIPlayer {
	private serviceProcess: ChildProcess | null = null;
	private initialized = false;
	private responseBuffer: string = '';
	private pendingResponse: ((data: any) => void) | null = null;
	private backend: string = 'deepseek/deepseek-chat-v3.1:free';

	constructor(
		playerStream: any,
		debug: boolean = true,
		backend: string = 'deepseek/deepseek-chat-v3.1:free'
	) {
		super(playerStream, debug);
		this.backend = backend;
	}

	/**
	 * 启动 PokéChamp Python 服务
	 */
	private async startService(): Promise<void> {
		if (this.initialized) {
			return;
		}

		return new Promise((resolve, reject) => {
			try {
				const servicePath = path.join(__dirname, '../../..', 'pokechamp-service.py');
				console.log('[PokéChamp] Starting service from:', servicePath);
				console.log('[PokéChamp] Using Python command: python');

				this.serviceProcess = spawn('python', [servicePath], {
					stdio: ['pipe', 'pipe', 'pipe'],
					cwd: path.join(__dirname, '../../..')
				});

				if (!this.serviceProcess.stdout || !this.serviceProcess.stderr) {
					throw new Error('Failed to create service process');
				}

				// 处理进程错误
				this.serviceProcess.on('error', (error: Error) => {
					console.error('❌ [PokéChamp] Process error:', error.message);
					console.error('提示：请确保已安装 Python 并添加到 PATH 环境变量');
					reject(error);
				});

				// 处理进程退出
				this.serviceProcess.on('exit', (code: number | null) => {
					if (code !== 0 && code !== null) {
						const message = `PokéChamp service exited with code ${code}`;
						console.error('❌ [PokéChamp]', message);
						reject(new Error(message));
					}
				});

				// 处理标准输出
				this.serviceProcess.stdout.on('data', (data: Buffer) => {
					const output = data.toString();
					if (this.debug) console.log('[PokéChamp stdout]', output);

					this.responseBuffer += output;
					const lines = this.responseBuffer.split('\n');
					this.responseBuffer = lines[lines.length - 1];

				for (let i = 0; i < lines.length - 1; i++) {
					const line = lines[i].trim();
					// 只解析看起来像 JSON 的行（以 { 开头）
					if (line && line.startsWith('{') && this.pendingResponse) {
						try {
							const response = JSON.parse(line);
							this.pendingResponse(response);
							this.pendingResponse = null;
						} catch (e) {
							// 忽略非 JSON 行的解析错误（可能是库的初始化输出）
							if (this.debug) {
								console.error('❌ [PokéChamp] JSON parse error (ignored):', e);
							}
						}
					}
				}
				});

				// 处理错误输出 - PokéChamp 的调试日志
				this.serviceProcess.stderr?.on('data', (data: Buffer) => {
					const errOutput = data.toString();
					console.log('[PokéChamp]', errOutput);
				});

				// 初始化 AI
				console.log('[PokéChamp] Sending init command...');
				this.sendCommand({
					action: 'init',
					backend: this.backend
				}).then((result: any) => {
					if (result.status === 'ok') {
						this.initialized = true;
						console.log('✓ [PokéChamp] Service initialized');
						resolve();
					} else {
						const errMsg = `PokéChamp init failed: ${result.message}`;
						console.error('❌', errMsg);
						reject(new Error(errMsg));
					}
				}).catch((error: any) => {
					console.error('❌ [PokéChamp] Init command error:', error.message);
					reject(error);
				});

			} catch (error) {
				console.error('❌ [PokéChamp] Spawn error:', error);
				reject(error);
			}
		});
	}

	/**
	 * 向服务发送命令
	 */
	private sendCommand(command: AnyObject): Promise<any> {
		return new Promise((resolve, reject) => {
			if (!this.serviceProcess?.stdin) {
				const errMsg = 'Service not running or stdin is not available';
				console.error('❌ [PokéChamp]', errMsg);
				reject(new Error(errMsg));
				return;
			}

			this.pendingResponse = resolve;

			const timeout = setTimeout(() => {
				this.pendingResponse = null;
				const errMsg = `PokéChamp service timeout (60s) for action: ${command.action}`;
				console.error('❌ [PokéChamp]', errMsg);
				reject(new Error(errMsg));
			}, 60000);

			const commandStr = JSON.stringify(command);
			if (this.debug) console.log('[PokéChamp] Sending command:', commandStr);

			this.serviceProcess.stdin.write(commandStr + '\n', (err) => {
				if (err) {
					clearTimeout(timeout);
					console.error('❌ [PokéChamp] stdin write error:', err.message);
					reject(err);
				}
			});
		});
	}

	/**
	 * 处理强制切换
	 */
	protected override handleForceSwitchRequest(request: SwitchRequest): void {
		try {
			this.initializeAndChoose(async () => {
				const result = await this.sendCommand({
					action: 'choose_switch',
					request: request
				});

				if (result.status === 'ok' && result.choice) {
					this.choose(result.choice);
				} else {
					console.error('❌ [PokéChamp] Switch decision failed:', result.message);
				}
			});
		} catch (error) {
			console.error('❌ [PokéChamp] Error in switch request:', error);
		}
	}

	/**
	 * 处理队伍预览
	 */
	protected override handleTeamPreviewRequest(request: TeamPreviewRequest): void {
		try {
			this.initializeAndChoose(async () => {
				const result = await this.sendCommand({
					action: 'choose_team_preview',
					request: request
				});

				if (result.status === 'ok' && result.choice) {
					this.choose(result.choice);
					if (this.debug) console.log('[PokéChamp] Team Preview chosen:', result.choice);
				} else {
					console.error('❌ [PokéChamp] Team preview decision failed:', result.message);
				}
			});
		} catch (error) {
			console.error('❌ [PokéChamp] Error in team preview request:', error);
		}
	}

	/**
	 * 初始化服务后执行异步操作
	 */
	private async initializeAndChoose(callback: () => Promise<void>): Promise<void> {
		try {
			if (!this.initialized) {
				console.log('[PokéChamp] Initializing service...');
				await this.startService();
				console.log('[PokéChamp] Service initialization complete');
			}
			await callback();
		} catch (error: any) {
			console.error('❌ [PokéChamp] Initialization or execution error:', error?.message || error);
		}
	}

	/**
	 * 处理对战回合
	 * 使用 PokéChamp 的 Minimax + LLM 混合决策
	 */
	protected override async handleActiveTurnRequest(request: MoveRequest): Promise<void> {
		try {
			if (!this.initialized) {
				await this.startService();
			}

			const result = await this.sendCommand({
				action: 'choose_move',
				request: request
			});

			if (result.status === 'ok' && result.choice) {
				this.choose(result.choice);
				if (this.debug) console.log('[PokéChamp] AI Decision:', result.choice, result.reasoning);
			} else {
				console.error('❌ [PokéChamp] AI decision failed:', result.message);
			}

		} catch (error) {
			console.error('❌ [PokéChamp] Error in move request:', error);
		}
	}

	/**
	 * 清理资源
	 */
	destroy(): void {
		if (this.serviceProcess) {
			this.serviceProcess.kill();
			this.serviceProcess = null;
		}
	}
}
