import { isValidUrl } from "./extractor.js";
import { fileURLToPath } from "url";
import path  from "path";
import { Worker } from "node:worker_threads";

/**
 * Controller function to generating sitemap request
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
const sitemap = async ({ body }, res) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Call worker to startCrawling with valid URL
    const worker = new Worker(__dirname + "../../utils/worker/sitemapWorker.js", {
        workerData: { body },
    });
    worker.on("error", (err) => {
        throw err;
    });
    worker.on("message", async (data) => {
        if (data.statusCode) {
            res.status(data.statusCode).json(data);
        } else {
            res.status(400).json(data);
        }
    });
};
export { sitemap, isValidUrl };
