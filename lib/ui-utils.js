/**
 * @file ui-utils.js
 * @description Utility functions for UI interactions, such as adding export buttons and logging.
 */
import { e } from "./dom.js";

function exportButton(fileName) {
    const button = e('button',
        {
            style: 'z-index: 1000; position: fixed; top: 1rem; right: 1rem; padding: 0.5rem 1.5rem; background-color: #0152a9; color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-size: 1.1rem;'
        },
        'Save snapshot'
    );
    button.addEventListener('click', () => {
        button.remove(); // remove button before saving
        const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
        document.body.append(button); // re-add button after getting HTML
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = e('a', { href: url, download: fileName });
        a.click();
        URL.revokeObjectURL(url);
    });
    
    document.body.append(button);
}

/**
* Add a "Save snapshot" button that saves the current document as an HTML file.
*
* Thanks to https://github.com/sideshowbarker
* https://lists.w3.org/Archives/Team/team-project/2026Jan/0007.html
* 
* @param {String} fileName The name of the file to save, e.g. "snapshot.html"
* @returns {void}
* @example
*   import { addExportButton } from "https://www.w3.org/PM/Groups/lib/ui-utils.js";
*   // when you're ready to add the button, use
*   addExportButton("filename");
*/
export
function addExportButton(fileName) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => exportButton(fileName));
    } else {
        exportButton(fileName);
    }
}

// Promise that resolves to the log element
let promiseLogger = null;

function logElement() {
    return new Promise((resolve, reject) => {
        function presolve() {
            let logElement = document.getElementById('log');
            if (!logElement) {
                logElement = e('pre', { id: 'log', style: 'position: fixed; bottom: 0; left: 0; width: 100%; max-height: 30%; overflow: auto; background-color: rgba(0,0,0,0.8); color: white; font-size: 0.8rem; padding: 0.5rem; z-index: 1000;' });
                document.body.append(logElement);
            }
            resolve(logElement);
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', presolve);
        } else {
            presolve();
        }
    });
}

/**
* A simple logger function that logs to a fixed log element at the bottom of the page.
* 
* @returns Function<...any> The log function
* @example
* import { logger } from "https://www.w3.org/PM/Groups/lib/ui-utils.js";
* const log = (config.debug) ? logger() : () => {};
* log("This is a log message", someObject, new Error("Something went wrong"));
*/
export
function logger() {
    function convert(arg) {
        let type = typeof arg;
        if (type === "object") {
            if (arg === null) {
                type = 'Null';
            } else {
                const proto = Object.prototype?.toString.call(arg).slice(8, -1);
                if (proto) {
                    type = proto;
                } else {
                    type = 'Object';
                }
                if (type.endsWith('Error') && arg.name && arg.message) {
                    type = arg.name;
                }
            }
        }
        switch (type) {
            case "Date":
            return `${type}: ${arg.toISOString()}`;
            case "HttpError":
            return `${type} ${arg.status}: ${arg.statusText} -- ${arg.url}`;
            case "Error":
            return type + ": " + ((arg.cause) ? arg.cause.message : arg.message);
            case "TypeError":
            return `${type}: ${arg.message}`;
            case "CacheError":
            return `${type}: ${arg.message} ${(arg.cause) ? ' -- Cause: ' + arg.cause.message : ''}`;
            case "Object":
            return JSON.stringify(arg, null, 2);
            case "Null":
            return 'null';
            case "undefined":
            return 'undefined';
            default:
            // fall through
            break;
        }
        return arg;
    }
    return function (...args) {
        args = args.map(arg => convert(arg));
        if (!promiseLogger) {
            promiseLogger = logElement();
        }
        promiseLogger = promiseLogger.then(log => {
            log.appendChild(document.createTextNode(args.join(" ") + "\n"));
            log.scrollTo(0, 1000);
            return log;
        });
    }
}
