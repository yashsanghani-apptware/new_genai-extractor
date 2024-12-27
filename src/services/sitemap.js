import { otherLogger } from "../logger/logger.js";
import { isValidUrl } from "../controllers/extractor.js";
import { PlaywrightCrawler, Configuration, ProxyConfiguration } from "crawlee";
import {
  generateUniqueKey,
  parsedUrl,
  removeWwwFromUrl,
} from "../utils/helper.js";
import { fetchDisallowedUrls,fetchSitemapUrls} from "../utils/robots.js";
import { v4 as uuidv4 } from "uuid";
import { webhookIngestor } from "../webhook/webhookApi.js";

/**
 * Controller function to generating sitemap request
 * @param {Request} req - Express request object
 */
const sitemap = async (req) => {
  try {
    otherLogger.info("info: Sitemap Start");
    if (req.pipeline_request_id === "" || req.pipeline_request_id === null) {
      return {
        status: false,
        statusCode: 400,
        message: "pipeline_request_id can not be empty",
      };
    }
    console.log({req});
    // Extract the required parameters from the request
    let { exclude: excludeUrls, depth: maxDepth, include: inclusions, apply_robot_txt=true, follow_meta_directives=true, http_proxy,use_sitemap=true } = req.data ? req.data : req;
    let url;
    if (req.data) {
      url = req.data.site_url
    } else {
      url = req.urls[0]
    }
    if (!url || url === "" || url === null) {
      return {
        status: false,
        statusCode: 400,
        message: "url can not be empty",
      };
    }
    if (!isValidUrl(url)) {
      return {
        status: false,
        statusCode: 400,
        message: "Enter valid URL",
      };
    }
    if (Array.isArray(inclusions)) {
      inclusions = inclusions.filter(str => str !== '');
    } else {
      return {
        status: false,
        statusCode: 400,
        message: "include should array of urls in strings",
      };
    }
    if (Array.isArray(excludeUrls)) {
      excludeUrls = excludeUrls.filter(str => str !== '');
    } else {
      return {
        status: false,
        statusCode: 400,
        message: "exclude should array of urls in strings",
      };
    }
    // Check if maxDepth is less than 0
    if (maxDepth < 0) {
      // Return an error if maxDepth is less than 0
      return {
        status: false,
        statusCode: 400,
        message: "depth should be more than 0",
      };
    }
    if (!req.pipeline_request_id) {
      const sitemapUrlListData = await generateSitemap(maxDepth, url, apply_robot_txt, excludeUrls, follow_meta_directives, inclusions, uuidv4(), http_proxy,use_sitemap);
      return  sitemapUrlListData
    } else {
      generateSitemap(maxDepth, url, apply_robot_txt, excludeUrls, follow_meta_directives, inclusions, req.pipeline_request_id, http_proxy,use_sitemap);
      return {
        status: true,
        statusCode: 202,
        message: "Input Sepcification accepted"
      };  
    }
    
  } catch (error) {
    otherLogger.error("error:", error);
    console.log(req.data);
    return {
      status: false,
      statusCode: 400,
      error: JSON.stringify(error),
      message: "Please validate input specification",
    };
  }
};

async function generateSitemap(maxDepth, url, apply_robot_txt, excludeUrls, follow_meta_directives, inclusions, pipeline_request_id, http_proxy,use_sitemap) {
  try {
    // Check if maxDepth is 0
    if (!use_sitemap&&maxDepth == 0) {
      // Return the URL if maxDepth is 0
      callWebhook([url], pipeline_request_id);
      return [url];
    }

    // Extract the domain from the URL
    let domain = new URL(url).origin;
    let urlsEndingWithSlash =[];
    let text;
    let reg;
    if (apply_robot_txt) {
      try {
        // Fetch disallowed URLs
        const disallowUrls = await fetchDisallowedUrls(domain);
        // Extract the disallowed URLs, URLs ending with slash, text, and regular expression
        const [excluded, urlsWithSlash, fetchedText, fetchedReg] = disallowUrls;
        
        urlsEndingWithSlash = urlsWithSlash;
        text = fetchedText;
        reg = fetchedReg;
        // Update the exclude URLs
        excludeUrls = [...excludeUrls, ...excluded];
      } catch (error) {
        console.error('Error fetching disallowed URLs:', error);
      }
    }

    // Once sitemap urls list generated then call webhook with list of url list

    let data = [];
    excludeUrls = excludeUrls.map((excludeUrl) => {
      return parsedUrl(excludeUrl);
    });

    let crawleeLinks = [{ url: url, uniqueKey: generateUniqueKey() }];
    let newCrawleeLinks = [];

    if (url) {
      if (isValidUrl(url)) {
        if(use_sitemap){
          let dataURLS = await fetchSitemapUrls(domain);
          const cleanedUrls = excludeUrls.map(url => url.replace(/\/\*$/, ''));
           data = dataURLS.filter(url => 
            !cleanedUrls.some(pattern => url.startsWith(pattern))
          );
        } 
        if(use_sitemap===false || data.length===0){
        for (let i = 0; i < maxDepth; i++) {
          // Disable persistent storage to prevent saving data across sessions
          const config = Configuration.getGlobalConfig();
          config.set("persistStorage", false);

          // proxy code: 
          let proxyConfiguration;
          if(http_proxy){
            proxyConfiguration = new ProxyConfiguration({
              proxyUrls: [ http_proxy ] 
            });
          }
          console.log({proxyConfiguration})

          // Create a new crawler
          const crawler = new PlaywrightCrawler({
            // Define the request handler
            async requestHandler({ request, page }) {
              const requestUrl = parsedUrl(request.url);
              if (!requestUrl) return false;
              if (
                !data.includes(requestUrl) &&
                !excludeUrls.includes(requestUrl)
              ) {
                if (excludeUrls.length) {
                  let flag1 = false;
                  excludeUrls.map((ele) => {
                    if (ele.endsWith('*')) {
                      if (
                        removeWwwFromUrl(requestUrl).startsWith(
                          removeWwwFromUrl(ele.replace('/*', ''))
                        )
                      ) {
                        flag1 = true;
                      }
                    }
                    if (ele.endsWith('?')) {
                      if (removeWwwFromUrl(requestUrl).startsWith(removeWwwFromUrl(ele))) {
                        flag1 = true;
                      }
                    }

                  });
                  if (!flag1) {
                    flag1 = true;
                    if (!(requestUrl.endsWith('.pdf') || requestUrl.endsWith('.pdf/')) && !(requestUrl.endsWith('.ics') || requestUrl.endsWith('.ics/')))
                      data.push(requestUrl);
                  }
                } else {
                  if (!(requestUrl.endsWith('.pdf') || requestUrl.endsWith('.pdf/')) && !(requestUrl.endsWith('.ics') || requestUrl.endsWith('.ics/'))) {
                    data.push(requestUrl);
                  }
                }
              }

              // Wait for 10 seconds
              await new Promise((r) => setTimeout(r, 10000));
              if(follow_meta_directives != false || follow_meta_directives == undefined){
                // Check for any links with rel="nofollow"
                const nofollowLinks = await page.$$eval('a[rel="nofollow"]', linkElements => {
                 return linkElements.map(link => link.href); 
                });
                excludeUrls = [...excludeUrls, ...nofollowLinks]
              }

              // we first have to extract all
              // the URLs from the page.
              const links = await page.$$eval("a[href]", (links) =>
                links.map((link) => link.href)
              );

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

              // Process the same hostname links
              sameHostnameLinks.map((sameHostnameLink) => {
                const requestUrl = parsedUrl(sameHostnameLink.url);
                if (
                  requestUrl &&
                  !data.includes(requestUrl) &&
                  !excludeUrls.includes(requestUrl)
                ) {
                  {
                    if (excludeUrls.length) {
                      let flag = false;
                      excludeUrls.map((ele) => {
                        if (ele.endsWith('*')) {
                          if (
                            removeWwwFromUrl(requestUrl).startsWith(
                              removeWwwFromUrl(ele.replace('/*', ''))
                            )
                          ) {
                            flag = true;
                          }
                        }
                        if (ele.endsWith('?')) {
                          if (removeWwwFromUrl(requestUrl).startsWith(removeWwwFromUrl(ele))) {
                            flag = true;
                          }
                        }
                      });
                      if (!flag) {
                        flag = true; 
                        if (!(requestUrl.endsWith('.pdf') || requestUrl.endsWith('.pdf/')) && !(requestUrl.endsWith('.ics') || requestUrl.endsWith('.ics/'))) {
                          data.push(requestUrl);
                          newCrawleeLinks.push({
                            url: requestUrl,
                            uniqueKey: generateUniqueKey(),
                          });
                        }
                      }
                    } else {
                      if (!(requestUrl.endsWith('.pdf') || requestUrl.endsWith('.pdf/')) && !(requestUrl.endsWith('.ics') || requestUrl.endsWith('.ics/'))) {
                        data.push(requestUrl);
                        newCrawleeLinks.push({
                          url: requestUrl,
                          uniqueKey: generateUniqueKey(),
                        });
                      }
                    }
                  }
                }
              });
            },
            useSessionPool: (http_proxy)?true : false,
            persistCookiesPerSession:(http_proxy)?true : false,
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

          await crawler.run(crawleeLinks);
          crawleeLinks = newCrawleeLinks;
          newCrawleeLinks = [];
        }
      }
        let removeR =url.replace(/\/$/, ''); 
        // const filteredUrls = data.filter(urls => urls.startsWith(removeR) );
        const filteredUrls = data.filter(urls => removeWwwFromUrl(urls).startsWith(removeWwwFromUrl(removeR)) );
        let include = inclusions;
        if (include?.length != 0) {
          // To check the url domain uncomment the following code
          // let Url = new URL(url);
          // let UrlDomain = Url.origin + "/";
          for (let i in include) {
            // let includeUrl = include[i];
            // let parsedUrl = new URL(includeUrl);
            // let parsedUrlDomain = parsedUrl.origin + "/";
            // if (parsedUrlDomain == UrlDomain) {
              if (!filteredUrls.includes(include[i])) {
                filteredUrls.push(include[i]);
              }
            // }
          }
        }
        let filteredUrl = filteredUrls.filter(url => !url.startsWith(domain+"/?"));
        let Urls = filteredUrl.filter(url => !url.endsWith(text));
        let dataUrls = Urls.filter(url => !urlsEndingWithSlash.includes(url));
        if (reg){
          let regUrl = dataUrls.filter(url => !url.match(reg));
          callWebhook(regUrl, pipeline_request_id);
          return regUrl
        }
        callWebhook(dataUrls, pipeline_request_id);
        return dataUrls;
      } else {
        otherLogger.error("error: invalid url");
        return {
          status: false,
          message: "invalid url",
        };
      }
    } else {
      otherLogger.error("error: URL Not Found");
      return {
        status: false,
        message: "URL Not Found",
      };
    }
  } catch (error) {
    console.log(error)
  }
}

async function callWebhook(sitemapList, pipeline_request_id) {
  try {
    let payload = {pipeline_request_id: pipeline_request_id, sitemap: sitemapList};
    console.log('***************************WEBHOOK API CALL*****************************');
    console.log(`WEHBOOK API call for pipile id: ${JSON.stringify(payload.pipeline_request_id)}`);
    otherLogger.info(`WEHBOOK API call for pipile id: ${JSON.stringify(payload.pipeline_request_id)}`);
    otherLogger.info(`SitemapList: ${JSON.stringify(payload)}`);
    webhookIngestor('sitemap/', payload);
  } catch (error) {
    console.error('Error making API call:', error.message);
  }   
}
export { sitemap };
