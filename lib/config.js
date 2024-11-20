const config_singleton = { };

export
function config(options) {
  if (config_singleton.debug !== undefined) {
    // the object was already initialized
    return config_singleton;
  }

  config_singleton.debug = (document
    && document.location
    && document.location.hostname
    && document.location.hostname === 'localhost');

  if (options) {
    for (const [key,value] of Object.entries(options)) {
      config_singleton[key]=value;
    }
  }
  // parse the URL to update the config
  for (const [key, value] of (new URL(window.location)).searchParams) {
    config_singleton[key] = value;
  }
  return config_singleton;
}

export default config;
