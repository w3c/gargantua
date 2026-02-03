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
    
    const hasH2 = !!card.element.querySelector('.card-title');
    const hasContent = !!card.element.querySelector('.card-content');
    const hasP = !!card.element.querySelector('.update-label');
    const hasRefreshBtn = !!card.element.querySelector('.refresh-btn');
    const hasOKContent = !!(hasContent && card.element.querySelector('.card-content').textContent === "OK");

    window.testLog("Logic: HTML Structure verified.", (hasH2 && hasP && hasContent && hasOKContent && hasRefreshBtn) ? 'pass' : 'fail');

    // Test Case: Cache Storage
    await card.refresh(true);
    const storedData = dashboard.config.storage.getItem(`${dashboard.config.namespace}struct`);
    window.testLog("Logic: Cache storage verified.", storedData ? 'pass' : 'fail');

    dashboard.destroy();

}