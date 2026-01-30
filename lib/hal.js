/**
* A generator function to iterate over HAL API resources.
* @module lib/hal
*/

import { e } from './dom.js';
import { json } from './fetch.js';

/**
* A generator function to iterate over HAL API resources.
*
* @param {string|Object} source - The initial API endpoint URL string or a HAL object.
* @param {string} rel - The property name to extract from _embedded or _links.
* @param {Object} [options={}] - Optional settings.
* @param {boolean} [options.embed=false] - Whether to use embedded resources.
* @param {Object} [options.fetch={}] - Custom fetch options.
* @param {Function} [options.adapter] - Optional function to transform each resource.
* @yields {Object} The resources from the HAL API.
*/
export
async function* hal(source, rel, options = {}) {
  if (typeof source === 'object') {
    // already a HAL object
    if (source._links && source._links[rel] && source._links[rel].href) {
        source = source._links[rel].href;
    } else {
      return;
    }
  }
  if (options.embed === true) {
    let apiURL = new URL(source);
    apiURL.searchParams.set("embed", "1"); // grab everything
    source = apiURL;
  }

  while (true) {
    let data = await json(source, options.fetch);
    if (options.embed && data._embedded && data._embedded[rel]) {
      for (const target of data._embedded[rel]) {
        if (options.adapter) {
          yield options.adapter(target);
        } else {
          yield target;
        }
      }
    } else if (Number.isInteger(data.pages) && data._links && data._links[rel]) {
      for (const target of data._links[rel]) {
        if (options.adapter) {
          yield options.adapter(target);
        } else {
          yield target;
        }
      }
    } else if (!Number.isInteger(data.pages)) {
      if (options.adapter) {
        yield options.adapter(data);
      } else {
        yield data;
      }
    }
    
    source = data._links?.next?.href;
    if (!source) {
      return;
    }
  }
}

export default hal;
