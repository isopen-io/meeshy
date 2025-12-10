// Example usage of the new translation structure

// Method 1: Import all translations (backward compatible)
import allTranslations from './index';

// Method 2: Import specific translation files
import { common, auth, dashboard } from './index';

// Method 3: Import individual files directly
import commonTranslations from './common.json';
import authTranslations from './auth.json';

// Usage examples:

// Using all translations (same as before)
const welcomeMessage = allTranslations.common.loading; // "Loading..."
const loginTitle = allTranslations.auth.login.title; // "Login"

// Using specific imports (more efficient)
const saveButton = common.common.save; // "Save"
const dashboardTitle = dashboard.dashboard.title; // "Dashboard"

// Using direct imports (most efficient for specific components)
const errorMessage = commonTranslations.common.error; // "Error"
const registerButton = authTranslations.register.registerButton; // "Create account"

// Example React component usage:
/*
import React from 'react';
import { common, auth } from '../locales/en';

const LoginForm = () => {
  return (
    <div>
      <h1>{auth.login.title}</h1>
      <button>{common.common.save}</button>
      <button>{common.common.cancel}</button>
    </div>
  );
};
*/

// Example with dynamic imports for code splitting:
/*
const loadDashboardTranslations = async () => {
  const { dashboard } = await import('../locales/en/dashboard.json');
  return dashboard;
};
*/

export {
  allTranslations,
  common,
  auth,
  dashboard,
  commonTranslations,
  authTranslations,
};
