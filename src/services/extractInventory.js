import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PlaywrightCrawler, ProxyConfiguration } from "crawlee";
import { clearLogFile, otherLogger } from "../logger/logger.js";
import { Configuration } from "crawlee";
import {
  createFileNameFromUrl,
  generateUniqueKey,
} from "../utils/helper.js";
import { json2csv } from "json-2-csv";
import { inventorySitemap } from "./inventorySitemap.js";

let parentAObj = {
  scrappedData: [],
  input_data: {},
};

/** Site Crawling function whcih will crawl through the website and extract the Data from the URLs accepted from inpust sepcification
 * @param {Object} urlData: URL array to crawl on the site
 * @param {Number} maxDepth Using to set the depth for deep scan
 * @param {Array} exclusions URL needs to exclude while crawling
 */
const extractDataFromUrl = async (urlList) => {
  // Disable persistent storage to prevent saving data across sessions
  const config = Configuration.getGlobalConfig();
  config.set("persistStorage", false);

  const proxyConfiguration = new ProxyConfiguration({
    proxyUrls: [
      "http://groups-RESIDENTIAL,country-US:apify_proxy_L03fJ7ilHVgWIw2aNpiNkDlwzIXd8c45mF5z@proxy.apify.com:8000",
    ],
  });

  const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page, log }) {
      page.setDefaultTimeout(0);

      const cssSelector = async (selector) => {
        try {
          const locator = page.locator(selector).first();
          return (await locator.count()) ? await locator.textContent() : "";
        } catch (e) {
          otherLogger.error(e.message);
          return "";
        }
      };

      const cssSelectorElementHandles = async (selector) => {
        try {
          const locator = page.locator(selector);
          return (await locator.count()) ? await locator.elementHandles() : [];
        } catch (e) {
          otherLogger.error(e.message);
          return [];
        }
      };

      const cssSelectorAttribute = async (selector) => {
        try {
          const locator = page.locator(selector);
          return (await locator.count())
            ? await locator.getAttribute("data-content", { strict: false })
            : "";
        } catch (e) {
          otherLogger.error(e.message);
          return "";
        }
      };

      try {
        let templetForExtractor = {
          url: "",
          title: "",
          vin: "",
          stock: "",
          msrp: "",
          "clearance discount": "",
          "bonus cash": "",
          "beck masten price": "",
          "price block header": "",
          "purchase allowance for current eligible non gm owners and lessees":
            "",
          "total savings": "",
          "for well qualified buyers when financed w gm financial": "",
          "basic info": {
            exterior: "",
            drivetrain: "",
            interior: "",
            transmission: "",
            engine: "",
            "fuel efficiency": "",
            mileage: "",
          },
          "key features": "",
          description: "",
          "vehicle details": "",
          "premium options packages": "",
          "payment options": {
            cash: "",
            msrp: "",
          },
          "other vehicles you may like": [],
          "get directions": "",
          "contact us": "",
          disclaimer: "",
        };
        //await new Promise((r) => setTimeout(r, 10000));
        log.info(`request url => ${request.url}`);
        await page.waitForSelector(".vdp-title__vehicle-info h1");

        otherLogger.info(`Site Crwaling for: ${request.url}`);
        let title = await cssSelector(".vdp-title__vehicle-info h1");
        templetForExtractor.title = title;
        templetForExtractor.vin = await cssSelector("#vin");
        templetForExtractor.stock = await cssSelector(
          ".vdp-title__vin-stock li:nth-child(2)"
        );
        templetForExtractor.stock = cleanData(templetForExtractor.stock);
        templetForExtractor.msrp = await cssSelector(".price-block .price");

        let content = await cssSelectorAttribute(
          ".price-block.dealer-incentive.subtract"
        );
        content = cleanHtmlTags(content);
        templetForExtractor["clearance discount"] = {
          price: await cssSelector(
            ".price-block.dealer-incentive.subtract .price"
          ),
          modalContent: content,
        };
        let bounsCashContent = await cssSelectorAttribute(
          ".price-block.incentive-bonus-cash.subtract"
        );
        bounsCashContent = cleanHtmlTags(bounsCashContent);
        templetForExtractor["bonus cash"] = {
          price: await cssSelector(
            ".price-block.incentive-bonus-cash.subtract .price"
          ),
          modalContent: bounsCashContent,
        };

        templetForExtractor["beck masten price"] = await cssSelector(
          ".price-block.our-price.real-price.strong .price"
        );
        templetForExtractor["price block header"] = await cssSelector(
          ".incentives.incentives-breakdown p.price-block-header"
        );

        let purchaseAllownceContent = "";
        let purchaseAllownceContentElements = await cssSelectorElementHandles(
          ".price-block a"
        );

        for (let i = 0; i < purchaseAllownceContentElements.length; i++) {
          const label = await purchaseAllownceContentElements[i].getAttribute(
            "data-content",
            { strict: false }
          );
          if (
            label &&
            label.includes("Expires:") &&
            label.includes("Description:")
          ) {
            purchaseAllownceContent = await purchaseAllownceContentElements[
              i
            ].getAttribute("data-content", { strict: false });
          }
        }
        purchaseAllownceContent = cleanHtmlTags(purchaseAllownceContent);
        templetForExtractor[
          "purchase allowance for current eligible non gm owners and lessees"
        ] = {
          price: await cssSelector(
            ".incentives.incentives-breakdown .price-block .price"
          ),
          modalContent: purchaseAllownceContent,
        };

        templetForExtractor["total savings"] = await cssSelector(
          ".price-block.strong.total-savings.green-bar .price"
        );
        templetForExtractor[
          "for well qualified buyers when financed w gm financial"
        ] = await cssSelector(
          ".incentives-breakdown.lowest-finance-offer-breakdown .price"
        );
        const labels = await cssSelectorElementHandles(
          ".basic-info-item__label"
        );
        const values = await cssSelectorElementHandles(
          ".basic-info-item__value"
        );

        for (let i = 0; i < labels.length; i++) {
          const label = await labels[i].textContent();
          const value = await values[i].textContent();

          switch (label.trim().toUpperCase()) {
            case "EXTERIOR:":
              templetForExtractor["basic info"].exterior = value.trim();
              break;
            case "DRIVETRAIN:":
              templetForExtractor["basic info"].drivetrain = value.trim();
              break;
            case "INTERIOR:":
              templetForExtractor["basic info"].interior = value.trim();
              break;
            case "TRANSMISSION:":
              templetForExtractor["basic info"].transmission = value.trim();
              break;
            case "ENGINE:":
              templetForExtractor["basic info"].engine = value.trim();
              break;
            case "FUEL EFFICIENCY:":
              templetForExtractor["basic info"]["fuel efficiency"] =
                value.trim();
              break;
            case "MILEAGE:":
              templetForExtractor["basic info"].mileage = value.trim();
              break;
            default:
              break;
          }
        }
        templetForExtractor.description = await cssSelector(
          "#vehicle-description .vdp-component__container"
        );
        templetForExtractor.description = cleanData(
          templetForExtractor.description
        );
        let Premium_Options = await cssSelector(
          "#premium-options .vdp-component__container"
        );
        Premium_Options = cleanData(Premium_Options);
        Premium_Options = Premium_Options.replaceAll("\t", " ");
        templetForExtractor["premium options packages"] = Premium_Options;

        let vehicleDescription = await cssSelector("#vehicle-details");
        vehicleDescription = cleanHtmlTags(vehicleDescription);
        templetForExtractor["vehicle details"] = vehicleDescription;

        let Key_Features = await cssSelector(
          ".vdp-key-features .vdp-component__container"
        );
        Key_Features = Key_Features.replaceAll("\n", " ");
        Key_Features = cleanData(Key_Features);
        templetForExtractor["key features"] = Key_Features;

        templetForExtractor["payment options"].cash = await cssSelector(
          ".vdp-payment-options__content .option__price"
        );
        templetForExtractor["payment options"].msrp = await cssSelector(
          ".vdp-payment-options__content .option__msrp"
        );
        const Other_Vehicles_You_May_Likes = await cssSelectorElementHandles(
          ".vdp-similar-vehicles .flex-row .item .info h3"
        );
        for (const Other_Vehicles_You_May_Like of Other_Vehicles_You_May_Likes) {
          templetForExtractor["other vehicles you may like"].push(
            await Other_Vehicles_You_May_Like.textContent()
          );
        }
        templetForExtractor["get directions"] = cleanData(
          await cssSelector(".ending-address")
        );
        templetForExtractor["contact us"] = cleanData(
          await cssSelector(".location-item__content .location-item__link")
        );
        templetForExtractor.disclaimer = cleanData(
          await cssSelector("#vehicle-disclaimer")
        );

        templetForExtractor.url = request.url;
        parentAObj.scrappedData.push(templetForExtractor);
        otherLogger.info(`extractTexFromSelctor done}`);
      } catch (error) {
        otherLogger.error("error:", error);
      }
      // await enqueueLinks(Array.from(array)); // may be useful in future for depth = 3 scan
    },
    useSessionPool: true,
    persistCookiesPerSession: true,
    proxyConfiguration,
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

  for (const url of urlList) {
    otherLogger.info(`url ==> ${url}`);
    await crawler.run([{ url }]);
  }
  otherLogger.info("END extractServiceContent function");
  return parentAObj;
};

/**
 *  Starting function of the Extraction of DATA from the URLs
 * @param {Object} userData Input specification taken from the Node API response
 * @returns Extrated data from the wensote
 */
const startCrawlingBySelector = async (userData, requestBody) => {
  clearLogFile();
  otherLogger.info("startCrawlingBySelector");
  try {
    const startTime = performance.now();
    // userData.urls.map((url) => {
    //   urlData.push({ url: url, uniqueKey: generateUniqueKey() });
    // });
    // parentUrl = urlData[0].url;
    const urlList = await inventorySitemap(requestBody);
    otherLogger.info(`urlList => ${JSON.stringify(urlList)}`)
    console.log("Fetching the child URLs");
    // let urlList;
    // urlList = requestBody.urls;

    const result = await extractDataFromUrl(
      urlList
    );
    const resultConversionForCsv = JSON.parse(JSON.stringify(result));

    const csvData = [];
    otherLogger.info(`result => ${JSON.stringify(result)}`);
    if (resultConversionForCsv?.scrappedData) {
      for (const resultData of resultConversionForCsv.scrappedData) {
        const url = resultData.url;
        delete resultData.url;
        let jsonString = JSON.stringify(resultData);
        jsonString = jsonString.replaceAll('\\"', '');
        jsonString = jsonString.replaceAll('"', "");
        let content = jsonString.replace(/[{}]/g, "");
        csvData.push({
          chunk_id: generateUniqueKey(),
          url: url,
          fact: content,
          category: "New Vehicle",
          is_lead_capture: true,
          delete_facts: false,
          summary:"",
          questions:"",
        });
      }
    }

    const csv = json2csv(csvData);

    const fileName = createFileNameFromUrl('https://www.beckmastennorth.com/new-vehicles', requestBody);
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const dirPath =
      __dirname + "/../../extractedDataFiles/csv_files_css_selector";
    const filePath = `${dirPath}/${fileName}.csv`;

    const dirPath1 =
      __dirname + "/../../extractedDataFiles";
    const filePath1 = `${dirPath1}/${fileName}.json`;

    // Adding the generated filepaths to the response of extraction service
    // result.push({filePaths: {absoluteFilePath: filePath, relativeFilePath: `ingestor/ingestor_451/json_files_raw/${fileName}.json`, uuid: uuidv4()}});
    result.input_data = requestBody;

    // Check if the directory exists, if not, create it
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true }); // Create directory recursively
    }
    if (!fs.existsSync(dirPath1)) {
      fs.mkdirSync(dirPath1, { recursive: true }); // Create directory recursively
    }

    if (result.scrappedData.length > 0) {
      // Write the file
      fs.writeFileSync(filePath, csv);
      fs.writeFileSync(filePath1, JSON.stringify(result, null, 2));
      if (fs.existsSync(filePath)) {
        console.log(`Extracted CSV uploaded here =>  ${filePath}`); // To Showcase the generated output file path
      }
      if (fs.existsSync(filePath1)) {
        console.log(`Extracted JSON uploaded here =>  ${filePath1}`); // To Showcase the generated output file path
      }
    }
    const endTime = performance.now();
    const timeTaken = endTime - startTime;
    console.log("timeTaken =>", timeTaken); // Caculating the time to Excute the complete function Will remove once the development is done
    otherLogger.info("Crawling successfully done.");
    return result;
  } catch (error) {
    otherLogger.error(JSON.stringify(error));
    throw error; // Throw the error to propagate it to the caller
  }
};

const cleanData = (data) => {
  return data
    .replace(/(\r\n|\n|\r|\t+)/gm, "")
    .replace(/\s\s+/gm, " ")
    .trim();
};
const cleanHtmlTags = (data) => {
  return data
    .replace(/\s\s+/gm, " ")
    .replace(/<\/?p[^>]*>|<\/?strong[^>]*>/g, "")
    .replace(/<\/?div[^>]*>/g, "")
    .replace(/\n/g, ", ")
    .replace(/(\r|\t+)/gm, "")
    .replace(/,\s*$/, "")
    .trim();
};
export { startCrawlingBySelector };
