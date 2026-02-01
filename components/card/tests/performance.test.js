import { setupTestEnv } from './test-helper.js';

export async function run(CardContainer) {
    const namespace = 'perf_debug_';
    const mountId = setupTestEnv(namespace);
    const dashboard = new CardContainer(mountId, { ttl: 5, namespace });
    
    const CARD_COUNT = 15;
    const trackedIndices = new Set();
    let totalRefreshes = 0;
    
    window.testLog(`DEBUG: Spawning ${CARD_COUNT} cards and tracking unique resolutions...`);
    
    for (let i = 0; i < CARD_COUNT; i++) {
        dashboard.add({
            title: `Node ${i}`,
            cacheKey: `key-${i}`,
            createValue: async () => {
                totalRefreshes++;
                trackedIndices.add(i); // Track exactly which index resolved
                return `Data ${i}`;
            },
            transformValue: (d) => d
        });
    }
    
    // Polling with detailed error reporting
    const startTime = Date.now();
    const poll = (resolve) => {
        const renderedCount = document.querySelectorAll('.ui-card').length;
        const timedOut = (Date.now() - startTime) > 2500;
        
        if (renderedCount === CARD_COUNT && totalRefreshes === CARD_COUNT) {
            window.testLog(`PASSED: 15/15 successful.`, 'pass');
            dashboard.destroy();
            
            resolve();
        } else if (timedOut) {
            // FIND THE MISSING INDICES
            const missing = [];
            for(let i=0; i<CARD_COUNT; i++) {
                if(!trackedIndices.has(i)) missing.push(i);
            }
            
            window.testLog(`FAILED: Stuck at ${totalRefreshes}/15. Missing indices: ${missing.join(', ')}`, 'fail');
            window.testLog(`HINT: If missing indices are high numbers, your lib.js may have a race condition in its internal registry update.`, 'info');
            dashboard.destroy();
            resolve();
        } else {
            setTimeout(() => poll(resolve), 100);
        }
    };
    
    return new Promise(poll);
}