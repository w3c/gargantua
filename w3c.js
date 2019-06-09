import LazyPromise from './lazypromise.js';
import { fetchJSON, fetchW3C, fetchHTML, setW3CKey } from "./fetch-utils.js";
import fetchEvents from "./w3cevents.js";
import specConfig from "./spec-config.js";

// export { fetchGroup, fetchGroups, fetchJSON, setW3CKey };

const NAME_CLEANUP = [["css3-", "css-"], ["NOTE-", ""], ["WD-", ""]];

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

// is a user an invited expert?
function isInvitedExpert(obj, group) {

  if (group["type"] !== "working group" && group["type"] !== "interest group" ) {
    // Not applicable, so return false
    return false;
  }
  const ieUser = async (user) =>
    ((await user.affiliations).filter(org => org.id === 36747).length != 0);

  if (obj instanceof LazyPromise) {
    return new LazyPromise(() =>
      obj.then(user => ieUser(user)).catch(err => {
        console.error(err);
        return false;
      }));
  } else {
    try {
      return new LazyPromise(() => ieUser(obj));
    } catch (e) {
      console.error(e);
      return false;
    }
  }
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
          participant["invited-expert"] = isInvitedExpert(participant["user"], group);
        } else {
          participant.title = participant["organization-title"];
          participant["invited-expert"] = false;
        }
      }
      return participants.sort(sortParticipants);
    }));
  }

  // enhance users
  if (group["users"]) {
    const lazy_users = group["users"];
    group["users"] = new LazyPromise(() => lazy_users.then(async (users) => {
      for (const user of users) {
        user["invited-expert"] = isInvitedExpert(user, group);
      }
      return users;
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


  // enhance services
  if (group["services"]) {
    const lazy_services = group["services"];
    group["services"] = new LazyPromise(() => lazy_services.then(async (services) => {
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

    if (!repositories.length) return repositories;

    // let's decorate the repositories with various extra data
    repositories.forEach(repo => {
      // associate issues with their repositories
      repo["issues"] = new LazyPromise(async () => {
        const dash = await group.dashboard.repositories;
        let issues = Object.entries(dash)
          .map(r => r[1])
          .filter(r => (r.repo.name === repo.name && r.repo.owner === repo.owner.login))[0];
        if (issues) return issues.issues;
      });
      // associate spec configuration with repositories
      specConfig(repo); // this will decorate the object
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

      // bring the
      specs.forEach(spec => {
        if (!spec["latest-version"]) {
          console.warn("No latest-version?");
          console.warn(spec);
        }
        spec["latest-status"] = new LazyPromise(() => spec["latest-version"].then(latest => latest.status));
        spec["rec-track"] = new LazyPromise(() => spec["latest-version"].then(latest => latest["rec-track"]));
        spec.history = `https://www.w3.org/standards/history/${spec.shortname}`;
        spec.description = textToNodes(spec.description);
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
