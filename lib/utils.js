import { e, id as i } from './dom.js';
import { json, html } from './fetch.js';

export 
const el = e;

export 
const id = i;

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
    && document.location.hostname === 'localhost')
    || window.location.href.startsWith("file:");
  config_singleton.cache = "https://labs.w3.org/github-cache";

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

// format a Date, "Aug 21, 2019"
export
function formatDate(date) {
    // date is a date object or string
    if (typeof date === "string")
        date = new Date(date);
    const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
    return date.toLocaleString('en-US', options);
}
  
// get the url of the actual issue, if there is a § marker
export
function hrLinkTo(issue) {
  let match;
  // get the url of the actual issue, if there is a § marker
  if (issue && issue.body) {
    match = issue.body.match(/§ [^\r\n$]+/g);
    if (match) {
      match = match[0].substring(2).trim().split(' ')[0];
      if (match.indexOf('http') !== 0) {
        match = undefined;
      }
    }
  }
  if (!match) {
    match = issue.html_url;
  }
  return match;
}



export
const fetchJSON = json;

export
const fetchHTML = html;

// for the parameters added to GH URLs
function searchParams(params) {
  if (!params) return "";
  let s = [];
  for (const [key,value] of Object.entries(params)) {
    s.push(`${key}=${value}`);
  }
  return s.join('&');
}

// telemetry for performance monitoring
let TELEMETRY_INIT = false;
function gh_telemetry() {
  if (TELEMETRY_INIT) return;
  TELEMETRY_INIT = true;
  const traceId = (""+Math.random()).substring(2, 18); // for resource correlation
  const rtObserver = new PerformanceObserver(list => {
    const resources = list.getEntries().filter(entry => entry.name.startsWith(config.cache + '/v3/repos')
                                                      || entry.name.startsWith("https://api.github.com/"));
    if (resources.length > 0) {
      navigator.sendBeacon(`${config.cache}/monitor/beacon`, JSON.stringify({ traceId, resources }));
    }
  });
  rtObserver.observe({entryTypes: ["resource"]});
}


/*
 * Grab GitHub data
 */
export
async function ghRequest(url, options) {
  gh_telemetry();
  return fetchJSON(url + '?' + searchParams(options))
    .catch(err => {
      if (err instanceof HttpError) {
        let errorText;
        if (response.status >= 500) {
          errorText = `cache responded with HTTP '${response.status}'. Try again later.`;
        } else {
          errorText = `Unexpected cache response HTTP ${response.status}`;
        }
        const error = { url, options, message: errorText };
        navigator.sendBeacon(`${config.cache}/monitor/beacon`, JSON.stringify({ traceId, error }));
      }
      throw err;
    });
}

