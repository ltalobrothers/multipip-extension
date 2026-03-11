let videoElements = [];
let activeCaptures = new Map();

console.log('[MultiPIP] Content script loaded');

function scanVideos() {
    console.log('[MultiPIP] Scanning videos...');
    videoElements = [];
    const videos = document.querySelectorAll('video');
    
    videos.forEach((video, index) => {
        videoElements.push({
            element: video,
            title: document.title || `视频 ${index + 1}`,
            status: video.paused ? '暂停' : '播放中',
            isHLS: video.src.includes('.m3u8') || video.currentSrc.includes('.m3u8')
        });
    });

    console.log(`[MultiPIP] Found ${videoElements.length} videos`);
    return videoElements.map((v, i) => ({
        index: i,
        title: v.title,
        status: v.status,
        isHLS: v.isHLS
    }));
}

function startCapture(captureId, videoIndex) {
    console.log('[MultiPIP] Starting capture:', captureId, 'for video:', videoIndex);
    
    if (videoElements.length === 0) {
        scanVideos();
    }
    
    const videoData = videoElements[videoIndex];
    if (!videoData) {
        return { success: false, error: 'Video not found' };
    }
    
    const originalVideo = videoData.element;
    const captureCanvas = document.createElement('canvas');
    const captureCtx = captureCanvas.getContext('2d');
    
    function updateCanvasSize() {
        const videoWidth = originalVideo.videoWidth || 1280;
        const videoHeight = originalVideo.videoHeight || 720;
        const maxWidth = 1280;
        const maxHeight = 720;
        
        let finalWidth = videoWidth;
        let finalHeight = videoHeight;
        
        if (videoWidth > maxWidth || videoHeight > maxHeight) {
            const scale = Math.min(maxWidth / videoWidth, maxHeight / videoHeight);
            finalWidth = Math.round(videoWidth * scale);
            finalHeight = Math.round(videoHeight * scale);
        }
        
        captureCanvas.width = finalWidth;
        captureCanvas.height = finalHeight;
        console.log('[MultiPIP] Canvas size set to:', finalWidth, 'x', finalHeight);
    }
    
    updateCanvasSize();
    originalVideo.addEventListener('loadedmetadata', updateCanvasSize);
    
    let intervalId = null;
    let lastFrameTime = 0;
    const targetFPS = 30;
    const frameInterval = 1000 / targetFPS;
    let lastFrameDataUrl = null;
    let lastCanvasSize = { width: captureCanvas.width, height: captureCanvas.height };
    
    function captureLoop() {
        const now = Date.now();
        
        if (originalVideo && captureCtx && now - lastFrameTime >= frameInterval) {
            try {
                if (captureCanvas.width !== lastCanvasSize.width || captureCanvas.height !== lastCanvasSize.height) {
                    lastCanvasSize = { width: captureCanvas.width, height: captureCanvas.height };
                }
                
                if (!originalVideo.paused && !originalVideo.ended && originalVideo.readyState >= 2) {
                    captureCtx.drawImage(originalVideo, 0, 0, captureCanvas.width, captureCanvas.height);
                    lastFrameDataUrl = captureCanvas.toDataURL('image/jpeg', 0.95);
                    lastFrameTime = now;
                }
            } catch (e) {
                console.warn('[MultiPIP] Capture error:', e);
            }
        }
    }
    
    function getState() {
        return {
            playing: !originalVideo.paused,
            volume: originalVideo.volume,
            frame: lastFrameDataUrl,
            canvasWidth: captureCanvas.width,
            canvasHeight: captureCanvas.height
        };
    }
    
    function togglePlay() {
        if (originalVideo.paused) {
            originalVideo.play().catch(e => console.warn('[MultiPIP] Play error:', e));
        } else {
            originalVideo.pause();
        }
    }
    
    function setVolume(volume) {
        originalVideo.volume = volume;
    }
    
    function cleanup() {
        console.log('[MultiPIP] Cleaning up capture:', captureId);
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
        activeCaptures.delete(captureId);
    }
    
    intervalId = setInterval(captureLoop, 16);
    
    activeCaptures.set(captureId, {
        getState,
        togglePlay,
        setVolume,
        cleanup
    });
    
    return { success: true };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[MultiPIP] Received message:', request.action);
    
    if (request.action === 'scanVideos') {
        const videos = scanVideos();
        sendResponse({ videos });
    } else if (request.action === 'startCapture') {
        const result = startCapture(request.captureId, request.videoIndex);
        sendResponse(result);
    } else if (request.action === 'getState') {
        const capture = activeCaptures.get(request.captureId);
        if (capture) {
            sendResponse({ success: true, state: capture.getState() });
        } else {
            sendResponse({ success: false, error: 'Capture not found' });
        }
    } else if (request.action === 'togglePlay') {
        const capture = activeCaptures.get(request.captureId);
        if (capture) {
            capture.togglePlay();
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Capture not found' });
        }
    } else if (request.action === 'setVolume') {
        const capture = activeCaptures.get(request.captureId);
        if (capture) {
            capture.setVolume(request.volume);
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Capture not found' });
        }
    } else if (request.action === 'stopCapture') {
        const capture = activeCaptures.get(request.captureId);
        if (capture) {
            capture.cleanup();
        }
        sendResponse({ success: true });
    }
});

if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.addedNodes) {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'VIDEO') {
                        scanVideos();
                    }
                });
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}
