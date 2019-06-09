// Lazy Promise
// Don't resolve the Promise unless you have to

const PENDING = "pending";
const FULFILLED = "fulfilled";
const REJECTED = "rejected";

class LazyPromise {

  /**
   * @param {Function} callback
   */
  constructor(callback) {
    if (!(callback && callback instanceof Function))
      throw new ReferenceError("LazyPromise needs a callback");
    this._callback = callback;
    this._state = PENDING;
  }

  _resolve() {
    if (this._state === PENDING) {
      try {
        this._value = this._callback();
        this._state = FULFILLED;
        console.log(this._value)
      } catch (err) {
        this._value = err;
        this._state = REJECTED;
      }
    }

    if (this._state === FULFILLED) {
      return Promise.resolve(this._value);
    } else if (this._state === REJECTED) {
      return Promise.reject(this._value);
    }
  }

  async then(fulfilled, rejected) {
    return this._resolve().then(fulfilled, rejected);
  }

  async catch(rejected) {
    return this.then(undefined, rejected);
  }
}

export default LazyPromise;
