import { workerData, parentPort } from "node:worker_threads";
import { startCrawling } from "../../services/extractor.js";

async function work() {
  const result = await startCrawling(workerData.body, workerData.headers);
  parentPort.postMessage(result);
}

work();
