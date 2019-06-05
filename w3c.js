import LazyPromise from './lazypromise.js';
import { fetchJSON, fetchW3C, fetchHTML, setW3CKey } from "./fetch-utils.js";

// export { fetchGroup, fetchGroups, fetchJSON, setW3CKey };

const NAME_CLEANUP = [["css3-", ""], ["NOTE-", ""], ["WD-", ""]];

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

async function fetchCharter(url) {
  let charter = {};
  let doc = await fetchHTML(url);

  charter.licenses = [];

  let links = doc.querySelectorAll("#licensing a");
  for (const link of links) {
    let href = link.href;
    if (href) charter.licenses.push(href);
  }

  // @@ could grab more info later..

  return charter;
}

function textToHTML(text) {
  return new LazyPromise(() => {
    try {
      let children = (new DOMParser()).parseFromString("<div class='spec_description'>"+text+"</div>", "text/html")
        .querySelectorAll("div.spec_description *");
      if (children.length === 0) throw new Error("DOMParser returned nothing");
      if (children.length === 1) return children[0];
      let container = children[0].ownerDocument.createElement("div");
      for (const child of children) container.appendChild(child);
      return container;
    } catch (e) {
      console.error(e);
      return text;
    }
  });
}

const GITHUB_TEAM = new RegExp("^https://github.com/orgs/[-A-Za-z0-9]+/teams/([-A-Za-z0-9]+)");

async function ongroup(group) {
  const groupId = group.id;

  if (group.description) {
    group.description = textToHTML(group.description);
  }

  // Some additional useful links
  group["details"] = `https://www.w3.org/2000/09/dbwg/details?group=${groupId}&order=org&public=1`;

  // the dashboard knows about spec milestones and a subset of GH repositories issues
  group["dashboard"] = {
    href: `https://w3c.github.io/spec-dashboard/?${groupId}`,
    repositories: new LazyPromise(() => fetchJSON(`https://w3c.github.io/spec-dashboard/pergroup/${groupId}-repo.json`)),
    milestones: new LazyPromise(() => fetchJSON(`https://w3c.github.io/spec-dashboard/pergroup/${groupId}-milestones.json`)),
    // we're getting that one from the W3C API already
    // publications: getData(`https://w3c.github.io/spec-dashboard/pergroup/${groupId}.json`),
  }

  // associate milestones and repositories with their publications
  if (group["participations"]) {
    const lazy_participations = group["participations"];
    group["participations"] = new LazyPromise(() => lazy_participations.promise.then(async (participants) => {
      for (const participant of participants) {
        if (participant.individual)
          participant.title = participant["user-title"];
        else {
          participant.title = participant["organization-title"];
        }
      }
      return participants.sort(sortParticipants);
    }));
  }

  // enhance active-charter
  if (group["active-charter"]) {
    const lazy_charter = group["active-charter"];
    group["active-charter"] = new LazyPromise(() => lazy_charter.promise.then(async (charter) => {
      charter.info = new LazyPromise(() => fetchCharter(charter.uri));
      return charter;
    }));
  }


  // enhance services
  if (group["services"]) {
    const lazy_services = group["services"];
    group["services"] = new LazyPromise(() => lazy_services.promise.then(async (services) => {
      for (const service of services) {
        if (service.type === "lists") {
          if (service.link.indexOf("https://lists.w3.org/Archives/Public/") === 0) {
            service.notify = `https://github.com/w3c/github-notify-ml-config/blob/master/mls.json`;
            service["notify-ml-config"] =
              new LazyPromise(() =>
                fetchJSON("https://w3c.github.io/github-notify-ml-config/mls.json").then(mls => mls[`${service.shortdesc}@w3.org`]
                ));
          }
        } else if (service.link.match(GITHUB_TEAM)) {
          service.repositories = `${service.link}/repositories`;
          service.edit = `${service.link}/members`;
          service.type = "github-team";
          service.team = service.link.replace(GITHUB_TEAM, "$1");
        }
      }
      return services;
    }));
  }

  group["events"] = new LazyPromise(() => fetchEvents().then(events => events.filter(evt => evt.summary.includes(group.name))));

  // the repo validator is gathering a lot of useful data on GitHub repositories, so let's add it
  const report = "https://w3c.github.io/validate-repos/report.json";
  group["repositories"] = new LazyPromise(() => fetchJSON(report).then(async (data) => {
    if (!data.groups) return data;
    let group_report = data.groups[groupId];
    if (!group_report) return [];
    const repositories = data.groups[groupId].repos.map(repo => {
      let GH = data.repos.filter(r => (r.name === repo.name && r.owner.login === repo.fullName.split('/')[0]))[0];
      GH.fullName = repo.fullName;

      if (GH.w3c && GH.w3c["repo-type"]) { // some shorthands
        GH.hasRecTrack = GH.w3c["repo-type"].includes("rec-track");
        GH.hasNote = GH.w3c["repo-type"].includes("note");
      }
      return GH;
    });
    // associate issues with their repositories
    if (!repositories.length) return repositories;
    repositories.forEach(repo => {
      repo["issues"] = new LazyPromise(async() => {
        const dash = await group.dashboard.repositories.promise;
        let issues = Object.entries(dash)
          .map(r => r[1])
          .filter(r => (r.repo.name === repo.name && r.repo.owner === repo.owner.login))[0];
        if (issues) return issues.issues;
      });
    });
    return repositories.sort(sortRepositories);
  }).catch(console.error));

  // associate milestones and repositories with their publications
  if (group["specifications"]) {
    const lazy_specs = group["specifications"];
    group["specifications"] = new LazyPromise(() => lazy_specs.promise.then(async (specs) => {
      if (!specs) return specs;
      specs.forEach(spec => {
        spec["milestones"] = new LazyPromise(async() => {
          const dash = await group.dashboard.milestones.promise;
          let milestones = Object.entries(dash)
            .filter(s => spec.shortlink === s[0]);
          if (milestones && milestones[0] && Object.keys(milestones[0]).length > 0) {
            return milestones[0][1];
          }
        });
      });

      // bring the
      specs.forEach(spec => {
        if (!spec["latest-version"]) {
          console.warn("No latest-version?");
          console.warn(spec);
        }
        spec["latest-status"] = new LazyPromise(() => spec["latest-version"].promise.then(latest => latest.status));
        spec["rec-track"] = new LazyPromise(() => spec["latest-version"].promise.then(latest => latest["rec-track"]));
        spec.history = `https://www.w3.org/standards/history/${spec.shortname}`;
        spec.description = textToHTML(spec.description);
      })

      // deal with TR versioning
      // @@this needs to be built-in in the W3C API instead!
      const versionRegExp = new RegExp('-?([.0-9]+)$');
      const versionNames = [];
      specs.forEach(spec => {
        let match = spec.shortname.match(versionRegExp);
        spec.version = { name: spec.shortname };
        if (match) {
          spec.version.level = match[1];
          spec.version.name = spec.shortname.substring(0, match.index);
        }
        let clean = NAME_CLEANUP.find(s => spec.version.name.indexOf(s[0]) === 0);
        if (clean)
          spec.version.name = clean[1] + spec.version.name.substring(clean[0].length);
      });
      return specs;
    }).catch(console.error));
  }

  return group;
} // END fetchGroup

// the main function. Just retrieve as much information as possible
// for a given group id
//
// string groupId -- the group id, e.g.  "109735"
async function fetchGroup(groupId, filter) {
  let newfilter = {};
  if (filter) {
    Object.entries(filter).forEach(e => newfilter[e[0]] = e[1]);
    if (filter.ongroup) {
      newfilter.ongroup = (g) => { ongroup(g); filter.ongroup(g) };
    }
  } else {
    newfilter.ongroup = ongroup;
  }
  return fetchW3C(`/groups/${groupId}`, newfilter);
}

// return the list of groups
async function fetchGroups(filter) {
  let newfilter = {};
  if (filter) {
    Object.entries(filter).forEach(e => newfilter[e[0]] = e[1]);
    if (filter.ongroup) {
      newfilter.ongroup = (g) => { ongroup(g); filter.ongroup(g) };
    }
  } else {
    newfilter.ongroup = ongroup;
  }
  return fetchW3C("/groups", newfilter);
}

// compare functions utils

function sortParticipants(a, b) {
  // first orgs, then individuals
  function criteria(v) {
    return ((!v.individual) ? "A" : "Z")
      + v["title"].toLowerCase();
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

function sortRepositories(a, b) {
  // first rec track, then note, then alphabetical order
  function criteria(v) {
    return (((v.hasRecTrack) ? "A" : "Z")
      + ((v.hasNote) ? "A" : "Z")
      + v.name).toLowerCase();;
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

function sortSpecifications(a, b) {
  // first rec track, then note, then alphabetical order
  function criteria(v) {
    return (((v.hasRecTrack) ? "A" : "Z")
      + ((v.hasNote) ? "A" : "Z")
      + v.name).toLowerCase();;
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

// export default fetchGroup;
export { fetchGroup, fetchGroups, fetchJSON, fetchHTML, fetchW3C, setW3CKey };
