// background.js - 多标签页队列管理 Service Worker

'use strict';

// 标签页队列
let tabQueue = [];
let currentTabIndex = -1;
let isProcessing = false;

// 监听来自 popup 和 content script 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
        case 'scanTabs':
            scanFacebookTabs().then(sendResponse);
            return true; // 异步响应

        case 'startQueue':
            startQueueProcessing();
            sendResponse({ success: true });
            break;

        case 'stopQueue':
            stopQueueProcessing();
            sendResponse({ success: true });
            break;

        case 'tabCompleted':
            handleTabCompleted(sender.tab?.id);
            sendResponse({ success: true });
            break;

        case 'tabError':
            handleTabError(sender.tab?.id, message.error);
            sendResponse({ success: true });
            break;

        case 'getQueueStatus':
            sendResponse({
                tabQueue,
                currentTabIndex,
                isProcessing
            });
            break;
    }
});

// 扫描所有Facebook批量上传页面
async function scanFacebookTabs() {
    try {
        const tabs = await chrome.tabs.query({
            url: "https://business.facebook.com/latest/bulk_upload_composer*"
        });

        tabQueue = tabs.map(tab => ({
            id: tab.id,
            url: tab.url,
            title: tab.title || '未命名页面',
            status: 'pending' // pending, processing, completed, error
        }));

        currentTabIndex = -1;

        // 通知popup更新队列显示
        notifyPopup('queueUpdated', {
            tabQueue,
            currentTabIndex,
            isProcessing
        });

        return { success: true, count: tabQueue.length };
    } catch (error) {
        console.error('扫描标签页失败:', error);
        return { success: false, error: error.message };
    }
}

// 开始处理队列
async function startQueueProcessing() {
    if (isProcessing) {
        console.log('已在处理中，忽略重复请求');
        return;
    }

    if (tabQueue.length === 0) {
        // 先扫描
        await scanFacebookTabs();
    }

    if (tabQueue.length === 0) {
        notifyPopup('error', { message: '未找到Facebook批量上传页面' });
        return;
    }

    isProcessing = true;
    currentTabIndex = -1;

    notifyPopup('processingStarted', {
        tabQueue,
        currentTabIndex,
        isProcessing
    });

    // 开始处理第一个
    processNextTab();
}

// 停止处理队列
function stopQueueProcessing() {
    isProcessing = false;
    currentTabIndex = -1;

    // 重置所有标签页状态
    tabQueue.forEach(tab => {
        tab.status = 'pending';
    });

    notifyPopup('queueUpdated', {
        tabQueue,
        currentTabIndex,
        isProcessing
    });
}

// 处理下一个标签页
async function processNextTab() {
    currentTabIndex++;

    if (currentTabIndex >= tabQueue.length) {
        // 所有标签页处理完成
        isProcessing = false;
        notifyPopup('allCompleted', {
            tabQueue,
            currentTabIndex,
            isProcessing
        });
        return;
    }

    const tabInfo = tabQueue[currentTabIndex];
    tabInfo.status = 'processing';

    notifyPopup('queueUpdated', {
        tabQueue,
        currentTabIndex,
        isProcessing
    });

    try {
        // 切换到目标标签页
        await chrome.tabs.update(tabInfo.id, { active: true });

        // 等待标签页加载完成
        const tab = await chrome.tabs.get(tabInfo.id);

        if (tab.status === 'complete') {
            // 页面已加载，直接触发处理
            triggerTabProcessing(tabInfo.id);
        } else {
            // 等待页面加载完成
            const listener = (tabId, changeInfo) => {
                if (tabId === tabInfo.id && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(listener);
                    triggerTabProcessing(tabInfo.id);
                }
            };
            chrome.tabs.onUpdated.addListener(listener);

            // 超时处理（10秒）
            setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(listener);
                if (tabInfo.status === 'processing') {
                    handleTabError(tabInfo.id, '页面加载超时');
                }
            }, 10000);
        }
    } catch (error) {
        handleTabError(tabInfo.id, error.message);
    }
}

// 触发标签页处理
async function triggerTabProcessing(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
                window.postMessage({
                    action: 'startProcessing',
                    source: 'background'
                }, '*');
            }
        });
    } catch (error) {
        handleTabError(tabId, error.message);
    }
}

// 标签页处理完成
function handleTabCompleted(tabId) {
    if (!tabId) return;

    const tabInfo = tabQueue.find(t => t.id === tabId);
    if (tabInfo) {
        tabInfo.status = 'completed';
        notifyPopup('queueUpdated', {
            tabQueue,
            currentTabIndex,
            isProcessing
        });
    }

    // 处理下一个
    if (isProcessing) {
        // 给页面一点时间稳定
        setTimeout(() => {
            processNextTab();
        }, 1000);
    }
}

// 标签页处理出错
function handleTabError(tabId, error) {
    if (!tabId) return;

    const tabInfo = tabQueue.find(t => t.id === tabId);
    if (tabInfo) {
        tabInfo.status = 'error';
        tabInfo.error = error;
        notifyPopup('queueUpdated', {
            tabQueue,
            currentTabIndex,
            isProcessing
        });
    }

    // 继续处理下一个
    if (isProcessing) {
        setTimeout(() => {
            processNextTab();
        }, 1000);
    }
}

// 通知popup
function notifyPopup(action, data) {
    chrome.runtime.sendMessage({ action, data }).catch(() => {
        // popup未打开时忽略错误
    });
}

// 监听标签页关闭事件
chrome.tabs.onRemoved.addListener((tabId) => {
    const index = tabQueue.findIndex(t => t.id === tabId);
    if (index !== -1) {
        // 如果是当前正在处理的标签页，继续下一个
        if (index === currentTabIndex && isProcessing) {
            tabQueue.splice(index, 1);
            currentTabIndex--; // 因为processNextTab会++
            processNextTab();
        } else {
            tabQueue.splice(index, 1);
            if (index < currentTabIndex) {
                currentTabIndex--;
            }
            notifyPopup('queueUpdated', {
                tabQueue,
                currentTabIndex,
                isProcessing
            });
        }
    }
});

// 安装时初始化
chrome.runtime.onInstalled.addListener(() => {
    console.log('Facebook多标签页处理插件已安装');
});
