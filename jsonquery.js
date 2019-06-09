import LazyPromise from './lazypromise.js';

function parseAccessSign(index, sign) {
  let isign = index.indexOf(sign);
  if (isign > 0 && isign < (index.length - sign.length)) {
    return {
      value: index.substring(isign + sign.length),
      sign: sign
    };
  }
}

function parseAccess(index) {
  const signs = ["!=", "="];
  let ret;
  for (let sign of signs) {
    if (!ret) ret = parseAccessSign(index, sign);
  }
  if (ret) {
    ret.name = index.substring(0, index.indexOf(ret.sign));
  } else {
    ret = { name: index };
  }
  let idx = Number.parseFloat(ret.name);
  ret.arrayIndex = (Number.isInteger(idx)) ? idx : undefined;
  return ret;
}

function parseAccessors(path, fromIndex) {
  let accessors = [];
  let rb = path.indexOf(']', fromIndex);
  while (rb > fromIndex + 1) {
    accessors.push(parseAccess(path.substring(fromIndex + 1, rb)));
    fromIndex = rb + 1;
    if (fromIndex < path.length) {
      if (path.charAt(fromIndex) !== '[')
        throw SyntaxError(`Unexpected token ${path.charAt(fromIndex)}`)
      rb = path.indexOf(']', fromIndex);
    }
  }
  if (rb !== path.length - 1) {
    throw SyntaxError(`Unexpected token ${path.substring(fromIndex)}`)
  }
  return accessors;
}

function parseSubpath(subpath) {
  if (!subpath)
    throw SyntaxError(`Empty token`);
  let propname = subpath;
  let accessors = [];
  let lb = subpath.indexOf('[');
  if (lb >= 0) {
    propname = subpath.substring(0, lb);
    accessors = parseAccessors(subpath, lb);
    if (!accessors.length) // eg subpath="foo[]"
      throw SyntaxError(`Unexpected token ${subpath.charAt(lb + 1)}`)
  }
  if (!propname) // eg subpath="[foo]"
    throw SyntaxError(`Unexpected token [`)
  return { propname: propname, accessors: accessors };
}

function parsePath(path) {
  const subpathSet = path.toString().split('.');
  let tokens = [];
  if (!subpathSet.length) throw SyntaxError("Unexpected empty tokens");
  for (const subpath of subpathSet) {
    tokens.push(parseSubpath(subpath));
  }
  return tokens;
}

async function getProperty(obj, token) {
  if (!obj) return obj;
  let values = [];

  obj = await obj;

  if (!(obj instanceof Object))
    throw ReferenceError(`Expected Object`);

  if (obj.hasOwnProperty(token.propname))
    values = [await obj[token.propname]];
  else if (token.propname === '::self') {
    values = [obj];
  } else if (token.propname === '*') {
    if (obj instanceof Array) {
      for (let v of obj) values.push(await v);
    } else {
      let keys = Object.keys(obj).filter(p => !(p instanceof Function));
      for (let ink of keys) values.push(await obj[ink]);
    }
  }

  if (token.accessors.length) {
    // array values will get updated with new values
    // value entries may be set to undefined
    for (let access of token.accessors) {
      for (let inv = 0; inv < values.length; inv++) {
        let value = values[inv];
        if (access.arrayIndex) {
          values[inv] = (Array.isArray(value)) ? (await value[access.arrayIndex]) : undefined;
        } else {
          if (!value.hasOwnProperty(access.name)) {
            if (access.sign !== '!=')
              values[inv] = undefined;
          } else {
            if (access.value) {
              const v = await value[access.name];
              switch (access.sign) {
                case "=":
                  if (!v.toString().includes(access.value))
                    values[inv] = undefined;
                  break;
                case "!=":
                  if (v.toString().includes(access.value))
                    values[inv] = undefined;
                  break;
                default:
                  throw new Error("Invalid sign (bug report?)");
              }
            }
          }
        }
      }
    }
  }
  return values.filter(v => !(v === undefined || v instanceof Function));
}

/**
 * Given an object, return fully resolved properties (one or more) based on
 * the query
 *
 * @param {Object} obj
 * @param {String} path
 */
async function jsonquery(obj, path) {
  if (!path) return obj;
  const tokens = parsePath(path);
  let values = [obj];
  for (const token of tokens) {
    let nvs = [];
    for (let value of values) {
      nvs = nvs.concat(await getProperty(value, token));
    }
    values = nvs;
  }
  if (values.length === 0) {
    throw new ReferenceError(`${path} is not known`);
  } else if (values.length === 1) {
    return values[0];
  }
  return values;
}

export default jsonquery;
