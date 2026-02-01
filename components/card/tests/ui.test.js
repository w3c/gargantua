import { setupTestEnv } from './test-helper.js';

export async function run(CardContainer) {
    const namespace = 'ui_test_';
    const mountId = setupTestEnv(namespace);
    const dashboard = new CardContainer(mountId, { namespace });

    const card = dashboard.add({
        title: 'Theme Test',
        cacheKey: 'theme-check',
        createValue: () => "UI Data",
        transformValue: (d) => d
    });

    const style = window.getComputedStyle(card.element);
    const hasBg = style.backgroundColor !== "transparent" && style.backgroundColor !== "";
    
    window.testLog(`UI: Computed styles detected (${style.backgroundColor}).`, hasBg ? 'pass' : 'fail');
}