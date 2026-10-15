// background.js - 多标签编排（service worker）
//
// 职责：
//   1. 接收 popup 的启动指令，查找所有「批量上传」标签页；
//   2. 逐个探测内容脚本是否就绪（MAIN world 的 content.js 会写 DOM 标记，可跨 world 读取）；
//   3. 向每个标签注入启动消息，并按「错峰延迟」分摊各标签的启动时间；
//   4. 汇总各标签的处理状态（经 bridge.js 转发），写入 chrome.storage.session 并推送给 popup。
//
// 说明：content.js 运行在 MAIN world，无法直接使用 chrome.* API，
// 因此页面 → background 的方向由 bridge.js（ISOLATED world）中转，
// background → 页面的方向用 chrome.scripting.executeScript 注入 postMessage。

var TARGET_URL_PATTERN = '*://business.facebook.com/latest/bulk_upload_composer*';
var RUN_STATE_KEY = 'multiRunState';

// ---------- 运行状态读写 ----------

function getRunState() {
    return chrome.storage.session.get(RUN_STATE_KEY).then(function (result) {
        return result[RUN_STATE_KEY] || null;
    });
}

function saveRunState(state) {
    return chrome.storage.session.set({ multiRunState: state }).then(function () {
        // 推送给已打开的 popup（popup 未打开时静默失败，属正常情况）
        // 用回调形式，兼容不支持 Promise 的旧版 Chrome
        chrome.runtime.sendMessage({ type: 'run-state-update', state: state }, function () {
            void chrome.runtime.lastError;
        });
    });
}

function makeTabEntry(tab) {
    return {
        tabId: tab.id,
        title: tab.title || '(无标题)',
        url: tab.url || '',
        status: 'pending',
        message: '等待启动',
        index: 0,
        total: 0,
        updatedAt: Date.now()
    };
}

// 探测某个标签的主世界内容脚本是否就绪
// content.js 初始化时会把 document.documentElement 打上 data-fb-scheduler-ready 标记，
// DOM 属性在 MAIN / ISOLATED world 之间共享，因此可以跨 world 读取。
function probeTabReady(tabId) {
    return chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: function () {
            return document.documentElement.getAttribute('data-fb-scheduler-ready') === '1';
        }
    }).then(function (results) {
        return !!(results && results[0] && results[0].result);
    }).catch(function () {
        return false;
    });
}

// ---------- 消息入口 ----------

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || !msg.type) return false;

    if (msg.type === 'probe-tabs') {
        chrome.tabs.query({ url: TARGET_URL_PATTERN }).then(function (tabs) {
            var results = [];
            var chain = Promise.resolve();
            tabs.forEach(function (tab) {
                chain = chain.then(function () {
                    if (tab.status !== 'complete') {
                        results.push({ id: tab.id, title: tab.title || '(无标题)', ready: false });
                        return;
                    }
                    return probeTabReady(tab.id).then(function (ready) {
                        results.push({ id: tab.id, title: tab.title || '(无标题)', ready: ready });
                    });
                });
            });
            return chain.then(function () { return results; });
        }).then(sendResponse, function () {
            sendResponse([]); // 查询失败时返回空列表，避免 popup 永久等待
        });
        return true; // 异步响应
    }

    if (msg.type === 'start-multi') {
        startMultiRun(msg).then(function () {
            sendResponse({ ok: true });
        }, function (err) {
            sendResponse({ ok: false, error: (err && err.message) || String(err) });
        });
        return true;
    }

    if (msg.type === 'tab-report') {
        handleTabReport(msg, sender).then(function () {
            sendResponse({ ok: true });
        }, function () {
            sendResponse({ ok: false });
        });
        return true;
    }

    if (msg.type === 'get-run-state') {
        getRunState().then(sendResponse, function () { sendResponse(null); });
        return true;
    }

    if (msg.type === 'reset-run-state') {
        chrome.storage.session.remove(RUN_STATE_KEY).then(function () {
            sendResponse({ ok: true });
        }, function () {
            sendResponse({ ok: false });
        });
        return true;
    }

    return false;
});

// ---------- 核心逻辑 ----------

function startMultiRun(msg) {
    var action = msg.action || 'startProcessing';
    var customDescription = msg.customDescription || '';
    var staggerMs = typeof msg.staggerMs === 'number' ? msg.staggerMs : 60000;
    var tabIds = Array.isArray(msg.tabIds) ? msg.tabIds : null;

    return chrome.tabs.query({ url: TARGET_URL_PATTERN }).then(function (tabs) {
        if (tabIds && tabIds.length > 0) {
            var idSet = {};
            tabIds.forEach(function (id) { idSet[id] = true; });
            tabs = tabs.filter(function (t) { return idSet[t.id]; });
        }

        var state = {
            runId: Date.now(),
            action: action,
            startedAt: Date.now(),
            staggerMs: staggerMs,
            tabs: {}
        };
        tabs.forEach(function (tab) { state.tabs[tab.id] = makeTabEntry(tab); });

        return saveRunState(state).then(function () {
            var chain = Promise.resolve();
            tabs.forEach(function (tab, i) {
                chain = chain.then(function () {
                    return launchTab(state, tab, i, action, customDescription, staggerMs);
                });
            });
            return chain;
        });
    });
}

function launchTab(state, tab, index, action, customDescription, staggerMs) {
    var entry = state.tabs[tab.id];
    var delay = index * staggerMs;

    // 注入前先探测内容脚本是否就绪，避免"假成功"（消息发出去没人接）
    return probeTabReady(tab.id).then(function (ready) {
        if (!ready) {
            entry.status = 'error';
            entry.message = '内容脚本未就绪（页面可能未加载完成，请刷新后重试）';
            entry.updatedAt = Date.now();
            return saveRunState(state);
        }

        // 注入启动消息；startDelay 由页面内的错峰等待逻辑消费，
        // 这样 service worker 只需短暂存活，长延迟不依赖后台定时器。
        return chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: function (act, desc, startDelay) {
                window.postMessage({
                    action: act,
                    source: 'facebook-schedule-helper-popup',
                    customDescription: desc,
                    startDelay: startDelay
                }, '*');
            },
            args: [action, customDescription, delay]
        }).then(function () {
            entry.status = delay > 0 ? 'waiting' : 'launched';
            entry.message = delay > 0
                ? '已注入，' + Math.round(delay / 1000) + ' 秒后启动'
                : '已注入，启动中';
            entry.updatedAt = Date.now();
            return saveRunState(state);
        }).catch(function (e) {
            entry.status = 'error';
            entry.message = '注入失败: ' + ((e && e.message) || String(e));
            entry.updatedAt = Date.now();
            return saveRunState(state);
        });
    });
}

function handleTabReport(msg, sender) {
    var report = msg.report || {};
    var tabId = sender.tab && sender.tab.id;
    if (!tabId) return Promise.resolve();
    // bridge-ready / main-ready 仅用于调试观察，就绪判断以 DOM 标记为准
    if (report.type !== 'status-report') return Promise.resolve();

    return getRunState().then(function (state) {
        if (!state || !state.tabs || !state.tabs[tabId]) return;
        var entry = state.tabs[tabId];
        entry.status = report.status || entry.status;
        if (report.message) entry.message = report.message;
        if (typeof report.index === 'number') entry.index = report.index;
        if (typeof report.total === 'number') entry.total = report.total;
        entry.updatedAt = Date.now();
        return saveRunState(state);
    });
}
