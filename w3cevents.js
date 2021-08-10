import { fetchHTML } from "./fetch-utils.js";

const TPAC_SCHEDULE = "https://www.w3.org/2020/10/TPAC/schedule.html";

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


let EVENT_CACHE = [];
async function fetchEvents(group) {
  if (EVENT_CACHE[group.id]) return EVENT_CACHE[group.id];

  return fetchHTML(`${group["default-homepage"]}/calendar`).then(doc => {
    const text = (n) => (n) ? n.textContent.trim() : undefined;
    let elements = doc.querySelectorAll("#event-list > li");
    let events = [];
    for (const evt of elements) {
      let title = text(evt.querySelector("h2 a"));
      if (title) {
        title = title.split('\n');
        let event = {
          summary: title[0].trim(),
          state: title[1].trim(),
          start: evt.querySelector("div.date-orig time:nth-child(1)").getAttribute("datetime"),
          end: evt.querySelector("div.date-orig time:nth-child(2)").getAttribute("datetime"),
          href: evt.querySelector("div nav ul li:nth-child(1) a").href
        }
        events.push(event);
      }
    }
    return EVENT_CACHE[group.id] = events.sort(sortEvents);
  });

  return []; // @@deactivate the W3C TPAC calendar

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
      if (!doc) return EVENT_CACHE;

      let monday = getTPACRooms(doc, "Monday", "2020-10-26");
      let tuesday = getTPACRooms(doc, "Tuesday", "2020-10-27");
      let thursday = getTPACRooms(doc, "Thursday", "2020-10-29");
      let friday = getTPACRooms(doc, "Friday", "2020-10-30");
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
    }).catch(console.error).then(() => EVENT_CACHE);
}

export default fetchEvents;

