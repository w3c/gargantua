/**
 * DOM utility functions
 * @module lib/dom
 */

/**
 * Convenient function to create a DOM Element
 * If 'attrs' is an object, each property is an element attribute
 *    otherwise, it's a value to append
 * 
 * Examples:
 *  el("li",
 *    el("a", {href: "./index.html"}, "Go to index")
 *   )
 * 
 * @param {string} name The element name
 * @param {object|Element|string} attrs 
 * @param  {Node} content DOM Nodes to append
 * @returns 
 */
export
function e(name, attrs, ...content) {
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

/**
 * A shortcut for document.getElementById
 * 
 * Example:
 *   id("toc")
 * @param {string} string_id the identifier
 * @returns {Element} the DOM Element with that ID
 */
export
function id(string_id) {
    return document.getElementById(string_id);
}
