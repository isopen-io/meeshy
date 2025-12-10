/**
 * Feature Flags Hook
 *
 * Centralized feature flag management for Meeshy frontend
 * Controls which features are enabled/disabled based on environment configuration
 */

'use client';

interface FeatureFlags {
  passwordReset: boolean;
  // Add more feature flags here as needed
  // twoFactorAuth: boolean;
  // videoCall: boolean;
}

/**
 * Hook to check if a feature is enabled
 *
 * Usage:
 * const { isFeatureEnabled } = useFeatureFlags();
 * if (isFeatureEnabled('passwordReset')) {
 *   // Show password reset UI
 * }
 */
export function useFeatureFlags() {
  const flags: FeatureFlags = {
    // Password Reset Feature
    // Set to 'true' to enable, 'false' to disable
    // Can be controlled via environment variable
    passwordReset: process.env.NEXT_PUBLIC_ENABLE_PASSWORD_RESET === 'true',

    // Add more features here
  };

  /**
   * Check if a specific feature is enabled
   */
  const isFeatureEnabled = (feature: keyof FeatureFlags): boolean => {
    return flags[feature] ?? false;
  };

  /**
   * Get all enabled features
   */
  const getEnabledFeatures = (): string[] => {
    return Object.keys(flags).filter(key => flags[key as keyof FeatureFlags]);
  };

  /**
   * Check if password reset is fully configured
   * This checks both the feature flag AND required configuration
   */
  const isPasswordResetConfigured = (): boolean => {
    if (!flags.passwordReset) return false;

    // Check if required configuration exists
    const hasCaptchaKey = !!process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY;
    const hasApiUrl = !!process.env.NEXT_PUBLIC_API_URL;

    return hasCaptchaKey && hasApiUrl;
  };

  return {
    flags,
    isFeatureEnabled,
    getEnabledFeatures,
    isPasswordResetConfigured,
  };
}
