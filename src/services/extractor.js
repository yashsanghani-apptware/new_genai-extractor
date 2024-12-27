/* eslint-disable no-prototype-builtins */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PlaywrightCrawler, ProxyConfiguration } from "crawlee";
import { otherLogger } from "../logger/logger.js";
import { Configuration } from "crawlee";
import { createFileNameFromUrl, flattendText } from "../utils/helper.js";
import md5 from "md5";
import { sitemap } from "./sitemap.js";
import { webhookIngestor } from "../webhook/webhookApi.js";

// FLAG to set depth 1 child URLs in the object
let sectionAdded = false,
  parentUrl;
let urlListLength = 0;

const regex =
  /<script[\s\S]*?<\/script>|window\.addEventListener\('DOMContentLoaded',\s*function\s*\(\)\s*{[\s\S]*?}\);?|jQuery\(\s*document\s*\)\.ready\(\s*function\s*\(\s*\)\s*{[\s\S]*?}\);?|}\);?/gi;

// Function to determine if the text contains programming constructs
function isProgrammingLanguageText(inputString) {
  // Define regex patterns for common programming constructs
  const patterns = [
    /\bfunction\b/,      // function keyword
    /\bvar\b/,           // var keyword
    /\bconst\b/,         // const keyword
    /\blet\b/,           // let keyword
    /\bif\b/,            // if keyword
    /\belse\b/,          // else keyword
    /\bfor\b/,           // for keyword
    /\bwhile\b/,         // while keyword
    /\breturn\b/,        // return keyword
    /\bclass\b/,         // class keyword
    // eslint-disable-next-line no-useless-escape
    /[\{\}\[\]\(\);]/,   // curly braces, brackets, parentheses, semicolon
    /\bconsole\.log\b/,  // console.log function
    /\$\(/,              // jQuery selector
    /\bdata-\w+\b/,      // data-attributes in HTML 
    /<img\b[^>]*>/       // image tags
  ];

  // Check if any of the patterns match the input string
  return patterns.some(pattern => pattern.test(inputString));
}

/** Site Crawling function whcih will crawl through the website and extract the Data from the URLs accepted from inpust sepcification
 * @param {Object} urlData: URL array to crawl on the site
 * @param {Number} maxDepth Using to set the depth for deep scan
 * @param {Array} exclusions URL needs to exclude while crawling
 */
const extractDataFromUrl = async (urlList, requestBody) => {
  otherLogger.info(`Extraction Process started for the batch id ${requestBody.batch_request_id}`);
  const startTime = performance.now();
  // Disable persistent storage to prevent saving data across sessions
  const config = Configuration.getGlobalConfig();
  config.set("persistStorage", false);
  
  const {http_proxy} = requestBody
  let proxyConfiguration;
  let proxy;
  // eslint-disable-next-line no-undef
  proxy = http_proxy || process.env.HTTP_PROXY
  if(proxy){
    proxyConfiguration = new ProxyConfiguration({
      proxyUrls: [ proxy ] 
    });
  }
  let parentAObj = [];
  const crawler = new PlaywrightCrawler({
    async requestHandler({ request, page, log }) {
      try {
        await new Promise((r) => setTimeout(r, 10000));
        log.info(`Site Crwaling for: => ${request.url}`);
        otherLogger.info(`Site Crwaling for: ${request.url}`);
        const pageTitle = await page.title();
        // const description = await page.$eval(
        //   'meta[name="description"]',
        //   (meta) => meta.getAttribute("content")
        // );

        // WE CAN USE THIS IN FUTURE
        // const metaTags = await page.$$eval("meta", (tags) =>
        //   tags.map((tag) => {
        //     const attributes = {};
        //     tag.getAttributeNames().forEach((attr) => {
        //       attributes[attr] = tag.getAttribute(attr);
        //     });
        //     return attributes;
        //   })
        // );

        // Meta Directives: Remove nofollow meta tags & ahref links:  future used:
        // Check for meta tags with content="nofollow"
        // const noFollowMetaTags = await page.$$eval('meta[name="robots"][content*="nofollow"]', metaElements => {
        //   return metaElements.map(meta => meta.outerHTML);
        // });

        // if (noFollowMetaTags.length > 0) {
        //     console.log(`Meta tags with "nofollow" found on ${request.url}:`);
        //     console.log(noFollowMetaTags);
        // } else {
        //     console.log(`No meta tags with "nofollow" found on ${request.url}`);
        // }
        
        const cssSelectorAll = async (selector) => {
          try {
            const locatorAllText = await page.locator(selector).allInnerTexts()            
            return locatorAllText || [];
          } catch (e) {
            otherLogger.error(`cssSelectorAll Error: ${e.message}`);
            return [];
          }
        };

        let data = null
        let section = []
        const contentGraph = {
          documentId: pageTitle,
          title: pageTitle,
          // metadataJson: JSON.stringify({ metaData: metaTags }),
          section: [],
        };
        requestBody.extraction_advance_model = false  // just remove this line to integrate advance model.
        if(requestBody?.extraction_advance_model){ 
          otherLogger.info(`Site Crwaling using : Advanced Method ${request.url}`);
          let fullContent = await page.locator('div').allInnerTexts() //|| page.content()

          data = await Array.from(new Set(fullContent.map(item => {
            if(item.length > 30 && item.length < 999){
              item = item.replaceAll("\n", " ")
              item = item.replaceAll("\t", " ")
              if(!isProgrammingLanguageText(item)){
                if(item.trim().length > 30)
                return item.trim()
              } 
            }
          })))
          .filter(content => (content != undefined || content != null) )
          .map(content => ({ title: content, text: content }));

          contentGraph["section"] = data 
        } else {
          otherLogger.info(`Site Crwaling using : Basic Method ${request.url}`);

          //FAQ: 
          let allQuestions = await cssSelectorAll(".t585__header .t585__title");
          let allAnswers = await cssSelectorAll(".t585__content  .t-descr");

          section = await Promise.all( allQuestions.map((question, index) => {
            return {
              title: question,
              text: allAnswers[index]
            }
          }))

          //CSS Selector: 
          let css_selectors =  requestBody?.css_selectors || []
          let selectorElements = []

          await Promise.all( css_selectors.map(async (element) => {
            let data = await cssSelectorAll(`.${element}`);

            data?.map(text => {
              if(text?.length > 5 && text?.length < 1999){
                text = flattendText(text)
                selectorElements.push( {
                  title: text,
                  text: text
                })
              }
            })
          }))

          otherLogger.info(`Start extractServiceContent function`);
          //Basic Extractor Code: 
          await extractServiceContent("h1", null, contentGraph, page);
          await extractServiceContent("h2", "h1", contentGraph, page);
          await extractServiceContent("h3", "h2", contentGraph, page);
          await extractServiceContent("h4", "h3", contentGraph, page);
          await extractServiceContent("strong", "h3", contentGraph, page);
          await extractServiceContent("p", "strong", contentGraph, page);
          await extractServiceContent("div", 'a', contentGraph, page);
          await extractServiceContent("a", "span", contentGraph, page);
          await extractServiceContent("span", true, contentGraph, page);
          otherLogger.info(`End of extractServiceContent function`);


          if(selectorElements.length > 0){
            contentGraph.section.push({section: section.concat(selectorElements)})
          } else {
            contentGraph.section.push({section: section})
          }
        }        

        const jsonString = JSON.stringify(contentGraph);
        const md5Hash = md5(jsonString);
        
        if (parentUrl === request.url) {
          parentAObj.push({
            [request.url]: {
              extractedData: contentGraph,
              metaDataHash: md5Hash,
              parentUrl: null,
            },
          });
        } else {
          parentAObj.push({
            [request.url]: {
              extractedData: contentGraph,
              metaDataHash: md5Hash,
              parentUrl,
            },
          });
        }
        removeEmptySections(contentGraph);
        removeDuplicateSections(contentGraph);
        otherLogger.info(`SiteCrwaling successfully run for: ${request.url}`);
      } catch (error) {
        otherLogger.error("SiteCrwaling error:", error.message);
      } finally {
          await page.close();
      }
      // await enqueueLinks(Array.from(array)); // may be useful in future for depth = 3 scan
    },
    useSessionPool: (proxy)?true : false,
    persistCookiesPerSession:(proxy)?true : false,
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
    maxConcurrency: 5
  });

  const extractServiceContent = async (
    headerTag,
    paraentSection,
    contentGraph,
    page
  ) => {
    /**
     * Extracts service content from a web page.
     * @param {string} headerTag - The HTML tag used for service headers (e.g., "h2", "h3", "strong").
     * @param {Object} paraentSection - The parent section to which the extracted content will be added.
     * @param {Object} contentGraph - The object representing the content graph.
     * @param {Page} page - The Playwright page object representing the web page.
     * @returns {void}
     */

    // Get all headers of the specified tag type
    const headers = await page.$$(headerTag);
    await traverseElements(headers, headerTag, contentGraph, paraentSection);
  };
  /**
   * Traverse elements and create sections based on headers.
   * @param {Element[]} headers - Array of header elements to traverse.
   * @param {string} headerTag - The tag name of the header elements (e.g., 'h2', 'h3', 'div').
   * @param {object} contentGraph - The object representing the content graph.
   * @param {object|null} paraentSection - The parent section of the headers, if any.
   * @returns {Promise<void>} A promise that resolves once traversal is complete.
   */
  const traverseElements = async (
    headers,
    headerTag,
    contentGraph,
    paraentSection
  ) => {
    // If header tag is 'div', process headers differently
    if (headerTag == "div") {
      for (const header of headers) {
        const textContent = await header.evaluate((node) =>
          node.textContent.trim()
        );
        // Check if header has child elements
        const hasChildElements = await header.evaluate(
          (node) => node.children.length > 0
        );

        // Skip empty headers and those containing the word "cookie"
        if (
          textContent !== "" &&
          !textContent.toLowerCase().includes("cookie") &&
          !hasChildElements
        ) {
          // Check if header is a child of header, footer, or not a child of main
          const isHeaderChild = await header.evaluate((ele) =>
            ele.closest("header")
          );
          const isFooterChild = await header.evaluate((ele) =>
            ele.closest("footer")
          );
          const isMainChild = await header.evaluate((ele) =>
            ele.closest("main")
          );
          if (isHeaderChild || isFooterChild || !isMainChild) continue; // Skip processing this footer if it's within a <header> section

          let serviceTitle = await header?.textContent();
          serviceTitle = flattendText(serviceTitle);
          if (!serviceTitle) continue;

          // Check if title already exists in the content graph
          let titleAlreadyPresent = false;

          serviceTitle = serviceTitle.replace(regex, "");

          if (serviceTitle !== "") {
            titleAlreadyPresent = detectTextInJSON(
              contentGraph,
              flattendText(serviceTitle),
              headerTag
            );
          }
          const section = await createServiceSecion(
            serviceTitle,
            titleAlreadyPresent,
            header
          );

          if (!paraentSection && section.title) {
            contentGraph.section.push(section);
          } else if (section.title) {
            sectionAdded = false;
            await handleParentsOfSections(header, contentGraph, section);
            if (!sectionAdded) {
              contentGraph.section.push(section);
            }
          }
        }
      }
    } else {
      // Loop through each header
      for (const header of headers) {
        const isHeaderChild = await header.evaluate((ele) =>
          ele.closest("header")
        );
        const isFooterChild = await header.evaluate((ele) =>
          ele.closest("footer")
        );
        if (isHeaderChild || isFooterChild) continue; // Skip processing this footer if it's within a <header> section
        let serviceTitle = await header?.textContent();
        serviceTitle = flattendText(serviceTitle);
        if (!serviceTitle) continue;
        let titleAlreadyPresent = false;

        serviceTitle = serviceTitle.replace(regex, "");

        if (serviceTitle !== "") {
          titleAlreadyPresent = detectTextInJSON(
            contentGraph,
            flattendText(serviceTitle)
          );
        }
        const section = await createServiceSecion(
          serviceTitle,
          titleAlreadyPresent,
          header
        );
        let sectionTextFlag = false;
        if (section.title) {
          sectionTextFlag = detectSectionTextInJSON(contentGraph, flattendText(section.text))
        }
        if (sectionTextFlag) {
          section.title = undefined
        }

        if (!paraentSection && section.title) {
          contentGraph.section.push(section);
        } else if (section.title) {
          if (headerTag == "h2") {
            if (contentGraph.section.length)
              contentGraph.section[0].section.push(section);
            else contentGraph.section.push(section);
          }
          // Handle parents of sections for h3, strong and p tags
          if (
            headerTag == "h3" ||
            headerTag == "h4" ||
            headerTag == "strong" ||
            headerTag == "p" ||
            headerTag == "a" ||
            headerTag == "span"
          ) {
            sectionAdded = false;
            await handleParentsOfSections(header, contentGraph, section);
            if (!sectionAdded) {
              contentGraph.section.push(section);
            }
          }
        }
      }
    }
  };
  /**
   * Create a service section based on the provided service title and description.
   * @param {string} serviceTitle - The title of the service.
   * @param {boolean} titleAlreadyPresent - Indicates whether the service title already exists.
   * @param {HTMLElement} header - The header element associated with the service.
   * @returns {Promise<object>} A promise that resolves to an object representing the service section.
   */
  const createServiceSecion = async (
    serviceTitle,
    titleAlreadyPresent,
    header
  ) => {
    // Determine the service name based on the title and existing presence
    const serviceName =
      serviceTitle !== "" && !titleAlreadyPresent
        ? flattendText(serviceTitle)
        : undefined;

    // Extract service description from header's next siblings
    const { serviceDescription, what, where } = await header.evaluate( // log also a patameter
      (ele) => {
        let log = [];
        let nextSibling = ele.nextElementSibling;
        let text = "",
          what = "",
          where = "";
        log.push(`ele ==> ${JSON.stringify(ele.outerHTML)}`);
        while (
          (nextSibling &&
            nextSibling?.textContent &&
            nextSibling?.textContent !== "") ||
          (nextSibling?.tagName &&
            (nextSibling?.tagName.toLowerCase() === "img" ||
              nextSibling?.tagName.toLowerCase() === "p" ||
              nextSibling?.tagName))
        ) {
          if (
            nextSibling?.tagName &&
            nextSibling?.tagName.toLowerCase() === "style"
          ) {
            nextSibling = nextSibling.nextElementSibling;
            continue;
          }
          if (
            nextSibling?.tagName &&
            nextSibling?.tagName.toLowerCase() !== "img"
          ) {
            const form = nextSibling.querySelector("form"); // Query the form element
            // let styleTag;
            // if (form) styleTag = form.querySelector("style"); // Query the style tag within the form
            if (!form) {
              // Exclude text content within <style> tags WE CAN USE THIS FUTURE HENCE ADDED IN THE COMMENT NOT REMOVED
              // const textContentExcludingStyle = Array.from(form.childNodes) // Iterate over form's children
              //     .filter(node => node.tagName !== 'STYLE') // Exclude style tag
              //     .map(node => node.textContent.trim())
              //     .join(' ');
              // text += textContentExcludingStyle;

              // Extract text content normally

              text += nextSibling?.textContent?.trim();
            }
          }

          // Get the previous sibling, parent element, and grandparent element to find <a>
          let previousSibling = ele?.previousElementSibling;
          let parentElement = ele?.parentElement;
          let grandParentElement = parentElement?.parentElement;

          // Check if any of the adjacent or parent/grandparent elements are anchor tags
          if (
            nextSibling?.tagName.toLowerCase() === "a" ||
            previousSibling?.tagName.toLowerCase() === "a" ||
            parentElement?.tagName.toLowerCase() === "a" ||
            grandParentElement?.tagName.toLowerCase() === "a"
          ) {
            // Determine the anchor element based on priority (nextSibling > previousSibling > parentElement > grandParentElement)
            const anchorElement =
              nextSibling?.tagName.toLowerCase() === "a"
                ? nextSibling
                : previousSibling?.tagName.toLowerCase() === "a"
                ? previousSibling
                : parentElement?.tagName.toLowerCase() === "a"
                ? parentElement
                : grandParentElement;

            // If the href attribute value exists, append the trimmed text content and href value
            if (anchorElement?.href) {
              what += anchorElement?.textContent?.trim() + " ";
              where += anchorElement?.href;
            }
          }
          const aTag = ele?.querySelector("a")
            ? ele?.querySelector("a")
            : nextSibling?.querySelector("a")
            ? nextSibling?.querySelector("a")
            : previousSibling?.querySelector("a")
            ? previousSibling?.querySelector("a")
            : parentElement?.querySelector("a")
            ? parentElement?.querySelector("a")
            : grandParentElement?.querySelector("a");

          if (aTag) {
            if (aTag?.href) {
              what = aTag?.textContent?.trim() + " ";
              where = aTag?.href;
            }
          }
          nextSibling = nextSibling.nextElementSibling;
        }

        return { serviceDescription: text, log, what, where };
      }
    );

    // Log aded in the evaluate header function
    // if (log) {
    //   log &&
    //     log?.forEach((element) => {
    //       otherLogger.info(element);
    //     });
    // }

    if (what && where) {
      // Return an object representing the service section
      return {
        title: serviceName,
        text:
          flattendText(serviceDescription) !== ""
            ? flattendText(serviceDescription)
            : serviceName,
        action: {
          what: flattendText(what),
          where: where,
        },
        section: [], // Will be filled with service types
      };
    } else {
      // Return an object representing the service section
      return {
        title: serviceName,
        text:
          flattendText(serviceDescription) !== ""
            ? flattendText(serviceDescription)
            : serviceName,
        section: [], // Will be filled with service types
      };
    }
  };

  /**
   * Removes empty sections from a nested object recursively.
   * @param {Object} obj - The object to remove empty sections from.
   */
  const removeEmptySections = (obj) => {
    // Check if the input is an object
    if (typeof obj === "object") {
      // If it's an array, iterate over each element
      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          // Recursively call removeEmptySections for each element
          removeEmptySections(obj[i]);
        }
      } else {
        // If the object has a "section" property and it's an empty array, delete it
        if (obj["section"] && obj["section"].length === 0)
          delete obj["section"];
        // Recursively call removeEmptySections for each property of the object
        for (const key in obj) {
          removeEmptySections(obj[key]);
        }
      }
    }
  };

  /**
   * Removes duplicate sections from a nested section object.
   * @param {Object} section - The section object to remove duplicates from.
   * @param {string} section.title - The title of the section.
   * @param {string} section.text - The text content of the section.
   * @param {Array<Object>} [section.section] - An array of nested subsections.
   * @returns {void}
   */
  const removeDuplicateSections = (section) => {
    try {
      // Check if the section has nested subsections
      if (section.section) {
        // Recursively remove duplicates from nested subsections
        section.section.forEach((subSection) =>
          removeDuplicateSections(subSection)
        );

        // This filters the nested subsections of the section object to remove duplicates based on the combination of their title and text properties
        // The condition (index === self.findIndex(...)) ensures that only the first occurrence of each unique subsection (based on title and text) is kept, while subsequent occurrences are filtered out
        section.section = section.section.filter(
          (subSection, index, self) =>
            index ===
            self.findIndex(
              (other) =>
                other.title === subSection.title &&
                other.text === subSection.text
            )
        );
      }
    } catch (error) {
      // Log error if any occurs
      otherLogger.error(
        `Error While removing duplicate sections ${JSON.stringify(error)}`
      );
    }
  };

  /**
   * Function to trigger the Crawling on the given URL and Manage the depth of the Scan
   * @param {Array} urls Input specification URLs
   */
  const handleChildCrawleRun = async (urls) => {
    // THIS FOR LOOP USED WHEN WE ARE GETTING URLS FROM SITEMAP
    for (const url of urls) {
      otherLogger.info(
        `Remaining URLS for batch ${requestBody.batch_request_id} => ${urlListLength}`
      );
      urlListLength = urlListLength - 1;
      await crawler.run([{ url }]);
    }
  };

  await handleChildCrawleRun(urlList);
  otherLogger.info(`Extraction Process end for the batch id ${requestBody.batch_request_id}`);

  // if (requestBody.depth === 0) {
    generateExtractedFinalOutput(startTime, requestBody, parentAObj);
  // } else {
  //   return parentAObj;
  // }
};

/**
 * Handle the Parents of the JSON and Push the new section in the proper parent's section (contentGraph)
 * @param {HTMLElement} header
 * @param {Object} contentGraph
 * @param {Object} section
 */
const handleParentsOfSections = async (header, contentGraph, section) => {
  let parent = await header.evaluateHandle((element) => {
    return element?.parentElement; // Get the parent element
  });

  const parentText = await parent?.evaluate((element) => {
    return element?.textContent?.trim(); // Get the text content of the parent element
  });
  let grandparentText = parentText;
  let grandparent = parent;
  while (true) {
    let newGrandparent = await grandparent?.evaluateHandle((element) => {
      return element?.parentElement; // Get the parent of the parent element (grandparent)
    });
    if (await newGrandparent.evaluate((element) => !element)) {
      otherLogger.info(`First while loop is break`);
      grandparentText = "";
      break;
    }
    let newParentText = await newGrandparent?.evaluate((element) => {
      return element?.textContent?.trim(); // Get the text content of the grandparent element
    });

    if (newParentText !== parentText) {
      grandparentText = newParentText;
      break;
    } else {
      grandparent = newGrandparent;
    }
  }

  let greatGrandparentText = grandparentText;
  let greatGrandparent = grandparent;
  while (true) {
    if (await greatGrandparent.evaluate((element) => !element)) {
      otherLogger.info(`start of second while loop is break`);
      greatGrandparentText = "";
      break;
    }
    let newGreatGrandparent = await greatGrandparent.evaluateHandle(
      (element) => {
        return element.parentElement; // Get the parent of the grandparent element (great-grandparent)
      }
    );
    if (await newGreatGrandparent.evaluate((element) => !element)) {
      otherLogger.info(`second while loop is break`);
      greatGrandparentText = "";
      break;
    }
    let newGrandparentText = await newGreatGrandparent.evaluate((element) => {
      return element?.textContent?.trim(); // Get the text content of the great-grandparent element
    });

    if (newGrandparentText !== grandparentText) {
      greatGrandparentText = newGrandparentText;
      break;
    } else {
      greatGrandparent = newGreatGrandparent;
    }
  }
  if (contentGraph.section.length) {
    function logTextValues(sec) {
      if (sec.title.trim() !== "") {
        if (
          parentText?.includes(sec.title.trim()) ||
          grandparentText?.includes(sec.title.trim()) ||
          greatGrandparentText?.includes(sec.title.trim())
        ) {
          if (sec.section && !sectionAdded) {
            sectionAdded = true;
            sec.section.push(section);
            return;
          }
        }
      }
      if (sec.section) {
        sec.section.forEach((subSection) => {
          return logTextValues(subSection);
        });
      }
    }

    contentGraph.section.forEach((section) => {
      return logTextValues(section, contentGraph.section);
    });
  } else {
    sectionAdded = true;
    contentGraph.section.push(section);
  }
};

/**
 * Recursively searches for a specific text within a JSON object.
 * @param {Object} json - The JSON object to search.
 * @param {string} searchText - The text to search for.
 * @returns {boolean} - True if the search text is found, otherwise false.
 */
const detectTextInJSON = (json, searchText) => {
  // Check if the JSON object is not null or undefined
  if (json && typeof json === "object") {
    // Check if the object has a text property
    if (json.hasOwnProperty("text")) {
      if (json.text.includes(searchText) || json.title.includes(searchText)) {
        return false; // Found the search text in the text property
      }
    }
    // Check if the object has a section property which is an array
    if (json.hasOwnProperty("section") && Array.isArray(json.section)) {
      // Iterate over each section recursively and check for the search text
      for (const subsection of json.section) {
        if (detectTextInJSON(subsection, searchText)) {
          return false; // Found the search text in one of the subsections
        }
      }
    }
  }
  return false; // Search text not found in the JSON object
};
const detectSectionTextInJSON = (json, searchText) => {
  // Check if the JSON object is not null or undefined
  if (json && typeof json === "object") {
    // Check if the object has a text property
    if (json.hasOwnProperty("text")) {
      if (json.text.includes(searchText) || json.title.includes(searchText)) {
        return true; // Found the search text in the text property
      }
    }
    // Check if the object has a section property which is an array
    if (json.hasOwnProperty("section") && Array.isArray(json.section)) {
      // Iterate over each section recursively and check for the search text
      for (const subsection of json.section) {
        if (detectSectionTextInJSON(subsection, searchText)) {
          return true; // Found the search text in one of the subsections
        }
      }
    }
  }
  return false; // Search text not found in the JSON object
};

/**
 *  Starting function of the Extraction of DATA from the URLs
 * @param {Object} userData Input specification taken from the Node API response
 * @returns Extrated data from the wensote
 */
const startCrawling = async (requestBody) => {
  try {
  // clearLogFile();
  const startTime = performance.now();
  otherLogger.info("Start startCrawling function");
  parentUrl = requestBody.urls[0];

    console.log("Fetching the child URLs");
    let urlList = [];
    // THIS CODE IS WHEN WE GET URLS FROM SITEMAP
    if (requestBody.depth > 0) {
      urlList = await sitemap(requestBody);
      urlListLength = urlList.length;
      const result = await extractDataFromUrl(urlList, requestBody);
      generateExtractedFinalOutput(startTime, requestBody, result)
      return result;
    } else {
      urlList = requestBody.urls;
      urlListLength = urlList.length;
      extractDataFromUrl(urlList, requestBody);
      otherLogger.info('Input specifcation accepted');
      return {
        status: true,
        statusCode: 202,
        message: "Input specification accepted",
      };
    }

    // return result;
  } catch (error) {
    otherLogger.error(JSON.stringify(error));
    throw error; // Throw the error to propagate it to the caller
  }
};

async function removeGlobalDuplicateTexts(data) {
  const uniqueTexts = new Set();

   return await data.map(urlObject => {
      const urlKey = Object.keys(urlObject)[0];
      const sections = urlObject[urlKey].extractedData.section;

      const uniqueSections = sections?.filter(section => {
          if (!uniqueTexts.has(section.text)) {
              uniqueTexts.add(section.text);
              return true;
          }
          return false;
      });

      urlObject[urlKey].extractedData.section = uniqueSections;
      return urlObject;
  });
}
const handleFailedExtractionUrls = (data, batch) => { 
  // Convert the data array of objects into a single object
const parentObjecMap = data.reduce((acc, obj) => {
  const key = Object.keys(obj)[0];
  acc[key] = obj[key];
  return acc;
}, {});

const failedUrlsList = [];

// Check each URL in the urls array
batch.forEach(url => {
  if (!parentObjecMap.hasOwnProperty(url)) {
      failedUrlsList.push(url);
  }
});

return failedUrlsList;
}
async function generateExtractedFinalOutput(startTime, requestBody, parentAObj) {
  otherLogger.info(`Generate Extracted FinalOutput for the batch id ${requestBody.batch_request_id}`);

  let fileName = createFileNameFromUrl(requestBody.urls[0], requestBody);

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  console.log("__dirname =>", __dirname);
  const dirPath = __dirname + "/../../extractedDataFiles";

  if (fs.existsSync(`${dirPath}/${fileName}.json`)) {
    fileName = new Date().toISOString().replace(/[^\d]/g, "") + fileName;
  }
  const filePath = `${dirPath}/${fileName}.json`;

  // Adding the generated filepaths to the response of extraction service
  // result.push({filePaths: {absoluteFilePath: filePath, relativeFilePath: `ingestor/ingestor_451/json_files_raw/${fileName}.json`, uuid: uuidv4()}});
  parentAObj = await removeGlobalDuplicateTexts(parentAObj);
  const failedUrls = await handleFailedExtractionUrls(parentAObj, requestBody.urls);
  // parentAObj.push({ inputRequests: requestBody });

  //Remove empty content urls:
  let emptyContentUrls = []
  parentAObj.map(url => {
    let urlName = url[Object.keys(url)[0]]
    if(urlName.extractedData?.section?.length < 1 || !urlName.extractedData.section){
      emptyContentUrls.push(Object.keys(url)[0])
    }
  })
  
  // Filter out the elements in main that are in arr2
  parentAObj = parentAObj.filter(item => {
    const key = Object.keys(item)[0];
    return !emptyContentUrls.includes(key);
  });

  // Check if the directory exists, if not, create it
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true }); // Create directory recursively
  }
  if (parentAObj.length > 0) {
    // Write the file
    fs.writeFileSync(filePath, JSON.stringify(parentAObj, null, 2));
    if (fs.existsSync(filePath)) {
      try {
        otherLogger.info(`File generated and Wehbhool call for the batch id ${requestBody.batch_request_id}`);
        console.log(`Extracted JSON uploaded here =>  ${filePath}`); // To Showcase the generated output file path
        console.log("************webhook API body***********")
        let payload = {
          batch_request_id: requestBody.batch_request_id,
          // pipeline_request_id: requestBody.pipeline_request_id,
          file_uri: filePath,
          extractor_data: parentAObj,
          failed_urls: failedUrls,
          failed_reason: failedUrls.length ? 'Extraction is failed for these URLs' : '',
          empty_content_urls: emptyContentUrls,
          empty_content_reason: emptyContentUrls.length ? 'No content found for these URLs' : '',
        };
        // console.log(JSON.stringify(payload));
        webhookIngestor('content-extractor/', payload)
      } catch (error) {
        console.error("Error making API call:", error.message);
      }
    }
  }
  const endTime = performance.now();
  const timeTaken = endTime - startTime;
  console.log("timeTaken =>", (timeTaken/1000).toFixed(2) + ' Seconds'); // Caculating the time to Excute the complete function Will remove once the development is done
  otherLogger.info("Crawling successfully Done.");
  return parentAObj;
}

export { startCrawling };
