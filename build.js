// build.js - 打包插件发布文件
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 配置
const PLUGIN_NAME = 'fb-scheduler-plugin';
const OUTPUT_DIR = __dirname;
const now = new Date();
const pad = n => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const OUTPUT_FILE = path.join(OUTPUT_DIR, `${PLUGIN_NAME}-${timestamp}.zip`);

// 需要打包的文件
const FILES = [
    'content.css',
    'content.js',
    'logo.png',
    'manifest.json',
    'popup.html',
    'popup.js'
];

// 检查文件是否存在
console.log('检查文件...');
const missingFiles = FILES.filter(f => !fs.existsSync(path.join(__dirname, f)));
if (missingFiles.length > 0) {
    console.error('错误：以下文件不存在：');
    missingFiles.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
}

// 构建 PowerShell 命令
const srcDir = __dirname.split(path.sep).join('/');
const fileList = FILES.map(f => `'${srcDir}/${f}'`).join(',');
const outFile = OUTPUT_FILE.split(path.sep).join('/');

const psCmd = `Compress-Archive -Path @(${fileList}) -DestinationPath '${outFile}' -Force`;

// 删除旧的 zip 文件
const oldZips = fs.readdirSync(OUTPUT_DIR).filter(f => f.startsWith(`${PLUGIN_NAME}-`) && f.endsWith('.zip'));
oldZips.forEach(f => fs.unlinkSync(path.join(OUTPUT_DIR, f)));
if (oldZips.length > 0) {
    console.log(`已删除 ${oldZips.length} 个旧包`);
}

console.log('打包中...');
try {
    execSync(`powershell -Command "${psCmd}"`, { stdio: 'inherit' });
    console.log(`\n✅ 打包完成！`);
    console.log(`输出: ${OUTPUT_FILE}`);
} catch (error) {
    console.error('打包失败:', error.message);
    process.exit(1);
}
