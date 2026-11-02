/**
 * Ce qu'une socket SAIT FAIRE, annoncé par le client à son ouverture (#11279).
 *
 * Une capacité ouvre un événement qu'un client plus ancien lirait de travers :
 * la passerelle ne l'émet qu'aux sockets qui l'annoncent, et un client qui
 * n'annonce rien garde exactement le comportement d'avant (#9223). Le relevé
 * voyage dans `handshake.auth[CLIENT_CAPABILITIES_AUTH_KEY]`, liste de noms ;
 * un nom inconnu est ignoré, une forme inattendue ne vaut rien.
 *
 * - `call-live-frame-group` : le client sait recevoir `call:frame-selected`
 *   dans un appel de groupe (3 à 6) et ne l'affiche que s'il sait le tenir.
 */

export const CLIENT_CAPABILITIES_AUTH_KEY = 'capabilities' as const;

export const CLIENT_CAPABILITIES = ['call-live-frame-group'] as const;
export type ClientCapability = (typeof CLIENT_CAPABILITIES)[number];

/** Au-delà, la liste n'est pas lue : une annonce honnête tient en quelques noms. */
export const CLIENT_CAPABILITIES_MAX = 32;

const EMPTY: ReadonlySet<ClientCapability> = new Set<ClientCapability>();

function isCapability(value: unknown): value is ClientCapability {
  return CLIENT_CAPABILITIES.some((capability) => capability === value);
}

export function readClientCapabilities(auth: unknown): ReadonlySet<ClientCapability> {
  if (auth === null || typeof auth !== 'object') return EMPTY;
  const declared: unknown = (auth as Record<string, unknown>)[CLIENT_CAPABILITIES_AUTH_KEY];
  if (!Array.isArray(declared)) return EMPTY;
  return new Set(declared.slice(0, CLIENT_CAPABILITIES_MAX).filter(isCapability));
}
