const webhookIngestor = async (endpoint, requestPayload) => {
  // eslint-disable-next-line no-undef
  const ingestorBaseUrl = `http://${process.env.INGESTOR_HOST}:${process.env.INGESTOR_PORT}/api/v1/`;

  // eslint-disable-next-line no-undef
  const maxAttempts = process.env.MAX_ATTEMPTPS || 3; // Maximum number of attempts
  // eslint-disable-next-line no-undef
  const baseDelay = process.env.BASE_DELAY || 10000; // Base delay in milliseconds (1 second)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(`${ingestorBaseUrl}${endpoint}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestPayload),
      });

      if (!(response.status === 200 || response.status === 404)) { // TODO we need to handle the 400 bad request error
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('webhook response data ==>', data);
      return data;
    } catch (error) {
      console.error(
        `Attempt ${attempt}: Error making API call:`,
        error.message
      );

      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt - 1) * baseDelay;
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error("All attempts failed.");
      }
    }
  }
};
export { webhookIngestor };
