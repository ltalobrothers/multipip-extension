console.log('[MultiPIP Player] Loading...');

let sourceTabId = null;
let sourceVideoIndex = null;
let captureId = null;
let isRunning = false;
let img = new Image();

document.addEventListener('DOMContentLoaded', () => {
    console.log('[MultiPIP Player] DOM loaded');
    
    const videoCanvas = document.getElementById('videoCanvas');
    const ctx = videoCanvas.getContext('2d');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const closeBtn = document.getElementById('closeBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeIcon = document.getElementById('volumeIcon');
    const videoTitle = document.getElementById('videoTitle');
    const videoStatus = document.getElementById('videoStatus');

    let currentCanvasWidth = 854;
    let currentCanvasHeight = 480;
    videoCanvas.width = currentCanvasWidth;
    videoCanvas.height = currentCanvasHeight;

    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, videoCanvas.width, videoCanvas.height);
    ctx.fillStyle = '#888';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('连接中...', videoCanvas.width / 2, videoCanvas.height / 2);

    const params = new URLSearchParams(window.location.search);
    sourceTabId = parseInt(params.get('tabId'));
    sourceVideoIndex = parseInt(params.get('videoIndex'));
    const title = params.get('title') || '视频';
    captureId = `pip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    videoTitle.textContent = title;
    videoStatus.textContent = '连接中...';

    console.log('[MultiPIP Player] Params:', { sourceTabId, sourceVideoIndex, title, captureId });

    async function init() {
        try {
            videoStatus.textContent = '初始化中...';
            
            const response = await chrome.tabs.sendMessage(sourceTabId, {
                action: 'startCapture',
                captureId: captureId,
                videoIndex: sourceVideoIndex
            });
            
            if (response && response.success) {
                console.log('[MultiPIP Player] Capture started');
                videoStatus.textContent = '已连接';
                isRunning = true;
                startPolling();
            } else {
                console.error('[MultiPIP Player] Failed to start capture:', response);
                videoStatus.textContent = '错误: ' + (response?.error || 'Unknown error');
            }
        } catch (error) {
            console.error('[MultiPIP Player] Init error:', error);
            videoStatus.textContent = '连接失败: ' + error.message;
        }
    }

    async function startPolling() {
        console.log('[MultiPIP Player] Starting polling');
        
        while (isRunning) {
            try {
                const response = await chrome.tabs.sendMessage(sourceTabId, {
                    action: 'getState',
                    captureId: captureId
                });
                
                if (response && response.success && response.state) {
                    updateState(response.state);
                    
                    if (response.state.frame) {
                        renderFrame(response.state.frame);
                    }
                }
            } catch (error) {
                console.warn('[MultiPIP Player] Poll error:', error);
            }
            
            await new Promise(resolve => setTimeout(resolve, 42));
        }
    }

    function renderFrame(dataUrl) {
        try {
            img.onload = () => {
                ctx.drawImage(img, 0, 0, videoCanvas.width, videoCanvas.height);
            };
            img.src = dataUrl;
        } catch (e) {
            console.warn('[MultiPIP Player] Render error:', e);
        }
    }

    function updateState(state) {
        try {
            if (state.canvasWidth !== undefined && state.canvasHeight !== undefined) {
                if (state.canvasWidth !== currentCanvasWidth || state.canvasHeight !== currentCanvasHeight) {
                    currentCanvasWidth = state.canvasWidth;
                    currentCanvasHeight = state.canvasHeight;
                    videoCanvas.width = currentCanvasWidth;
                    videoCanvas.height = currentCanvasHeight;
                    console.log('[MultiPIP Player] Canvas resized to:', currentCanvasWidth, 'x', currentCanvasHeight);
                }
            }
            
            if (state.playing !== undefined) {
                playPauseBtn.textContent = state.playing ? '⏸' : '▶';
                videoStatus.textContent = state.playing ? '播放中' : '已暂停';
            }
            if (state.volume !== undefined) {
                volumeSlider.value = state.volume;
                updateVolumeIcon(state.volume);
            }
        } catch (e) {
            console.warn('[MultiPIP Player] State update error:', e);
        }
    }

    function updateVolumeIcon(volume) {
        if (volume === 0) {
            volumeIcon.textContent = '🔇';
        } else if (volume < 0.5) {
            volumeIcon.textContent = '🔉';
        } else {
            volumeIcon.textContent = '🔊';
        }
    }

    playPauseBtn.addEventListener('click', async () => {
        console.log('[MultiPIP Player] Play/pause clicked');
        try {
            await chrome.tabs.sendMessage(sourceTabId, {
                action: 'togglePlay',
                captureId: captureId
            });
        } catch (error) {
            console.warn('[MultiPIP Player] Toggle play error:', error);
        }
    });

    volumeSlider.addEventListener('input', async (e) => {
        const volume = parseFloat(e.target.value);
        updateVolumeIcon(volume);
        try {
            await chrome.tabs.sendMessage(sourceTabId, {
                action: 'setVolume',
                captureId: captureId,
                volume: volume
            });
        } catch (error) {
            console.warn('[MultiPIP Player] Set volume error:', error);
        }
    });

    videoCanvas.addEventListener('dblclick', () => {
        console.log('[MultiPIP Player] Double clicked');
        toggleFullscreen();
    });

    document.addEventListener('fullscreenchange', () => {
        const controls = document.querySelector('.controls');
        if (document.fullscreenElement) {
            controls.style.display = 'none';
        } else {
            controls.style.display = 'flex';
        }
    });

    closeBtn.addEventListener('click', () => {
        console.log('[MultiPIP Player] Close clicked');
        closeWindow();
    });

    function toggleFullscreen() {
        try {
            const videoContainer = document.getElementById('videoContainer');
            if (!document.fullscreenElement) {
                videoContainer.requestFullscreen().catch((err) => {
                    console.warn('[MultiPIP Player] Fullscreen error:', err);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        } catch (error) {
            console.warn('[MultiPIP Player] Toggle fullscreen error:', error);
        }
    }

    async function closeWindow() {
        isRunning = false;
        try {
            await chrome.tabs.sendMessage(sourceTabId, {
                action: 'stopCapture',
                captureId: captureId
            });
        } catch (error) {
            console.warn('[MultiPIP Player] Stop capture error:', error);
        }
        console.log('[MultiPIP Player] Closing');
        window.close();
    }

    window.addEventListener('beforeunload', async () => {
        console.log('[MultiPIP Player] Before unload');
        isRunning = false;
        try {
            await chrome.tabs.sendMessage(sourceTabId, {
                action: 'stopCapture',
                captureId: captureId
            });
        } catch (error) {
        }
    });

    init();
    console.log('[MultiPIP Player] Setup complete');
});
