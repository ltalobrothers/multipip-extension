console.log('[MultiPIP Background] Loading...');

let connections = new Map();

chrome.runtime.onConnect.addListener((port) => {
    console.log('[MultiPIP Background] Port connected:', port.name);
    
    connections.set(port.name, port);
    
    port.onMessage.addListener((msg) => {
        console.log('[MultiPIP Background] Message received:', msg.action, 'from', port.name);
        
        if (msg.action === 'init' && msg.targetPort) {
            const targetPort = connections.get(msg.targetPort);
            if (targetPort) {
                msg.sourcePort = port.name;
                targetPort.postMessage(msg);
            } else {
                port.postMessage({ action: 'error', message: 'Target not found' });
            }
        } else if (msg.targetPort) {
            const targetPort = connections.get(msg.targetPort);
            if (targetPort) {
                msg.sourcePort = port.name;
                targetPort.postMessage(msg);
            }
        }
    });
    
    port.onDisconnect.addListener(() => {
        console.log('[MultiPIP Background] Port disconnected:', port.name);
        connections.delete(port.name);
    });
});

console.log('[MultiPIP Background] Loaded');
