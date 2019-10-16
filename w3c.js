import LazyPromise from './lazypromise.js';
import { fetchJSON, fetchW3C, fetchHTML, setW3CKey } from "./fetch-utils.js";
import fetchEvents from "./w3cevents.js";
import specConfig from "./spec-config.js";
import mlsConfig from "./mls-config.js";

// export { fetchGroup, fetchGroups, fetchJSON, setW3CKey };

const NAME_CLEANUP = [["css3-", "css-"], ["NOTE-", ""], ["WD-", ""]];

function titleCleanup(title) {
  // from https://github.com/foolip/day-to-day/blob/master/build/specs.js#L180
  return title.replace(/ \([^)]+\)$/, '')
  .replace(/ Level \d+$/, '')
  .replace(/ Module$/, '')
  .replace(/ \d+(\.\d+)?$/, '')

  .replace(/ Specification$/, '');
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

function textToNodes(text) {
  if (!text || text.indexOf('<') === -1) return text;
  return new LazyPromise(() => {
    try {
      let children = (new DOMParser()).parseFromString("<div class='spec_description'>" + text + "</div>", "text/html")
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

  // prevent reentering... @@THIS SHOULDN'T HAPPEN BUT IT DOES
  if (group._links.seenBefore) return group;
  group._links.seenBefore = true;

  if (group.description) {
    group.description = textToNodes(group.description);
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

  // enhance participations
  if (group["participations"]) {
    const lazy_participations = group["participations"];
    group["participations"] = new LazyPromise(() => lazy_participations.then(async (participants) => {
      for (const participant of participants) {
        if (participant.individual) {
          participant.title = participant["user-title"];
        } else {
          participant.title = participant["organization-title"];
        }
      }
      return participants.sort(sortParticipants);
    }));
  }

  // enhance active-charter
  if (group["active-charter"]) {
    const lazy_charter = group["active-charter"];
    group["active-charter"] = new LazyPromise(() => lazy_charter.then(async (charter) => {
      charter.info = new LazyPromise(() => fetchCharter(charter.uri));
      return charter;
    }));
  }

  group["mailing-lists"] = {
    public: mlsConfig("https://lists.w3.org/Archives/Public/00stats.json", groupId)
  }

  // enhance services
  if (group["services"]) {
    const lazy_services = group["services"];
    group["services"] = new LazyPromise(() => lazy_services.then(async (services) => {
      for (const service of services) {
        if (service.type === "lists") {
          if (service.link.indexOf("https://lists.w3.org/Archives/Public/") === 0) {
            service.notify = `https://github.com/w3c/github-notify-ml-config/blob/master/mls.json`;
            service.stats = new LazyPromise(() =>
              fetchJSON("https://lists.w3.org/Archives/Public/00stats.json").then(mls => mls[service.shortdesc]).catch(console.error));
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
    let timestamp = (!data.timestamp)? "1994-10-01T00:00:00.000Z" : data.timestamp;
    const repositories = data.groups[groupId].repos.map(repo => {
      let GH = data.repos.filter(r => (r.name === repo.name && r.owner.login === repo.fullName.split('/')[0]))[0];
      GH.fullName = repo.fullName;
      GH.retrievedAt = timestamp;
      if (GH.w3c && GH.w3c["repo-type"]) { // some shorthands
        GH.hasRecTrack = GH.w3c["repo-type"].includes("rec-track");
        GH.hasNote = GH.w3c["repo-type"].includes("note");
      }

      return GH;
    });

    if (!repositories.length) return repositories;

    // let's decorate the repositories with various extra data
    repositories.forEach(repo => {
      // associate issues with their repositories
      repo["issues"] = new LazyPromise(async () => {
        const dash = await group.dashboard.repositories;
        const name = repo.name.toLowerCase();
        const owner = repo.owner.login.toLowerCase();
        let issues = Object.entries(dash)
          .map(r => r[1])
          .filter(r => (r.repo.name.toLowerCase() === name && r.repo.owner.toLowerCase() === owner))[0];
        if (issues) return issues.issues;
      });
      // associate spec configuration with repositories
      specConfig(repo); // this will decorate the object
      repo["wpt"] = {
        specs: new LazyPromise(() => fetchJSON("https://foolip.github.io/day-to-day/data.json")
          .then(data =>
            data.specs.filter(s => (s.specrepo === repo.fullName))))
      }
      if (repo.labels && repo.labels.edges) {
        repo.labels = repo.labels.edges.map(e => e.node); // validate-repos workout
      }
    });
    return repositories.sort(sortRepositories);
  }).catch(console.error));

  // associate milestones and repositories with their publications
  if (group["specifications"]) {
    const lazy_specs = group["specifications"];
    group["specifications"] = new LazyPromise(() => lazy_specs.then(async (specs) => {
      if (!specs) return specs;
      specs.forEach(spec => {
        spec["milestones"] = new LazyPromise(async () => {
          const dash = await group.dashboard.milestones;
          let milestones = Object.entries(dash)
            .filter(s => spec.shortlink === s[0]);
          if (milestones && milestones[0] && milestones[0][1] && Object.keys(milestones[0][1]).length > 0) {
            return milestones[0][1];
          }
        });
      });

      // enhance specifications information
      specs.forEach(spec => {
        if (!spec["latest-version"]) {
          console.warn("No latest-version?");
          console.warn(spec);
        }
        spec["latest-status"] = new LazyPromise(() => spec["latest-version"].then(latest => latest.status));
        spec["rec-track"] = new LazyPromise(() => spec["latest-version"].then(latest => latest["rec-track"]));
        spec.history = `https://www.w3.org/standards/history/${spec.shortname}`;
        spec.description = textToNodes(spec.description);
        spec.wpt = new LazyPromise(() => fetchJSON("https://foolip.github.io/day-to-day/specs.json")
          .then(data =>
            data.filter(s => (s.href === spec["editor-draft"])))
          .then(data => (data.length)? data[0] : undefined)
          .then(data => {
            if (data) {
              data.path = data.testpath || data.id;
              data.icons = ["chrome", "edge", "firefox", "safari"].map(product => {
                return {
                  product: product,
                  href: `https://wpt-badge.glitch.me/?product=${product}&prefix=/` + data.path
                };
              });
            }
            return data;
          }))
          spec.implementations = new LazyPromise(() => fetchJSON("https://w3c.github.io/web-roadmaps/data/impl.json")
          .then(data => data[spec["shortname"]]));
      });

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

    group["active-specifications"] = new LazyPromise(() => group["specifications"].then(async (specs) => {
      let active = [];
      for (const spec of specs) {
        const status = await spec["latest-status"];
        if (status !== "Retired") {
          active.push(spec);
        }
      }
      return active;
    }));
  }

  group["spec-groups"] = new LazyPromise(() => group["active-specifications"].then(specs => {
    let uniq = {};
    specs.forEach(spec => {
      let obj = uniq[spec.version.name];
      if (!obj) {
        uniq[spec.version.name] = obj = {};
        obj.specifications = [];
        obj.name = spec.version.name;
        obj.title = titleCleanup(spec.title);
        obj.icons = ["chrome", "edge", "firefox", "safari"].map(product => {
          return {
            product: product,
            href: `https://wpt-badge.glitch.me/?product=${product}&prefix=/` + spec.version.name
          };
        });
        obj["wpt-fyi"] = "https://wpt.fyi/results/" + spec.shortname;
        obj.implementations = new LazyPromise(() => fetchJSON("https://w3c.github.io/web-roadmaps/data/impl.json")
        .then(data => data[spec.shortname]));
      }
      obj.specifications.push(spec);
    });
    return Object.entries(uniq).map(e => e[1]);
  }));

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
