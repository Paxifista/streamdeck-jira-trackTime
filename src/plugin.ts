import { Plugin } from "@fnando/streamdeck";
import * as config from "./streamdeck.json";
import query from "./actions/Query";
import inlineTasks from "./actions/ConfluenceTasks";
import confluenceQuery from "./actions/ConfluenceSearch";
import alerts from "./actions/OpsAlerts";
import trackTime from "./actions/TrackTime";

const plugin = new Plugin({ 
  ...config, 
  actions: [query, confluenceQuery, inlineTasks, alerts, trackTime] 
});

export default plugin;
