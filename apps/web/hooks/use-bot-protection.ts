/**
 * Bot Protection Hook
 *
 * Provides client-side bot protection without external captcha services.
 * Combines multiple techniques:
 * - Honeypot fields (invisible fields that bots fill)
 * - Time-based validation (bots submit too fast)
 * - JavaScript challenge (bots often don't execute JS properly)
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface BotProtectionConfig {
  /** Minimum time in ms before form can be submitted (default: 2000ms) */
  minSubmitTime?: number;
  /** Honeypot field name (default: 'website') */
  honeypotFieldName?: string;
}

interface BotProtectionResult {
  /** Whether the form submission appears legitimate */
  isHuman: boolean;
  /** Error message if bot detected */
  botError: string | null;
}

interface BotProtectionState {
  /** Honeypot field value - should remain empty for humans */
  honeypotValue: string;
  /** Set honeypot value */
  setHoneypotValue: (value: string) => void;
  /** Honeypot field name for form */
  honeypotFieldName: string;
  /** Check if submission is from a human */
  validateSubmission: () => BotProtectionResult;
  /** Reset protection state (call after successful submission) */
  reset: () => void;
  /** Time elapsed since form load in ms */
  timeElapsed: number;
  /** Whether JS challenge was completed */
  jsVerified: boolean;
  /** Hidden props to spread on honeypot input */
  honeypotProps: {
    name: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    style: React.CSSProperties;
    tabIndex: number;
    autoComplete: string;
    'aria-hidden': boolean;
  };
}

const DEFAULT_MIN_SUBMIT_TIME = 2000; // 2 seconds minimum
const DEFAULT_HONEYPOT_FIELD = 'website';

/**
 * Hook for client-side bot protection
 *
 * Usage:
 * ```tsx
 * const { honeypotProps, validateSubmission } = useBotProtection();
 *
 * const handleSubmit = (e) => {
 *   e.preventDefault();
 *   const { isHuman, botError } = validateSubmission();
 *   if (!isHuman) {
 *     toast.error(botError);
 *     return;
 *   }
 *   // Continue with form submission
 * };
 *
 * return (
 *   <form onSubmit={handleSubmit}>
 *     <input {...honeypotProps} />
 *     // ... other fields
 *   </form>
 * );
 * ```
 */
export function useBotProtection(config: BotProtectionConfig = {}): BotProtectionState {
  const {
    minSubmitTime = DEFAULT_MIN_SUBMIT_TIME,
    honeypotFieldName = DEFAULT_HONEYPOT_FIELD,
  } = config;

  // Track when the form was loaded
  const loadTimeRef = useRef<number>(Date.now());
  const [timeElapsed, setTimeElapsed] = useState(0);

  // Honeypot field state
  const [honeypotValue, setHoneypotValue] = useState('');

  // JavaScript verification - proves JS is running
  const [jsVerified, setJsVerified] = useState(false);

  // Track mouse/keyboard activity (humans interact, bots often don't)
  const hasInteractionRef = useRef(false);

  // Update time elapsed periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(Date.now() - loadTimeRef.current);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Mark JS as verified after component mounts (proves browser executed JS)
  useEffect(() => {
    // Small delay to ensure this isn't just immediate execution
    const timer = setTimeout(() => {
      setJsVerified(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Track user interactions
  useEffect(() => {
    const handleInteraction = () => {
      hasInteractionRef.current = true;
    };

    // Listen for any human interaction
    window.addEventListener('mousemove', handleInteraction, { once: true });
    window.addEventListener('keydown', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
    window.addEventListener('scroll', handleInteraction, { once: true });

    return () => {
      window.removeEventListener('mousemove', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      window.removeEventListener('scroll', handleInteraction);
    };
  }, []);

  // Validate if submission appears human
  const validateSubmission = useCallback((): BotProtectionResult => {
    const currentTimeElapsed = Date.now() - loadTimeRef.current;

    // Check 1: Honeypot field should be empty
    if (honeypotValue.trim() !== '') {
      console.warn('[BotProtection] Honeypot field filled - likely bot');
      return {
        isHuman: false,
        botError: 'Une erreur est survenue. Veuillez réessayer.',
      };
    }

    // Check 2: Form submitted too quickly
    if (currentTimeElapsed < minSubmitTime) {
      console.warn(`[BotProtection] Form submitted too fast (${currentTimeElapsed}ms < ${minSubmitTime}ms)`);
      return {
        isHuman: false,
        botError: 'Veuillez patienter quelques secondes avant de soumettre le formulaire.',
      };
    }

    // Check 3: JavaScript verification
    if (!jsVerified) {
      console.warn('[BotProtection] JavaScript not verified');
      return {
        isHuman: false,
        botError: 'Veuillez activer JavaScript pour continuer.',
      };
    }

    // All checks passed
    return {
      isHuman: true,
      botError: null,
    };
  }, [honeypotValue, minSubmitTime, jsVerified]);

  // Reset protection state
  const reset = useCallback(() => {
    loadTimeRef.current = Date.now();
    setTimeElapsed(0);
    setHoneypotValue('');
    hasInteractionRef.current = false;
  }, []);

  // Honeypot input props - spread these on a hidden input
  const honeypotProps = {
    name: honeypotFieldName,
    value: honeypotValue,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setHoneypotValue(e.target.value),
    style: {
      position: 'absolute' as const,
      left: '-9999px',
      top: '-9999px',
      width: '1px',
      height: '1px',
      opacity: 0,
      overflow: 'hidden',
      pointerEvents: 'none' as const,
    },
    tabIndex: -1,
    autoComplete: 'off',
    'aria-hidden': true as const,
  };

  return {
    honeypotValue,
    setHoneypotValue,
    honeypotFieldName,
    validateSubmission,
    reset,
    timeElapsed,
    jsVerified,
    honeypotProps,
  };
}

/**
 * Get bot protection data to send with form submission
 * This can be validated server-side
 */
export function getBotProtectionPayload(timeElapsed: number): {
  _bp_time: number;
  _bp_js: boolean;
  _bp_ts: number;
} {
  return {
    _bp_time: timeElapsed,
    _bp_js: true,
    _bp_ts: Date.now(),
  };
}
