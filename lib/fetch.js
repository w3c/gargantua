export
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

/**
 * Fetch a JSON object
 * @param {string} string_url
 * @returns {object}
 * @throws {HttpError} if response is not ok, such as 404
 */
export
async function json(string_url) {
  return fetch(string_url)
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
async function html(string_url) {
  return fetch(string_url)
    .then(async (r) => {
      if (!r.ok) {
        throw new HttpError(r);
      }
      return (new DOMParser()).parseFromString((await r.text()), "text/html")
    });
}
