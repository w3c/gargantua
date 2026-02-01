import { setupTestEnv } from './test-helper.js';

export async function run(CardContainer) {
    const namespace = 'stress_test_';
    const mountId = setupTestEnv(namespace); // DOM is now empty
    
    const dashboard = new CardContainer(mountId, { ttl: 5, namespace });
    const ITERATIONS = 100;
    
    window.testLog(`STRESS TEST: Spawning and destroying ${ITERATIONS} cards...`);

    for (let i = 0; i < ITERATIONS; i++) {
        const card = dashboard.add({
            title: `Stress Node ${i}`,
            cacheKey: `stress-${i}`,
            createValue: () => `Value ${i}`,
            transformValue: (d) => d
        });

        dashboard.remove(card);
    }

    const remainingElements = document.querySelectorAll('.ui-card').length;
    
    if (remainingElements === 0) {
        window.testLog(`PASSED: ${ITERATIONS} cards cycled. DOM is clean.`, 'pass');
    } else {
        window.testLog(`FAILED: DOM leak detected. ${remainingElements} elements remain.`, 'fail');
    }
    dashboard.destroy();

}