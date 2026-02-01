import { setupTestEnv } from './test-helper.js';

export async function run(CardContainer) {
    const namespace = 'int_test_';
    const mountId = setupTestEnv(namespace);
    const dashboard = new CardContainer(mountId, { ttl: 5, namespace });

    let apiCalls = 0;
    const card = dashboard.add({
        title: 'Full System Integration',
        cacheKey: 'full-flow',
        createValue: async () => {
            apiCalls++;
            return { val: 100 };
        },
        transformValue: (d) => `Value: ${d.val}`
    });

    // Wait for the async render cycle
    await new Promise(r => setTimeout(r, 100));

    const content = card.element.querySelector('.card-content').innerText;
    const inCache = localStorage.getItem(`${namespace}full-flow`);

    const success = content.includes('100') && inCache !== null && apiCalls === 1;
    window.testLog("Integration: API -> Cache -> DOM flow verified.", success ? 'pass' : 'fail');
}