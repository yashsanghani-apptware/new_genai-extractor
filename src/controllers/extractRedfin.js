import { apiLogger } from "../logger/logger.js";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "url";
import path from "path";
import refreshToken from "../services/refreshToken.js";

/**
 * Controller function to handle scraping request
 * @param {object} req - Express request object containing the body with 'urls', 'login', and 'credentials'
 * @param {object} res - Express response object
 * @returns {object} - Response with passUrl, failUrl, scrapedData, and metadata
 */
// ONLY WORK FOR THE WEBISTE: https://www.beckmastennorth.com/inventory/new-2023-buick-envision-essence-front-wheel-drive-suv-lrbfznr48pd019531/
// USING CSS SELECTORS
const extractRedfin = async (req, res) => {
  apiLogger.info("Extraction service Start");
  let authHeader = req.headers.authorization;

  try {
    if (!authHeader) {
      return res
        .status(401)
        .json({ status: false, message: "Authorization header missing" });
    }

 
      authHeader = await refreshToken(authHeader);
 

    const { urls } = req.body;
    // Validate if the request body is a valid JSON object
    if (typeof req.body !== "object" || req.body === null)
      return res
        .status(400)
        .json({
          status: false,
          message: "Request body is not a valid JSON object",
        });

    // Check if 'urls' is provided and not empty
    if (!urls || urls.length === 0)
      return res.status(400).json({ status: false, message: "URL Not Found" });

    // Iterate through each URL
    // for (const url of urls) {
    //   apiLogger.info("Validate input URL");
    //   if (urls) {
    //     try {
    //       let arr=[]
    //       passUrl = { ...body, urls: [urls] };
    //       for (let i in passUrl.exclusions){
    //         let URLS = passUrl.exclusions[i].replace(/([^:]\/)\/+/g, "$1");
    //         arr.push(URLS)
    //       }
    //       passUrl.exclusions = arr
    //       body.exclusions = arr
    //     } catch (error) {
    //       console.log(error);
    //     }
    //   } else {
    //     failUrl = {urls: [urls], message: "URL is incorrect" };
    //   }
    // }

    // const headers = {
    //   'Authorization': `Bearer ${body.credentials.email}:${body.credentials.password}`,
    //   'Content-Type': 'application/json'
    // };
    // Call startCrawling only if at least valid URL is found

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Call worker to startCrawling with valid URL
    const worker = new Worker(
      __dirname + "../../utils/worker/extractRedfinWorker.js",
      {
        workerData: { urls, authHeader },
      }
    );
    worker.on("error", (err) => {
      throw err;
    });
    worker.on("message", async (scrapedData) => {
      try {
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

export { extractRedfin };
