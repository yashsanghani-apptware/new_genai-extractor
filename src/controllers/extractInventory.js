import { performance } from 'perf_hooks';
import { apiLogger } from "../logger/logger.js";
import { createTimeStampMetaData } from '../utils/helper.js';
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "url";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { isValidEmail } from './extractor.js';

/**
 * Controller function to handle scraping request
 * @param {object} req - Express request object containing the body with 'urls', 'login', and 'credentials'
 * @param {object} res - Express response object
 * @returns {object} - Response with passUrl, failUrl, scrapedData, and metadata
*/
// ONLY WORK FOR THE WEBISTE: https://www.beckmastennorth.com/inventory/new-2023-buick-envision-essence-front-wheel-drive-suv-lrbfznr48pd019531/
// USING CSS SELECTORS
const extractInventory = async ({ body }, res) => {
  apiLogger.info("Extraction service Start");
  console.log('inside of the extractInventory');
  const startTime = performance.now();

  try {
    const { urls, login, credentials } = body;
    // Validate if the request body is a valid JSON object
    if (typeof body !== 'object' || body === null)
      return res.status(400).json({ status: false, message: "Request body is not a valid JSON object" });

    // Validate the fields in the request body
    if (typeof body.login !== 'boolean')
        return res.status(400).json({ status: false, message: "Invalid 'login' field. It should be a boolean." });

    if (typeof body.client_id !== 'string')
        return res.status(400).json({ status: false, message: "Invalid 'client_id' field. It should be a string." });

    if (typeof body.isSave !== 'boolean')
        return res.status(400).json({ status: false, message: "Invalid 'isSave' field. It should be a boolean." });

    if (!body.credentials || typeof body.credentials !== 'object' || typeof body.credentials.email !== 'string' || typeof body.credentials.password !== 'string')
        return res.status(400).json({ status: false, message: "Invalid 'credentials' field. It should be an object with 'email' and 'password' strings." });

    if (typeof body.depth !== 'number')
        return res.status(400).json({ status: false, message: "Invalid 'depth' field. It should be a number." });

    if (!Array.isArray(body.exclusions) || !body.exclusions.every(exclusion => typeof exclusion === 'string'))
        return res.status(400).json({ status: false, message: "Invalid 'exclusions' field. It should be an array of strings." });

    if (body.categorizations) {
      if (!Array.isArray(body.categorizations) || !body.categorizations.every(category => typeof category === 'object' && typeof category.category === 'string' && typeof category.lead_capture === 'boolean'))
      return res.status(400).json({ status: false, message: "Invalid 'categorizations' field. It should be an array of objects with 'category' as string and 'lead_capture' as boolean." });
    }

    // Check if 'urls' is provided and not empty
    // if (!urls || urls.length === 0)
    //   return res.status(400).json({ status: false, message: "URL Not Found" });

    // Check login and credentials, if provided
    if (login && credentials && !isValidEmail(credentials.email))
      return res.status(400).json({ status: false, message: "Credentials is incorrect" });

    if (Array.isArray(body.inclusions)) {
      body.inclusions = body.inclusions.filter(str => str !== '');
    }
    if (Array.isArray(body.exclusions)) {
      body.exclusions = body.exclusions.filter(str => str !== '');
    }
    if (!body.execution_id) {
      body.execution_id = uuidv4();
    }
    let passUrl, failUrl;

    // Iterate through each URL
    // for (const url of urls) {
      apiLogger.info("Validate input URL");
      if (urls) {
        try {
          let arr=[]
          passUrl = { ...body, urls: [urls] };
          for (let i in passUrl.exclusions){
            let URLS = passUrl.exclusions[i].replace(/([^:]\/)\/+/g, "$1");
            arr.push(URLS)
          }
          passUrl.exclusions = arr
          body.exclusions = arr
        } catch (error) {
          console.log(error);
        }
      } else {
        failUrl = {urls: [urls], message: "URL is incorrect" };
      }
    // }

    const headers = {
      'Authorization': `Bearer ${body.credentials.email}:${body.credentials.password}`,
      'Content-Type': 'application/json'
    };
    // Call startCrawling only if at least valid URL is found

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Call worker to startCrawling with valid URL
    const worker = new Worker(__dirname + "../../utils/worker/extractInventoryWorker.js", {
      workerData: { passUrl, headers, body },
    });
    worker.on("error", (err) => {
      throw err;
    });
    worker.on("message", async (scrapedData) => {
      const endTime = performance.now();
    
      const metaData = {
        ...createTimeStampMetaData(startTime, endTime),
        urlProcessed: passUrl ? passUrl.urls: failUrl ? failUrl.urls : "URL not found"
      }

  
      try {
        return  res.status(200).json({
          passUrl: passUrl,
          failUrl: failUrl,
          scrapedData,
          metadata: metaData
        });
      } catch (error) {
        apiLogger.error(JSON.stringify(error));
      }
  
      apiLogger.info("Extraction service ends");
  
    });
    
  } catch (error) {
    console.log('error in the catch block =>', error)
    apiLogger.error(JSON.stringify(error));
    return res.status(400).json({ status: false, error, message: "Something went wrong" });
  }
};


export { extractInventory };
