/**
* Configuration singleton
* @module lib/config
*/

const config_singleton = { };

/**
* Get the configuration singleton, initializing it if needed with options and URL parameters
*
* @param {*} options configuration settings defaults
* @returns {Object} the configuration singleton
*/
export
function config(options) {
  if (config_singleton.debug !== undefined) {
    // the object was already initialized
    return config_singleton;
  }

  // default configuration values
  config_singleton.debug = (document
    && document.location
    && document.location.hostname
    && document.location.hostname === 'localhost')
    || window.location.href.startsWith("file:");

    config_singleton.cache = "https://labs.w3.org/github-cache";

    if (options) {
      for (const [key,value] of Object.entries(options)) {
        config_singleton[key]=value;
      }
    }
    // parse the URL to update the config, and override defaults
    for (const [key, value] of (new URL(window.location)).searchParams) {
      config_singleton[key] = value;
    }

    // default values for missing configuration settings
    // here since it does not permit overriding via URL parameters
    config_singleton.cache = "https://labs.w3.org/github-cache";
    config_singleton.w3cAPI = 'https://api.w3.org';

    return config_singleton;
  }

  export default config;
