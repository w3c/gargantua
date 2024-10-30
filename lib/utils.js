// format a Date, "Aug 21, 2019"
export
function formatDate(date) {
    // date is a date object
    const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
    return date.toLocaleString('en-US', options);
}
  
// create an element easily
// attrs is object (and optional)
// content is Element or string
function el(name, attrs, ...content) {
  const elt = document.createElement(name);
  const makeChild = c =>(c instanceof Element)?
    c : (typeof c === 'string')?
         document.createTextNode(c) : undefined;

  if (attrs) {
    const c = makeChild(attrs);
    if (c) {
      elt.appendChild(c);
    } else {
      for (const [name, value] of Object.entries(attrs)) {
        elt.setAttribute(name, value);
      }
    }
  }
  for (const child of content) {
    if (child instanceof Element) {
      elt.appendChild(child);
    } else {
      elt.appendChild(document.createTextNode(child));
    }
  }
  return elt;
}

export
function id(string_id) {
    return document.getElementById(string_id);
}
  
// get the url of the actual issue, if there is a § marker
export
function ghLinkTo(issue) {
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
