// Facebook 定时发布助手 - Content Script

(function() {
    'use strict';

    // 运行状态标志
    let isProcessing = false;

    // 创建悬浮按钮
    function createFloatingButton() {
        const btn = document.createElement('button');
        btn.className = 'fb-schedule-helper-btn';
        btn.textContent = '开始设置定时发布';
        btn.id = 'fb-schedule-helper-btn';

        // 添加拖动功能（按住1秒后可拖动）
        let pressTimer = null;
        let isDragging = false;
        let canDrag = false;
        let startX = 0;
        let startY = 0;
        let initialX = 0;
        let initialY = 0;
        let hasMoved = false; // 标记是否移动过
        let justDragged = false; // 标记是否刚刚拖动过，用于阻止点击事件

        // 鼠标按下事件
        btn.addEventListener('mousedown', (e) => {
            // 记录初始位置
            startX = e.clientX;
            startY = e.clientY;
            const rect = btn.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            hasMoved = false;

            // 设置1秒定时器
            pressTimer = setTimeout(() => {
            canDrag = true;
            btn.style.cursor = 'move';
            btn.style.opacity = '0.8';
            btn.style.transition = 'none'; // 拖动时禁用过渡
            }, 1000);

            // 在 document 上监听移动和释放事件
            const handleMouseMove = (e) => {
                if (canDrag && (e.buttons === 1 || e.which === 1)) {
                    if (!isDragging) {
                        isDragging = true;
                        btn.style.userSelect = 'none';
                    }

                    hasMoved = true;

                    // 计算移动距离
                    const deltaX = e.clientX - startX;
                    const deltaY = e.clientY - startY;

                    // 更新按钮位置
                    const newX = initialX + deltaX;
                    const newY = initialY + deltaY;

                    // 限制在视窗内
                    const maxX = window.innerWidth - btn.offsetWidth;
                    const maxY = window.innerHeight - btn.offsetHeight;

                    btn.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
                    btn.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
                    btn.style.right = 'auto';
                    btn.style.bottom = 'auto';
                }
            };

            const handleMouseUp = (e) => {
                // 清除定时器
                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }

                // 如果进入拖动模式（canDrag为true）或正在拖动或移动过，标记并阻止点击事件
                if (canDrag || isDragging || hasMoved) {
                    justDragged = true;
                    e.stopPropagation();
                    e.preventDefault();

                    // 延迟重置标志，确保点击事件不会触发
                    setTimeout(() => {
                        justDragged = false;
                    }, 200);
                }

                // 重置状态
                canDrag = false;
                isDragging = false;
                hasMoved = false;
                btn.style.cursor = 'pointer';
                btn.style.opacity = '1';
                btn.style.transition = '';
                btn.style.userSelect = '';

                // 移除 document 上的事件监听
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };

            // 在 document 上添加事件监听
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        // 鼠标离开按钮时也重置
        btn.addEventListener('mouseleave', () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
            if (!isDragging) {
                canDrag = false;
                btn.style.cursor = 'pointer';
                btn.style.opacity = '1';
            }
        });

        // 点击事件处理 - 检查是否刚刚拖动过
        btn.addEventListener('click', (e) => {
            if (justDragged) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            handleStartClick();
        });

        document.body.appendChild(btn);

        // 创建状态提示
        const status = document.createElement('div');
        status.className = 'fb-schedule-helper-status';
        status.id = 'fb-schedule-helper-status';
        document.body.appendChild(status);
    }

    // 创建状态提示（如果不存在）
    function ensureStatusElement() {
        let status = document.getElementById('fb-schedule-helper-status');
        if (!status) {
            status = document.createElement('div');
            status.className = 'fb-schedule-helper-status';
            status.id = 'fb-schedule-helper-status';
            // 确保 body 存在后再添加
            if (document.body) {
                document.body.appendChild(status);
            }
        }
        return status;
    }

    // 显示状态消息
    function showStatus(message, duration = 3000) {
        const status = ensureStatusElement();
        status.textContent = message;
        status.classList.add('show');
        setTimeout(() => {
            status.classList.remove('show');
        }, duration);
    }

    // 触发 React 输入事件 - 使用箭头键调整 spinbutton 值（参考 v1.0 的实现）
    async function triggerReactInput(element, value) {
        if (!element) return false;

        const currentValue = parseInt(element.getAttribute('aria-valuenow')) || 0;
        const target = parseInt(value) || 0;

        if (currentValue === target) return true;

        const maxValue = parseInt(element.getAttribute('aria-valuemax')) || 23;

        // 计算两个方向的步数（考虑循环）
        let upSteps = target > currentValue ? target - currentValue : (maxValue - currentValue) + target + 1;
        let downSteps = target < currentValue ? currentValue - target : currentValue + (maxValue - target) + 1;

        const useUp = upSteps <= downSteps;
        const steps = useUp ? upSteps : downSteps;
        const keyCode = useUp ? 38 : 40;
        const keyName = useUp ? 'ArrowUp' : 'ArrowDown';

        element.focus();
        await sleep(30);

        for (let i = 0; i < steps; i++) {
            element.dispatchEvent(new KeyboardEvent('keydown', {
                key: keyName, keyCode, code: keyName, which: keyCode,
                bubbles: true, cancelable: true
            }));
            element.dispatchEvent(new KeyboardEvent('keyup', {
                key: keyName, keyCode, code: keyName, which: keyCode,
                bubbles: true, cancelable: true
            }));
            if (i < steps - 1) await sleep(15);
        }

        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
        return true;

    }

    // 快速设置 spinbutton 的值（直接设值，不逐次按键）
    async function quickSetSpinbutton(element, value) {
        if (!element) return false;

        const target = parseInt(value) || 0;
        const currentValue = parseInt(element.getAttribute('aria-valuenow')) || 0;
        if (currentValue === target) return true;

        element.focus();
        await sleep(30);

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        )?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(element, String(target));
        } else {
            element.value = String(target);
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));

        console.log(`[quickSetSpinbutton] 直接设值: ${currentValue} → ${target}`);
        return true;
    }

    // 专门处理日期输入框（可能没有有效的 onChange）
    function triggerDateInput(element, value) {
        if (!element) return false;

        // 先点击输入框以打开日期面板
        element.click();

        // 等待一小段时间让日期面板出现
        // 注意：这里不等待，让调用者控制等待时间

        // 设置值 - 使用原生 setter
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        )?.set;

        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(element, value);
        } else {
            element.value = value;
        }

        // 聚焦元素
        element.focus();

        // 尝试获取 React 实例并触发事件
        const reactKey = Object.keys(element).find(key =>
            key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
        );

        // 触发原生事件
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        element.dispatchEvent(inputEvent);

        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        element.dispatchEvent(changeEvent);

        // 如果 React 实例存在，尝试触发 React 事件
        if (reactKey) {
            const reactInstance = element[reactKey];
            if (reactInstance) {
                const props = reactInstance.memoizedProps;

                // 触发 onFocus（使用简化的事件对象，避免 preventDefault 问题）
                if (props && props.onFocus) {
                    try {
                        const focusEvent = {
                            target: element,
                            currentTarget: element,
                            bubbles: true,
                            cancelable: true,
                            defaultPrevented: false,
                            preventDefault: function() {
                                this.defaultPrevented = true;
                            },
                            stopPropagation: function() {},
                            type: 'focus',
                            nativeEvent: new FocusEvent('focus', { bubbles: true })
                        };
                        props.onFocus(focusEvent);
                    } catch (e) {
                        console.log('onFocus 调用失败:', e);
                    }
                }

                // 触发 onChange（如果存在）
                if (props && props.onChange) {
                  try {
                      const syntheticEvent = {
                          target: element,
                          currentTarget: element,
                          bubbles: true,
                          cancelable: true,
                          defaultPrevented: false,
                          nativeEvent: changeEvent,
                          preventDefault: function() {
                              this.defaultPrevented = true;
                          },
                          stopPropagation: function() {},
                          timeStamp: Date.now(),
                          type: 'change'
                      };
                      Object.defineProperty(syntheticEvent.target, 'value', {
                          value: value,
                          writable: true,
                          enumerable: true,
                          configurable: true
                      });
                      props.onChange(syntheticEvent);
                  } catch (e) {
                      console.log('onChange 调用失败:', e);
                  }
                }
            }
        }

        return true;
    }

    // 等待元素出现
    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const element = document.querySelector(selector);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`等待元素超时: ${selector}`));
            }, timeout);
        });
    }

    // 等待一小段时间
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 等待元素从 popup 中出现（比 waitForElement 更快，直接在容器内查找）
    function waitForElementIn(container, selector, timeout = 2000) {
        return new Promise((resolve, reject) => {
            const found = container.querySelector(selector);
            if (found) { resolve(found); return; }

            const observer = new MutationObserver(() => {
                const el = container.querySelector(selector);
                if (el) { observer.disconnect(); resolve(el); }
            });
            observer.observe(container, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); reject(new Error(`等待元素超时: ${selector}`)); }, timeout);
        });
    }

    /**
     * 按文案查找可点击元素（role="button" 或 <button> 或 <a>）
     * 通过文本节点匹配，找到文本直接匹配的最内层可点击元素
     * @param {Element} container - 搜索范围，默认 document
     * @param {string} text - 要匹配的文案
     * @param {object} options - 可选配置
     * @param {boolean} options.excludeBusy - 是否排除 aria-busy="true" 的元素，默认 true
     * @param {string[]} options.extraTexts - 额外匹配的文案（如 ['保存草稿', 'save draft']）
     * @returns {Element|null}
     */
    function findBtnByText(container, text, options = {}) {
        const { excludeBusy = true, extraTexts = [] } = options;
        const searchRoot = container || document;
        const allTexts = [text, ...extraTexts];

        // 检查文本是否匹配（精确匹配）
        const isTextMatch = (t) => {
            if (!t) return false;
            const trimmed = t.trim();
            return allTexts.some(keyword => trimmed === keyword);
        };

        // 向上查找最近的可点击祖先元素
        const findClickableAncestor = (node) => {
            let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
            while (el && el !== searchRoot) {
                const role = el.getAttribute('role');
                const tag = el.tagName.toLowerCase();
                if (role === 'button' || tag === 'button' || tag === 'a' || el.hasAttribute('tabindex')) {
                    if (excludeBusy && el.getAttribute('aria-busy') === 'true') {
                        return null; // 排除 busy 状态
                    }
                    return el;
                }
                el = el.parentElement;
            }
            return null;
        };

        // 使用 TreeWalker 遍历文本节点，找到匹配的最内层可点击元素
        const walker = document.createTreeWalker(
            searchRoot,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        let node;
        while (node = walker.nextNode()) {
            if (isTextMatch(node.textContent)) {
                const clickable = findClickableAncestor(node);
                if (clickable) return clickable;
            }
        }

        return null;
    }

    /**
     * 等待按文案匹配的按钮出现并可用
     * @param {Element} container - 搜索范围
     * @param {string} text - 要匹配的文案
     * @param {number} timeout - 超时时间（ms）
     * @param {object} options - 同 findBtnByText
     * @returns {Promise<Element>}
     */
    function waitForBtnByText(container, text, timeout = 2000, options = {}) {
        return new Promise((resolve, reject) => {
            const check = () => findBtnByText(container, text, options);
            const found = check();
            if (found) { resolve(found); return; }

            const observer = new MutationObserver(() => {
                const btn = check();
                if (btn) { observer.disconnect(); resolve(btn); }
            });
            observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] });
            setTimeout(() => { observer.disconnect(); reject(new Error(`等待按钮"${text}"超时`)); }, timeout);
        });
    }



    // 复制第一行的描述
    async function copyDescription(items, customDescription = ''){

        // 如果有自定义描述，直接使用
        let description = customDescription || null;

        // 如果没有自定义描述，从第一行获取
        if (!description) {
            // 获取第一行的描述，如果存在就复制到其他行
            // 添加重试逻辑，每次等待500ms
            const maxRetries = 5; // 最多重试5次

            for (let retry = 0; retry < maxRetries; retry++) {
                try {
                    let textElement = items[0]?.querySelector('[role="textbox"]');
                    if (textElement && textElement.innerText) {
                        description = textElement.innerText;
                        break;
                    }
                } catch (err) {
                    console.log(`[copyDescription] 获取描述文本失败 (重试 ${retry + 1}/${maxRetries}):`, err);
                }

                if (retry < maxRetries - 1) {
                    await sleep(300); // 等待300ms后重试
                }
            }
        }

        if(!description){
            console.log('[copyDescription] 无法获取描述文本，跳过复制');
            return;
        }

        console.log('[copyDescription] 找到描述文本:', description);

        // 如果有自定义描述，从第一行开始设置；否则从第二行开始（保留第一行原有描述）
        const startIndex = customDescription ? 0 : 1;
        for(let i = startIndex; i < items.length; i++){
            try {
                // 找到当前行的编辑器
                const editor = items[i]?.querySelector('[role="textbox"]');
                if (!editor) {
                    console.log(`[copyDescription] 第 ${i + 1} 行未找到编辑器`);
                    continue;
                }

                // 获取 React Fiber 节点
                let fiber = null;
                for (const k in editor) {
                    if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) {
                        fiber = editor[k];
                        break;
                    }
                }

                if (!fiber) {
                    console.log(`[copyDescription] 第 ${i + 1} 行未找到 Fiber 节点`);
                    continue;
                }

                // 向上查找包含 editorState 和 onChange 的 Fiber
                let found = null;
                for (let j = 0; fiber && j < 20; j++, fiber = fiber.return) {
                    const p = fiber.memoizedProps || {};
                    if (p.editorState && p.onChange) {
                        found = p;
                        break;
                    }
                }

                if (!found) {
                    console.log(`[copyDescription] 第 ${i + 1} 行未找到 editorState`);
                    continue;
                }

                // 使用 Draft.js API 更新内容
                try {
                    const oldState = found.editorState;
                    const content = oldState.getCurrentContent?.();
                    if (!content || !content.constructor) {
                        console.log(`[copyDescription] 第 ${i + 1} 行无法获取 content`);
                        continue;
                    }

                    const newContent = content.constructor.createFromText(description);
                    const newState = oldState.constructor.createWithContent(newContent);
                    found.onChange(newState);

                    // console.log(`[copyDescription] ✅ 第 ${i + 1} 行描述已更新`);
                } catch (err) {
                    console.error(`[copyDescription] ❌ 第 ${i + 1} 行更新失败:`, err);
                }
            } catch (err) {
                console.error(`[copyDescription] 处理第 ${i + 1} 行时出错:`, err);
            }
        }

    }

    // 检查视频项的定时是否设置成功
    // 定时设置成功后，按钮文案从"立即發佈"变为"排定時間"
    function verifyScheduleSet(item, index) {
        // 查找发布按钮（role="button"，含下拉箭头 SVG：M12 6a）
        const publishBtn = Array.from(
            item.querySelectorAll('[role="button"] svg')
        ).find(svg => {
            const path = svg.querySelector('path');
            return path && path.getAttribute('d')?.includes('M12 6a');
        })?.closest('[role="button"]');

        if (!publishBtn) {
            // 找不到按钮，无法判断，视为通过（避免误阻塞）
            return true;
        }

        const btnText = publishBtn.textContent.trim();

        // 设置成功：文案变为"排定時間"
        if (btnText.includes('排定時間') || btnText.includes('排定时间') || btnText.includes('发定时帖') || btnText.includes('Scheduled')) {
            return true;
        }

        // 未设置成功：文案仍为"立即發佈"/"发布"等
        console.warn(`[verifyScheduleSet] ⚠️ 第 ${index + 1} 个视频未设置定时，按钮文案: "${btnText}"`);
        return false;
    }

    // 验证所有视频项的定时状态（第一个除外）
    function verifyAllSchedules(items) {
        const failed = [];
        for (let i = 1; i < items.length; i++) {
            if (!verifyScheduleSet(items[i], i)) {
                failed.push(i + 1); // 记录失败的序号（1-based）
            }
        }
        return failed;
    }

    // 处理单个视频项
    // mode: 'immediate' = 立即发布模式（默认），'nextDay' = 次日定时模式
    async function processVideoItem(item, index, mode = 'immediate') {
        try {
            // 先滚动到当前视频项的位置
            item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(50); // 短暂等待滚动启动

            // 找到定时发布按钮（含下拉箭头 SVG）
            // 箭头 SVG 特征：viewBox="0 0 16 16" 且有 path d 含 "M12 6a"
            const optionBtn = Array.from(
                item.querySelectorAll('[role="button"] svg')
            ).find(svg => {
                const path = svg.querySelector('path');
                return path && path.getAttribute('d')?.includes('M12 6a');
            })?.closest('[role="button"]');

            if (!optionBtn) throw new Error(`第 ${index + 1} 个视频未找到定时发布按钮`);
            optionBtn.click();

            // 等待 popup 出现（事件驱动，不固定等待）
            const popup = await waitForElement('[data-surface] [data-testid="ContextualLayerRoot"]', 3000);

            // 找到 popup 里面的选项
            const optionsGroup = popup.querySelector('[role="group"]');
            if (!optionsGroup || !optionsGroup.children || optionsGroup.children.length < 2) {
                throw new Error(`无法找到发布选项`);
            }

            const options = optionsGroup.children;

            if (mode === 'immediate' && index === 0) {
                // 立即发布模式：第一条立即发布
                options[0].click();
                showStatus(`第 1 个视频：设置为立即发布`, 2000);
            } else {
                // 定时发布（次日模式全部，或立即模式的第2条起）

                // 计算发布时间
                let publishTime;
                if (mode === 'nextDay') {
                    // 次日定时模式：明天的 index 点（0点、1点、2点...）
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(index, 0, 0, 0);
                    publishTime = tomorrow;
                    showStatus(`第 ${index + 1} 个视频：设置为次日 ${index}:00 发布`, 2000);
                } else {
                    // 立即发布模式：当前时间 + index 小时
                    publishTime = new Date(Date.now() + index * 60 * 60 * 1000);
                }

                // 检查发布时间是否满足 Facebook 的 20 分钟要求
                const minPublishTime = new Date(Date.now() + 20 * 60 * 1000);
                if (publishTime < minPublishTime) {
                    const timeStr = `${publishTime.getMonth() + 1}/${publishTime.getDate()} ${publishTime.getHours()}:${String(publishTime.getMinutes()).padStart(2, '0')}`;
                    throw new Error(`第 ${index + 1} 个视频的发布时间 ${timeStr} 不满足 Facebook 的 20 分钟要求，已终止`);
                }

                // 选择定时发布
                options[1].click();

                // 等待输入框出现（事件驱动）
                await waitForElementIn(popup, "input[id*='js_']", 2000);

                // 使用通用选择器查找所有输入框：0-日期，1-小时，2-分钟
                const inputs = popup.querySelectorAll("input[id*='js_']");

                if (inputs.length < 2) {
                    throw new Error(`未找到足够的输入框，找到 ${inputs.length} 个`);
                }

                // 判断是否跨天（使用 getDate 而不是 getDay）
                const currentDate = new Date();
                const isCrossDay = publishTime.getDate() !== currentDate.getDate() ||
                                  publishTime.getMonth() !== currentDate.getMonth() ||
                                  publishTime.getFullYear() !== currentDate.getFullYear();

                if (isCrossDay && inputs.length >= 1) {
                    // 处理日期 - 格式：年-月-日（如 "2026-1-1"）
                    const year = publishTime.getFullYear();
                    const month = publishTime.getMonth() + 1; // 不需要补零
                    const day = publishTime.getDate(); // 不需要补零
                    const dateValue = `${year}-${month}-${day}`;

                    const dateInput = inputs[0]; // 索引 0: 日期
                    if (dateInput) {
                        // 日期输入框使用专门的处理函数（会点击输入框打开日期面板）
                        triggerDateInput(dateInput, dateValue);

                        // 等待日期选中项出现（事件驱动）
                        await sleep(100);
                        try {
                            const selectedItem = document.querySelector('[role="gridcell"][aria-selected="true"]')
                            if (selectedItem) {
                                selectedItem.click();
                            }
                        } catch (e) {
                            console.log('未找到日期选择器的选中项');
                        }
                    }
                }

                // 处理时间（只设置小时，分钟使用 Facebook 默认值）
                const hour = String(publishTime.getHours());

                // 设置小时 - inputs[1]
                if (inputs.length >= 2) {
                    const hourInput = inputs[1]; // 索引 1: 小时
                    if (hourInput) {
                        if (mode === 'nextDay') {
                            await quickSetSpinbutton(hourInput, hour);
                        } else {
                            await triggerReactInput(hourInput, hour);
                        }
                    }
                }
            }

            // 等待更新按钮就绪（事件驱动，不固定等待）
            const updateBtn = await waitForBtnByText(popup, '更新', 2000, {
                extraTexts: ['保存', '儲存', 'update', 'save']
            });

            if (updateBtn) {
                updateBtn.click();
            } else {
                throw new Error('无法找到更新按钮');
            }

            return true;
        } catch (error) {
            console.error(`处理第 ${index + 1} 个视频时出错:`, error);
            showStatus(`第 ${index + 1} 个视频处理失败: ${error.message}`, 3000);
            return false;
        }
    }

    // 主处理函数
    // mode: 'immediate' = 立即发布模式（默认），'nextDay' = 次日定时模式
    async function handleStartClick(mode = 'immediate', customDescription = '') {
        // 如果正在运行，直接返回
        if (isProcessing) {
            return;
        }

        // 检查激活状态
        // const isActive = await checkActivationStatus();
        // if (!isActive) {
        //     showStatus('请先激活插件（点击浏览器扩展图标）', 5000);
        //     return;
        // }

        // 设置运行状态
        isProcessing = true;

        const modeText = mode === 'nextDay' ? '次日定时发布' : '立即发布';
        showStatus(`开始处理（${modeText}模式）...`, 2000);

        try {
            // 找到所有待发布的视频列表
            const items = document.querySelectorAll(".x1g0dm76.xsag5q8.x2lwn1j");

            if (items.length === 0) {
                showStatus('未找到待发布的视频', 3000);
                return;
            }

            showStatus(`找到 ${items.length} 个视频，开始处理...`, 2000);

            //复制第一行的描述
            await copyDescription(items, customDescription);

            // 逐个处理视频
            for (let i = 0; i < items.length; i++) {
                const success = await processVideoItem(items[i], i, mode);
                if (!success) {
                    showStatus(`处理失败，已终止`, 5000);
                    return;
                }
            }

            // ====== 发布前验证：检查定时是否全部设置成功（第一个除外，立即发布模式） ======
            if (mode === 'immediate') {
                const failedItems = verifyAllSchedules(items);
                if (failedItems.length > 0) {
                    const failedList = failedItems.join('、');
                    const msg = `⚠️ 以下视频的定时可能未设置成功：第 ${failedList} 个。请手动检查后再发布！`;
                    showStatus(msg, 8000);
                    console.warn(`[验证失败] ${msg}`);
                    // 不自动发布，让用户手动确认
                    return;
                }
            }

            console.log('[验证通过] 所有视频定时设置正确');

            // 等待发布按钮出现再点击
            const publishBtn = await waitForBtnByText(document, '发布', 5000, {
                extraTexts: ['發佈', '發布', 'Publish', 'Schedule']
            });
            if (publishBtn) {
                publishBtn.click();
            }
            showStatus(`完成！已处理 ${items.length} 个视频`, 5000);

        } catch (error) {
            console.error('处理过程中出错:', error);
            showStatus(`处理失败: ${error.message}`, 5000);
        } finally {
            // 清除运行状态（运行完成或报错中断后都设置为 false）
            isProcessing = false;
        }
    }

    // 监听来自 popup 的消息（通过 postMessage）
    window.addEventListener('message', (event) => {
        // 只处理来自 popup 的消息
        if (event.data && event.data.source === 'facebook-schedule-helper-popup') {
            const customDescription = event.data.customDescription || '';
            if (event.data.action === 'startProcessing') {
                handleStartClick('immediate', customDescription);
            } else if (event.data.action === 'startNextDayProcessing') {
                handleStartClick('nextDay', customDescription);
            }
        }
    });

})();




