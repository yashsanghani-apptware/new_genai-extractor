import {createLogger,transports,format} from "winston";
import { fileURLToPath } from 'url';
import path  from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const customFormat = format.printf(({ level, message, timestamp }) => {
  return `${timestamp} | ${level} | ${message}`;
});

const apiLogger = createLogger({
  level: 'info',
  format:format.combine(
    format.timestamp({ format: 'YYYY_MM_DD h:mm:ss A' }),
    customFormat
  ),
  transports: [
    new transports.File({ filename: path.join(__dirname, 'logs', 'api.log') })
  ]
});

// Create a logger for other logs
const otherLogger = createLogger({
  level: 'info',
  format:format.combine(
    format.timestamp({ format: 'YYYY_MM_DD h:mm:ss A' }),
    customFormat
  ),
  transports: [
    // new transports.File({ filename: 'index.log' })
    new transports.File({ filename: path.join(__dirname, 'logs', 'index.log') })
  ]
});

const logFilePath = path.resolve(__dirname, 'logs/index.log');
/**
 * Clears the content of the log files.
 */
const clearLogFile = () => {
  try {
    // Check if the log file exists
    if (fs.existsSync(logFilePath)) {
      // Truncate the file to clear its content
      fs.truncateSync(logFilePath, 0);
      console.log('Log file cleared successfully.');
    } else {
      console.log('Log file does not exist.');
    }
  } catch (error) {
    console.error('Error clearing log file:', error);
  }
};


export {apiLogger,otherLogger, clearLogFile};
