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
 * @param {boolean} embed - Whether to use embedded resources or links.
 * @param {Function} [objFct] - Optional function to transform each resource.
 * @yields {Object} The resources from the HAL API.
 */
export
async function* hal(propertyTarget, link, embed, objFct) {
  while (true) {
    let apiURL = new URL(link);
    if (embed === true) {
      apiURL.searchParams.set("embed", "1"); // grab everything
    }
    let data = await json(apiURL);
    if (embed) {
      for (const target of data._embedded[propertyTarget]) {
        if (objFct) {
          yield objFct(target);
        } else {
          yield target;
        }
      }
    } else {
      if (data._links[propertyTarget]) {
        for (const target of data._links[propertyTarget]) {
          if (objFct) {
            yield objFct(target);
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
