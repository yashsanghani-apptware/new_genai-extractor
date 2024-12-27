import { workerData, parentPort } from "node:worker_threads";
import { startCrawlingBySelectorInRedfin } from "../../services/extractRedfin.js";

async function work() {
  const result = await startCrawlingBySelectorInRedfin(
    workerData.urls,
    workerData.authHeader
  );
  parentPort.postMessage(result);
  
  
}

work();
