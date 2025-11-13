/**
 * 本地 Pokemon Showdown 服务器
 * 用于 PokéChamp AI 对战
 */

const { Teams } = require('pokemon-showdown');

/**
 * 创建本地服务器配置
 */
function createLocalServerConfig() {
	return {
		host: 'localhost',
		port: 8000,
		// 不需要认证
		loginServer: null,
		// 禁用速率限制
		noRateLimit: true
	};
}

/**
 * 创建对战房间
 * @param {string} format - 对战格式 (如 'gen9randombattle')
 * @returns {Object} 对战房间对象
 */
function createBattleRoom(format = 'gen9randombattle') {
	const room = {
		id: `battle-${Date.now()}`,
		format: format,
		rated: false,
		players: {},
		log: []
	};

	return room;
}

/**
 * 生成随机队伍
 * @param {string} format - 对战格式
 * @returns {string} 队伍字符串
 */
function generateTeam(format = 'gen9randombattle') {
	return Teams.generate(format);
}

module.exports = {
	createLocalServerConfig,
	createBattleRoom,
	generateTeam
};
