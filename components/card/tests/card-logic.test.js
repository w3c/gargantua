import { setupTestEnv } from './test-helper.js';

export async function run(CardContainer) {
    const namespace = 'logic_test_';
    const mountId = setupTestEnv(namespace);
    const dashboard = new CardContainer(mountId, { ttl: 10, namespace });

    // Test Case: Semantic Structure
    const card = dashboard.add({
        title: 'Structure Test',
        cacheKey: 'struct',
        createValue: () => "OK",
        transformValue: (d) => d
    });
    
    const hasH2 = !!card.element.querySelector('h2');
    const hasP = !!card.element.querySelector('p.update-label');

    window.testLog("Logic: HTML Structure verified.", (hasH2 && hasP) ? 'pass' : 'fail');
    dashboard.destroy();

}