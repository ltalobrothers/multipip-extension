let videos = [];
let activeWindows = new Map();

document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scanBtn');
    const videoList = document.getElementById('videoList');
    const statusBar = document.getElementById('statusBar');
    const activeWindowsSection = document.getElementById('activeWindowsSection');
    const activeWindowsList = document.getElementById('activeWindowsList');

    async function refreshActiveWindows() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, { action: 'getActiveWindows' }, (response) => {
                if (response && response.windows) {
                    renderActiveWindows(response.windows);
                }
            });
        } catch (error) {
            console.error('获取活跃窗口失败:', error);
        }
    }

    function renderActiveWindows(windows) {
        const allWindows = [
            ...windows.map(w => ({ ...w, source: 'content' })),
            ...Array.from(activeWindows.entries()).map(([id, w]) => ({ ...w, id, source: 'popup' }))
        ];

        if (allWindows.length === 0) {
            activeWindowsSection.style.display = 'none';
            return;
        }

        activeWindowsSection.style.display = 'block';
        activeWindowsList.innerHTML = allWindows.map((win, index) => `
            <div class="window-item">
                <div class="window-info">
                    <div class="window-indicator"></div>
                    <span class="window-title">${win.title || `视频 ${(win.index || index) + 1}`}</span>
                    <span style="font-size: 10px; color: #667eea; margin-left: 8px;">
                        ${win.source === 'popup' ? '独立窗口' : (win.type === 'native' ? '原生' : '页面内')}
                    </span>
                </div>
                <div class="video-actions">
                    ${win.source === 'popup' ? 
                        `<button class="action-btn" data-window-id="${win.id}" data-action="focus" data-source="popup">聚焦</button>` : 
                        ''}
                    <button class="action-btn" 
                        data-window-index="${win.index}" 
                        data-window-id="${win.id}"
                        data-action="close" 
                        data-source="${win.source}">关闭</button>
                </div>
            </div>
        `).join('');

        document.querySelectorAll('#activeWindowsList .action-btn').forEach(btn => {
            btn.addEventListener('click', handleWindowAction);
        });
    }

    async function handleWindowAction(e) {
        const index = e.target.dataset.windowIndex !== undefined ? parseInt(e.target.dataset.windowIndex) : null;
        const windowId = e.target.dataset.windowId !== undefined ? parseInt(e.target.dataset.windowId) : null;
        const action = e.target.dataset.action;
        const source = e.target.dataset.source;

        try {
            if (source === 'popup') {
                if (action === 'focus') {
                    await chrome.windows.update(windowId, { focused: true });
                    statusBar.textContent = '已聚焦窗口';
                } else if (action === 'close') {
                    await chrome.windows.remove(windowId);
                    activeWindows.delete(windowId);
                    statusBar.textContent = '已关闭窗口';
                }
                refreshActiveWindows();
            } else {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                chrome.tabs.sendMessage(tab.id, { 
                    action: action === 'show' ? 'showWindow' : 'closeWindow', 
                    windowIndex: index 
                }, (response) => {
                    if (response && response.success) {
                        statusBar.textContent = action === 'show' ? '已显示窗口' : '已关闭窗口';
                        refreshActiveWindows();
                    } else {
                        statusBar.textContent = '操作失败';
                    }
                });
            }
        } catch (error) {
            console.error('操作失败:', error);
            statusBar.textContent = '操作失败';
        }
    }

    scanBtn.addEventListener('click', async () => {
        try {
            scanBtn.disabled = true;
            scanBtn.textContent = '扫描中...';
            statusBar.textContent = '正在扫描页面...';

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });

            chrome.tabs.sendMessage(tab.id, { action: 'scanVideos' }, (response) => {
                if (response && response.videos) {
                    videos = response.videos;
                    renderVideoList();
                    refreshActiveWindows();
                    statusBar.textContent = `找到 ${videos.length} 个视频`;
                } else {
                    statusBar.textContent = '未找到视频';
                }
                scanBtn.disabled = false;
                scanBtn.textContent = '扫描当前页面视频';
            });
        } catch (error) {
            console.error('扫描失败:', error);
            statusBar.textContent = '扫描失败，请刷新页面后重试';
            scanBtn.disabled = false;
            scanBtn.textContent = '扫描当前页面视频';
        }
    });

    function renderVideoList() {
        if (videos.length === 0) {
            videoList.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                    </svg>
                    <p>未找到视频元素</p>
                </div>
            `;
            return;
        }

        videoList.innerHTML = videos.map((video, index) => `
            <div class="video-item" data-index="${index}">
                <div class="video-item-header">
                    <div class="video-thumb">
                        视频 ${index + 1}
                    </div>
                    <div class="video-info">
                        <div class="video-title">${video.title || `视频 ${index + 1}`}</div>
                        <div class="video-status">${video.status || '就绪'}</div>
                    </div>
                </div>
                <div class="video-actions">
                    <button class="action-btn" data-index="${index}" data-action="standalone">独立窗口</button>
                </div>
            </div>
        `).join('');

        document.querySelectorAll('.video-item .action-btn').forEach(btn => {
            btn.addEventListener('click', handleAction);
        });
    }

    async function handleAction(e) {
        const index = parseInt(e.target.dataset.index);
        const video = videos[index];

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            await createStandaloneWindow(tab.id, index, video);
        } catch (error) {
            console.error('操作失败:', error);
            statusBar.textContent = '操作失败';
        }
    }

    async function createStandaloneWindow(tabId, videoIndex, video) {
        try {
            const params = new URLSearchParams({
                tabId: tabId,
                videoIndex: videoIndex,
                title: video.title || `视频 ${videoIndex + 1}`
            });

            const window = await chrome.windows.create({
                url: `player.html?${params.toString()}`,
                type: 'popup',
                width: 528,
                height: 320,
                left: 100 + activeWindows.size * 50,
                top: 100 + activeWindows.size * 50,
                focused: true
            });

            activeWindows.set(window.id, {
                id: window.id,
                index: videoIndex,
                title: video.title || `视频 ${videoIndex + 1}`
            });

            statusBar.textContent = '已打开独立窗口（可拖出浏览器！）';
            refreshActiveWindows();
        } catch (error) {
            console.error('创建独立窗口失败:', error);
            statusBar.textContent = '创建独立窗口失败';
        }
    }

    chrome.windows.onRemoved.addListener((windowId) => {
        if (activeWindows.has(windowId)) {
            activeWindows.delete(windowId);
            refreshActiveWindows();
        }
    });

    refreshActiveWindows();
});
