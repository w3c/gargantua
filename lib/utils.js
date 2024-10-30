
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

// create an element easily
// attrs is object (and optional)
// content is Element or string
export
function el(name, attrs, ...content) {
  const elt = document.createElement(name);
  const makeChild = c =>(c instanceof Element)?
    c : (typeof c === 'string')?
         document.createTextNode(c) : undefined;

  if (attrs) {
    const c = makeChild(attrs);
    if (c) {
      elt.append(c);
    } else {
      for (const [name, value] of Object.entries(attrs)) {
        elt.setAttribute(name, value);
      }
    }
  }
  elt.append(...content);
  return elt;
}

export
function id(string_id) {
    return document.getElementById(string_id);
}
  
// get the url of the actual issue, if there is a § marker
export
function hrLinkTo(issue) {
  // get the url of the actual issue, if there is a § marker
  let match = issue.body.match(/§ [^\r\n$]+/g);
  if (match) {
    match = match[0].substring(2).trim().split(' ')[0];
    if (match.indexOf('http') !== 0) {
      match = undefined;
    }
  }
  if (!match) {
    match = issue.html_url;
  }
  return match;
}

class HttpError extends Error {
  constructor(response) {
    super(`${this.response.status} ${this.response.url}`);
    this.response = response;
  }
  get status() {
    return this.response.status;
  }
  get url() {
    return this.response.url;
  }
}

// throw an error if 404
export
async function fetchJSON(string_url) {
  return fetch(string_url)
    .then(r => {
      if (!r.ok) {
        throw new HttpError(r);
      }
      return r.json();
    });
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

/*
 * Grab GitHub data
 */
export
async function ghRequest(url, options) {
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

// telemetry for performance monitoring
const traceId = (""+Math.random()).substring(2, 18); // for resource correlation
const rtObserver = new PerformanceObserver(list => {
  const resources = list.getEntries().filter(entry => entry.name.startsWith(config.cache + '/v3/repos')
                                                      || entry.name.startsWith("https://api.github.com/"));
  if (resources.length > 0) {
    navigator.sendBeacon(`${config.cache}/monitor/beacon`, JSON.stringify({ traceId, resources }));
  }
});

rtObserver.observe({entryTypes: ["resource"]});
