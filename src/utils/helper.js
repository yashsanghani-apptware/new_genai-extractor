/**
 * Generates a unique key composed of a timestamp and a random number.
 * This function is useful for generating unique identifiers in JavaScript.
 * @returns {string} A unique key composed of a timestamp and a random number.
 */
const generateUniqueKey = () => {
  // Get the current timestamp in milliseconds
  const timestamp = new Date().getTime();

  // Generate a random number between 0 and 999999
  const random = Math.floor(Math.random() * 1000000);

  // Concatenate the timestamp and random number to create a unique key
  const uniqueKey = `${timestamp}_${random}`;

  // Return the unique key
  return uniqueKey;
};

/**
 * Creates metadata containing start time, end time, and process time.
 * @param {number} startTime - The start time in milliseconds.
 * @param {number} endTime - The end time in milliseconds.
 * @returns {Object} - Metadata object containing start time, end time, and process time.
 */
const createTimeStampMetaData = (startTime, endTime) => {
    // Convert start time to Date object and format it as a string
    const formattedStartTime = new Date(Date.now() + startTime).toLocaleString();
    
    // Convert end time to Date object and format it as a string
    const formattedEndTime = new Date(Date.now() + endTime).toLocaleString();
    
    // Calculate process time in seconds
    const processTimeSeconds = (endTime - startTime) / 1000;

    // Return metadata object
    return {
        "startTime": formattedStartTime,
        "endTime": formattedEndTime, // Fixed the typo in the property name
        "processTime(Seconds)": processTimeSeconds
    };
};

  /**
 * Removes newline and tab characters from the provided text and trims whitespace.
 * @param {string} data - The text data to be flattened.
 * @returns {string} - The flattened text.
 */
  const flattendText = (data) => {
    let cleanData = data.replace(/\n|\t/g, "").trim();
    // This will remove the javascript code from the text
    const regex = /\.(svg-star-rating)|\.(function\()|<script[\s\S]*?<\/script>|window\.addEventListener\('DOMContentLoaded',\s*function\s*\(\)\s*{[\s\S]*?}\);?|jQuery\(\s*document\s*\)\.ready\(\s*function\s*\(\s*\)\s*{[\s\S]*?}\);?|}\);?/gi;
    cleanData = cleanData.replace(regex, '');

    // This will remove the img tag from the text
    cleanData = cleanData.replace(/<img[^>]*\/?>/g, '');

    // This will remove the <noscript> tag from the text
    cleanData = cleanData.replace(/<noscript[^>]*\/?>/g, '');
    cleanData = cleanData.replace(/<iframe[^>]*\/?>/g, '');
    cleanData = cleanData.replace(/window\.addEventListener\('load', \(\) => \{[^{}]*\}\)/g, '');
    while (/\{[^{}]*\}/g.test(cleanData)) {
      cleanData = cleanData.replace(/\{[^{}]*\}/g, '');
    }
    let patterns = [
      /_satellite\.pageBottom\(\);/,
      /document\.querySelector/,
      /window\.location/,
      /\(function\(c,d,f,g,e\)\{c\[e\]=c\[e\]\|\|\[\];var h=function\(\);var a=d\.createElement\(f\);a\.src=g;a\.async=1;a\.onload=a\.onreadystatechange=function\(\)\{d=d\.getElementsByTagName\(f\)\[0\];d\.parentNode\.insertBefore\(a,d\);\}\}\)\(window,document,'script','\/\/bat\.bing\.com\/bat\.js','uetq'\)/g,
    ];
    let shouldReplace = patterns.some(pattern => pattern.test(cleanData));
    if (shouldReplace) {
      cleanData = "";
    }
    cleanData = clearText(cleanData);
    return cleanData.trim();
    // cleanData.replace(/\s+/g, ' ');
    // const regex = /window\.addEventListener\('load', \(\) => \{[^{}]*\}\)/g;

  };
/**
 * Clear text by replacing it with an empty string if it contains specified words.
 * @param {string} text - The text to be cleared.
 * @returns {string} - An empty string if the text contains any of the specified words; otherwise, the original text.
 */
  const clearText = (text) => {
    // Define an array of words to check
    // For now taken specifically this two words "Privacy Policy", "Your Privacy" As only adding Privacy might remove some important content from the JSON
    const wordsToCheck = [
      "Cookies", // We need to find solution for the website which are related to Cookies(example Biscuits, sweets and some other like those)
      "Privacy Policy",
      "Your Privacy",
      "we store cookies",
      "Cookie List",
      "Cookie Settings",
      "cookie consent'",
      "cookie policy",
      "Cookie Notice"
    ];

    // Create a regular expression pattern to match any of the words in the array
    const regexPattern = new RegExp(wordsToCheck.join("|"), "i");

    // Check if the text contains any of the words
    if (regexPattern.test(text)) {
      // If a match is found, replace the entire text with an empty string
      return "";
    } else {
      // If no match is found, return the original text
      return text;
    }
  };
/**
* Creates a filename from a given URL by extracting the domain, path, and appending the current date and time.
* @param {string} originalUrl - The original URL from which the filename will be created.
* @returns {string} The generated filename.
*/
const createFileNameFromUrl = (originalUrl, requestBody) => {
  // Parse the original URL
  const url = new URL(originalUrl);

  // Extract the domain from the URL's hostname, removing any "www." prefix and ".com" suffix
  let domain = url.hostname.replace(/^www\./, '').replace('.com', '').replace('.', '_'); // Remove 'www.' from the domain and remove '.com'
  if (!domain) domain = 'no_domain'; // If domain is empty, use 'no_domain'

  // Extract the path, replace slashes with underscores
  let path = url.pathname.replace(/\//g, '_'); // Replace slashes with underscores
  path = path.replace('.', '_'); // Replace slashes with underscores
  if (!path) path = 'no_path'; // If path is empty, use 'no_path'

  // Generate a current date and time string, removing non-digits
  // const dateTimeKey = new Date().toISOString().replace(/[^\d]/g, ''); // Remove non-digits from the date and time
  // Create the filename by combining the domain, path, and date/time key
  let fileName = `${domain}_${requestBody.batch_request_id}`;
  // Replace consecutive underscores with a single underscore
  fileName = fileName.replace(/_+/g, '_');
  return fileName;
}

const parsedUrl = (url) => {
  try {
    const { protocol, hostname, pathname, search } = new URL(url);

    return `${protocol}//${hostname}${
      pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
    }${search}`;
  } catch (error) {
    console.log(error.message)
    return "";
  }
};
/**
 * Removes 'www' from the given URL.
 * @param {string} url - The URL string.
 * @returns {string} The modified URL string without 'www'.
 */
const removeWwwFromUrl = (url) => {
  try {
    const parsedUrl = new URL(url);
    // Remove 'www' from the hostname
    const modifiedUrl = parsedUrl.protocol + '//' + parsedUrl.hostname.replace(/^www\./, '') + parsedUrl.pathname;
    return modifiedUrl;
  } catch (error) {
    console.error('Invalid URL:', url, error.message);
    return url; // Return the original URL if it's invalid
  }
};

export { generateUniqueKey, createTimeStampMetaData, flattendText, createFileNameFromUrl,parsedUrl, removeWwwFromUrl }
