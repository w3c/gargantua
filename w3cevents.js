const TPAC_SCHEDULE = "https://www.w3.org/2019/09/TPAC/schedule.html";

function getTPACRooms(doc, weekday, day) {
  let tds = doc.getElementById(weekday).querySelectorAll("table.rooms tr td:first-child");
  let events = [];
  for (const td of tds) {
    let text = td.textContent
      .trim()
      .replace(new RegExp("([ /]?)WG"), "$1Working Group")
      .replace(new RegExp("([ /]?)IG"), "$1Interest Group")
      .replace(new RegExp("([ /]?)CG"), "$1Community Group")
      .replace(new RegExp("([ /]?)TF"), "$1Task Force")
      ;
    let href = TPAC_SCHEDULE;
    if (td.firstElementChild && td.firstElementChild.nodeName === 'A') {
      href = td.firstElementChild.href;
    }
    if (td.hasAttribute("data-id")) {
      console.warn("TPAC schedule: @@ data-ids")
    }
    events.push({
      summary: "TPAC 2019: " + text,
      location: "Fukuoka, Japan",
      host: "W3C",
      start: day,
      end: day,
      href: href
    });
  }
  return events;
}

function sortEvents(a, b) {
  // first rec track, then note, then alphabetical order
  function criteria(v) {
    return (v.start) ? v.start.toLowerCase() : "";
  }
  let vA = criteria(a);
  let vB = criteria(b);
  if (vA < vB) {
    return -1;
  }
  if (vA > vB) {
    return 1;
  }

  // must be equal
  return 0;
}


let EVENT_CACHE;
async function fetchEvents() {
  if (EVENT_CACHE) return EVENT_CACHE;

  return fetchHTML("https://www.w3.org/participate/eventscal").then(doc => {
    const text = (n) => (n) ? n.textContent : undefined;
    let element = doc.querySelector("#groups").parentNode;
    let events = [];
    for (const evt of element.querySelectorAll("li.vevent")) {
      let event = {
        summary: text(evt.querySelector(".summary a.url")),
        location: text(evt.querySelector(".location")),
        host: text(evt.querySelector(".host")),
        start: text(evt.querySelector(".dtstart")),
        end: text(evt.querySelector(".dtend")),
      }
      let a = evt.querySelector(".summary a.url");
      if (a) event.href = a.href;
      events.push(event);
    }
    return EVENT_CACHE = events.sort(sortEvents);
  }).catch(console.error).then(() => fetchHTML(TPAC_SCHEDULE))
    .then(doc => {
      let monday = getTPACRooms(doc, "Monday", "2019-09-16");
      let tuesday = getTPACRooms(doc, "Tuesday", "2019-09-17");
      let thursday = getTPACRooms(doc, "Thursday", "2019-09-19");
      let friday = getTPACRooms(doc, "Friday", "2019-09-20");
      let events = (EVENT_CACHE) ? EVENT_CACHE : [];
      let tpacevents = [].concat(monday).concat(tuesday).concat(thursday).concat(friday);
      let trimmed_events = [];

      for (const evt of tpacevents) {
        const name = evt.summary;
        let event = trimmed_events.find(e => e.summary === name);
        if (!event) {
          trimmed_events.push(evt);
          event = evt;
        }
        if (evt.start < event.start) {
          event.start = evt.start;
        }
        if (evt.end > event.end) {
          event.end = evt.end;
        }
      }

      events = events.concat(trimmed_events);

      return EVENT_CACHE = events.sort(sortEvents);
    }).catch(console.error)
}

export default fetchEvents;

