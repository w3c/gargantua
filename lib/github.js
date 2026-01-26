import { json } from "./fetch.js";

/**
 * Extract the specification issue from an horizontal issue
 * If not found, it returns issue.html_url
 * 
 * @param {object} issue 
 * @returns {string} url of the linked issue
 */
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
async function github(url, options) {
  gh_telemetry();
  return json(url + '?' + searchParams(options))
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

