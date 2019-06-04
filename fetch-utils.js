import LazyPromise from './lazypromise.js';

// export { fetchGroup, fetchGroups, fetchJSON, fetchW3C, setW3CKey };

// This helps retrieve asynchronously information from the W3C API
// fetchJSON and fetchW3C provide caching mechanisms
// fetchGroups will return a JS object listing all of the W3C Groups
// fetchGroup will return an asynchronous JS object containing information
//   about a given W3C Group
// NOTE: async object means that some object properties are Promise

// used by getW3CData and groupInfo
const W3C_APIURL = "https://api.w3.org/";

let W3C_APIKEY;
function setW3CKey(key) {
  W3C_APIKEY = key.toString();
}

let JSON_CACHE = {};

/**
 * Fetch any JSON data and cache it
 * this is low level since it doesn't cache pagination results
 *
 * @param {String} url
 */
async function fetchJSON(url) {
  const ENTRY = url.toString();
  if (JSON_CACHE[ENTRY]) return JSON_CACHE[ENTRY];
  return JSON_CACHE[ENTRY] = await fetch(url)
    .then(r => {
      if (!r.ok) {
        throw new Error(`GET ${r.url} ${r.status}`);
      }
      return r.text();
    }).then(text => {
      if (text.length > 0) {
        try {
          return JSON.parse(text);
        } catch (orig) {
          let e = new Error(`${ENTRY} has a JSON syntax error`);
          e.url = ENTRY;
          e.error = orig;
          throw e;
        }
      } else {
        let e = new Error(`${ENTRY} is empty`);
        e.url = ENTRY;
        throw e;
      }
    });
}

const FILTERS_REGEXP =
[
  [ new RegExp(`^${W3C_APIURL}groups/[0-9]+$`), "ongroup" ]
];

let HTML_CACHE = {};

/**
 * Fetch any HTML page and cache it
 *
 * @param {String} url
 */
async function fetchHTML(url) {
  const ENTRY = url.toString();
  if (HTML_CACHE[ENTRY]) return HTML_CACHE[ENTRY];
  return HTML_CACHE[ENTRY] = await fetch(url)
    .then(async (r) => (new DOMParser()).parseFromString((await r.text()), "text/html"));
}

// W3C API follows a HAL model. This function creates promises to resolve the links
// going deeper into the API.
function resolveLinks(set, filters) {
  function iter(data) {
    if (data._links) {
//      Object.entries(data._links).filter(e => e[0] !== "self").forEach(e => {
      Object.entries(data._links).filter(e => e[0] !== "self").forEach(e => {
        const key = e[0];
        const obj = e[1];
        Object.keys(obj).forEach(k => {
          const value = obj[k];
          // console.log(k)
          if (k === "href") {
            if (value.indexOf(W3C_APIURL) === 0) {
              // fetch data but keep as a LazyPromise
              data[key] = new LazyPromise(() => fetchW3C(value, filters));
            } else {
              data[key] = value;
            }
          } else {
            data[key + "-" + k] = value;
          }
        });
      });
      if (filters) {
        for (const filter of FILTERS_REGEXP)
          if (data._links.self.href.match(filter[0])) {
            if (filters[filter[1]] && filters[filter[1]] instanceof Function) {
              filters[filter[1]](data);
            }
          }
      }
    }
  }
  if (Array.isArray(set)) {
    set.forEach(iter);
  } else {
    iter(set);
  }
  return set;
}

let API_CACHE = {};

/**
 * Fetch any JSON data from W3C API and cache it
 *
 * @param {String} queryPath
 * @returns {Object}
 */
function fetchW3C(queryPath, filters) {
  const mapper = (set) => resolveLinks(set, filters);
  const ENTRY = queryPath.toString();
  if (API_CACHE[ENTRY]) return API_CACHE[ENTRY];
  if (!W3C_APIKEY) throw new ReferenceError("Missing W3C key. Use setKey")
  const apiURL = new URL(queryPath, W3C_APIURL);
  apiURL.searchParams.set("apikey", W3C_APIKEY);
  apiURL.searchParams.set("embed", "1"); // grab everything
  return API_CACHE[ENTRY] = fetchJSON(apiURL).then(data => {
    if (data.error) return data;
    if (data.pages && data.pages > 1 && data.page < data.pages) {
      return fetchW3C(data._links.next.href, filters).then(nextData => {
        let key = Object.keys(data._embedded)[0];
        let value = data._embedded[key];
        return value.map(mapper).concat(nextData);
      });
    }
    let value;
    if (data._embedded) {
      let key = Object.keys(data._embedded)[0];
      value = data._embedded[key];
      if (value instanceof Array) {
        value = value.map(mapper);
      } else {
        value = mapper(value);
      }
    } else {
      value = mapper(data);
    }
    return value;
  });
}

export { fetchJSON, fetchW3C, fetchHTML, setW3CKey };
