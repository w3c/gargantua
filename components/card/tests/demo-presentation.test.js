import { setupTestEnv } from './test-helper.js';

/**
 * Presentation Demo: Showcases all library features in one view.
 */
export async function run(CardContainer) {
    const namespace = 'demo_app_';
    const mountId = setupTestEnv(namespace);
    
    // Set a short TTL (2 mins) so the Time Warp is easy to demonstrate
    const dashboard = new CardContainer(mountId, { 
        ttl: 2, 
        namespace 
    });

    window.testLog("🎬 Starting Presentation Demo Dashboard...", "info");

    // 1. Weather Card (API Simulation)
    dashboard.add({
        title: 'London Weather',
        cacheKey: 'weather-london',
        createValue: async () => {
            const temps = [18, 19, 21, 20, 22];
            return { temp: temps[Math.floor(Math.random() * temps.length)], city: 'London' };
        },
        transformValue: (data) => `☀️ Current Status: ${data.temp}°C in ${data.city}`
    });

    // 2. System Resource Card (Dynamic Data)
    dashboard.add({
        title: 'Server Load',
        cacheKey: 'system-load',
        createValue: async () => ({ load: (Math.random() * 100).toFixed(1) }),
        transformValue: (data) => {
            const color = data.load > 80 ? 'red' : 'green';
            return `CPU Usage: <strong style="color:${color}">${data.load}%</strong>`;
        }
    });

    // 3. Documentation Link Card
    dashboard.add({
        title: 'GitHub Repository',
        url: 'https://github.com',
        cacheKey: 'repo-link',
        createValue: () => "v1.0.4 - Stable",
        transformValue: (v) => `Current Build: <code>${v}</code>`
    });

    window.testLog("✅ Presentation cards loaded. Use the slider to warp time!", "pass");

    dashboard.destroy();
}