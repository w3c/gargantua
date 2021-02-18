import jsonquery from './jsonquery.js';

const ATTR_QUERY = "data-query";
const ATTR_IF = "data-if";
const ATTR_FILTER = "data-filter";

let PROCESS_REQUEST = 0;

function pushRequest() {
  PROCESS_REQUEST++;
}

function popRequest(res) {
  PROCESS_REQUEST--;
  if (PROCESS_REQUEST === 0) {
    pub("done");
  }
  return res;
}

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
    pushRequest();
    let replacement = await jsonquery(obj, query).catch(err => {
      pub('warn', `Query /${query}/ failed ${err}`);
      return "${" + query + "}";
    }).then(popRequest());
    if (replacement) {
      if (replacement.nodeType && replacement.nodeType === 1) { // replacement instanceof Element
        if (node) {
          addValue(replacement.cloneNode(true));
        }
      } else {
        addValue(replacement.toString());
      }
    } else {
      pub("warn", `Query /${query}/ returned nothing`);
    }
    start = me + 1;
    ms = text.indexOf('${', start);
  }
  if (start < text.length)
    addValue(text.substring(start));
  return values;
}

function processLeaf(obj, node) {
  pushRequest();
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
  }).catch(err => pub('error', err)).then(popRequest);
}

// identity function as a Promise
const identity = v => v;

function internalrender(obj, node, env) {
  if (node.nodeType === 3) // text node
    processLeaf(obj, node);

  if (node.nodeName === "SCRIPT" || node.nodeName === "STYLE") {
    return;
  }

  pushRequest();

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
          pushRequest();
          content(obj, node.getAttribute(attrname)).then(newtext => {
            if (newtext) {
              node.setAttribute(attrname, newtext[0]);
            }
          }).catch(err => pub('error', err)).then(popRequest);
      }
    }
  }

  if (hasQuery) {
    const query = node.getAttribute(ATTR_QUERY);
    pushRequest();
    jsonquery(obj, query).then(filter).then(subobj => {
      if (!subobj) return subobj; //filterFct returned an empty set
      if (!(subobj instanceof Object))
        // primitive type not expected from a query
        throw new Error(`${JSON.stringify(subobj)} not an Object`)
      if (Array.isArray(subobj)) {
        // @@could get an Array of primitive types
        const docFrag = node.ownerDocument.createDocumentFragment();
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
    }).catch(err => pub('error', err)).then(popRequest);
  } else if (hasIf) {
    const query = node.getAttribute(ATTR_IF);
    const firstBranch = node.firstElementChild;
    const secondBranch = (firstBranch) ? firstBranch.nextElementSibling : undefined;

    if (!firstBranch)
      throw new SyntaxError("missing if branch for " + query);
    pushRequest();
    jsonquery(obj, query).then(filter).then(subobj => {
      if (!subobj) throw new Error("// it's an else")
      // if query successful
      return firstBranch;
    }).catch(err => {
      // if query failed
      return (secondBranch) ? secondBranch : node.ownerDocument.createTextNode(" ");
    }).then(branch => {
      node.parentNode.replaceChild(branch, node);
      internalrender(obj, branch, env);
    }).then(popRequest);
  } else {
    let subobj = filter(obj);
    let subprocess = o => {
      if (node.hasChildNodes()) {
        for (const child of node.childNodes) internalrender(subobj, child, env);
      }
    };
    if (subobj instanceof Promise) {
      pushRequest();
      subobj.then(subprocess).all(popRequest);
    } else {
      subprocess(subobj);
    }
  }
  popRequest();
}

function jsonrender(obj, element, env) {
  if (!env) {
    env = {};
  }
  internalrender(obj, element, env);
}

// from https://github.com/w3c/respec/blob/develop/src/core/pubsubhub.js

const subscriptions = new Map();

function pub(topic, ...data) {
  if (!subscriptions.has(topic)) {
    return; // Nothing to do...
  }
  Array.from(subscriptions.get(topic)).forEach(cb => {
    try {
      cb(...data);
    } catch (err) {
      pub(
        "error",
        `Error when calling function ${cb.name}. See developer console.`
      );
      pub('error', err);
    }
  });
  if (window.parent === window.self) {
    return;
  }
  // If this is an iframe, postMessage parent (used in testing).
  const args = data
    // to structured clonable
    .map(arg => String(JSON.stringify(arg.stack || arg)));
  window.parent.postMessage({ topic, args }, window.parent.location.origin);
}

/**
 * Subscribes to a message type.
 *
 * @param  {string} topic        The topic to subscribe to (e.g., "start-all")
 * @param  {Function} cb         Callback function
 * @param  {Object} [opts]
 * @param  {Boolean} [opts.once] Add prop "once" for single notification.
 * @return {Object}              An object that should be considered opaque,
 *                               used for unsubscribing from messages.
 */
export function sub(topic, cb, opts = { once: false }) {
  if (opts.once) {
    return sub(topic, function wrapper(...args) {
      unsub({ topic, cb: wrapper });
      cb(...args);
    });
  }
  if (subscriptions.has(topic)) {
    subscriptions.get(topic).add(cb);
  } else {
    subscriptions.set(topic, new Set([cb]));
  }
  return { topic, cb };
}
/**
 * Unsubscribe from messages.
 *
 * @param {Object} opaque The object that was returned from calling sub()
 */
export function unsub({ topic, cb }) {
  // opaque is whatever is returned by sub()
  const callbacks = subscriptions.get(topic);
  if (!callbacks || !callbacks.has(cb)) {
    console.warn("Already unsubscribed:", topic, cb);
    return false;
  }
  return callbacks.delete(cb);
}

sub("error", err => {
  console.error(err, err.stack);
});

sub("warn", str => {
  console.warn(str);
});

export { jsonrender as default, sub as subscribe, unsub as unsubscribe };
