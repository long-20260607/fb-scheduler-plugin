// popup.js - Popup 激活界面逻辑

// 激活 API 基础 URL（需要根据实际情况修改）
const ACTIVATION_API_BASE = 'https://www.xm2013.com'; // TODO: 替换为实际的 API 地址

// 调用激活 API
async function callActivationAPI(endpoint, fingerId, code) {
    try {
        const url = `${ACTIVATION_API_BASE}${endpoint}`;
        const params = new URLSearchParams();
        params.append('fingerId', fingerId);
        params.append('code', code);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: params.toString()
        });
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('激活 API 调用失败:', error);
        throw error;
    }
}

// 生成设备指纹（确保跨浏览器一致性）
function generateFingerprint() {
    const components = [];
    
    try {
        // 硬件特征
        components.push(screen.width + 'x' + screen.height);
        components.push(screen.colorDepth);
        components.push(navigator.hardwareConcurrency || 'unknown');
        components.push(navigator.deviceMemory || 'unknown');
        
        // 系统特征
        components.push(new Date().getTimezoneOffset());
        components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
        components.push(navigator.language);
        components.push(navigator.platform);
        
        // Canvas指纹
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 300;
            canvas.height = 80;
            
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#FF6600';
            ctx.fillRect(120, 1, 60, 18);
            ctx.fillStyle = '#0066CC';
            ctx.font = '12pt Arial';
            ctx.fillText('FacebookSchedule2024', 2, 16);
            
            const canvasData = canvas.toDataURL();
            components.push(canvasData.substring(canvasData.length - 80));
        } catch (e) {
            components.push('canvas-unavailable');
        }
        
        // 生成更长的哈希
        const combined = components.join('|');
        
        // 使用多个哈希算法组合
        let hash1 = 0;
        let hash2 = 0;
        let hash3 = 0;
        
        for (let i = 0; i < combined.length; i++) {
            const char = combined.charCodeAt(i);
            
            // 第一个哈希算法
            hash1 = ((hash1 << 5) - hash1) + char;
            hash1 = hash1 & hash1;
            
            // 第二个哈希算法
            hash2 = hash2 * 31 + char;
            hash2 = hash2 & 0xFFFFFFFF;
            
            // 第三个哈希算法
            hash3 = hash3 + char * (i + 1);
            hash3 = hash3 & 0xFFFFFFFF;
        }
        
        // 组合多个哈希值，生成更长的指纹
        const combinedHash = Math.abs(hash1).toString(36) + 
                           Math.abs(hash2).toString(36) + 
                           Math.abs(hash3).toString(36);
        
        // 确保长度至少为16位
        return combinedHash.padEnd(16, '0').substring(0, 16);
        
    } catch (error) {
        console.error('生成设备指纹失败:', error);
        return 'fingerprint-error';
    }
}

// 显示消息
function showMessage(text, type) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = text;
    messageEl.className = 'message message-' + type;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        messageEl.style.display = 'none';
    }, 3000);
}

// 显示/隐藏加载状态
function setLoading(loading) {
    document.getElementById('loading').style.display = loading ? 'block' : 'none';
}

// 加载激活状态
async function loadActiveStatus() {
    try {
        const result = await chrome.storage.local.get(['activeInfo']);
        const activeInfo = result.activeInfo;
        
        if (activeInfo && activeInfo.isActive) {
            // 已激活
            document.getElementById('activeStatus').style.display = 'block';
            document.getElementById('inactiveStatus').style.display = 'none';
            document.getElementById('expireTime').textContent = activeInfo.expireTime || '-';
            document.getElementById('activeCode').textContent = activeInfo.code || '-';
        } else {
            // 未激活
            document.getElementById('activeStatus').style.display = 'none';
            document.getElementById('inactiveStatus').style.display = 'block';
        }
    } catch (error) {
        console.error('加载激活状态失败:', error);
        document.getElementById('activeStatus').style.display = 'none';
        document.getElementById('inactiveStatus').style.display = 'block';
    }
}

// 激活
async function activate() {
    const codeInput = document.getElementById('codeInput');
    const code = codeInput.value.trim();
    
    if (!code) {
        showMessage('请输入激活码', 'error');
        return;
    }
    
    setLoading(true);
    
    try {
        const fingerId = generateFingerprint();
        
        // 直接调用激活 API
        const data = await callActivationAPI('/app/plugin/active', fingerId, code);
        
        if (data.status === true) {
            // 保存激活信息
            const activeInfo = {
                isActive: true,
                fingerId: fingerId,
                code: code,
                expireTime: data.data || null
            };
            await chrome.storage.local.set({ activeInfo: activeInfo });
            
            showMessage(data.msg || '激活成功', 'success');
            // 重新加载状态
            setTimeout(() => {
                loadActiveStatus();
            }, 500);
        } else {
            showMessage(data.msg || '激活失败', 'error');
        }
    } catch (error) {
        console.error('激活失败:', error);
        showMessage('激活失败: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
}

// 取消激活
async function cancelActive() {
    if (!confirm('确定要取消激活吗？')) {
        return;
    }
    
    setLoading(true);
    
    try {
        const result = await chrome.storage.local.get(['activeInfo']);
        const activeInfo = result.activeInfo;
        
        if (!activeInfo || !activeInfo.isActive) {
            showMessage('当前未激活', 'error');
            setLoading(false);
            return;
        }
        
        const fingerId = generateFingerprint();
        
        // 直接调用取消激活 API
        const data = await callActivationAPI('/app/plugin/unactive', fingerId, activeInfo.code);
        
        if (data.status === true) {
            // 清除激活信息
            await chrome.storage.local.remove('activeInfo');
            
            showMessage(data.msg || '取消激活成功', 'success');
            // 重新加载状态
            setTimeout(() => {
                loadActiveStatus();
            }, 500);
        } else {
            showMessage(data.msg || '取消激活失败', 'error');
        }
    } catch (error) {
        console.error('取消激活失败:', error);
        showMessage('取消激活失败: ' + error.message, 'error');
    } finally {
        setLoading(false);
    }
}

// 获取激活状态（通过 API 检测）
async function getActivationStatus() {
    try {
        // 从 storage 获取激活信息（用于获取 code）
        const result = await chrome.storage.local.get(['activeInfo']);
        const activeInfo = result.activeInfo;
        
        if (!activeInfo || !activeInfo.isActive || !activeInfo.code) {
            return { isActive: false };
        }
        
        // 发送请求检测激活状态
        const data = await callActivationAPI('/app/plugin/checkTime', activeInfo.fingerId, activeInfo.code);
        
        if (data.status === true) {
            // 激活有效，更新过期时间（如果有）
            if (data.data) {
                activeInfo.expireTime = data.data;
                await chrome.storage.local.set({ activeInfo: activeInfo });
            }
            return { isActive: true, activeInfo: activeInfo };
        } else {
            // 激活无效或已过期，清除激活信息
            await chrome.storage.local.remove('activeInfo');
            return { isActive: false };
        }
    } catch (error) {
        console.error('获取激活状态失败:', error);
        return { isActive: false };
    }
}

// 开始处理
async function startProcessing() {
    try {
        // 检查激活状态
        const status = await getActivationStatus();
        if (!status.isActive) {
            showMessage('请先激活插件', 'error');
            return;
        }
        
        // 获取当前活动标签页
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            showMessage('无法获取当前标签页', 'error');
            return;
        }
        
        // 检查是否在正确的页面
        if (!tab.url || !tab.url.includes('business.facebook.com/latest/bulk_upload_composer')) {
            showMessage('请在 Facebook 批量上传页面使用此功能', 'error');
            return;
        }
        
        // 使用 executeScript 发送 postMessage 启动处理
        // javascript-obfuscator:disable
        await chrome.scripting.executeScript({
            target: {
                tabId: tab.id 
            }, 
            func: ()=>{
                window.postMessage({ action: 'startProcessing', source: 'facebook-schedule-helper-popup'}, '*');
            }
        });
        // await chrome.scripting.executeScript({target: { tabId: tab.id }, func: ()=>{window.postMessage({ action: 'startProcessing', source: 'facebook-schedule-helper-popup'}, '*');}});

        showMessage('已开始处理', 'success');
       
    } catch (error) {
        console.error('启动处理失败:', error);
        showMessage('启动失败: ' + error.message, 'error');
    }
}


function sendMesageToMain(){
     // 发送 postMessage 到 content script
     
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadActiveStatus();
    
    document.getElementById('activeBtn').addEventListener('click', activate);
    document.getElementById('cancelActiveBtn').addEventListener('click', cancelActive);
    
    // 开始按钮（只在已激活时显示）
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', startProcessing);
    }
    
    // 支持回车键激活
    const codeInput = document.getElementById('codeInput');
    if (codeInput) {
        codeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                activate();
            }
        });
    }
});

