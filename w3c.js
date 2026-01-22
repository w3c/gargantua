import LazyPromise from './lazypromise.js';
import { fetchJSON, fetchW3C, fetchHTML } from "./fetch-utils.js";
import fetchEvents from "./w3cevents.js";
import specConfig from "./spec-config.js";
import mlsConfig from "./mls-config.js";

// export { fetchGroup, fetchGroups, fetchJSON };

const CACHE = "https://labs.w3.org/github-cache";

const NAME_CLEANUP = [["css3-", "css-"], ["NOTE-", ""], ["WD-", ""]];

function titleCleanup(title) {
  // from https://github.com/foolip/day-to-day/blob/master/build/specs.js#L21
  return title
  .replace(/ \([^)]+\)$/, '')
  .replace(/ Level \d+$/, '')
  .replace(/ Module$/, '')
  .replace(/ \d+(\.\d+)?$/, '')
  .replace(/ Specification$/, '')
  .replace(/ -$/, '')
  ;
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

  charter.milestones = [];
  let specs = doc.querySelectorAll("#normative dl dt.spec");
  for (const spec of specs) {
    let milestone = {};
    let anchor = spec.querySelector("a");
    if (anchor) {
      let spec = {href: anchor.href, title: anchor.textContent.trim()};
      milestone.specification = spec;
    }
    let dd = spec.nextElementSibling;
    if (dd) {
      let elt = dd.querySelector(".milestone a");
      if (elt) {
        milestone.milestone = elt.textContent.trim();
        milestone.href = elt.href;
        charter.milestones.push(milestone);
      } else {
        elt = dd.querySelector(".milestone");
        if (elt)  {
          elt = elt.textContent;
          let match = elt.match(/Expected completion:\s+([A-Za-z0-9.\-_\s ]+)/);
          if (match) {
            milestone.milestone = match[1].trim();
            charter.milestones.push(milestone);
          }
        }
      }
    }
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

function enhanceSpecification(group, spec) {
  spec["milestones"] = new LazyPromise(async () => {
    const dash = await group.dashboard.milestones;
    let milestones = Object.entries(dash)
      .filter(s => spec.shortlink === s[0]);
    if (milestones && milestones[0] && milestones[0][1] && Object.keys(milestones[0][1]).length > 0) {
      return milestones[0][1];
    }
  });
  if (!spec["latest-version"]) {
    console.warn("No latest-version?");
    console.warn(spec);
  }
  spec["latest-status"] = new LazyPromise(() => spec["latest-version"].then(latest => latest.status));
  spec["rec-track"] = new LazyPromise(() => spec["latest-version"].then(latest => latest["rec-track"]));
  spec.history = `https://www.w3.org/standards/history/${spec.shortname}`;
  spec.description = textToNodes(spec.description);
  if (!spec["series-version"]) {
    spec["series-version"] = "unknown";
  }
  spec.wpt = new LazyPromise(() => fetchJSON("https://foolip.github.io/day-to-day/specs.json")
    .then(data =>
      data.filter(s => (s.href === spec["editor-draft"])))
    .then(data => (data.length)? data[0] : undefined)
    .then(data => {
      if (data) {
        data.path = data.testpath || data.id;
        data.icons = ["chrome", "firefox", "safari"].map(product => {
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
}

async function ongroup(group) {
  const groupId = group.id;

  // prevent reentering... @@THIS SHOULDN'T HAPPEN BUT IT DOES
  if (group._links.seenBefore) return group;
  group._links.seenBefore = true;

  if (group.description) {
    group.description = textToNodes(group.description);
  }

  group.identifier =  group._links.self.href.replace('https://api.w3.org/groups/','');
  group["short-type"] = group.identifier.match("^([a-z]+)")[1];
  group["default-homepage"] = `https://www.w3.org/groups/${group.identifier}`;

  // Some additional useful links (fopr backward compat)
  group["details"] = `https://www.w3.org/admin/${group["short-type"]}/${groupId}/show`;

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
      const today = new Date();
      const end = new Date(charter.end);
      const rejoin = new Date(charter.start + "T00:00:00Z");
      rejoin.setHours(45*24); // add 45 days

      charter.expired = (today > end);
      charter.rejoin = (today < rejoin); // @@ this could inaccurate :-(
      return charter;
    }));
  }


  group["mailing-lists"] = {
    public: mlsConfig("https://lists.w3.org/Archives/Public/00stats.json", groupId)
  }
  if (group["short-type"] === "wg" || group["short-type"] === "ig" || group["short-type"] === "other") {
    const glabel = group.identifier.replace('/', ':');
//    group["transitions"] = new LazyPromise(async () => fetchJSON(`${CACHE}/v3/repos/w3c/transitions/issues?state=open&labels=${group.identifier}`)).then(doc => {
    group["transitions"] = new LazyPromise(async () => {
      let doc = await fetchJSON(`${CACHE}/v3/repos/w3c/transitions/issues?state=open&labels=${glabel}`);
      return doc;
    });
    group["onboarding"] = `https://github.com/w3c/onboarding/blob/master/template/${group.identifier}`;
    group["strategy"] = new LazyPromise(async () => {
      let doc = await fetchJSON(`${CACHE}/v3/repos/w3c/strategy/issues?state=open&search=[${group["identifier"]}]`);
      return doc;
    });
    group["past-transitions"] = `https://github.com/w3c/transitions/issues?q=is%3Aissue+label%3A${glabel}+is%3Aclosed`;
    group["horizontal-issues"] = new LazyPromise(async () => {
      const HR_REPOSITORIES = await fetchJSON("https://w3c.github.io/common-labels.json")
          .then(labels => labels.filter(l => l.repo).map(l => l.repo))
          .then(labels => {
              const se = new Set();
              labels.forEach(r => se.add(r));
              return se;
          });

      const all = [];
      for (const repo of HR_REPOSITORIES) {
        all.push({
          repo: repo,
          html_url: `https://github.com/${repo}/issues?state=open&labels=${glabel}`,
          issues: await fetchJSON(`${CACHE}/v3/repos/${repo}/issues?state=open&labels=${glabel}`)
        });
      }
      return all;
    });
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

  group["events"] = new LazyPromise(() => fetchEvents(group));

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
/*
    group["repositories"] = new LazyPromise(() =>
    fetchJSON(`${CACHE}/extra/repos/${groupId}`).then(async (repositories) => {
      if (!repositories || !repositories.length) return [];
      repositories.map(repo => {
        if (repo.w3c && repo.w3c["repo-type"]) { // some shorthands
          repo.hasRecTrack = repo.w3c["repo-type"].includes("rec-track");
          repo.hasNote = repo.w3c["repo-type"].includes("note");
        }
      }); */

    if (!repositories.length) return repositories;

    // let's decorate the repositories with various extra data
    repositories.forEach(repo => {
      // associate issues with their repositories
      repo["issues"] = new LazyPromise(async () => {
        return fetchJSON(`${CACHE}/v3/repos/${repo.owner.login}/${repo.name}/issues?state=all`);
      });
      repo["commits"] = new LazyPromise(async () => {
        return fetchJSON(`${CACHE}/v3/repos/${repo.owner.login}/${repo.name}/commits`);
      });
      repo["open_issues"] = new LazyPromise(async () => {
        return fetchJSON(`${CACHE}/v3/repos/${repo.owner.login}/${repo.name}/issues`);
      });
      repo["milestones"] = new LazyPromise(async () => {
        return fetchJSON(`${CACHE}/v3/repos/${repo.owner.login}/${repo.name}/milestones`);
      });
      repo["hooks"] = new LazyPromise(async () => {
        return fetchJSON(`${CACHE}/v3/repos/${repo.owner.login}/${repo.name}/hooks`);
      });
      // associate spec configuration with repositories
      specConfig(repo); // this will decorate the object
      repo["wpt"] = {
        specs: new LazyPromise(() => fetchJSON("https://foolip.github.io/day-to-day/data.json")
          .then(data =>
            data.specs.filter(s => (s.specrepo === repo.fullName))))
      }
    });
    return repositories.sort(sortRepositories);
  }).catch(console.error));

  // associate milestones and repositories with their publications
  if (group["specifications"]) {
    const lazy_specs = group["specifications"];
    group["specifications"] = new LazyPromise(() => lazy_specs.then(async (specs) => {
      if (specs) specs.forEach(spec => enhanceSpecification(group, spec));
      return specs;
    }).catch(console.error));
    group["active-specifications"] = new LazyPromise(() => group["specifications"].then(async (specs) => {
      let active = [];
      for (const spec of specs) {
        const supersededBy = spec["superseded-by"];
        const status = await spec["latest-status"];
        if (status !== "Retired" && !supersededBy) {
          active.push(spec);
        }
      }
      return active;
    }));

    group["series"] = new LazyPromise(() => group["specifications"].then(async (specs) => {
      let series = [];
      for (const spec of specs) {
        const spec_series = await spec["series"];
        if (!series.find(s => s.shortname === spec_series.shortname)) {
          series.push(spec_series);
          spec_series.title = new LazyPromise(() => {
            return spec_series['current-specification'].then(current => titleCleanup(current.title));
          });
          spec_series.icons = ["chrome", "edge", "firefox", "safari"].map(product => {
            return {
              product: product,
              href: `https://wpt-badge.glitch.me/?product=${product}&prefix=/` + spec_series.shortname,
            };
          });
          spec_series["wpt-fyi"] = "https://wpt.fyi/results/" + spec.shortname;
          spec_series.implementations = new LazyPromise(() => fetchJSON("https://w3c.github.io/web-roadmaps/data/impl.json")
            .then(data => data[spec_series.shortname]));
          // for object and code consistency, we replace the specifications array by our own
          const specs_p = spec_series['specifications'];

          const lazy_specs = spec_series["specifications"];
          spec_series["specifications"] = new LazyPromise(() => lazy_specs.then(async (specs) => {
            if (specs) specs.forEach(spec => enhanceSpecification(group, spec));
            return specs;
          }).catch(console.error));
          const lazy_spec = spec_series["current-specification"];
          spec_series["current-specification"] = new LazyPromise(() => lazy_spec.then(async (spec) => {
            if (spec) enhanceSpecification(group, spec);
            return spec;
          }).catch(console.error));
        }
      }
      return series;
    }));

    group["active-series"] = new LazyPromise(() => group["series"].then(async (series) => {
      let active = [];
      for (const s of series) {
        const status = (await (await s["current-specification"])['latest-version']).status;
        if (status !== "Retired") {
          active.push(s);
        }
      }
      return active;
    }));

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
export { fetchGroup, fetchGroups, fetchJSON, fetchHTML, fetchW3C };
