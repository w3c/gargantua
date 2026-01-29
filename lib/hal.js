/**
 * A generator function to iterate over HAL API resources.
 * @module lib/hal
 */

import { json } from './fetch.js';

/**
 * A generator function to iterate over HAL API resources.
 *
 * @param {string} propertyTarget - The property name to extract from _embedded or _links.
 * @param {string} link - The initial API endpoint URL.
 * @param {Object} [options={}] - Optional settings.
 * @param {boolean} [options.embed=false] - Whether to use embedded resources.
 * @param {Object} [options.fetch={}] - Custom fetch options.
 * @param {Function} [options.adapter] - Optional function to transform each resource.
 * @yields {Object} The resources from the HAL API.
 */
export
async function* hal(propertyTarget, link, options = {}) {
  while (true) {
    let apiURL = new URL(link);
    if (options.embed === true) {
      apiURL.searchParams.set("embed", "1"); // grab everything
    }
    let data = await json(apiURL, options.fetch);
    if (options.embed) {
      for (const target of data._embedded[propertyTarget]) {
        if (options.adapter) {
          yield options.adapter(target);
        } else {
          yield target;
        }
      }
    } else {
      if (data._links[propertyTarget]) {
        for (const target of data._links[propertyTarget]) {
          if (options.adapter) {
            yield options.adapter(target);
          } else {
            yield target;
          }
        }
      }
    }
    if (data.pages && data.pages > 1 && data.page < data.pages) {
      link = data._links.next.href;
    } else {
      return;
    }
  }
}

export default hal;
