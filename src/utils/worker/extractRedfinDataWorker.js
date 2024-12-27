import { workerData, parentPort } from "node:worker_threads";
import { startCrawlingBySelectorInRedfinData } from "../../services/extractRedfinData.js";

async function work() {
  const result = await startCrawlingBySelectorInRedfinData(
    workerData.urls,
    workerData.authHeader
  );
  parentPort.postMessage(result);
}

work();
