// Initialize the configuration object with default values or 
// environment variables
const config = {
    // Set the Listing Service URL from environment variables or use a 
    // default local URL
    // eslint-disable-next-line no-undef
    listingServiceUrl: process.env.LISTING_SERVICE_URL || 'http://app.4fiveone.com/api/listings',
    // eslint-disable-next-line no-undef
    resourceARI: process.env.RESOURCE_ARI || 'ari:nova:us:agsiri:listings',
    // eslint-disable-next-line no-undef
    policyServiceUrl: process.env.POLICY_SERVICE_URL || 'http://app.4fiveone.com/api/policy',
    // eslint-disable-next-line no-undef
    extractorServiceUrl: process.env.EXTRACTOR_URL || 'http://localhost:3003/api/v1',

  
  };
  
  // Export the configuration object for use in other parts of the application
  export default config;
  