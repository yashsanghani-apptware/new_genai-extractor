import { workerData, parentPort } from "node:worker_threads";
import { startCrawlingBySelector } from "../../services/extractInventory.js";

async function work() {
  const result = await startCrawlingBySelector(
    workerData.passUrl,
    workerData.body,
    workerData.headers
  );
  parentPort.postMessage(result);
}

work();
