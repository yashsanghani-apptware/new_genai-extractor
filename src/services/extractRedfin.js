import { PlaywrightCrawler, ProxyConfiguration } from "crawlee";
import { v4 as uuidv4 } from "uuid";
import { clearLogFile, otherLogger } from "../logger/logger.js";
import { Configuration } from "crawlee";
import axios from "axios";
import refreshToken from "./refreshToken.js";
import Config from "../config/config.js";
// import  FormData from'form-data';

let urlData = [];
let pageUrl = [];
let firstAttempt = true;
/** Site Crawling function whcih will crawl through the website and extract the Data from the URLs accepted from inpust sepcification
 * @param {Object} urlData: URL array to crawl on the site
 * @param {Number} maxDepth Using to set the depth for deep scan
 * @param {Array} exclusions URL needs to exclude while crawling
 */
const extractDataFromUrl = async (urlList, authHeader) => {
  // Disable persistent storage to prevent saving data across sessions
  const config = Configuration.getGlobalConfig();
  config.set("persistStorage", false);

  const proxyConfiguration = new ProxyConfiguration({
    // eslint-disable-next-line no-undef
    proxyUrls: [process.env.NEW_HTTP_PROXY],
  });

  const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page }) {
      page.setDefaultTimeout(0);

      try {
        const cssSelectorAttribute = async (selector, teg) => {
          try {
            // Get all matching elements using the selector
            const elements = await page.locator(selector).all();

            // Check if there are any elements
            if (elements.length === 0) {
              return [];
            }

            // Get the 'data-content' (or 'src' for images) for each element
            const attributes = [];
            for (const element of elements) {
              const attribute = await element.getAttribute(teg); // Change this to 'src' for images
              if (attribute) {
                attributes.push(attribute);
              }
            }

            return attributes; // Return array of all image 'src' attributes
          } catch (e) {
            otherLogger.error(e.message);
            return [];
          }
        };

        let URLS = await cssSelectorAttribute(
          ".link-and-anchor.visuallyHidden",
          "href"
        );
        otherLogger.info(`URLS ==> ${JSON.stringify(URLS)}`);
        const url = new URL(request.url);
        const baseUrl = `${url.protocol}//${url.hostname}`;
        const fullUrls = URLS.map((path) => `${baseUrl}${path}`);

        urlData = urlData.concat(fullUrls);

        if (firstAttempt) {
          firstAttempt = false;

          let pages = await cssSelectorAttribute(
            ".bp-Button.PageNumbers__page.Pagination__button.spacing-margin-left-xsmall.bp-Button__type--ghost.bp-Button__size--compact",
            "href"
          );

          pages.map((page, index) => {
            pageUrl.push(request.url + "/page-" + (index + 2));
          });
        }
      } catch (error) {
        otherLogger.error(error);
      }
    },
    useSessionPool: true,
    persistCookiesPerSession: true,
    proxyConfiguration,
    navigationTimeoutSecs: 100,
    browserPoolOptions: {
      useFingerprints: true,
      fingerprintOptions: {
        fingerprintGeneratorOptions: {
          browsers: [{ name: "edge", minVersion: 80 }],
          devices: ["desktop"],
          operatingSystems: ["windows"],
        },
      },
    },
    sessionPoolOptions: {
      blockedStatusCodes: [],
    },
  });

  // for (const url of urlList) {
  otherLogger.info(`url ==> ${urlList}`);
  firstAttempt = true;

  await crawler.run([{ url: urlList }]);

  let requestURL = [];
  // requestURL.push(urlList);
  requestURL = pageUrl;

  let formatedReq = [];
  requestURL.map((url) => {
    formatedReq.push({ url: url });
  });
  if (requestURL.length) {
    await crawler.run(formatedReq);
  }

  // Function to split the array into batches of 10
  function splitIntoBatches(array) {
    let result = [];
    for (let i = 0; i < array.length; i += 10) {
      result.push(array.slice(i, i + 10));
    }
    return result;
  }

  // Splitting data into batches of 10
  let batches = splitIntoBatches(urlData, 10);
  let batchesUUID = Array.from({ length: batches.length }, () => uuidv4());

  authHeader = await refreshToken(authHeader);

  batches.forEach((batch, i) => {
    axios
      .post(
        `${Config.extractorServiceUrl}/extractors/redfinData`, // URL
        { urls: batch, batchId: batchesUUID[i] }, // Data (body)
        {
          headers: {
            Authorization: authHeader, // Pass your authorization header
          },
        }
      )
      .then((response) => {
        console.log("extractdata success");

        return response.data;
      })
      .catch((error) => {
        console.error("extractdata error:", error.response.data);
      });
  });
  const responseData = {
    message: "success",
    data: batches,
    batches: batchesUUID,
  };
  otherLogger.info("END extractServiceContent function");
  return responseData;
};

/**
 *  Starting function of the Extraction of DATA from the URLs
 * @param {Object} userData Input specification taken from the Node API response
 * @returns Extrated data from the wensote
 */
const startCrawlingBySelectorInRedfin = async (requestBody, authHeader) => {
  console.log("Start startCrawlingBySelectorInRedfin function");

  clearLogFile();
  otherLogger.info("startCrawlingBySelectorInRedfin");
  try {
    const startTime = performance.now();

    const result = await extractDataFromUrl(requestBody, authHeader);

    otherLogger.info(`result => ${JSON.stringify(result)}`);
    console.log("result =>", result);

    console.log("result.data.length =>", result.data.length);

    const endTime = performance.now();
    const timeTaken = endTime - startTime;
    console.log("timeTaken =>", timeTaken); // Caculating the time to Excute the complete function Will remove once the development is done
    otherLogger.info("Crawling successfully done.");

    if (!result) {
      console.log("result not found");
      return;
    }

    return result;
  } catch (error) {
    otherLogger.error(JSON.stringify(error));
    throw error; // Throw the error to propagate it to the caller
  }
};

export { startCrawlingBySelectorInRedfin };