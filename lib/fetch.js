/**
* Fetch utility functions
* @module lib/fetch
*/

/**
* An error representing an HTTP error response
*/
export
class FetchError extends Error {
  constructor(status, statusText, url, options) {
    super(`${status} ${statusText} at ${url}`, options);
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.name = 'FetchError';
  }
}

/**
* Fetch a text
* @param {string} string_url the URL to fetch
* @param {Object} [options] fetch options
* @returns {string} the text content
* @throws {FetchError} if response is not ok or fetch fails. See error.cause for details
*/
export
async function text(string_url, options) {
  return fetch(string_url, options)
  .then(r => {
    if (!r.ok) {
      throw new FetchError(r.status, r.statusText, r.url);
    }
    return r.text();
  })
  .catch(err => {
    throw new FetchError(400, "Bad Request", string_url, { cause: err });
  });
}


/**
* Fetch a JSON object
* @param {string} string_url the URL to fetch
* @param {Object} [options] fetch options
* @returns {object} the parsed JSON object
* @throws {FetchError} if response is not ok or fetch fails or JSON is invalid. See error.cause for details
*/
export
async function json(string_url, options) {
  return fetch(string_url, options)
  .then(r => {
    if (!r.ok) {
      throw new FetchError(r.status, r.statusText, r.url);
    }
    return r.json();
  })
  .catch(err => {
    throw new FetchError(400, "Bad Request", string_url, { cause: err });
  });
}

/**
* Fetch a HTML document
* @param {string} string_url the URL to fetch
* @param {Object} [options] fetch options
* @returns {Document} the parsed HTML document
* @throws {FetchError} if response is not ok or fetch fails or HTML is invalid. See error.cause for details
*/
export
async function html(string_url, options) {
  return fetch(string_url, options)
  .then(async (r) => {
    if (!r.ok) {
      throw new FetchError(r.status, r.statusText, r.url);
    }
    return (new DOMParser()).parseFromString((await r.text()), "text/html");
  })
  .catch(err => {
    throw new FetchError(400, "Bad Request", string_url, { cause: err });
  });
}
