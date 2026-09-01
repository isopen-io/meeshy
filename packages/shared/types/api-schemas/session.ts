/**
 * Schémas d’API — sessions d’appareil.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/session
 */

// =============================================================================
// SESSION SCHEMAS
// =============================================================================

/**
 * Session object schema for API responses
 * Contains device, browser, and location information
 */
export const sessionSchema = {
  type: 'object',
  description: 'User session information with device and location data',
  properties: {
    id: { type: 'string', description: 'Session unique identifier' },
    userId: { type: 'string', description: 'User ID who owns this session' },

    // Device Information
    deviceType: { type: 'string', nullable: true, description: 'Device type: mobile, tablet, desktop, smarttv' },
    deviceVendor: { type: 'string', nullable: true, description: 'Device vendor: Apple, Samsung, Huawei' },
    deviceModel: { type: 'string', nullable: true, description: 'Device model: iPhone 15, Galaxy S23' },
    osName: { type: 'string', nullable: true, description: 'Operating system: iOS, Android, Windows, macOS' },
    osVersion: { type: 'string', nullable: true, description: 'OS version: 17.0, 14, 11' },
    browserName: { type: 'string', nullable: true, description: 'Browser name: Safari, Chrome, Firefox' },
    browserVersion: { type: 'string', nullable: true, description: 'Browser version' },
    isMobile: { type: 'boolean', description: 'Is mobile device' },

    // Location Information
    ipAddress: { type: 'string', nullable: true, description: 'IP address' },
    country: { type: 'string', nullable: true, description: 'Country code (ISO 3166-1 alpha-2: FR, US)' },
    city: { type: 'string', nullable: true, description: 'City name' },
    location: { type: 'string', nullable: true, description: 'Formatted location: Paris, France' },

    // Lifecycle
    createdAt: { type: 'string', format: 'date-time', description: 'Session creation timestamp' },
    lastActivityAt: { type: 'string', format: 'date-time', description: 'Last activity timestamp' },

    // Flags
    isCurrentSession: { type: 'boolean', description: 'Is this the current request session' },
    isTrusted: { type: 'boolean', description: 'Is this a trusted device (user-marked)' }
  }
} as const;

/**
 * Minimal session schema for login response
 */
export const sessionMinimalSchema = {
  type: 'object',
  description: 'Minimal session data returned on login',
  properties: {
    id: { type: 'string', description: 'Session unique identifier' },
    deviceType: { type: 'string', nullable: true, description: 'Device type' },
    browserName: { type: 'string', nullable: true, description: 'Browser name' },
    osName: { type: 'string', nullable: true, description: 'OS name' },
    location: { type: 'string', nullable: true, description: 'Location' },
    isMobile: { type: 'boolean', description: 'Is mobile device' },
    createdAt: { type: 'string', format: 'date-time', description: 'Session creation' },
    isTrusted: { type: 'boolean', description: 'Is this a trusted device (user-marked at login via `rememberDevice`)' }
  }
} as const;
