import { setupTestEnv } from './test-helper.js';

/**
 * Test Suite: Edge Cases & Resilience
 */
export async function run(CardContainer) {
    const namespace = 'edge_test_';
    const mountId = setupTestEnv(namespace);
    const dashboard = new CardContainer(mountId, { ttl: 5, namespace });

    // 1. Corrupt Cache Recovery
    const corruptKey = `${namespace}corrupt`;
    localStorage.setItem(corruptKey, "!!!INVALID JSON!!!");
    
    try {
        dashboard.add({
            title: 'Recovery Test',
            cacheKey: 'corrupt',
            createValue: () => "Safe Data",
            transformValue: (d) => d
        });
        window.testLog("EDGE: Successfully bypassed corrupted cache data.", "pass");
    } catch (e) {
        window.testLog("EDGE: Crashed on corrupted cache.", "fail");
    }

    // 2. Network/API Rejection
    const errorCard = dashboard.add({
        title: 'API Failure',
        cacheKey: 'fail-key',
        createValue: async () => { throw new Error("404"); },
        transformValue: (d) => d
    });

    await new Promise(r => setTimeout(r, 100));
    
    const content = errorCard.element.querySelector('.card-content').innerText;
    if (content.toLowerCase().includes('fail') || content.toLowerCase().includes('error')) {
        window.testLog("EDGE: API errors handled within card UI.", "pass");
    } else {
        window.testLog("EDGE: API errors not correctly displayed.", "fail");
    }
    dashboard.destroy();
}