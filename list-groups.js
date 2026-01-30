import { json } from './lib/fetch.js';
import jsonrender from './jsonrender.js';
import configuration from './lib/config.js';

const config = configuration();

function init() {
  json("https://w3c.github.io/groups/w3c-groups.json").then(groups => {
    const gtypeElt = document.getElementById("gtype");
    if (!gtypeElt) {
      throw new Error("No gtype element found");
    }
    if (config.gtype && config.gtype!="all") {
      config.gtype = config.gtype + " group";
      groups = groups.filter(grp => grp.type === config.gtype);
    } else {
      config.gtype = "all group"
    }
    gtypeElt.textContent = config.gtype + "s";
    document.querySelectorAll("*.groups").forEach(element => jsonrender({ groups: groups }, element));
  }).catch(console.error);
}
window.addEventListener('load', init);
