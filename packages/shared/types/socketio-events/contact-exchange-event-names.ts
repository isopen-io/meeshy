/**
 * Les noms du PARTAGE SANS CONTACT (#19205). Charges : `../contact-exchange.ts`.
 *
 * Audience : la room `user:<émetteur>`, seule. Émis par
 * `services/gateway/src/services/contactExchange/contactExchange.ts`.
 */

export const CONTACT_EXCHANGE_SERVER_EVENTS = {
  /** À l'émetteur : quelqu'un a reçu ce qu'il donnait (« Sofia a reçu ta vitrine »). */
  CONTACT_EXCHANGE_RECEIVED: 'contact-exchange:received',
} as const;
