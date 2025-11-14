#!/usr/bin/env node
/**
 * 启动本地 Pokemon Showdown 服务器
 * 用于 PokéChamp AI 本地对战
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Pokemon Showdown 服务器路径
const showdownPath = path.join(__dirname, '..', 'node_modules', 'pokemon-showdown');
const configPath = path.join(showdownPath, 'config', 'config.js');

// 修改配置以支持本地开发
console.log('⚙️  配置本地服务器...');
try {
    let config = fs.readFileSync(configPath, 'utf8');

    // 启用 noguestsecurity 以支持不需要认证的本地登录
    if (config.includes('exports.noguestsecurity = false')) {
        config = config.replace(
            'exports.noguestsecurity = false;',
            'exports.noguestsecurity = true; // 自动启用以支持本地对战'
        );
        fs.writeFileSync(configPath, config, 'utf8');
        console.log('✓ 已启用 noguestsecurity（本地开发模式）');
    }
} catch (error) {
    console.warn('⚠️  配置文件修改失败，使用默认配置:', error.message);
}

console.log('🚀 启动 Pokemon Showdown 本地服务器...');
console.log(`📁 服务器路径: ${showdownPath}`);
console.log(`🌐 服务器地址: http://localhost:8000`);
console.log('');

// 启动服务器
const server = spawn('node', ['pokemon-showdown', '8000'], {
	cwd: showdownPath,
	stdio: 'inherit',
	shell: true
});

server.on('error', (error) => {
	console.error('❌ 服务器启动失败:', error);
	process.exit(1);
});

server.on('exit', (code) => {
	if (code !== 0) {
		console.log(`\n❌ 服务器退出，代码: ${code}`);
	} else {
		console.log('\n✅ 服务器已停止');
	}
});

// 处理Ctrl+C
process.on('SIGINT', () => {
	console.log('\n\n停止服务器...');
	server.kill('SIGINT');
	process.exit(0);
});
