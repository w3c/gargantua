import LazyPromise from './lazypromise.js';
import { fetchJSON } from "./fetch-utils.js";

function mlsConfig(url, groupId) {
 return new LazyPromise(() => fetchJSON(url)
    .then(mls => Object.entries(mls).filter(ml => {
      let dbbacked = ml[1].dbbacked;
      if (groupId && dbbacked == groupId) return true;
      if (!groupId) return true;
      if (dbbacked instanceof Array) console.log("It's an array");
      return false;
    }).map(e => { e[1].name = e[0]; return e[1]}))
    .catch(err => {
      console.error(err);
      return [];
    }));
}

export default mlsConfig;
