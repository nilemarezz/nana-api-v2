import Fastify from "fastify";
import routes from "./routes/index.js";
import { createGoogleSheetConnection } from "./service/googlesheet.js";
import cors from "@fastify/cors";
import axios from "axios";
import moment from "moment-timezone";

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  // put your options here
});

fastify.register(routes);

// Polling configuration
const POLLING_INTERVAL = 14 * 60 * 1000; // 14 minutes in milliseconds
const API_URL = "https://nana-api-v2.onrender.com";
const TIMEZONE = "Asia/Bangkok"; // GMT+7
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds between retries
const TESTING_MODE = false; // Set to false for production

// Function to check if current time is within polling window (18:00 to 2:00 GMT+7)
const isWithinPollingWindow = () => {
  // In testing mode, always return true
  if (TESTING_MODE) {
    console.log(`[${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}] TESTING MODE: Polling window check bypassed`);
    return true;
  }
  
  const now = moment().tz(TIMEZONE);
  const hour = now.hour();
  
  // Check if time is between 18:00 (6 PM) and 23:59, or between 00:00 and 01:59 (2 AM)
  return hour >= 18 || hour < 2;
};

// Function to make polling request with retry logic (ping-like behavior)
const makePollingRequest = async () => {
  if (!isWithinPollingWindow()) {
    console.log(`[${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}] Outside polling window, skipping request`);
    return;
  }

  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}] Pinging ${API_URL} (attempt ${attempt}/${MAX_RETRIES})`);
      
      const response = await axios.get(API_URL, {
        timeout: 30000, // 30 seconds timeout
        headers: {
          'User-Agent': 'nana-api-v2-poller'
        },
        validateStatus: () => true // Accept any status code (200, 404, 500, etc.)
      });
      
      console.log(`[${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}] Ping successful - server responded (status: ${response.status})`);
      return; // Success, exit the function - any response means server is alive
      
    } catch (error) {
      // Only retry on network/connection errors, not HTTP status errors
      const isConnectionError = error.code === 'ECONNREFUSED' || 
                               error.code === 'ENOTFOUND' || 
                               error.code === 'ETIMEDOUT' ||
                               error.message.includes('timeout') ||
                               error.message.includes('Network Error');
      
      if (!isConnectionError) {
        // If it's not a connection error, consider it a successful "ping"
        console.log(`[${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}] Ping successful - server responded with error: ${error.message}`);
        return;
      }
      
      lastError = error;
      console.error(`[${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}] Ping failed on attempt ${attempt}/${MAX_RETRIES} (connection error):`, error.message);
      
      // If this isn't the last attempt, wait before retrying
      if (attempt < MAX_RETRIES) {
        console.log(`[${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}] Retrying in ${RETRY_DELAY/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  
  // If we get here, all retries failed due to connection issues
  console.error(`[${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}] All ${MAX_RETRIES} ping attempts failed (connection issues). Last error:`, lastError.message);
};

// Start polling interval
const startPolling = () => {
  const intervalText = TESTING_MODE ? "5 seconds (TESTING)" : "14 minutes between 18:00-02:00 GMT+7";
  console.log(`[${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}] Starting polling service - every ${intervalText}`);
  
  // Make initial request if within window
  makePollingRequest();
  
  // Set up interval
  setInterval(makePollingRequest, POLLING_INTERVAL);
};

const start = async () => {
  try {
    /// Connect googlesheet
    const sheets = await createGoogleSheetConnection();
    fastify.decorate("sheets", sheets);

    const port = process.env.PORT || 3000;
    await fastify.listen({ port: port, host: "0.0.0.0" });
    console.log(`Server is running at http://localhost:${port}`);
    
    // Start the polling service after server is running
    startPolling();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
