// bridge.js - ISOLATED world 消息桥
//
// content.js 运行在 MAIN world，拿不到 chrome.runtime API，
// 因此由本脚本（ISOLATED world，默认 content script 环境）中转：
//   页面（MAIN）--window.postMessage--> 本脚本 --chrome.runtime.sendMessage--> background
//
// 注意：DOM 事件系统在 MAIN / ISOLATED world 之间共享，
// 所以 MAIN world postMessage 的消息可以被本脚本的 window 监听器收到。

(function () {
    'use strict';

    function forward(data) {
        try {
            chrome.runtime.sendMessage({ type: 'tab-report', report: data });
        } catch (e) {
            // 扩展上下文失效（如扩展重载）时忽略
        }
    }

    window.addEventListener('message', function (event) {
        // 只处理本窗口发出的消息，忽略 iframe 等来源
        if (event.source !== window) return;
        var data = event.data;
        if (data && data.source === 'fb-scheduler-main' && data.type) {
            forward(data);
        }
    });

    // 桥就绪上报（便于排查；就绪判断实际以 DOM 标记为准）
    forward({ type: 'bridge-ready' });
})();
