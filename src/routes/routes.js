import express from 'express';
import os from 'os';
import process from 'process';
import { extractor } from '../controllers/extractor.js';
import { contentExtractorUpdateEvent } from '../utils/cronJob.js';
import { sitemap } from '../controllers/sitemap.js';
import { extractInventory } from '../controllers/extractInventory.js';
import { inventorySitemap } from '../services/inventorySitemap.js';
import { extractRedfin } from '../controllers/extractRedfin.js';
import { isAuthenticated, authorizeAction } from '../middlewares/roleAuthorization.js';
import { extractRedfinData } from '../controllers/extractRedfinData.js';


const router = express.Router();

/**
 * @route POST
 * @description Endpoint to initiate scraping
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */

router.post('/extractors/content', extractor ); 
router.post('/sitemaps', sitemap);
router.post('/inventory/sitemaps', inventorySitemap);
router.post("/content/urls/update", contentExtractorUpdateEvent);
router.post("/extractors/inventory", extractInventory);
router.post("/extractors/redfin",
  isAuthenticated, 
  authorizeAction('redfin.extract'), extractRedfin);
router.post("/extractors/redfinData",
  isAuthenticated, 
  authorizeAction('redfin.extract'), extractRedfinData);


/**
 * @route GET /status
 * @description Endpoint to get current process metrics
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
router.get('/status', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const loadAverage = os.loadavg();
  const uptime = process.uptime();
  const resourceUsage = process.resourceUsage();

  res.json({
    uptime: `${Math.floor(uptime / 60)} minutes`,
    memoryUsage: {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
      external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`
    },
    cpuUsage: {
      user: `${(cpuUsage.user / 1000000).toFixed(2)} seconds`,
      system: `${(cpuUsage.system / 1000000).toFixed(2)} seconds`
    },
    loadAverage: loadAverage.map(avg => avg.toFixed(2)),
    resourceUsage: {
      userCPUTime: `${(resourceUsage.userCPUTime / 1000000).toFixed(2)} seconds`,
      systemCPUTime: `${(resourceUsage.systemCPUTime / 1000000).toFixed(2)} seconds`,
      maxRSS: `${(resourceUsage.maxRSS / 1024).toFixed(2)} KB`,
      sharedMemorySize: `${(resourceUsage.sharedMemorySize / 1024).toFixed(2)} KB`,
      unsharedDataSize: `${(resourceUsage.unsharedDataSize / 1024).toFixed(2)} KB`,
      unsharedStackSize: `${(resourceUsage.unsharedStackSize / 1024).toFixed(2)} KB`,
      minorPageFaults: resourceUsage.minorPageFaults,
      majorPageFaults: resourceUsage.majorPageFaults,
      blockInputOps: resourceUsage.blockInputOps,
      blockOutputOps: resourceUsage.blockOutputOps,
      voluntaryContextSwitches: resourceUsage.voluntaryContextSwitches,
      involuntaryContextSwitches: resourceUsage.involuntaryContextSwitches
    }
  });
});

export default router;
