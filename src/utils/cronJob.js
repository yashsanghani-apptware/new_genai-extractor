import { startCrawling } from "../services/extractor.js";
import { apiLogger, otherLogger } from "../logger/logger.js";
import { isValidEmail, isValidUrl } from "../controllers/extractor.js";
import { createTimeStampMetaData } from "./helper.js";
import {
  getByUrlAndClientId,
  updateData as dynamoUpdateData,
} from "./aws.js";

/**
 * Extracts data from a list of URLs, optionally requiring login credentials.
 * 
 * @param {Object} body - The request body containing the URLs to extract data from,
 *                       along with optional login information.
 * @param {string[]} body.urls - An array of URLs to extract data from.
 * @param {boolean} [body.login=false] - Indicates whether login credentials are required.
 * @param {Object} [body.credentials] - User credentials for authentication.
 * @param {string} body.credentials.email - User email address.
 * @param {string} body.credentials.password - User password.
 * 
 * @returns {Object|null} An object containing extracted data, along with metadata,
 *                        or null if an error occurs or if the input is invalid.
 * @returns {Object|null} An object containing extracted data, along with metadata,
 *                        or null if an error occurs or if the input is invalid.
 * @returns {Object} response - The response object.
 * @returns {Object|null} response.passUrl - The object containing URLs that passed validation,
 *                                            along with any associated data.
 * @returns {Array} response.scrapedData - An array containing the extracted data.
 * @returns {Object} response.metadata - Metadata about the extraction process.
 * @returns {number} response.metadata.startTime - The start time of the extraction process (in milliseconds).
 * @returns {number} response.metadata.endTime - The end time of the extraction process (in milliseconds).
 * @returns {string|string[]} response.metadata.urlProcessed - The URL(s) that were processed during extraction.
 *                                                              If no valid URL is found, it indicates "URL not found".
 * 
 * @async
 */
export async function dataExtraction(body) {
  apiLogger.info("Extraction service Start");
  const startTime = performance.now();

  try {
    const { urls, login, credentials } = body;

    // Check if 'urls' is provided and not empty
    if (!urls || urls.length === 0) {
      apiLogger.error("URL Not Found");
      return null;
    }

    // Check login and credentials, if provided
    if (login && (!credentials?.email || !credentials?.password)) {
      apiLogger.error("Credentials is incorrect");
      return null;
    } else if (login && credentials && !isValidEmail(credentials.email)) {
      apiLogger.error("Credentials is incorrect");
      return null;
    }

    let passUrl, failUrl;

    // Iterate through each URL
    for (const url of urls) {
      apiLogger.info("Validate input URL");
      if (isValidUrl(url)) passUrl = { ...body, urls: [url] };
      else failUrl = { urls: [url], message: "URL is incorrect" };
    }

    // Call startCrawling only if at least valid URL is found
    const scrapedData = passUrl ? await startCrawling(passUrl) : [];

    const endTime = performance.now();
    apiLogger.info("Extraction service ends");

    return {
      passUrl,
      scrapedData,
      metadata: {
        ...createTimeStampMetaData(startTime, endTime),
        urlProcessed: passUrl
          ? passUrl.urls
          : failUrl
          ? failUrl.urls
          : "URL not found",
      },
    };
  } catch (error) {
    otherLogger.info(error.message);
    return null;
  }
}

/**
 * Updates content extraction event based on the provided URL and parameters.
 * 
 * @param {Object} req - The request object containing the URL and extraction parameters.
 * @param {string} req.body.url - The URL from which content will be extracted.
 * @param {string} [req.body.client_id=""] - The client ID associated with the content extraction event.
 * @param {boolean} [req.body.login=false] - Indicates whether login credentials are required.
 * @param {Object} [req.body.credentials] - User credentials for authentication.
 * @param {string} req.body.credentials.email - User email address.
 * @param {string} req.body.credentials.password - User password.
 * @param {number} [req.body.depth=1] - The depth of the extraction process.
 * 
 * @param {Object} res - The response object to send back to the client.
 * 
 * @returns {Object} The response JSON object containing the status of the update,
 *                   any error information, a message, and the extracted data (if available).
 * @returns {boolean} res.status - Indicates the success or failure of the update operation.
 * @returns {string|null} res.error - The error message, if any.
 * @returns {string} res.message - A descriptive message about the update operation.
 * @returns {Object} res.data - The extracted data, if available, otherwise an empty object.
 * 
 * @async
 */

export async function contentExtractorUpdateEvent(req, res) {
  const { url, client_id, login, credentials, depth } = req.body;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ status: false, message: "Invalid url" });
  }
  if (
    login &&
    (!credentials ||
      !credentials.email ||
      !credentials.password ||
      !isValidEmail(credentials.email))
  ) {
    return res
      .status(400)
      .json({ status: false, message: "Credentials is incorrect" });
  }

  const { status, error, message, data } = await _contentExtractorRefresher(
    url,
    client_id ?? "",
    login ?? false,
    {
      email: credentials?.email ?? "",
      password: credentials?.password ?? "",
    },
    depth ?? 1
  );

  return res.status(200).json({ status, error, message, data: data ?? {} });
}

async function _contentExtractorRefresher(
  url,
  clientId,
  login,
  credentials,
  depth = 1,
  exclude = []
) {
  try {
    const body = {
      urls: [url],
      login: login,
      client_id: clientId,
      credentials: credentials,
      depth: depth,
      notify: "Webhook endpoint URL",
      exclude: exclude,
    };

    const newData = await dataExtraction(body);

    if (!newData || !newData?.scrapedData) {
      return { status: false, error: null, message: "Something went wrong" };
    }

    try {
      let updateData = {};
      const [url, data] = Object.entries(newData.scrapedData[0])[0];

      // parent url hash
      const isHashEqual = await _compareHash(
        url,
        body.client_id,
        data?.metaDataHash
      );

      if (isHashEqual === null) {
        return {
          status: true,
          error: null,
          message: "URL with Client id not exist in dynamoDB",
          data: updateData,
        };
      }

      // parent url hash match or not
      if (!isHashEqual) {
        const updatedWebpageUrls = [];

        if (data?.webpageUrls?.length) {
          for (const webpageUrlInfo of data.webpageUrls) {
            for (const [webpageUrl, webpageUrlData] of Object.entries(
              webpageUrlInfo
            )) {
              // child url hash
              const isHashEqual = await _compareHash(
                webpageUrl,
                body.client_id,
                webpageUrlData?.metaDataHash
              );

              if (!isHashEqual) {
                updatedWebpageUrls.push(webpageUrlInfo);
              }
            }
          }
        }

        updateData = {
          ...newData,
          scrapedData: [
            {
              [url]: {
                ...data,
                webpageUrls: updatedWebpageUrls,
              },
            },
          ],
        };
      }

      if (Object.keys(updateData).length) {
        // update data into dynamo db
        const { success } = await dynamoUpdateData(updateData);
        if (success) {
          console.log("Extraction data updated in dynamoDB");
          apiLogger.info("Extraction data updated in dynamoDB");
          return {
            status: true,
            error: null,
            message: "Extraction data updated in dynamoDB",
            data: updateData,
          };
        } else {
          console.log(
            "Something went wrong while saving updated extraction data in dynamoDB"
          );
          apiLogger.info(
            "Something went wrong while saving updated extraction data in dynamoDB"
          );
          return {
            status: false,
            error: null,
            message:
              "Something went wrong while saving updated extraction data in dynamoDB",
            data: updateData,
          };
        }
      } else {
        console.log("No change with previously saved data in dynamoDB");
        apiLogger.info("No change with previously saved data in dynamoDB");
        return {
          status: true,
          error: null,
          message: "No change with previously saved data in dynamoDB",
        };
      }
    } catch (error) {
      apiLogger.error(JSON.stringify(error));
    }

    apiLogger.info("Extraction service ends");
  } catch (error) {
    apiLogger.error(JSON.stringify(error));
    return { status: false, error: error, message: "Something went wrong" };
  }
}

/**
 * Compares the hash of provided URL data with the hash of existing data in DynamoDB
 * for the given client ID and URL.
 * 
 * @param {string} url - The URL for which the hash of data will be compared.
 * @param {string} clientId - The client ID associated with the URL data.
 * @param {string} urlDataHash - The hash of the URL data to compare.
 * 
 * @returns {boolean|null} A boolean indicating whether the hash of the provided URL data
 *                         matches the hash of existing data in DynamoDB, or null if an error occurs.
 *                         - If the hashes match, returns false.
 *                         - If there is no existing data or an error occurs, returns null.
 * 
 * @async
 */

async function _compareHash(url, clientId, urlDataHash) {
  const existingDynamoDbData = await getByUrlAndClientId(clientId, url);

  if (
    existingDynamoDbData?.success &&
    existingDynamoDbData?.data?.scrapedData
  ) {
    const [, scrapedDataInfo] = Object.entries(
      existingDynamoDbData.data.scrapedData
    )[0];

    // for parent url
    if (scrapedDataInfo?.metaDataHash === urlDataHash) return false;
      //we will change this to true once testing will finish, 
      //for testing purpose we make it false so we can test into dynamodb
      // return true;
    

    return false;
  } else {
    return null;
  }
}
