/**
 * format a Date using UTC timezone, "1994-10-11"
 * 
 * @param {Date|string} date 
 * @returns {string}
 */
export
function format(date) {
    // date is a date object or string
    if (typeof date === "string")
        date = new Date(date);
    return date.toISOString().substring(0, 10);
}

/**
 * Format a date in US format using UTC timezone, "Aug 21, 2019"
 * @param {Date|string} date
 * @returns {string} format a Date, "Aug 21, 2019"
 */
export
function formatDate(date) {
    // date is a date object or string
    if (typeof date === "string")
        date = new Date(date);
    const options = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
    return date.toLocaleString('en-US', options);
}
