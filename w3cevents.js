import loadICS from "./ics.js";

let EVENT_CACHE = [];
function sortEvents(a, b) {
  // first rec track, then note, then alphabetical order
  function criteria(v) {
    return (v.dtstart) ? v.dtstart : "";
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
  
async function fetchEvents(group) {
  if (EVENT_CACHE[group.id]) return EVENT_CACHE[group.id];

  return loadICS(`${group["default-homepage"]}/calendar/export/`).then(calendar => {
    return EVENT_CACHE[group.id] = calendar.events.sort(sortEvents);
  });
}

export default fetchEvents;

