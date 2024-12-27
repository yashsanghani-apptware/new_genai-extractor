import axios from "axios";
import xml2js from "xml2js";
import dotenv from "dotenv";
dotenv.config();
/**
 * it gives Disallow url from robots.txt file
 * @param {Request} domain - url domain
 */
async function fetchDisallowedUrls(domain) {
  try {
    // Make a GET request to the robots.txt file
    const response = await axios.get(`${domain}/robots.txt`);

    // Check if the response was successful
    if (response.status === 200) {
      const responseData = response.data;
      const lines = responseData.split("\n");
      const disallowUrls = lines
        .filter((line) => line.startsWith("Disallow:"))
        .map((line) => {
          const urls = line.split(" ")[1];
          return `${domain}${urls}`;
        });
      let removeR = disallowUrls.map((url) => url.replace("\r", ""));
      let filteredUrls = removeR.filter((url) => !url.endsWith("/?"));
      let urlsEndingWithSlash = filteredUrls.filter((url) => url.match(/\/$/));
      let urlsNotEndingWithSlash = filteredUrls.filter(
        (url) => !url.match(/\/$/)
      );
      let cleanedUrls = urlsNotEndingWithSlash.map((url) =>
        url.replace(/\*$/, "")
      );
      let RegUrl = disallowUrls.filter((url) => url.endsWith("/*?"));
      const new_list = [];
      let new_url;
      let reg;
      if (RegUrl.length > 0) {
        for (let j = 0; j < RegUrl.length; j++) {
          const url = RegUrl[j].split("/");
          new_url = url[2].split(".");
          new_list.push(url[3]);
        }
        const new_string = new_list.join("|");
        reg = new RegExp(
          `^https://${new_url[0]}\\.${new_url[1]}/(${new_string})/.*/\\?`
        );
      }
      // Extract the text from the URLs that include wildcards
      let texts = removeR
        .filter((url) => url.includes("*"))
        .map((url) => {
          let text = url.split("*")[1];
          if (text.endsWith("?")) {
            return text.slice(0, -1); // Remove the '?' character
          }
          return text;
        })
        .filter((text) => text !== ""); // Remove empty strings
      let removeOracleUrl = cleanedUrls.filter((url) => !url.endsWith("/*?"));

      // Return the disallowed URLs, URLs ending with a slash, text, and regular expression
      return [removeOracleUrl, urlsEndingWithSlash, texts[0], reg];
    } else {
      // Log an error if the robots.txt file is not found
      console.log("robots.txt File Not Found");
      return [];
    }
  } catch (error) {
    console.log(error.response ? error.response.status : error.message);
    return [];
  }
}

async function checkUrlInList(url, urls) {
  return !urls.includes(url);
}

async function fetchSitemapUrls(domain) {
  try {
    // Make a GET request to the robots.txt file
    // let sitemap_search_order= process.env.sitemap_search_order
    // eslint-disable-next-line no-undef
    let sitemap_search_order = process.env.sitemap.split(",");
    const response = await axios.get(`${domain}/robots.txt`);
    // Check if the response was successful
    if (response.status === 200) {
      const responseData = response.data;
      const lines = responseData.split("\n");
      // const sitemapUrls = lines.filter(line => line.endsWith('.xml'))
      const sitemapUrls = lines
        .filter((line) => line.startsWith("Sitemap"))
        .map((line) => {
          const urls = line.split(" ")[1];
          return `${urls}`;
        });
      if (sitemapUrls.length > 0) {
        let URLS;
        URLS = await xmlUrls(sitemapUrls);
        // const sitemapXmlUrls = URLS.map(url => {
        //   const parts = url.split(',');
        //   return parts[0];
        // }).filter(url => url.endsWith('.xml'));
        const sitemapXmlUrls = URLS.flatMap((url) => {
          if (url.includes(",")) {
            const [base, ...suffixes] = url.split(",");
            return [
              `${base}`,
              ...suffixes.map((suffix) => `${domain}/${suffix.trim()}`),
            ];
          }
          return `${url}`;
        }).filter((url) => url.endsWith(".xml"));
        if (sitemapXmlUrls.length > 0) {
          let newurl = await xmlUrls(sitemapXmlUrls);
          let NEW = [...URLS, ...newurl];
          const filteredUrls = NEW.filter((url) => !url.endsWith(".xml"));
          return filteredUrls;
        }
        return URLS;
      } else {
        let sitemapUrls = [];
        for (let i in sitemap_search_order) {
          sitemapUrls.push(`${domain}/${sitemap_search_order[i]}`);
        }
        let URLS;
        // let newData;

        URLS = await xmlUrls(sitemapUrls);
        const sitemapXmlUrls = URLS.flatMap((url) => {
          if (url.includes(",")) {
            const [base, ...suffixes] = url.split(",");
            return [
              `${base}`,
              ...suffixes.map((suffix) => `${domain}/${suffix.trim()}`),
            ];
          }
          return `${url}`;
        }).filter((url) => url.endsWith(".xml"));
        if (sitemapXmlUrls.length > 0) {
          URLS = await xmlUrls(sitemapXmlUrls);

          return URLS;
        }
        return URLS;
      }
    } else {
      // Log an error if the robots.txt file is not found
      console.log("robots.txt File Not Found");

      return [];
    }
  } catch (error) {
    console.log(error.response ? error.response.status : error.message);
    return [];
  }
}

async function extractUrlsFromXml(xmlData) {
  try {
    const parser = new xml2js.Parser();
    const parsedXml = await parser.parseStringPromise(xmlData);
    let urls = [];
    let data = [];
    // Assuming URLs are in the 'loc' tag
    if (parsedXml.urlset && parsedXml.urlset.url) {
      urls = parsedXml.urlset.url.map((urlObj) => urlObj.loc[0]);
      data = urls.map((str) => str.match(/\bhttps?:\/\/\S+/g)).flat();
    } else {
      data = parsedXml.sitemapindex.sitemap.map((urlObj) => urlObj.loc[0]);
    }
    // const $ = cheerio.load(data, { xmlMode: true });
    // data = $('sitemap > loc').map((index, element) => $(element).text().trim()).get();
    return data;
  } catch (err) {
    console.error("Error reading or parsing XML file:", err);
    return [];
  }
}

async function xmlUrls(sitemapUrls) {
  let URLS = [];
  for (let i = 0; i < sitemapUrls.length; i++) {
    try {
      const urlResponse = await axios.get(sitemapUrls[i]);
      if (urlResponse.status === 200) {
        const Data = urlResponse.data;
        const url = await extractUrlsFromXml(Data);

        URLS.push(url);
      } else {
        console.log(`${sitemapUrls[i]}File Not Found`);
      }
    } catch (error) {
      console.log(`${sitemapUrls[i]} Error:`, error.message);
    }
  }
  const flattenedArray = URLS.flat();
  return flattenedArray;
}

export { fetchDisallowedUrls, checkUrlInList, fetchSitemapUrls };
