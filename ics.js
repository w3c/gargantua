// https://datatracker.ietf.org/doc/html/rfc5545#section-3.1
// return an array of content lines
// content line = { name: <string>, params: [ ], value: string }
function contentLines(eventText) {
    const PROPERTY = new RegExp("[A-Z-]+.*:");
    let seq = eventText.split('\r\n');
    const event = {};
    // line "folding" technique
    for (let index = seq.length -1; index >= 0; index--) {
        const line = seq[index];
        // https://datatracker.ietf.org/doc/html/rfc5234#appendix-B.1
        // WSP            =  SP / HTAB
        if (line.startsWith(' ') || line.startsWith('\t')) {
            if ((index-1) >= 0) {
              seq[index-1] = seq[index-1] + seq[index].substring(1);
              seq[index] = undefined;
            }
        }
    }
    // remove lines that have been folded
    seq = seq.filter(l => l != undefined);
    if (seq[seq.length-1] === '') {
      seq.pop(); // remove an empty line at the end
    }

    // contentline   = name *(";" param ) ":" value CRLF
    // param         = param-name "=" param-value *("," param-value)
    return seq.map(line => {
        const NAME = /[A-Za-z0-9-]+/;
        let name = line.match(NAME);
        if (name) {
            name = name[0].toLowerCase();
        } else {
            throw new Error(`Can't find name in ${line}`);
        }
        line = line.substring(name.length);
        let params = [];
        while (line.charAt(0) === ';') {
            line = line.substring(1);
            let paramName = line.match(NAME);
            if (paramName) {
                paramName = paramName[0].toLowerCase();
            } else {
                throw new Error(`Can't find paramName in ${line}`);
            }
            if (line.charAt(paramName.length) !== '=') {
                console.error(line);
                throw new Error(`Expected '=', got ${line.charAt(paramName.length)}`)
            }
            // param-value   = paramtext / quoted-string
            let begin = paramName.length+1;
            let paramValues = [];
            let hasValue = true;
            let end = begin+1;
            while (hasValue) {
                if (line.charAt(begin) === '"') {
                    // quoted-string
                    begin++;
                    end = begin+1;
                    while (line.charAt(end) !== '"') {
                        end++;
                        if (end === line.length) {
                            throw new Error('EOL unexpected while parsing a quoted string');
                        }
                    }
                    paramValues.push(line.substring(begin+1, end));
                    end++;
                } else {
                    let char = line.charAt(end);
                    while (char !== ':' && char !== ',' && char !== ';') {
                        end++;
                        if (end === line.length) {
                            throw new Error('EOL unexpected while parsing paramtext');
                        }
                        char = line.charAt(end);
                    }
                    paramValues.push(line.substring(begin, end));
                }
                if (line.charAt(end) !== ',') {
                    hasValue = false;
                    begin = end;
                } else {
                    begin = end+1;
                }
                end=begin+1;
            }

            if (paramValues.length === 1) {
                paramValues = paramValues[0];
            }
            params.push([paramName, paramValues]);
            line = line.substring(begin);
        }
        if (line.charAt(0) !== ':') {
            console.error(line);
            throw new Error(`Expected ';', got ${line.charAt(0)}`)
        }
        return {
            name: name,
            params: params,
            value: line.substring(1)
        }
    });
}

function components(contentLines) {
    let components = [];
    let cursor = 0;
    let currentLine = undefined;
    function nextline() {
        currentLine = contentLines[cursor++];
        return currentLine;
    }
    function component() {
        const comp = {};
        const props = [];
        const components = [];
        if (currentLine.name != 'begin') {
            console.log(currentLine)
            throw new Error(`Expect content line begin got ${currentLine.name}`);
        }
        comp.name = currentLine.value;
        while (nextline().name != 'end') {
            if (currentLine.name === 'begin') {
                components.push(component());
            } else {
                if (!currentLine.params.length) {
                    delete currentLine.params;
                }
                props.push(currentLine);
            }
        }
        if (currentLine.value != comp.name) {
            console.log(currentLine)
            throw new Error(`Expect content line end with ${comp.name} got ${currentLine.value}`);
        }
        if (props.length) {
            comp.props = props;
        }
        if (components.length) {
            comp.components = components;
        }
        return comp;
    }
    nextline();
    return component();
}

function text2date(text) {
    return text.substring(0, 4) + '-' +
                text.substring(4, 6) + '-' +
                text.substring(6, 8) + 'T' +
                text.substring(9, 11) + ':' +
                text.substring(11, 13) + ':' +
                text.substring(13, 15);
}

function times(component) {
    const obj = {};
    component.props.forEach(p => {
        const name = p.name;
        switch (name) {
            case 'tzname':
            case 'tzoffsetto':
            case 'tzoffsetfrom':
                obj[name] = p.value;
            break;
            case 'dtstart':
                obj[name] = text2date(p.value);
            break;
            default:
                if (obj[name]) throw new Error(`Duplicate ${name} entry`)
                obj[name] = p;
                break;
        }
    })

    return obj;
}

function VTIMEZONE(vcalendar, component) {
    const obj = {};
    component.props.forEach(p => {
        if (obj[p.name]) throw new Error(`Duplicate ${name} entry for ${component.name}`);
        obj[p.name] = p.value;
    });

    function sortTZ(t1, t2) {
        const d1 = t1.dtstart,
         d2 = t2.dtstart;
        if (d1 < d2) return -1;
        if (d1 > d2) return 1;
        return 0;
    }

    obj.times = component.components.filter(c => c.name === 'STANDARD'
        || c.name === 'DAYLIGHT')
      .map(c => times(c)).sort(sortTZ);
    const others = component.components.filter(c => c.name !== 'STANDARD'
        && c.name !== 'DAYLIGHT'
    );
    if (others.length) {
        obj.unknown = others;
    }
    return obj;
}

function findOffset(vcalendar, tzid, dt) {
    if (!vcalendar.timezones[tzid]) {
        throw new Error(`Unknown timezone ${tzid}`);
    }
    let current = undefined;
    for (let index = 0; index < vcalendar.timezones[tzid].times.length; index++) {
        const time = vcalendar.timezones[tzid].times[index];
        if (dt > time.dtstart) {
            current = time;
        }
    }
    if (!current) {
        console.log(vcalendar.timezones[tzid]);
    }
    return current.tzoffsetto;
}

function RECUR(vcalendar, params, text) {
    const parts = text.split(';').map(r => r.split('='));
    const ruleParts = {
        interval: 1
    };
    let offset = "Z";
    if (params && params[0][0] === 'tzid') {
        offset = findOffset(vcalendar, params[0][1], dt);
    } 
    for (let index = 0; index < parts.length; index++) {
        const part = parts[index];
        const name = part[0].toLowerCase();
        const value = part[1];
        switch (name) {
            case 'freq':
                //      freq        = "SECONDLY" / "MINUTELY" / "HOURLY" / "DAILY"
                //                    / "WEEKLY" / "MONTHLY" / "YEARLY"
                ruleParts[name] = value.toLowerCase();
            break;
            case 'until':
                ruleParts[name] = text2date(value) + offset;
            break;
            case 'count':
            case 'interval':
                ruleParts[name] = parseInt(value);
            break;
            case 'bysecond':
                ruleParts[name] = parseInt(value);
                break;
            case 'byminute':
                ruleParts[name] = parseInt(value);
                break;
            case 'byhour':
                ruleParts[name] = parseInt(value);
                break;
            case 'byday':
                ruleParts[name] = value.toLowerCase();
                break;
            case 'bymonthday':
                ruleParts[name] = parseInt(value);
                break;
            case 'byyearday':
                ruleParts[name] = parseInt(value);
                break;
            case 'byweekno':
                ruleParts[name] = parseInt(value);
                break;
            case 'bymonth':
                ruleParts[name] = parseInt(value);
                break;
            case 'bysetpos':
                ruleParts[name] = parseInt(value);
                break;
            case 'count':
                ruleParts[name] = parseInt(value);
            break;
            case 'wkst':
                // weekday     = "SU" / "MO" / "TU" / "WE" / "TH" / "FR" / "SA"
                ruleParts[name] = value.toLowerCase();
            break;
            default:
                ruleParts[name] = value;
            break;
        }
    }
    return ruleParts;
}


function VEVENT(vcalendar, component) {
    const vevent = {};
    component.props.forEach(p => {
        const name = p.name;
        const value = p.value;
        const params = p.params;
        switch (name) {
            case 'uid':
            case 'recurrence-id':
            case 'description':
            case 'status':
            case 'location':
                vevent[name] = value;
            break;
            case 'sequence':
                vevent[name] = parseInt(value);
            break;
            case 'categories':
                vevent[name] = value.split(',');
            break;
            case 'summary':
                vevent[name] = value.replaceAll('\\', '');
            break;
            case 'dtstart':
            case 'dtend':
                let offset = "+0000";
                let dt = text2date(value);
                if (params && params[0][0] === 'tzid') {
                    vevent.tzid = params[0][1];
                    offset = findOffset(vcalendar, vevent.tzid, dt);
                }
                vevent[name] = text2date(value) + offset;
            break;
            case 'dtstamp':
            case 'created':
            case 'last-modified':
                if (value.indexOf('Z') != value.length-1) {
                    throw new Error(`Unexpected timezone for ${name}`);
                }
                vevent[name] = text2date(value) + '+0000';
            break;
            case 'attendee':
            case 'organizer':
                const pp = {};
                const oneOrMore = name + 's';
                if (!vevent[oneOrMore]) {
                    vevent[oneOrMore] = [];
                }
                if (value.startsWith('mailto:')) {
                    pp.mailto = value.substring(7);
                } else {
                    pp.value = value;
                }
                params.forEach(p => pp[p[0]] = p[1]);
                if (pp.rsvp) {
                    pp.rsvp = !(pp.rsvp === 'FALSE');
                }
                vevent[oneOrMore].push(pp);
            break;
            case 'related-to':
                if (!vevent[name]) {
                    vevent[name] = [];
                }
                vevent[name].push(value);
            break;
            case 'rrule':
                vevent[name] = RECUR(vcalendar, params, value);
            break;
            default:
                if (vevent[name]) throw new Error(`Duplicate ${name} entry`)
                vevent[name] = p;
                break;
        }
    })
    // adjust properties
    
    if (vevent.uid === undefined)
        throw new Error('No UID in event');

    vevent.html_url = `https://www.w3.org/events/meetings/${vevent.uid}/`;
    if (vevent['recurrence-id']) {
        vevent.html_url += `${vevent['recurrence-id']}/`;
    }
    const descr = vevent.html_url + "\\n\\n";
    if (vevent.description.startsWith(descr)) {
        vevent.description = vevent.description.substring(descr.length);
    } else {
        console.log(component);
        throw new Error(`Missing W3C URL in description ${vevent.html_url}`);
    }
    const agenda_url_descr = '\\n\\nAgenda: ';
    let index = vevent.description.indexOf(agenda_url_descr);
    if (index != -1) {
        let index2 = vevent.description.indexOf('\\', index+agenda_url_descr.length);
        if (index2 === -1) index2 = vevent.description.length;
        vevent.agenda_url = vevent.description.substring(index+agenda_url_descr.length, index2);
        if (!vevent.agenda_url.match(/^https?:\/\//)) {
            console.log(vevent.description);
            throw new Error(`Invalid URL ${vevent.agenda_url} for agenda in ${vevent.html_url}`)
        }
        if (index != 0) {
            vevent.description = vevent.description.substring(0, index)
              + vevent.description.substring(index2);
        } else {
            vevent.description = vevent.description.substring(index2);
        }
    }
    const agenda_descr = '\\n\\nAgenda\\n\\n';
    index = vevent.description.indexOf(agenda_descr);
    if (index != -1) {
        vevent.agenda = vevent.description.substring(index+agenda_descr.length).replaceAll('\\n', '\n');
        vevent.description = vevent.description.substring(0, index);
    }
    return vevent;
}

function VCALENDAR(component) {
    const obj = {};
    component.props.forEach(p => {
        if (obj[p.name]) throw new Error(`Duplicate ${name} entry for ${component.name}`);
        obj[p.name] = p.value;
    });
    const tzs = component.components.filter(c => c.name === 'VTIMEZONE');
    obj.timezones = {};
    tzs.forEach(c => {
        const tz = VTIMEZONE(obj, c);
        obj.timezones[tz.tzid] = tz;
    });
    const events = component.components.filter(c => c.name === 'VEVENT');
    obj.events = [];
    events.forEach(c => {
        obj.events.push(VEVENT(obj, c));
    });
    const others = component.components.filter(c => c.name !== 'VTIMEZONE'
        && c.name !== 'VEVENT'
    );
    if (others.length) {
        obj.unknown = others;
    }
    return obj;
}

async function loadICS(url) {
    const text =  await fetch(url)
      .then(res => res.text());

    let cal = VCALENDAR(components(contentLines(text)));
    cal.url = url;
    return cal;
}

export default loadICS;

