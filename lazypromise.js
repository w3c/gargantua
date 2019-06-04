// @@TODO extend {Promise} would be way better!

class LazyPromise {

  /**
   * Store a Promise using a callback function
   * Use .promise to retrieve the Promise later
   *
   * @param {Function} callback
   */
  constructor(callback) {
    this._callback = callback;
  }
  /**
   * @param {String} text
   */
  set title(text) {
    this.title = text;
  }
  /**
   * @returns {Object}
   */
  get promise() {
    if (!this.value)
      this.value = this._callback();
    while (this.value instanceof LazyPromise) {
      this.value = this.value.promise();
    }
    return this.value;
  }
}

export default LazyPromise;
