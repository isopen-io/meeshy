/**
 * Playwright Global Setup
 *
 * Exécuté une fois avant tous les tests E2E
 */

import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {

  const baseURL = config.projects[0].use.baseURL || 'http://localhost:3100';
  const apiURL = process.env.GATEWAY_URL || 'http://localhost:3000';

  // Wait for services to be ready

  const maxRetries = 30;
  const retryDelay = 2000;

  // Check frontend availability
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) {
        break;
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        throw new Error(`Frontend not available at ${baseURL}`);
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // Check backend availability
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${apiURL}/health`);
      if (response.ok || response.status === 404) { // 404 is OK if no health endpoint
        break;
      }
    } catch (error) {
      if (i === maxRetries - 1) {
        console.warn(`⚠️ Backend may not be ready at ${apiURL}`);
        break; // Continue anyway
      }
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // Create test data or perform other setup tasks
}

export default globalSetup;
