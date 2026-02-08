/**
 * Format and manipulate dates
 * @module lib/date
 */

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


/**
 * Compute the relative differences between two dates, in years, months, days, hours, minutes and seconds.
 * 
 * @param {Date} d1 first date
 * @param {Date} d2 second date
 * @returns {Object} an object with the differences in years, months, days, hours, minutes and seconds
 */
export
function diffDate(d1, d2) {
    let diff = (d2.getTime() - d1.getTime()) / 1000; // Convert to seconds
    if (diff < 0) { // make it relative
        diff = -diff;
    }

    let years, months, days, hours, minutes, seconds;

    days = Math.floor(diff / (60 * 60 * 24));
    diff -= days * 60 * 60 * 24;
    hours = Math.floor(diff / (60 * 60));
    diff -= hours * 60 * 60;
    minutes = Math.floor(diff / 60);
    diff -= minutes * 60;
    seconds = Math.floor(diff);

    months = Math.floor(days / 30); // good enough approximation
    days -= months * 30;
    years = Math.floor(months / 12);
    months -= years * 12;

    return {
        year: years,
        month: months,
        day: days,
        hour: hours,
        minute: minutes,
        second: seconds
    };
}

/**
 * Compute the relative time from now to a given date, and return a human readable string representing it, e.g. "2 days ago", "in 3 months", "yesterday", "tomorrow", etc.
 * 
 * @param {Date} d the date object
 * @returns {string} the relative time from now, e.g. "2 days ago", "in 3 months", "yesterday", "tomorrow", etc.
 */
export
function fromNow(d) {
    const now = new Date();
    const past = (d.getTime() - now.getTime()) < 0;
    let parts = ['year', 'month', 'day', 'hour', 'minute'];
    const s = (p) => p > 1 ? 's' : '';
    const f = (p) => p > 1 ? p : past ? 'last' : 'next';
    const diff = diffDate(d, now);
    if (diff.hour > 1) {
        parts = parts.slice(0, 4);
    }
    if (diff.day > 1) {
        parts = parts.slice(0, 3);
    }
    if (diff.month > 1) {
        parts = parts.slice(0, 2);
    }
    if (diff.year > 1) {
        parts = parts.slice(0, 1);
    }

    parts.toReversed().forEach((unit) => {
        switch (unit) {
            case 'minute':
                if (diff.second > 30 && diff.minute > 1) {
                    diff.minute += 1;
                    diff.second = 0;
                }
                break;
            case 'hour':
                if (diff.minute > 30 && diff.hour > 1) {
                    diff.hour += 1;
                    diff.minute = 0;
                }
                break;
            case 'day':
                if (diff.hour > 12 && diff.day >= 1) {
                    diff.day += 1;
                    diff.hour = 0;
                }
                break;
            case 'month':
                if (diff.day > 15 && diff.month >= 1) {
                    diff.month += 1;
                    diff.day = 0;
                }
                break;
            case 'year':
                if ((diff.month > 6 || (diff.month === 6 && diff.day > 10)) && diff.year > 1) {
                    diff.year += 1;
                    diff.month = 0;
                }
                break;
        }
    });

    parts = parts.filter((unit) => diff[unit] > 0);

    let text;
    if (parts.length === 1 && parts[0] === 'year') {
        let ydiff = d.getFullYear() - now.getFullYear();
        if (ydiff < 0) {
            ydiff = -ydiff;
        }
        text = `${f(ydiff)} year${s(ydiff)}`;
    } else {
        text = parts.map((unit) => `${f(diff[unit])} ${unit}${s(diff[unit])}`).filter(Boolean).join(', ')
    }
    text = past ? `${text} ago` : `in ${text}`;
    text = ((text) => {
    switch (text) {
        case ' ago':
        case 'in ':
            return 'now';
        case 'last minute ago':
            return 'a minute ago';
        case 'in next minute':
            return 'in a minute';
    }
    if (text.startsWith('in next hour')) {
        if (diff.minute < 27)
            return 'in an hour';
        else
            return `in ${diff.minute+60} minutes`;
    } else if (text.startsWith('last hour')) {
        if (diff.minute < 27)
            return 'an hour ago';
        else
            return `${diff.minute+60} minutes ago`;
    } else if (text.startsWith('in next day')) {
            return 'tomorrow';
    } else if (text.startsWith('last day')) {
            return 'yesterday';
    } else if (text.startsWith('in next month')) {
        return 'next month';
    } else if (text.startsWith('last month')) {
            return 'last month';
    } else if (text.startsWith('in next year')) {
            return 'next year';
    } else if (text.startsWith('last year')) {
            return 'last year';
    }
    return text;
    })(text);

    return text;
}
