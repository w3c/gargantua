import { setupTestEnv } from './test-helper.js';

/**
 * Executes integration tests on the provided CardContainer implementation.
 * @param {typeof CardContainer} ContainerClass - The library class to test.
 */
export async function run(ContainerClass) {
    // setupTestEnv initializes the DOM and hooks window.testLog
    const namespace = `int_test_`;
    const mountId = setupTestEnv('Integration_Suite');
    
        
        const slowTTL = 10;      // 10 mins
        const fastHeartbeat = 1; // 1 min
        
        // Correctly using mountId and namespace
        const dashboard = new ContainerClass(mountId, { 
            ttl: slowTTL, 
            heartbeat: fastHeartbeat,
            namespace: namespace 
        });

        // Constraint: Math.max(1m, 10m) = 10m
        if (dashboard.config.heartbeat === 10) {
            window.testLog("✅ Heartbeat logic correctly constrained to TTL (10m).", "success");
        } else {
            throw new Error(`Logic fail: Expected 10, got ${dashboard.config.heartbeat}`);
        }

        // --- TEST 2: DOM Node Rendering ---
        window.testLog("Test 2: Verifying DOM Node Support...", "info");
        dashboard.add({
            title: "Node Test",
            cacheKey: "node-key",
            createValue: async () => ({ label: 'Live Node' }),
            transformValue: (data) => {
                const el = document.createElement('div');
                el.id = "target-node";
                el.innerHTML = `<span class="badge">${data.label}</span>`;
                return el;
            }
        });

        await new Promise(r => setTimeout(r, 50));
        
        const node = document.getElementById('target-node');
        if (node && node.closest('.card-content')) {
            window.testLog("✅ transformValue successfully mounted a DOM Node.", "success");
        } else {
            throw new Error("DOM Node was not found inside .card-content.");
        }

        // --- TEST 3: Self-Healing Cache ---
        window.testLog("Test 3: Verifying Self-Healing Cache...", "info");
        const fullKey = `${namespace}corrupt-key`;
        
        // Inject non-JSON string
        localStorage.setItem(fullKey, "MALFORMED_DATA_STREAM");
        
        dashboard.add({
            title: "Healing Test",
            cacheKey: "corrupt-key",
            createValue: async () => "Recovered",
            transformValue: (data) => `<b>${data}</b>`
        });

        await new Promise(r => setTimeout(r, 50));
        const finalCache = localStorage.getItem(fullKey);
        
        if (finalCache && finalCache.includes("Recovered")) {
            window.testLog("✅ Corrupted cache purged and healed with valid data.", "success");
        } else {
            throw new Error("Self-healing failed to overwrite the malformed cache.");
        }

        window.testLog("🏁 Integration Suite Complete.", "success");
        dashboard.destroy();
}
