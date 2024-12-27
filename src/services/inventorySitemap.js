import { clearLogFile, otherLogger } from "../logger/logger.js";
import { PlaywrightCrawler } from "crawlee";
import {
  generateUniqueKey,
  parsedUrl,
} from "../utils/helper.js";

let inventorySitemap = async (req) => {
    try {
      // const {url, paginationCount} = req.body
      const { urls, paginationCount } = req;
  
      // Call the inventorySitemapGenerator function with the provided URLs and pagination count
      let result = await inventorySitemapGenerator(urls, paginationCount);
      return result;
      // res.status(200).send(result);
    } catch (error) {
      // return res.status(400).json({
      //   status: false,
      //   error: JSON.stringify(error),
      //   message: error.message,
      // });
      console.log(error);
    }
  };
  
  async function inventorySitemapGenerator(url, paginationCount) {
    try {
      // Clear the log file
      clearLogFile();
      otherLogger.info("info: sitemap Start");
  
      let searchUrl = url;
      let validUrl = url.split("?");
      let pageCount = 0;
      let searchQuery = `_p=${pageCount}&_dFR%5Btype%5D%5B0%5D=New`;
      let result = [];
  
      if (validUrl.length === 1) {
        searchUrl = `${validUrl[0]}?${searchQuery}`;
      } else {
        pageCount = validUrl[1].split("&")[0].replace("_p=", "");
      }
  
      let pgCount = paginationCount;
      if (!pgCount) {
        pgCount = 1;
      }
  
      console.log({ searchUrl, pageCount, paginationCount, pgCount });
  
      let count = 0;
      let currentCount = Number(pageCount) + count;
      let nextCount = Number(pageCount);
      let nextSearchUrl = searchUrl;
  
      // Loop through the pages
      while (count < pgCount) {
        // Generate the URLs for the current page
        let urls = await createInventoryUrls(nextSearchUrl);
        console.log({ urls, length: urls.length, nextCount }, "GOT URL");
  
        if (nextCount >= urls[0].lastPage) {
          console.log("I'm dyinding off");
          break;
        }
  
        if (urls.length > 1) {
          urls.splice(0, 1);
          result = result.concat(urls);
          count++;
  
          nextCount = Number(pageCount) + count;
  
          nextSearchUrl = nextSearchUrl.replace(
            `_p=${currentCount}`,
            `_p=${nextCount}`
          );
  
          currentCount = Number(pageCount) + count;
  
          console.log(
            { count, nextCount, currentCount, pageCount, nextSearchUrl },
            "RUNNING COUNT "
          );
          otherLogger.info(
            `"RUNNING COUNT " =>  ${{
              count,
              nextCount,
              currentCount,
              pageCount,
              nextSearchUrl,
            }}`
          );
        }
  
        console.log({ count });
      }
  
      console.log(result.length, "RESULT");
      return result;
    } catch (error) {
      otherLogger.error("error:", error);
      // return res.status(400).json({
      //   status: false,
      //   error: JSON.stringify(error),
      //   message: error.message,
      // });
    }
  }
  
  async function createInventoryUrls(customUrl) {
  try {
    let crawleeLinks = [{ url: customUrl, uniqueKey: generateUniqueKey() }];
    const data = [];
    let lastPage = 0;
    const pageInfo = { isNextPage: false, isCurrentPage: false };
  
    let givenPageCount = customUrl.split("?")[1].split("&")[0];
  
    // Create a new PlaywrightCrawler instance
    const crawler = new PlaywrightCrawler({
      // Define the request handler
      async requestHandler({ request, page }) {
        // Parse the URL of the request
        const requestUrl = parsedUrl(request.url);
        if (!requestUrl) return false;
  
        const links = await page.$$eval("a[href]", (links) =>
          links.map((link) => {
            // if(link.href.includes('/inventory/')){
            //   return link.href;
            // }
            return link.href;
          })
        );
  
        const cssSelector = async (selector) => {
          try {
            const locator = page.locator(selector).first();
            return (await locator.count()) ? await locator.textContent() : "";
          } catch (e) {
          otherLogger.error(e.message);
            return "";
          }
        };
        let lastPageSelector = await cssSelector(".pagination-state");
        lastPage = Number(lastPageSelector.split("of ")[1]);
        // Then we need to resolve relative URLs,
        // otherwise they would be unusable for crawling.
        const { hostname } = new URL(request.loadedUrl);
        const absoluteUrls = links.map(
          (link) => new URL(link, request.loadedUrl)
        );
  
        // We use the hostname to filter links that point
        // to a different domain, even subdomain.
        const sameHostnameLinks = absoluteUrls
          .filter((url) => url.hostname === hostname)
          .map((url) => ({ url: url.href }));
  
        console.log("sameHostnameLinks ", sameHostnameLinks.length);
        // Process the same hostname links
        sameHostnameLinks.map((sameHostnameLink) => {
           const requestUrl = parsedUrl(sameHostnameLink.url);
  
          let currentPageCount = requestUrl.split("?")[1]?.split("&")[0];
          let nextPageCount = `_p=${Number(givenPageCount.split("=")[1]) + 1}`;
  
          if (currentPageCount == givenPageCount) {
            pageInfo.isCurrentPage = true;
          }
  
          if (currentPageCount == nextPageCount) {
            pageInfo.isNextPage = true;
          }
  
          if (requestUrl && !data.includes(requestUrl)) {
            if (!requestUrl.includes("/undefined")) {
              if (requestUrl.includes("/inventory/")) {
                data.push(requestUrl);
              }
            }
          }
        });
  
        data.unshift({ lastPage });
      },
  
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
  
    // Run the crawler
    await crawler.run(crawleeLinks);
    console.log('data =>', data);
    return data;
    } catch (error) {
      otherLogger.error("error:", error);
    }
  }

export { inventorySitemap };
