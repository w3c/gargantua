/**
 * timeout.js
 * 
 * Utility functions for creating delays and abort signals
 * @module lib/timeout
 */

/**
 * A delay promise that can be aborted
 * 
 * @example
 * await delay(5); // delays for 5 seconds
 * 
 * await delay(10, signal(7)).catch(err => {
 *     console.log('Delay aborted:', err);
 * });
 * @param s number of seconds to delay
 * @param signal an AbortSignal to cancel the delay
 * @returns a Promise that resolves after the delay or rejects if aborted
 */
export
function delay(s = 1, signal = undefined) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, s * 1000);
        if (signal) {
            signal.addEventListener('abort', () => {
                clearTimeout(timer);
                reject(new Error('Aborted'));
            });
        }
    });
}

/**
 * 
 * @param s number of seconds before aborting
 * @returns an AbortSignal that aborts after the specified time
 */
export
function signal(s = 10) { 
    const controller = new AbortController();
    const signal = controller.signal;
    setTimeout(() => controller.abort(), s*1000);
    return signal;
}
