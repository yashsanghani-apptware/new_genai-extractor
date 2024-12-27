import { workerData, parentPort } from "node:worker_threads";
import { sitemap } from "../../services/sitemap.js";

async function work() {
  const result = await sitemap(workerData.body);
  parentPort.postMessage(result);
}

work();
