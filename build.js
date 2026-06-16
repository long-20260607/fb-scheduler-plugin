const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');

// 清理 dist 目录
if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

// 混淆选项 - 激进但安全（不会破坏运行）
const obfuscatorOptions = {
    compact: true,
    controlFlowFlattening: true,         // 控制流平坦化
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,             // 注入死代码
    deadCodeInjectionThreshold: 0.4,
    stringArray: true,                   // 字符串提取到数组
    stringArrayEncoding: ['rc4'],        // RC4 加密字符串
    stringArrayThreshold: 0.75,
    renameGlobals: false,                // 不重命名全局变量（避免破坏 DOM 选择器）
    selfDefending: false,                // 关闭自保护（扩展环境不兼容）
    debugProtection: false,              // 关闭调试保护
    disableConsoleOutput: false,         // 保留 console 输出
    target: 'browser',
    seed: 42,                            // 固定种子，每次构建结果一致
};

// 需要混淆的 JS 文件
const jsFiles = ['content.js', 'popup.js'];

// 需要原样复制的文件
const copyFiles = ['manifest.json', 'popup.html', 'content.css', 'logo.png'];

// 混淆 JS 文件
for (const file of jsFiles) {
    const src = path.join(__dirname, file);
    if (!fs.existsSync(src)) {
        console.log(`⚠️  跳过 ${file}（文件不存在）`);
        continue;
    }
    const code = fs.readFileSync(src, 'utf-8');
    const result = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);
    const outPath = path.join(DIST, file);
    fs.writeFileSync(outPath, result.getObfuscatedCode(), 'utf-8');

    const originalSize = (Buffer.byteLength(code) / 1024).toFixed(1);
    const obfuscatedSize = (Buffer.byteLength(result.getObfuscatedCode()) / 1024).toFixed(1);
    console.log(`✅ ${file}: ${originalSize}KB → ${obfuscatedSize}KB`);
}

// 原样复制其他文件
for (const file of copyFiles) {
    const src = path.join(__dirname, file);
    if (!fs.existsSync(src)) {
        console.log(`⚠️  跳过 ${file}（文件不存在）`);
        continue;
    }
    fs.copyFileSync(src, path.join(DIST, file));
    console.log(`📄 ${file}（原样复制）`);
}

// 打包为带时间戳的 zip
const { execSync } = require('child_process');
const now = new Date();
const timestamp = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
    + String(now.getHours()).padStart(2, '0')
    + String(now.getMinutes()).padStart(2, '0');
const zipName = `fb-scheduler-plugin-${timestamp}.zip`;
const zipPath = path.join(__dirname, zipName);
execSync(`powershell -Command "Compress-Archive -Path '${DIST}\\*' -DestinationPath '${zipPath}' -Force"`);
console.log(`\n🎉 构建完成！输出目录: dist/`);
console.log(`📦 已打包: ${zipName}`);
