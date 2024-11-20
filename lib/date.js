/**
 * format a Date, "1994-10-11"
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
