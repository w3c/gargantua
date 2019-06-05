import jsonquery from './jsonquery.js';

const ATTR_QUERY = "data-query";
const ATTR_IF = "data-if";
const ATTR_FILTER = "data-filter";

async function content(obj, text, node) {
  let ms = text.indexOf('${');
  if (ms === -1) {
    return undefined;
  }
  let values = [""];
  const addValue = v => {
    const last = values[values.length-1];
    if (typeof v === "string") {
      if (v.length === 0) return;
      if (typeof last === "string")
        values[values.length-1] = last + v;
      else
        values.push(v);
    } else { // Element!
      if (typeof last === "string" && last.length === 0) {
          values[values.length-1] = v;
      } else {
        values.push(v);
      }
    }
  }
  let start = 0;
  let me;
  while (ms !== -1 && (me = text.indexOf('}', ms + 2)) !== -1) {
    const query = text.substring(ms + 2, me);
    let add;
    addValue(text.substring(start, ms));
    let replacement = await jsonquery(obj, query).catch(err => {
      console.error(err);
      return "${" + query + "}";
    });
    if (replacement) {
      if (replacement instanceof Element) {
        if (node) {
          addValue(replacement.cloneNode(true));
        }
      } else {
        addValue(replacement.toString());
      }
    } else {
      console.warn(`${query} returned nothing`);
    }
    start = me + 1;
    ms = text.indexOf('${', start);
  }
  if (start < text.length)
    addValue(text.substring(start));
  return values;
}

function processLeaf(obj, node) {
  content(obj, node.textContent, node).then(newtext => {
    if (!newtext) return;
    if (newtext.length === 1) {
      let t = newtext[0];
      if (typeof t === "string") {
        node.textContent = t;
      } else {
        node.parentNode.replaceChild(t, node);
      }
    } else {
      const doc = node.ownerDocument;
      const container = doc.createElement("span");
      for (const v of newtext) {
        if (v instanceof Element)
          container.appendChild(v);
        else
          container.appendChild(doc.createTextNode(v));
      }
      node.parentNode.replaceChild(container, node);
    }
  }).catch(console.error);
}

// identity function as a Promise
const identity = v => v;

function internalrender(obj, node, env) {
  if (node.nodeType === 3) // text node
    processLeaf(obj, node);

  if (node.nodeName === "SCRIPT" || node.nodeName === "STYLE") {
    return;
  }


  let filter = identity;
  let hasQuery = false;
  let hasIf = false;
  if (node.getAttributeNames) { // if not a docFrag
    for (const attrname of node.getAttributeNames()) {
      switch (attrname) {
        case ATTR_QUERY:
          hasQuery = true;
          break;
        case ATTR_IF:
          hasIf = true;
          break;
        case ATTR_FILTER: {
          const name = node.getAttribute(ATTR_FILTER);
          if (!env[name])
            throw new ReferenceError(`jsonrender environment is missing ${name}`);
          if (!(env[name] instanceof Function))
            throw new TypeError(`${name} is not a function`);
          filter = env[name];
        }
          break;
        default:
          content(obj, node.getAttribute(attrname)).then(newtext => {
            if (newtext) {
              node.setAttribute(attrname, newtext[0]);
            }
          }).catch(console.error);
      }
    }
  }

  if (hasQuery) {
    const query = node.getAttribute(ATTR_QUERY);
    jsonquery(obj, query).then(filter).then(subobj => {
      if (!subobj) return subobj; //filterFct returned an empty set
      if (!(subobj instanceof Object))
        // primitive type not expected from a query
        throw new Error(`${JSON.stringify(subobj)} not an Object`)
      if (Array.isArray(subobj)) {
        // @@could get an Array of primitive types
        const docFrag = document.createDocumentFragment();
        while (node.hasChildNodes()) {
          docFrag.appendChild(node.firstChild);
        }
        let subtrees = [docFrag];
        const ps = [];
        for (let index = 0; index < subobj.length; index++) {
          const data = subobj[index];
          let df = subtrees[index];
          if (!df) {
            df = docFrag.cloneNode(true);
            subtrees.push(df);
          }
          ps.push(internalrender(data, df, env));
        }
        Promise.all(ps).then(d => {
          for (let idx = 0; idx < subtrees.length; idx++)
            node.appendChild(subtrees[idx]);
        })
      } else {
        for (const child of node.childNodes) {
          internalrender(subobj, child, env);
        }
      }
    }).catch(err => {
      console.error(err);
    });
  } else if (hasIf) {
    const query = node.getAttribute(ATTR_IF);
    const firstBranch = node.firstElementChild;
    const secondBranch = (firstBranch) ? firstBranch.nextElementSibling : undefined;

    if (!firstBranch)
      throw new SyntaxError("missing if branch for " + query);

    jsonquery(obj, query).then(filter).then(subobj => {
      if (!subobj) throw new Error("// it's an else")
      // if query successful
      return firstBranch;
    }).catch(err => {
      // if query failed
      return (secondBranch) ? secondBranch : document.createTextNode(" ");
    }).then(branch => {
      node.parentNode.replaceChild(branch, node);
      internalrender(obj, branch, env);
    });
  } else {
    let subobj = filter(obj);
    let subprocess = o => {
      if (node.hasChildNodes()) {
        for (const child of node.childNodes) internalrender(subobj, child, env);
      }
    };
    if (subobj instanceof Promise)
      subobj.then(subprocess);
    else
      subprocess(subobj);
  }
}

function jsonrender(obj, element, env) {
  if (!env) {
    env = {};
  }
  internalrender(obj, element, env);
}

export default jsonrender;
