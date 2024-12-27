import { apiLogger } from "../logger/logger.js";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "url";
import path from "path";
import config from "../config/config.js";
import axios from "axios";

/**
 * Controller function to handle scraping request
 * @param {object} req - Express request object containing the body with 'urls', 'login', and 'credentials'
 * @param {object} res - Express response object
 * @returns {object} - Response with passUrl, failUrl, scrapedData, and metadata
 */
// ONLY WORK FOR THE WEBISTE: https://www.beckmastennorth.com/inventory/new-2023-buick-envision-essence-front-wheel-drive-suv-lrbfznr48pd019531/
// USING CSS SELECTORS
const extractRedfinData = async (req, res) => {
  apiLogger.info("Extraction service Start");
  const authHeader = req.headers.authorization;

  try {
    const { urls, batchId } = req.body;

    // Validate if the request body is a valid JSON object
    if (typeof req.body !== "object" || req.body === null)
      return res.status(400).json({
        status: false,
        message: "Request body is not a valid JSON object",
      });

    // Check if 'urls' is provided and not empty
    if (!urls || urls.length === 0)
      return res.status(400).json({ status: false, message: "URL Not Found" });

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Call worker to startCrawling with valid URL
    const worker = new Worker(
      __dirname + "../../utils/worker/extractRedfinDataWorker.js",
      {
        workerData: { urls, authHeader },
      }
    );

    worker.on("error", (err) => {
      throw err;
    });

    worker.on("message", async (scrapedData) => {

      try {
        await axios
          .post(
            `${config.listingServiceUrl}/listings/webhook`, // URL
            {
              message: "Scraping is successfully Done",
              batchId: batchId,
              data: urls,
            }
          )
          .then((response) => {
            console.log("successfully call webhook");

            return response.data;
          })
          .catch((error) => {
            console.error("Error calling webhook", error.response.data);
          });

        return res.status(200).json({
          scrapedData,
        });
      } catch (error) {
        apiLogger.error(JSON.stringify(error));
      }

      apiLogger.info("Extraction service ends");
    });
  } catch (error) {
    console.log("error in the catch block =>", error);
    apiLogger.error(JSON.stringify(error));
    return res
      .status(400)
      .json({ status: false, error, message: "Something went wrong" });
  }
};

export { extractRedfinData };
