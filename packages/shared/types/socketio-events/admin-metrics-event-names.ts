/**
 * Les noms des MÉTRIQUES DE L'HÔTE en direct (#10384) — une PARTIE des deux
 * cartes de `event-names.ts`, qui les répandent.
 *
 * Un administrateur (BIGBOSS ou ADMIN) s'abonne par `admin-metrics:subscribe`,
 * reçoit l'instantané complet dans l'accusé, puis un échantillon toutes les
 * cinq secondes sur la room `admin:host-metrics`.
 */

export const ADMIN_METRICS_SERVER_EVENTS = {
  ADMIN_METRICS_SAMPLE: 'admin-metrics:sample',
} as const;

export const ADMIN_METRICS_CLIENT_EVENTS = {
  ADMIN_METRICS_SUBSCRIBE: 'admin-metrics:subscribe',
  ADMIN_METRICS_UNSUBSCRIBE: 'admin-metrics:unsubscribe',
} as const;
