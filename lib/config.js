/**
* Configuration singleton
* @module lib/config
*/

const singleton = { };

export const ENV = (typeof globalThis !== 'undefined') ? globalThis : (typeof window !== 'undefined') ? window : global;
  
export const PLATFORM = (typeof window !== 'undefined') ? 'browser' : (typeof Bun !== 'undefined') ? 'bun' : 'node';

  // default values for missing configuration settings
  // here since it does not permit overriding via URL parameters
export const GITHUB_CACHE = "https://labs.w3.org/github-cache";
export const W3C_API = 'https://api.w3.org';

/**
* Get the configuration singleton, initializing it if needed with options and URL parameters
*
* @param {*} options configuration settings defaults
* @returns {Object} the configuration singleton
*/
export
function config(options) {
  
  if (singleton.debug !== undefined) {
    // the object was already initialized
    return singleton;
  }
  
  // default configuration values
  singleton.debug = (ENV.location?.hostname === 'localhost' || ENV.location?.href?.startsWith("file:") === true);
  
  if (options) {
    for (const [key,value] of Object.entries(options)) {
      singleton[key]=value;
    }
  }
  
  // parse the URL to update the config, and override defaults
  if (PLATFORM === 'browser') {
    for (const [key, value] of (new URL(ENV.location)).searchParams) {
      singleton[key] = value;
    }
  }

  if (PLATFORM === 'bun') {
    singleton.platform = 'bun';
  }


  singleton.host = ENV.location?.hostname 
  || ENV.process?.env?.HOST
  || ((ENV.location?.href?.startsWith("file:") === true) ? "none" : undefined)
  || singleton.host 
  || "localhost";

  singleton.port = ENV.location?.port
  || ENV.process?.env?.PORT
  || singleton.port
  || ((ENV.location?.href?.startsWith("file:") === true) ? "none" : undefined)
  || 8080;

  if (singleton.platform === 'node') {
    singleton.env = process.env["NODE_ENV"] || singleton.env || "dev";
  }
  
  // default values for missing configuration settings
  // here since it does not permit overriding via URL parameters
  singleton.cache = GITHUB_CACHE;
  singleton.w3cAPI = W3C_API;
  
  return singleton;
}

export default config;
