import ics from "./lib/ics.js";

let EVENT_CACHE = [];
function sortEvents(a, b) {
  // sort by most recent first
  function criteria(v) {
    return (v.dtstart) ? v.dtstart : "";
  }
  let vA = criteria(a);
  let vB = criteria(b);
  if (vA > vB) {
    return -1;
  }
  if (vA < vB) {
    return 1;
  }

  // must be equal
  return 0;
}
  
async function fetchEvents(group) {
  if (EVENT_CACHE[group.id]) return EVENT_CACHE[group.id];

  return EVENT_CACHE[group.id] = ics(`${group["default-homepage"]}calendar/export/`)
    .then(calendar => calendar.events.sort(sortEvents))
    .catch(console.error);
}

export default fetchEvents;

