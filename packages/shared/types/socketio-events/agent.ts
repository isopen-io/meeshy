/**
 * Le domaine AGENT : le canal Redis partagé service agent / gateway et la
 * charge relayée vers la room `admin:agent`.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */

// Canal Redis pub/sub partagé service agent / gateway pour notifier les
// dashboards admin (relayé vers la room Socket.IO `admin:agent`)
export const AGENT_ADMIN_EVENT_CHANNEL = 'agent:admin-event';

export const AGENT_ADMIN_EVENT_KINDS = ['delivery-queue', 'scan', 'config', 'topics'] as const;

export type AgentAdminEventKind = (typeof AGENT_ADMIN_EVENT_KINDS)[number];

export interface AgentAdminEventData {
  readonly kind: AgentAdminEventKind;
  readonly conversationId?: string;
}
