/**
 * PokéChamp 对战服务器
 * 使用 WebSocket 在本地运行 Pokemon Showdown 服务器
 * 让玩家和 PokéChamp AI 都连接到这个服务器进行对战
 */

const WebSocket = require('ws');
const { BattleStream } = require('pokemon-showdown/dist/sim/battle-stream');
const { Teams } = require('pokemon-showdown');

class PokéChampBattleServer {
	constructor(port = 8000) {
		this.port = port;
		this.wss = null;
		this.battles = new Map();
		this.clients = new Map();
	}

	/**
	 * 启动服务器
	 */
	start() {
		this.wss = new WebSocket.Server({ port: this.port });

		console.log(`[Server] Pokemon Showdown 本地服务器启动于 ws://localhost:${this.port}`);

		this.wss.on('connection', (ws, req) => {
			const clientId = this.generateClientId();
			this.clients.set(clientId, ws);

			console.log(`[Server] 客户端连接: ${clientId}`);

			ws.on('message', (message) => {
				this.handleMessage(clientId, message.toString());
			});

			ws.on('close', () => {
				console.log(`[Server] 客户端断开: ${clientId}`);
				this.clients.delete(clientId);
			});

			// 发送欢迎消息
			ws.send(JSON.stringify({
				type: 'connected',
				clientId: clientId
			}));
		});
	}

	/**
	 * 处理客户端消息
	 */
	handleMessage(clientId, message) {
		try {
			const data = JSON.parse(message);

			switch (data.type) {
				case 'challenge':
					this.handleChallenge(clientId, data);
					break;
				case 'accept':
					this.handleAccept(clientId, data);
					break;
				case 'move':
					this.handleMove(clientId, data);
					break;
				default:
					console.log(`[Server] 未知消息类型: ${data.type}`);
			}
		} catch (e) {
			console.error(`[Server] 解析消息失败:`, e);
		}
	}

	/**
	 * 处理挑战
	 */
	handleChallenge(challengerId, data) {
		const battleId = this.generateBattleId();
		const format = data.format || 'gen9randombattle';

		console.log(`[Server] 创建对战: ${battleId} (格式: ${format})`);

		// 创建对战流
		const streams = BattleStream.getPlayerStreams(new BattleStream());

		// 生成队伍
		const p1Team = Teams.generate(format);
		const p2Team = Teams.generate(format);

		// 保存对战信息
		this.battles.set(battleId, {
			id: battleId,
			format: format,
			streams: streams,
			players: {
				p1: challengerId,
				p2: null // 等待对手连接
			},
			teams: {
				p1: p1Team,
				p2: p2Team
			}
		});

		// 通知挑战者
		this.sendToClient(challengerId, {
			type: 'battle_created',
			battleId: battleId,
			format: format,
			team: p1Team
		});
	}

	/**
	 * 处理接受挑战
	 */
	handleAccept(accepterId, data) {
		const battle = this.battles.get(data.battleId);
		if (!battle) {
			return this.sendToClient(accepterId, {
				type: 'error',
				message: 'Battle not found'
			});
		}

		battle.players.p2 = accepterId;

		// 通知双方对战开始
		this.sendToClient(battle.players.p1, {
			type: 'battle_start',
			battleId: battle.id,
			team: battle.teams.p1
		});

		this.sendToClient(battle.players.p2, {
			type: 'battle_start',
			battleId: battle.id,
			team: battle.teams.p2
		});

		// 启动对战
		this.startBattle(battle);
	}

	/**
	 * 启动对战
	 */
	async startBattle(battle) {
		const { streams, teams } = battle;

		// 发送开始命令
		streams.omniscient.write(`>start ${JSON.stringify({
			formatid: battle.format
		})}`);

		streams.omniscient.write(`>player p1 {"name":"Player 1","team":"${teams.p1}"}`);
		streams.omniscient.write(`>player p2 {"name":"Player 2","team":"${teams.p2}"}`);

		// 监听对战流
		for await (const chunk of streams.omniscient) {
			// 广播给双方玩家
			this.broadcastToBattle(battle, {
				type: 'battle_message',
				message: chunk
			});
		}
	}

	/**
	 * 处理招式
	 */
	handleMove(clientId, data) {
		const battle = this.findBattleByClient(clientId);
		if (!battle) {
			return;
		}

		const playerSide = battle.players.p1 === clientId ? 'p1' : 'p2';
		const stream = battle.streams[playerSide];

		stream.write(data.choice);
	}

	/**
	 * 查找客户端所在的对战
	 */
	findBattleByClient(clientId) {
		for (const battle of this.battles.values()) {
			if (battle.players.p1 === clientId || battle.players.p2 === clientId) {
				return battle;
			}
		}
		return null;
	}

	/**
	 * 发送消息给客户端
	 */
	sendToClient(clientId, data) {
		const ws = this.clients.get(clientId);
		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(JSON.stringify(data));
		}
	}

	/**
	 * 广播消息给对战中的所有玩家
	 */
	broadcastToBattle(battle, data) {
		[battle.players.p1, battle.players.p2].forEach(clientId => {
			if (clientId) {
				this.sendToClient(clientId, data);
			}
		});
	}

	/**
	 * 生成客户端 ID
	 */
	generateClientId() {
		return `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * 生成对战 ID
	 */
	generateBattleId() {
		return `battle-${Date.now()}`;
	}

	/**
	 * 停止服务器
	 */
	stop() {
		if (this.wss) {
			this.wss.close();
			console.log('[Server] 服务器已停止');
		}
	}
}

module.exports = { PokéChampBattleServer };
