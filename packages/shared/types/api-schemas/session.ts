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

    // Ce que le client déclare (#9610, `utils/client-session.ts`) et le moyen de connexion posé par le serveur
    appVersion: { type: 'string', nullable: true, description: 'Meeshy version declared by the client (X-Meeshy-Version)' },
    appBuild: { type: 'string', nullable: true, description: 'Meeshy build declared by the client (X-Meeshy-Build)' },
    platform: { type: 'string', nullable: true, description: 'ios | web | pwa | android-shell (X-Meeshy-Platform)' },
    deviceName: { type: 'string', nullable: true, description: 'Readable device name derived from the model by the client (X-Meeshy-Device-Name)' },
    loginMethod: { type: 'string', nullable: true, description: 'password | two_factor | magic_link | registration | email_verification | oauth | anonymous' },

    // Location Information — déduit de l'adresse par une base LOCALE (DB-IP Lite, #9609) ; la ville est APPROXIMATIVE
    ipAddress: { type: 'string', nullable: true, description: 'IP address' },
    country: { type: 'string', nullable: true, description: 'Country code (ISO 3166-1 alpha-2: FR, US)' },
    city: { type: 'string', nullable: true, description: 'Approximate city, derived from the IP address' },
    location: { type: 'string', nullable: true, description: 'Formatted location: Paris, France' },
    timezone: { type: 'string', nullable: true, description: 'IANA time zone declared by the client' },

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

/**
 * L'attribution de la géolocalisation, servie avec toute liste de sessions
 * (#9609) — la licence CC-BY 4.0 de DB-IP Lite exige qu'elle accompagne le
 * lieu affiché. Valeur : `GEOLOCATION_ATTRIBUTION` (`utils/client-session.ts`).
 */
export const geolocationAttributionSchema = {
  type: 'object',
  description: 'Attribution required by the IP geolocation database license; the city is approximate',
  properties: {
    provider: { type: 'string', example: 'DB-IP' },
    text: { type: 'string', example: 'IP Geolocation by DB-IP' },
    url: { type: 'string', example: 'https://db-ip.com' },
    license: { type: 'string', example: 'CC-BY-4.0' },
    approximate: { type: 'boolean', example: true }
  }
} as const;
