export
class HttpError extends Error {
  constructor(response) {
    super(`${response.status} ${response.statusText} at ${response.url}`);
    this._status = response.status;
    this._statusText = response.statusText;
    this._url = response.url;
  }
  get status() {
    return this._status;
  }
  get statusText() {
    return this._statusText;
  }
  get url() {
    return this._url;
  }
  get name() {
    return 'HttpError';
  }
  get message() {
    return `${this._status} ${this._statusText} at ${this._url}`;
  }
}

/**
 * Fetch a JSON object
 * @param {string} string_url
 * @returns {object}
 * @throws {HttpError} if response is not ok, such as 404
 */
export
async function json(string_url, options) {
  return fetch(string_url, options)
    .then(r => {
      if (!r.ok) {
        throw new HttpError(r);
      }
      return r.json();
    });
}

/**
 * Fetch a HTML document
 * @param {string} string_url
 * @returns {Document}
 * @throws {HttpError} if response is not ok, such as 404
 */
export
async function html(string_url, options) {
  return fetch(string_url, options)
    .then(async (r) => {
      if (!r.ok) {
        throw new HttpError(r);
      }
      return (new DOMParser()).parseFromString((await r.text()), "text/html")
    });
}
