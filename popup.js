// popup.js - Popup 激活界面逻辑

// 激活 API 基础 URL（需要根据实际情况修改）
// const ACTIVATION_API_BASE = 'http://localhost:3000';
// const ACTIVATION_API_BASE = 'http://localhost:54321/functions/v1';
const ACTIVATION_API_BASE = 'https://hizynzkovnnugjedqpuw.supabase.co/functions/v1';

// 调用激活 API
async function callActivationAPI(endpoint, fingerId, code) {
    try {
        const url = `${ACTIVATION_API_BASE}${endpoint}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ fingerId, code })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('激活 API 调用失败:', error);
        throw error;
    }
}

// 格式化到期时间
function formatExpireTime(isoString) {
    const d = new Date(isoString);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 指纹算法版本（升级算法时递增，触发旧缓存自动更新）
const FINGERPRINT_ALGO_VERSION = 'v2';

// 生成指纹公共组件（硬件 + 系统特征，跨配置文件稳定）
function getFingerprintComponents() {
    const components = [];
    components.push(screen.width + 'x' + screen.height);
    components.push(screen.colorDepth);
    components.push(navigator.hardwareConcurrency || 'unknown');
    components.push(navigator.deviceMemory || 'unknown');
    components.push(new Date().getTimezoneOffset());
    components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
    components.push(navigator.language);
    components.push(navigator.platform);
    return components;
}

// 哈希计算（新旧算法共用）
function computeHash(combined) {
    let hash1 = 0, hash2 = 0, hash3 = 0;
    for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash1 = ((hash1 << 5) - hash1) + char;
        hash1 = hash1 & hash1;
        hash2 = hash2 * 31 + char;
        hash2 = hash2 & 0xFFFFFFFF;
        hash3 = hash3 + char * (i + 1);
        hash3 = hash3 & 0xFFFFFFFF;
    }
    const combinedHash = Math.abs(hash1).toString(36) +
                       Math.abs(hash2).toString(36) +
                       Math.abs(hash3).toString(36);
    return combinedHash.padEnd(16, '0').substring(0, 16);
}

// 新算法：不含 Canvas（跨配置文件/重装稳定）
function generateFingerprint() {
    try {
        const components = getFingerprintComponents();
        return computeHash(components.join('|'));
    } catch (error) {
        console.error('生成设备指纹失败:', error);
        return 'fingerprint-error';
    }
}

// 旧算法：含 Canvas（兼容老用户已绑定的指纹）
function generateFingerprintLegacy() {
    try {
        const components = getFingerprintComponents();
        // Canvas 指纹（旧版本使用）
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
        return computeHash(components.join('|'));
    } catch (error) {
        console.error('生成旧设备指纹失败:', error);
        return 'fingerprint-error';
    }
}

// 获取设备指纹（优先使用缓存，确保跨标签页一致）
let fingerprintPromise = null;
async function getFingerprint() {
    // 防止并发调用导致重复生成
    if (fingerprintPromise) return fingerprintPromise;

    fingerprintPromise = (async () => {
        try {
            const result = await chrome.storage.local.get(['cachedFingerprint', 'fingerprintAlgoVersion', 'activeInfo']);

            // 算法版本不匹配 → 清除旧缓存，用新算法重新生成
            if (result.cachedFingerprint && result.fingerprintAlgoVersion !== FINGERPRINT_ALGO_VERSION) {
                console.log('指纹算法版本升级，重新生成指纹...');
                const fp = generateFingerprint();
                const updateData = { cachedFingerprint: fp, fingerprintAlgoVersion: FINGERPRINT_ALGO_VERSION };
                // 同步更新 activeInfo 中的指纹（确保取消激活等操作使用新指纹）
                if (result.activeInfo && result.activeInfo.fingerId) {
                    result.activeInfo.fingerId = fp;
                    updateData.activeInfo = result.activeInfo;
                }
                await chrome.storage.local.set(updateData);
                return fp;
            }

            if (result.cachedFingerprint) {
                return result.cachedFingerprint;
            }

            // 兼容老用户：从已存储的激活信息中读取指纹（且版本匹配）
            if (result.activeInfo && result.activeInfo.fingerId && result.fingerprintAlgoVersion === FINGERPRINT_ALGO_VERSION) {
                await chrome.storage.local.set({ cachedFingerprint: result.activeInfo.fingerId });
                return result.activeInfo.fingerId;
            }
            // 首次生成，缓存后返回
            const fp = generateFingerprint();
            await chrome.storage.local.set({ cachedFingerprint: fp, fingerprintAlgoVersion: FINGERPRINT_ALGO_VERSION });
            return fp;
        } catch (e) {
            return generateFingerprint();
        }
    })();

    try {
        return await fingerprintPromise;
    } finally {
        fingerprintPromise = null;
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
            document.getElementById('expireTime').textContent = activeInfo.expireTime ? formatExpireTime(activeInfo.expireTime) : '-';
            document.getElementById('activeCode').textContent = activeInfo.code || '-';
        } else {
            // 未激活
            document.getElementById('activeStatus').style.display = 'none';
            document.getElementById('inactiveStatus').style.display = 'block';
            // 如果有保存的激活码，自动回填
            if (activeInfo && activeInfo.code) {
                document.getElementById('codeInput').value = activeInfo.code;
            }
        }
    } catch (error) {
        console.error('加载激活状态失败:', error);
        document.getElementById('activeStatus').style.display = 'none';
        document.getElementById('inactiveStatus').style.display = 'block';
    }
}

// 激活
let isActivating = false;
async function activate() {
    if (isActivating) return;
    isActivating = true;
    const codeInput = document.getElementById('codeInput');
    const code = codeInput.value.trim();

    if (!code) {
        showMessage('请输入激活码', 'error');
        isActivating = false;
        return;
    }

    setLoading(true);

    try {
        const fingerId = await getFingerprint();

        // 调用激活 API
        const data = await callActivationAPI('/plugin-active', fingerId, code);

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
        isActivating = false;
        setLoading(false);
    }
}

// 取消激活
let isCanceling = false;
async function cancelActive() {
    if (isCanceling) return;
    isCanceling = true;
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

        // 直接调用取消激活 API（使用存储的指纹，确保与激活时一致）
        const data = await callActivationAPI('/plugin-unactive', activeInfo.fingerId, activeInfo.code);

        if (data.status === true) {
            // 清除激活信息和缓存的指纹
            await chrome.storage.local.remove(['activeInfo', 'cachedFingerprint']);

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
        isCanceling = false;
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
        const data = await callActivationAPI('/plugin-check-time', activeInfo.fingerId, activeInfo.code);

        if (data.status === true) {
            // 激活有效，更新过期时间（如果有）
            if (data.data) {
                activeInfo.expireTime = data.data;
                await chrome.storage.local.set({ activeInfo: activeInfo });
            }
            return { isActive: true, activeInfo: activeInfo };
        } else {
            // 激活无效或已过期，保留激活码，只标记为未激活
            activeInfo.isActive = false;
            await chrome.storage.local.set({ activeInfo: activeInfo });
            return { isActive: false };
        }
    } catch (error) {
        console.error('获取激活状态失败:', error);
        return { isActive: false };
    }
}

// ===== 多标签执行 =====

// 默认标签启动间隔（秒）
const DEFAULT_STAGGER_SECONDS = 5;

// 与 background 通信（兼容不支持 Promise 的 chrome.runtime.sendMessage）
function sendBgMessage(msg) {
    return new Promise((resolve, reject) => {
        try {
            const ret = chrome.runtime.sendMessage(msg, (resp) => {
                const err = chrome.runtime.lastError;
                if (err) reject(new Error(err.message));
                else resolve(resp);
            });
            // 新版 Chrome 同时返回 Promise，任一路径先到达即可
            if (ret && typeof ret.then === 'function') {
                ret.then(resolve, reject);
            }
        } catch (e) {
            reject(e);
        }
    });
}

// HTML 转义（标签标题来自页面，防止注入）
function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 读取用户设置的错峰间隔（毫秒）
function getStaggerMs() {
    const input = document.getElementById('staggerInput');
    let seconds = parseInt(input && input.value, 10);
    if (isNaN(seconds) || seconds < 0) seconds = DEFAULT_STAGGER_SECONDS;
    return seconds * 1000;
}

// 开始处理：探测所有批量上传标签 → 二次确认 → 通知 background 编排
// action: 'startProcessing' = 立即发布，'startNextDayProcessing' = 次日定时
let isProcessing = false;
async function startProcessing(action = 'startProcessing') {
    if (isProcessing) return;
    isProcessing = true;
    try {
        // 检查激活状态
        const status = await getActivationStatus();
        if (!status.isActive) {
            showMessage('请先激活插件', 'error');
            return;
        }

        // 探测当前所有「批量上传」标签页及其就绪状态
        let tabs = [];
        try {
            tabs = await sendBgMessage({ type: 'probe-tabs' });
        } catch (e) {
            tabs = [];
        }
        if (!tabs || tabs.length === 0) {
            showMessage('未找到批量上传页面标签，请先打开 Facebook 批量上传页面', 'error');
            return;
        }

        // 弹确认框列出将执行的标签（发布不可撤销，必须二次确认）
        const selectedIds = await showStartConfirm(tabs, action);
        if (!selectedIds) return;

        // 获取自定义描述（多标签共用同一份）
        const customDescriptionInput = document.getElementById('customDescriptionInput');
        const customDescription = customDescriptionInput?.value?.trim() || '';

        const resp = await sendBgMessage({
            type: 'start-multi',
            action: action,
            customDescription: customDescription,
            staggerMs: getStaggerMs(),
            tabIds: selectedIds
        });

        if (resp && resp.ok) {
            showMessage(`已向 ${selectedIds.length} 个标签发送启动指令`, 'success');
            renderRunPanel(await sendBgMessage({ type: 'get-run-state' }));
        } else {
            showMessage('启动失败: ' + ((resp && resp.error) || '未知错误'), 'error');
        }

    } catch (error) {
        console.error('启动处理失败:', error);
        showMessage('启动失败: ' + error.message, 'error');
    } finally {
        isProcessing = false;
    }
}

// 启动确认弹层：返回勾选的 tabId 数组，取消返回 null
function showStartConfirm(tabs, action) {
    return new Promise(resolve => {
        const modeText = action === 'startNextDayProcessing' ? '次日定时发布' : '立即发布';
        const readyCount = tabs.filter(t => t.ready).length;

        const listHtml = tabs.map(t => `
            <label class="confirm-tab ${t.ready ? '' : 'confirm-tab-warn'}">
                <input type="checkbox" value="${t.id}" ${t.ready ? 'checked' : ''}>
                <span class="confirm-tab-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
                ${t.ready ? '' : '<span class="confirm-tab-flag">未就绪</span>'}
            </label>`).join('');

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-box">
                <div class="confirm-title">确认执行（${modeText}）</div>
                <div class="confirm-desc">将在以下 <b>${tabs.length}</b> 个标签页中执行（已就绪 ${readyCount} 个）。发布后不可撤销，请确认各标签属于不同主页。</div>
                <div class="confirm-list">${listHtml}</div>
                <div class="confirm-actions">
                    <button class="btn-secondary" data-act="cancel">取消</button>
                    <button class="btn-primary" data-act="ok">确认执行</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const close = (val) => { overlay.remove(); resolve(val); };
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) { close(null); return; }
            const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
            if (act === 'cancel') close(null);
            if (act === 'ok') {
                const ids = Array.from(overlay.querySelectorAll('input[type="checkbox"]:checked'))
                    .map(cb => parseInt(cb.value, 10));
                close(ids.length > 0 ? ids : null);
            }
        });
    });
}

// 运行状态文案
function runStatusText(s) {
    switch (s) {
        case 'pending': return '等待启动';
        case 'launched': return '已启动';
        case 'waiting': return '错峰等待';
        case 'processing': return '处理中';
        case 'progress': return '进行中';
        case 'done': return '已完成';
        case 'error': return '失败';
        default: return s || '-';
    }
}

// 渲染多标签运行状态面板
function renderRunPanel(state) {
    const panel = document.getElementById('runPanel');
    const list = document.getElementById('runList');
    if (!panel || !list) return;
    if (!state || !state.tabs || Object.keys(state.tabs).length === 0) {
        panel.style.display = 'none';
        return;
    }
    panel.style.display = 'block';
    const entries = Object.keys(state.tabs).map(k => state.tabs[k]);
    list.innerHTML = entries.map(t => {
        const icon = t.status === 'done' ? '✅' : (t.status === 'error' ? '❌' : '⏳');
        const progress = (t.status === 'progress' && t.total) ? `（${t.index}/${t.total}）` : '';
        return `<div class="run-item run-${escapeHtml(t.status || '')}">
            <div class="run-item-head">
                <span>${icon}</span>
                <span class="run-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
                <span class="run-status">${runStatusText(t.status)}${progress}</span>
            </div>
            <div class="run-message">${escapeHtml(t.message || '')}</div>
        </div>`;
    }).join('');
}

// 接收 background 推送的运行状态更新
chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'run-state-update') {
        renderRunPanel(msg.state);
    }
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadActiveStatus();

    // 恢复错峰间隔设置
    const staggerInput = document.getElementById('staggerInput');
    if (staggerInput) {
        chrome.storage.local.get(['staggerSeconds'], (result) => {
            if (typeof result.staggerSeconds === 'number') {
                staggerInput.value = result.staggerSeconds;
            }
        });
        staggerInput.addEventListener('change', () => {
            const v = parseInt(staggerInput.value, 10);
            chrome.storage.local.set({ staggerSeconds: isNaN(v) ? DEFAULT_STAGGER_SECONDS : v });
        });
    }

    // 加载上次多标签运行状态
    sendBgMessage({ type: 'get-run-state' })
        .then(renderRunPanel)
        .catch(() => {});

    // 清除运行记录
    const runResetBtn = document.getElementById('runResetBtn');
    if (runResetBtn) {
        runResetBtn.addEventListener('click', () => {
            sendBgMessage({ type: 'reset-run-state' })
                .then(() => renderRunPanel(null))
                .catch(() => {});
        });
    }

    // 自定义描述 textarea 自动高度调整
    const textarea = document.getElementById('customDescriptionInput');
    if (textarea) {
        // 从缓存恢复内容
        chrome.storage.session.get(['cachedCustomDescription'], (result) => {
            if (result.cachedCustomDescription) {
                textarea.value = result.cachedCustomDescription;
                // 触发 input 事件以调整高度
                textarea.dispatchEvent(new Event('input'));
            }
        });

        // 防抖保存：停止输入 500ms 后才保存
        let saveTimeout = null;

        // 监听输入变化，保存到缓存
        textarea.addEventListener('input', function() {
            // 防抖保存
            if (saveTimeout) clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                chrome.storage.session.set({ cachedCustomDescription: this.value });
            }, 500);

            // 重置高度为 auto 以获取正确的 scrollHeight
            this.style.height = 'auto';
            // 设置高度为 scrollHeight，但最多 5 行（约 120px）
            const maxHeight = 120;
            this.style.height = Math.min(this.scrollHeight, maxHeight) + 'px';
        });
    }

    document.getElementById('activeBtn').addEventListener('click', activate);
    document.getElementById('cancelActiveBtn').addEventListener('click', cancelActive);

    // 开始按钮（只在已激活时显示）
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.addEventListener('click', () => startProcessing('startProcessing'));
    }

    // 次日定时发布按钮
    const nextDayBtn = document.getElementById('nextDayBtn');
    if (nextDayBtn) {
        nextDayBtn.addEventListener('click', () => startProcessing('startNextDayProcessing'));
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

