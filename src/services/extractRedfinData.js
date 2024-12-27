import { PlaywrightCrawler, ProxyConfiguration } from "crawlee";
import { clearLogFile, otherLogger } from "../logger/logger.js";
import { Configuration } from "crawlee";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import config from "../config/config.js";

import refreshToken from "./refreshToken.js";

/** Site Crawling function whcih will crawl through the website and extract the Data from the URLs accepted from inpust sepcification
 * @param {Object} urlData: URL array to crawl on the site
 * @param {Number} maxDepth Using to set the depth for deep scan
 * @param {Array} exclusions URL needs to exclude while crawling
 */
const extractDataFromUrl = async (urlList) => {
  // Disable persistent storage to prevent saving data across sessions
  const config = Configuration.getGlobalConfig();
  let failed_urls = [];
  let scrappedData = [];

  config.set("persistStorage", false);

  const proxyConfiguration = new ProxyConfiguration({
    // eslint-disable-next-line no-undef
    proxyUrls: [process.env.NEW_HTTP_PROXY],
  });

  const crawlers = new PlaywrightCrawler({
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

      const cssSelectorAll = async (selector) => {
        try {
          const locatorAllText = await page.locator(selector).allInnerTexts();
          return locatorAllText || [];
        } catch (e) {
          otherLogger.error(`cssSelectorAll Error: ${e.message}`);
          return [];
        }
      };

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

      // Function to extract the first number from a string
      function extractNumberFromString(str) {
        const match = str.match(/-?\d+(\.\d+)?/); // Regular expression to match both integers and decimals
        const number = match ? parseFloat(match[0]) : null;

        // If the number is less than 1, return 1; otherwise, return the number itself
        return number !== 0 && number < 1 ? 1 : number;
      }

      // Function to extract key-value pairs dynamically
      function extractBathroomData(data) {
        // Initialize the object with default values
        const bathroomObj = {
          number_full: 0,
          number_total: 0,
          bathroom1_level: "NA",
          bathroom2_level: "NA",
        };

        // Find the bathroom information
        const bathroomData = data.find((item) =>
          item.startsWith("Bathroom Information")
        );
        if (!bathroomData) return bathroomObj; // Return default values if not found

        // Split and process the bathroom details
        const bathroomDetails = bathroomData.split("\n").slice(1); // Remove the header

        bathroomDetails.forEach((line) => {
          const [key, value] = line.split(": ").map((str) => str.trim());

          if (key && value) {
            if (key.includes("Full")) {
              bathroomObj.number_full = parseInt(value) ? parseInt(value) : 0;
            } else if (key.includes("Total")) {
              bathroomObj.number_total = parseInt(value) ? parseInt(value) : 0;
            } else if (key.includes("Bath Levels")) {
              bathroomObj.bathroom1_level = value ? value : 0;
              bathroomObj.bathroom2_level = value ? value : 0;
            }
          }
        });

        return bathroomObj;
      }

      function extractRoomData(data) {
        // Filter only the lines that start with "Room"
        const rooms = data.filter((item) => item.startsWith("Room"));
        if (!rooms) return [];

        return rooms
          .map((room) => {
            // Split by new lines and remove the first line (which is the room identifier)
            const roomDetails = room.split("\n").slice(1);
            const roomObj = {};
            roomDetails.forEach((line) => {
              if (line.includes("Type") || line.includes("Level")) {
                // Split key and value based on ": " delimiter
                const [key, value] = line.split(": ").map((str) => str.trim());
                if (key && value) {
                  // Set key as "type" if "Type" is in line, or "level" if "Level" is in line
                  if (key.includes("Type")) {
                    roomObj["type"] = value;
                  } else if (key.includes("Level")) {
                    roomObj["level"] = value;
                  }
                }
              }
            });

            // Only return roomObj if it has any data
            if (Object.keys(roomObj).length !== 0) {
              return roomObj;
            }
          })
          .filter(Boolean); // Filter out any undefined values
      }

      function extractBasementData(data) {
        const basementData = data.find((item) =>
          item.startsWith("Basement Information")
        );
        if (!basementData) return {};
        return {
          basement: basementData.split(": ")[1].trim(),
        };
      }

      function extractLaundryData(data) {
        const laundryData = data.find((item) =>
          item.startsWith("Laundry Features")
        );
        if (!laundryData) return {};
        return {
          laundry: laundryData.split(": ")[1].trim(),
        };
      }

      function extractFireplaceData(data) {
        const fireplaceData = data.find((item) =>
          item.startsWith("Fireplace Information")
        );
        if (!fireplaceData) return {};

        const fireplaceDetails = fireplaceData.split("\n").slice(1);
        const fireplaceObj = {};
        fireplaceDetails.forEach((line) => {
          const [key, value] = line.split(": ").map((str) => str.trim());
          if (key && value) {
            fireplaceObj[key.toLowerCase().replace(/\s+/g, "_")] = value;
          }
        });
        return fireplaceObj;
      }

      function transformData(input) {
        const result = [];

        for (let i = 0; i < input.length; i += 3) {
          const dateInfo = input[i].split("\n\n");
          const eventInfo = input[i + 1].split("\n\n");
          const priceInfo = input[i + 2].split("\n\n");

          const entry = {
            Date: dateInfo[0],
            status: eventInfo[0],
            Price: priceInfo[0],
          };

          result.push(entry);
        }

        return result;
      }

      try {
        let templetForExtractor = {
          name: "test_name",
          address: {
            house_number: 0,
            street: "test_street",
            city: "test_city",
            apartment: "NA",
            state: "test_state",
            zip: 395006,
          },
          property_description: "test_property_description",
          property_highlights: {
            total_acres: 0,
            tillable: 0,
            woodland: 0,
            wetland: 0,
            deed_restrictions: "NA",
            barns: [],
          },
          days_on_market: 0,
          type: "test_type",
          listing_agent: {
            name: "test_listing_agent",
            company: "test_company",
            phone_number: "518-231-7241",
            email: "",
          },
          schools: "test_schools",
          built_on: "1999-01-01",
          property_details: {
            parking: {
              number_of_spaces: 0,
              type: "Garage",
            },
            exterior: {},
            location: {},
            utilities: {},
            interior: {},
            financial: {},
          },
          sales_and_tax: {
            sales_history: {},
            tax_history: {},
          },
          public_facts: {},
          listing_source: "SYSTEM",
          status: "SOURCED",
          images: [],
          videos: []
        };
        //await new Promise((r) => setTimeout(r, 10000));
        log.info(`request url => ${request.url}`);
        // await page.waitForSelector(".vdp-title__vehicle-info h1");

        otherLogger.info(`Site Crwaling for: ${request.url}`);
        // let title = await cssSelector(".vdp-title__vehicle-info h1");

        // ----------Redfin data-----------

        let status = await cssSelector(
          ".bp-DefinitionFlyout.bp-DefinitionFlyout__underline"
        );

        if (status !== "PENDING") {
          templetForExtractor.status = status;
          let address = await cssSelector(".street-address");
          if (!address) {
            address = "000 Temp Address";
          }

          templetForExtractor.address.house_number = address.split(" ")[0];
          templetForExtractor.address.street = address
            .split(" ")
            .slice(1)
            .join(" ")
            .replace(/,$/, "");
          templetForExtractor.name = address
            .split(" ")
            .slice(1)
            .join(" ")
            .replace(/,$/, "");

          let city = await cssSelector(".dp-subtext.bp-cityStateZip");
          if (!city) {
            city = "Temp city, TE 00000";
          }

          let parts = city.split(", ");

          // Further split the second part (NY 12053) by space

          let stateAndZip = parts[1]
            ? parts[1].split(" ")
            : parts[0].split(" ");
          templetForExtractor.address.city =
            parts.length == 1 ? "NA" : parts[0];
          templetForExtractor.address.state = stateAndZip[0];
          templetForExtractor.address.zip = stateAndZip[1] || "00000";
          templetForExtractor.property_description =
            (await cssSelector(".remarks")) || "Temp property_description";
          templetForExtractor.listing_agent.name =
            (await cssSelector(".agent-basic-details--heading span")) ||
            templetForExtractor.listing_agent.name;
          let company = await cssSelector(".agent-basic-details--broker span");
          templetForExtractor.listing_agent.company =
            company.trim().substring(2) ||
            templetForExtractor.listing_agent.company;
          templetForExtractor.listing_agent.phone_number =
            (await cssSelector(".agent-info-link")) ||
            templetForExtractor.listing_agent.phone_number;
          templetForExtractor.listing_agent.email = await cssSelector(
            ".email-addresses a"
          );

          let acresData = await cssSelectorAll(".keyDetails-value");

          templetForExtractor.type = acresData[1] || "Temp type";

          // Loop through the data array
          for (let i = 0; i < acresData.length; i++) {
            let currentItem = acresData[i];

            // Separate if condition for "days on Redfin"
            if (currentItem.includes("on Redfin")) {
              const daysOnRedfin = extractNumberFromString(currentItem);
              templetForExtractor.days_on_market = daysOnRedfin || 0;
            }

            // Separate if condition for "acres"
            if (currentItem.includes("acres")) {
              const acres = extractNumberFromString(currentItem);
              templetForExtractor.property_highlights.total_acres = acres || 0;
            }
            // Separate if condition for "acres"
            if (currentItem.includes("tillable")) {
              const tillable = extractNumberFromString(currentItem);
              templetForExtractor.property_highlights.tillable = tillable || 0;
            }
            // Separate if condition for "acres"
            if (currentItem.includes("woodland")) {
              const woodland = extractNumberFromString(currentItem);
              templetForExtractor.property_highlights.woodland = woodland || 0;
            }
            // Separate if condition for "acres"
            if (currentItem.includes("wetland")) {
              const wetland = extractNumberFromString(currentItem);
              templetForExtractor.property_highlights.wetland = wetland || 0;
            }

            if (currentItem.includes("spaces")) {
              const parking = extractNumberFromString(currentItem);
              templetForExtractor.property_details.parking.number_of_spaces =
                parking || 0;
            }

            // Separate if condition for "Built in"
            if (currentItem.includes("Built in")) {
              const builtInYear = extractNumberFromString(currentItem);
              templetForExtractor.built_on = builtInYear
                ? `${builtInYear}-01-01`
                : "1999-01-01";
            }
          }

          let property_details = await cssSelectorAll(".amenity-group");

          // List of dynamic keys you want to extract
          const dynamicKeys = [
            "Beds",
            "Baths",
            "Finished Sq. Ft.",
            "Unfinished Sq. Ft.",
            "Total Sq. Ft.",
            "Stories",
            "Lot Size:",
            "Style",
            "Year Built",
            "Year Renovated",
            "County",
            "APN",
          ];

          // Function to dynamically filter the data based on the list of dynamic keys
          const filteredData = property_details.filter((item) => {
            return dynamicKeys.some((key) => item.startsWith(key));
          });

          // Convert filtered data into key-value pairs
          const jsonResponse = filteredData.reduce((acc, item) => {
            const lines = item.split("\n"); // Split each data block into lines

            // Convert the lines into key-value pairs
            const result = {};
            lines.forEach((line) => {
              const [key, value] = line.split(":").map((str) => str.trim()); // Split by ':' and trim spaces
              if (key && value) {
                result[key.replace(/[\s.]+/g, "_")] = value; // Replace spaces and periods with underscores in the key
              }
            });

            // Merge the result into the accumulator
            return { ...acc, ...result };
          }, {});

          templetForExtractor.public_facts =
            jsonResponse || "Temp public_facts";

          // Function to extract specific sections in JSON key-value format
          function extractSection(data, sectionName) {
            // Find the section that starts with the sectionName
            const section = data.find((item) => item.startsWith(sectionName));

            if (!section) {
              return {}; // Return empty object if the section isn't found
            }

            // Split the section into lines and remove the section header
            const lines = section.split("\n").slice(1);

            // Convert the lines into key-value pairs
            const result = {};
            lines.forEach((line) => {
              const [key, value] = line.split(":").map((str) => str.trim()); // Split by ':' and trim spaces
              if (key && value) {
                result[key.replace(/[\s.]+/g, "_")] = value; // Replace spaces and periods with underscores in the key
              }
            });

            return result;
          }

          // Extracting Property Information, Lot Information, and Exterior Features (if applicable)
          const propertyInfo = extractSection(
            property_details,
            "Property Information"
          );
          const lotInfo = extractSection(property_details, "Lot Information");
          // Assuming you may have a future "Exterior Features" section or similar
          const exteriorFeatures = extractSection(
            property_details,
            "Exterior Features"
          );

          // Combine the extracted sections into one JSON object
          const result = {
            property_information: propertyInfo,
            lot_information: lotInfo,
            features: exteriorFeatures, // This will be empty if no matching section
          };

          let schoolsData = await cssSelector(
            ".ListItem__heading.font-body-base-bold.color-text-primary"
          );
          templetForExtractor.schools = schoolsData || "Temp schools";

          const locationData = {
            school_information: extractSection(
              property_details,
              "School Information"
            ),
            location_information: extractSection(
              property_details,
              "Location Information"
            ),
          };

          const utilitiesData = {
            utility: extractSection(property_details, "Utility Information"),
            heating_and_cooling: extractSection(
              property_details,
              "Heating & Cooling"
            ),
          };

          const financialData = {
            TaxInformation: extractSection(property_details, "Tax Information"),
          };

          templetForExtractor.property_details.exterior = result;
          templetForExtractor.property_details.location = locationData;
          templetForExtractor.property_details.utilities = utilitiesData;
          templetForExtractor.property_details.financial = financialData;
          let price = await cssSelector(".statsValue");

          templetForExtractor.property_details.financial.price = {
            currency: "USD",
            price: parseInt(price.replace("$", "").replace(/,/g, ""), 10) || 0,
          };

          // templetForExtractor.property_details.interior.bathrooms = extractBathroomData(data);
          // templetForExtractor.property_details.interior.rooms = extractRoomData(data);
          // Build the final object
          const interiorData = {
            bathrooms: extractBathroomData(property_details),
            rooms:
              extractRoomData(property_details)[0] == null
                ? [{ type: "NA", level: "NA" }]
                : extractRoomData(property_details),
            basement: extractBasementData(property_details),
            laundry: extractLaundryData(property_details),
            fireplace: extractFireplaceData(property_details),
          };

          templetForExtractor.property_details.interior = interiorData;

          let salesData = await cssSelectorAll(".col-4");
          templetForExtractor.sales_and_tax.sales_history =
            transformData(salesData);
          console.log("<<<<<<<<<<<<<<<<<<<<<<<");


          const retryClickAndGetSrc = async (page, maxRetries = 3) => {
            let attempt = 0;
            let src = null;

            while (attempt < maxRetries) {
              try {
                if (page.isClosed()) {
                  console.log("Page is closed. Stopping retries.");
                  break;
                }

                // Locate the button with the given selector
                const button = await page.$(
                  "#photoPreviewButton .bp-Button.bp-Button__type--secondary-outlined.bp-Button__size--compact"
                );

                if (button) {
                  console.log(
                    `Button found, clicking... Attempt ${attempt + 1}`
                  );
                  await button.click(); // Click the button
                  console.log("Clicked on photo preview button");

                  // Wait for images to load
                  if (!page.isClosed()) {
                    await page.waitForTimeout(10000); // Wait for 9 seconds to ensure images are loaded
                  } else {
                    console.log("Page was closed before timeout.");
                    break;
                  }

                  // Extract the image source
                  src = await cssSelectorAttribute(".img-card", "src"); // Assuming cssSelectorAttribute is async and fetches 'src'
                  console.log("src", src, src ? src.length : 0);

                  if (src && src.length > 0) {
                    // If valid src is found, return it
                    break;
                  } else {
                    console.log("No images found, retrying...");
                  }
                } else {
                  console.log(
                    "Button with specified class not found, skipping click."
                  );
                  break; // If button is not found, exit the loop
                }
              } catch (error) {
                // Catch errors such as page closing or any other issues
                console.error(`Error on attempt ${attempt + 1}:`, error);
                if (page.isClosed()) {
                  console.log("Page is closed. Stopping retries.");
                  break;
                }
              }

              attempt++; // Increment the attempt count

              // Wait before retrying if we haven't exhausted the retry attempts
              if (attempt < maxRetries && !page.isClosed()) {
                await page.waitForTimeout(10000); // Wait 5 seconds before retrying
              }
            }

            return src; // Return the final result (either valid src or null)
          };

          try {
            const src = await retryClickAndGetSrc(page);

            // Assign the src to your data template if found
            if (src && src.length > 0) {
              templetForExtractor.images = src;
            }


            try {
              // Select the button with the specified data attribute
              const videoButton = await page.locator('button:has-text("Video")');

              if (videoButton) {

                // Click the video button
                await videoButton.click();

                // Wait for the video element to load (adjust selector as needed for your page)
                await page.waitForSelector('#GuidedWalkthroughVideo');

                // Get the src attribute of the video element
                await page.evaluate(() => {
                  const video = document.querySelector('#GuidedWalkthroughVideo'); // Update selector if needed
                  return video ? templetForExtractor.videos.push(video.src) : null;
                });
              }
            } catch (error) {
              console.error("Error during the retry process:", error);
            }

          } catch (error) {
            console.error("Error during the retry process:", error);
          }



          if (templetForExtractor.name == "Temp Address") {
            if (!failed_urls.includes(request.url)) {

              failed_urls.push(request.url);
            }
          } else {
            const urlIndex = failed_urls.indexOf(request.url);
            if (urlIndex > -1) {
              // Remove the URL from failed_urls
              failed_urls.splice(urlIndex, 1);
            }

            scrappedData.push(templetForExtractor);
          }

          otherLogger.info(`extractTexFromSelctor done}`);
        }
      } catch (error) {
        otherLogger.error("error:", error);
      }
      // await enqueueLinks(Array.from(array)); // may be useful in future for depth = 3 scan
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

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  await crawlers.run(urlList);
  await sleep(5000);

  for (let i = 0; i < 3; i++) {
    // Splitting data into batches of 10

    if (failed_urls.length > 0) {
      await sleep(5000);
      await crawlers.run(failed_urls);
    }
  }

  otherLogger.info("END extractServiceContent function");
  return scrappedData;
};

/**
 *  Starting function of the Extraction of DATA from the URLs
 * @param {Object} userData Input specification taken from the Node API response
 * @returns Extrated data from the wensote
 */
const startCrawlingBySelectorInRedfinData = async (requestBody, authHeader) => {
  console.log("Start startCrawlingBySelectorInRedfin function");
  clearLogFile();
  otherLogger.info("startCrawlingBySelectorInRedfin");
  try {
    let new_image = [];
    const startTime = performance.now();

    const result = await extractDataFromUrl(requestBody);

    const endTime = performance.now();
    const timeTaken = endTime - startTime;
    console.log("timeTaken =>", timeTaken); // Caculating the time to Excute the complete function Will remove once the development is done
    otherLogger.info("Crawling successfully done.");

    if (!result) {
      console.log("result not found");
      return;
    }

    // Function to remove duplicates
    const removeDuplicates = (result) => {
      const uniqueEntries = [];
      const seen = new Set();

      result.forEach((item) => {
        const uniqueKey = `${item.name}-${item.address.house_number}`;

        if (!seen.has(uniqueKey)) {
          seen.add(uniqueKey);
          uniqueEntries.push(item);
        }
      });

      return uniqueEntries;
    };

    const filteredData = removeDuplicates(result);

    otherLogger.info(`result => ${JSON.stringify(filteredData)}`);
    console.log("result =>", filteredData);
    console.log("result >>>>>>>> =>", JSON.stringify(filteredData));

    console.log(filteredData.length);

    try {
      // Create URL object from requestBody
      const url = new URL(requestBody);

      // Generate a random number for unique file naming
      let rendomNo = Math.floor(Math.random() * 1000000);
      let fileName = url.hostname + rendomNo;

      // Get the current file's directory
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // Define the folder path
      const folderPath = path.join(__dirname, "../../redfinDataFiles");

      // Check if the folder exists, if not, create it
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      // Define the file path
      const filePath = path.join(folderPath, `${fileName}.json`);

      // Convert filtered data to JSON string
      const jsonContent = JSON.stringify(filteredData, null, 2); // `null, 2` is used for pretty formatting

      // Write the JSON content to the file
      fs.writeFileSync(filePath, jsonContent);

      console.log(`JSON file created at: ${filePath}`);
    } catch (error) {
      console.error("Error creating JSON file:", error);
    }
    // Create a new listing
    for (let i = 0; i < filteredData.length; i++) {
      authHeader = await refreshToken(authHeader);

      console.log("filteredData[i] =>", filteredData[i], authHeader);

      new_image = [];
      new_image = new_image.concat(filteredData[i].images);
      delete filteredData[i].images;
      console.log("new_image =>", filteredData[i]);
      const listing = await axios
        .post(
          `${config.listingServiceUrl}/listings`, // URL
          filteredData[i], // Data (body)
          {
            headers: {
              Authorization: authHeader, // Pass your authorization header
            },
          }
        )
        .then((response) => {
          console.log("listing created successfully");

          return response.data;
        })
        .catch((error) => {
          console.error("LISTING_CREATE_ERROR", error.response.data);
        });

      if (listing.listing_id) {
        console.log("listing =>", listing.listing_id);
        const formdata = new FormData();
        // Fetch and append images to the FormData
        for (let imageUrl of new_image) {
          const response = await fetch(imageUrl);
          if (!response.ok) {
            throw new Error("Failed to fetch image from " + imageUrl);
          }

          const blob = await response.blob(); // Convert to Blob
          formdata.append("image", blob); // Append the image file
        }

        await axios
          .post(
            `${config.listingServiceUrl}/listings/media/${listing.listing_id}/image`, // URL
            formdata, // Data (body)
            {
              headers: {
                Authorization: authHeader, // Pass your authorization header
                "Content-Type": "multipart/form-data",
              },
            }
          )
          .then((response) => {
            console.log("media created successfully");
            return response.data;
          })
          .catch((error) => {
            console.error("MEDIA_CREATE_ERROR", error.response.data);
          });
      }
    }

    return filteredData;
  } catch (error) {
    otherLogger.error(JSON.stringify(error));
    throw error; // Throw the error to propagate it to the caller
  }
};

export { startCrawlingBySelectorInRedfinData };
