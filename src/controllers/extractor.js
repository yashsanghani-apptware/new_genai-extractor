import { apiLogger } from "../logger/logger.js";
// import {insertOrUpdateData} from '../utils/aws.js'
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "url";
import path from "path";
// import { v4 as uuidv4 } from "uuid";

// Regular expressions for URL and email validation
const urlRegex = /^(?:https?|ftp):\/\/[\w/\-?=%.]+\.[\w/\-?=%.]+$/;
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Controller function to handle extractor request
 * @param {object} req - Express request object containing the body with 'urls', 'login', and 'credentials'
 * @param {object} res - Express response object
 * @returns {object} - Response with passUrl, incorrectUrls, scrapedData, and metadata
*/
const extractor = async ({ body }, res) => {
  apiLogger.info("Extraction service Start");
  // const startTime = performance.now();

  try {
    const { urls } = body;
    // Validate if the request body is a valid JSON object
    if (typeof body !== 'object' || body === null)
      return res.status(400).json({ status: false, statusCode: 400, message: "Request body is not a valid JSON object" });

    // Validate the fields in the request body
    // if (typeof body.login !== 'boolean')
    //     return res.status(400).json({ status: false, statusCode: 400, message: "Invalid 'login' field. It should be a boolean." });

    // if (typeof body.client_id !== 'string')
    //     return res.status(400).json({ status: false, statusCode: 400, message: "Invalid 'client_id' field. It should be a string." });

    // if (typeof body.isSave !== 'boolean')
    //     return res.status(400).json({ status: false, statusCode: 400, message: "Invalid 'isSave' field. It should be a boolean." });

    // if (!body.credentials || typeof body.credentials !== 'object' || typeof body.credentials.email !== 'string' || typeof body.credentials.password !== 'string')
    //     return res.status(400).json({ status: false, statusCode: 400, message: "Invalid 'credentials' field. It should be an object with 'email' and 'password' strings." });

    // if (typeof body.depth !== 'number')
    //     return res.status(400).json({ status: false, statusCode: 400, message: "Invalid 'depth' field. It should be a number." });

    // if (!Array.isArray(body.exclude) || !body.exclude.every(exclusion => typeof exclusion === 'string'))
    //     return res.status(400).json({ status: false, statusCode: 400, message: "Invalid 'exclusions' field. It should be an array of strings." });

    if (body.categorizations) {
      if (!Array.isArray(body.categorizations) || !body.categorizations.every(category => typeof category === 'object' && typeof category.category === 'string' && typeof category.lead_capture === 'boolean'))
      return res.status(400).json({ status: false, statusCode: 400, message: "Invalid 'categorizations' field. It should be an array of objects with 'category' as string and 'lead_capture' as boolean." });
    }

    // Check if 'urls' is provided and not empty
    if (!urls || urls.length === 0)
      return res.status(400).json({ status: false, statusCode: 400, message: "URL Not Found" });

    // Check login and credentials, if provided
    // if (login && credentials && !isValidEmail(credentials.email))
    //   return res.status(400).json({ status: false, statusCode: 400, message: "Credentials is incorrect" });

    // if (Array.isArray(body.include)) {
    //   body.include = body.include.filter(str => str !== '');
    // }
    // if (Array.isArray(body.exclude)) {
    //   body.exclude = body.exclude.filter(str => str !== '');
    // }
    // if (!body.execution_id) {
    //   body.execution_id = uuidv4();
    // }
    let incorrectUrls;

    // Iterate through each URL
    for (const url of urls) {
      apiLogger.info("Validate input URL");
      if (!isValidUrl(url)) {
        incorrectUrls = {urls: [url], message: "URL is incorrect" };
        console.log(incorrectUrls);
      }
    }
    const headers = {
      'Authorization': `Bearer ${body?.credentials?.email}:${body?.credentials?.password}`,
      'Content-Type': 'application/json'
    };

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Call worker to startCrawling with valid URL
    const worker = new Worker(__dirname + "../../utils/worker/extractorWorker.js", {
      workerData: { headers, body },
    });
    worker.on("error", (err) => {
      throw err;
    });
    worker.on("message", async (scrapedData) => {
      // const endTime = performance.now();
    
      // const metaData = {
      //   ...createTimeStampMetaData(startTime, endTime),
      //   incorrectUrls
      // }
      // const Data = {
      //   scrapedData,
      //   metadata: metaData
      // }

  
      // TODO: For depth = 2 Storing data to dynamoDB gives error for that commented this code will solve this ASAP
      try {
        // MAKING DYNAMODB STORING DISABLE AS FORMAT OF THE JSON IS CHANGED
        // passUrl.isSave = false;
        // if(passUrl.isSave == true){
        //   const { success } = await insertOrUpdateData(Data)
        //   if(success){
        //     apiLogger.info("Extraction data save in dynamoDB");
        //     return  res.status(200).json({
        //       passUrl: passUrl,
        //       incorrectUrls: incorrectUrls,
        //       scrapedData,
        //       execution_id: body.execution_id,
        //       metadata: metaData
        //     });
        //   }
        // }else{
          if (scrapedData.statusCode) {
            return res.status(scrapedData.statusCode).json(scrapedData);
        } else {
            return res.status(400).json(scrapedData);
        }
          // if (scrapedData.length > 1) {
          //   return  res.status(200).json({
          //     incorrectUrls: incorrectUrls,
          //     scrapedData,
          //     execution_id: body.execution_id,
          //     metadata: metaData
          //   });
          // } else {
          //   return  res.status(400).json({
          //     ErrorMessage: "Extraction failed, please try again",
          //   });
          // }
        // }
        // return res.status(500).json({success: false, message: 'Error'})
        
      } catch (error) {
        apiLogger.error(JSON.stringify(error));
      }
  
      apiLogger.info("Extraction service ends");
  
    });
    
  } catch (error) {
    apiLogger.error(JSON.stringify(error));
    console.log(error);

    return res.status(400).json({ status: false, error, message: "Something went wrong" });
  }
};

/**
 * Function to check if a URL is valid
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidUrl(url) {
  return urlRegex.test(url);
}

/**
 * Function to check if an email is valid
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidEmail(email) {
  return emailRegex.test(email);
}

export { extractor, isValidEmail, isValidUrl };
