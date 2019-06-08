import LazyPromise from "../lazypromise.js";
import JQ from '../jsonquery.js';

window.document.getElementById("scriptText").textContent =
  window.document.getElementById("script").textContent;

function jqtestr(path, result) {
  promise_test(async () => {
    let o = await JQ(theObject, path);
    result = await result;
    if (result instanceof Object) {
      assert_object_equals(o, result);
    } else {
      assert_equals(o, result);
    }
  }, (path) ? `"${path}" ` : "<same object>");
}

function jqtest(path) {
  promise_test(async () => {
    let o = await JQ(theObject, path);
    assert_equals(true, true);
  }, (path) ? `"${path}" ` : "<same object>");
}

function perror(path, code) {
  promise_test(async t => {
    return promise_rejects(t, code, JQ(theObject, path));
  }, `"${path}" returns ${code.name}`);
}

function referror(path) {
  perror(path, new ReferenceError());
}

function synerror(path) {
  perror(path, new SyntaxError());
}

export { jqtestr, jqtest, referror, synerror }
