/**
 * Standardizes the test environment for all suites.
 */
export const setupTestEnv = (namespace) => {
    const mountId = 'app-root';
    const mountElement = document.getElementById(mountId);
    
    mountElement.innerHTML = '';
    
    // Clear localStorage for this namespace
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith(namespace)) localStorage.removeItem(key);
    });
    
    return mountId;
};