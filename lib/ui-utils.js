/**
* @file ui-utils.js
* @description Utility functions for UI interactions, such as adding export buttons and logging.
* @module lib/ui-utils
*/
import { e } from "./dom.js";

function exportButton(fileName, converter) {
    const button = e('button',
        {
            style: 'z-index: 1000; position: fixed; top: 1rem; right: 1rem; padding: 0.5rem 1.5rem; background-color: #087236; color: white; border: none; border-radius: 0.5rem; cursor: pointer; font-size: 1.1rem;'
        },
        'Save snapshot'
    );
    button.addEventListener('click', () => {
        button.remove(); // remove button before saving
        const html = converter ? converter() : '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
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
* @param {Function} [converter] Optional function to convert the document to a string before saving. If not provided, the current document's outerHTML will be used.
* @returns {void}
* @example
*   import { addExportButton } from "https://www.w3.org/PM/Groups/lib/ui-utils.js";
*   // when you're ready to add the button, use
*   addExportButton("filename", converter);
*/
export
function addExportButton(fileName, converter) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => exportButton(fileName, converter));
    } else {
        exportButton(fileName, converter);
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
*/
function rawlog() {
    function convert(arg) {
        let type = typeof arg;
        let prototype;
        if (type === "object") {
            if (arg === null) {
                type = 'Null';
            } else if (arg instanceof Error) {
                type = 'Error';
            } else {
                type = Object.prototype.toString.call(arg).slice(8, -1);
                if (type === 'Object') {
                    prototype = Object.getPrototypeOf(arg);
                    if (prototype.constructor) {                    
                        type = 'Prototype';
                        prototype = prototype.constructor.name;
                    }
                }
            }
        }
        switch (type) {
            case "Error":
            const stack = arg.stack ? arg.stack : arg.prototype?.stack;
            const trace = stack ? `\nStack trace<\n${stack}>` : '';
            return `${arg.name}: ${arg.message}${trace} ${(arg.cause) ? ' -- Cause: ' + arg.cause.message : ''}`;
            case "DOMException":
            return `${arg.name}: ${arg.message} ${(arg.cause) ? ' -- Cause: ' + arg.cause.message : ''}`;
            case "Object":
            return `Object<${JSON.stringify(arg, null, 2)}>`;
            case "Prototype":
            return `${prototype}<${JSON.stringify(arg, null, 2)}>`;
            case "Date":
            return `Date<${JSON.stringify(arg, null, 2)}>`;
            case "Array":
            return `Array<${arg.length}><${arg.map(convert).join(",\n")}>`;
            case "Set":
            return `Set<${arg.size}><${[...arg].map(convert).join(",\n")}>`;
            case "Map":
            return `Map<${arg.size}><${Array.from(arg).map(([k,v])=> `${k} => ${convert(v)}`).join(",\n")}>`;
            case "symbol":
            return arg.toString();
            case 'string':
            return `"${arg}"`;
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
    return function (level, app, ...args) {
        if (typeof args[0] === 'string' && args[0].length != 0) {
            args = [args[0], ...args.slice(1).map(arg => convert(arg))];
        } else {
            args = args.map(arg => convert(arg));
        }
        if (app) {
            args = [app, ...args];
        }
        if (!promiseLogger) {
            promiseLogger = logElement();
        }
        promiseLogger = promiseLogger.then(log => {
            log.appendChild(document.createTextNode(args.join(" ") + "\n"));
            log.scrollTo(0, 1000);
            return log;
        }).catch(logElement); // in case log element was removed, try to get it again
    }
}

/**
* A simple Logger class that logs to both a fixed log element and the console.
*
* @example
* import { Logger } from "https://www.w3.org/PM/Groups/lib/ui-utils.js";
* const log = (config.debug) ? new Logger('MyApp') : new Logger('', true);
* log.info("This is a log message", someObject, new Error("Something went wrong"));
*/
export class Logger {
    /**
    * Create a new Logger instance.
    * @param {String} name The name of the logger.
    * @param {Boolean} noappend If true, do not append logs to the log element.
    * @param {Boolean} noconsole If true, do not log to the console.
    */
    constructor(name='', noappend=false, noconsole=true) {
        this._name =  (name ? `${name}:` : '');
        if (noappend) {
            this._logFunction = () => {};
        } else {
            this._logFunction = rawlog();
        }
        if (!noconsole) {
            this._console = console;
        } else {
            this._console = null;
        }
    }
    /**
    * Log a message.
    * @param  {...any} args The arguments to log.
    * @return {void}
    */
    log(...args) {
        this._logFunction('log', this._name, ...args);
        if (this._console) {
            this._console.log(this._name, ...args);
        }
    }
    /**
    * Log an info message.
    * @param  {...any} args The arguments to log.
    * @return {void}
    */
    info(...args) {
        this._logFunction('info', this._name, ...args);
        if (this._console) {
            this._console.info(this._name, ...args);
        }
    }
    /**
    * Log a warning message.
    * @param  {...any} args The arguments to log.
    * @return {void}
    */
    warn(...args) {
        this._logFunction('warn', this._name, ...args);
        if (this._console) {
            this._console.warn(this._name, ...args);
        }
    }
    /**
    * Log an error message.
    * @param  {...any} args The arguments to log.
    * @return {void}
    */
    error(...args) {
        this._logFunction('error', this._name, ...args);
        if (this._console) {
            this._console.error(this._name, ...args);
        }
    }
}