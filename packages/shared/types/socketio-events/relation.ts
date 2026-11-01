/**
 * Le domaine RELATION : le lien entre deux personnes monte, et le rituel du Sang
 * (#13933, cercles de proximité). Noms : `relation-event-names.ts`.
 *
 * Chaque charge nomme `userId` = l'AUTRE personne, du point de vue du destinataire
 * (le serveur émet une charge par destinataire). Aucune charge ne porte de nom, de
 * présence ni de cool-down : le client hydrate la personne par ses propres caches.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */
import type { RelationLevel } from '../relation.js';

/** Les trois temps du rituel (corps de `POST /relations/:userId/ritual`). */
export const RELATION_RITUAL_PHASES = ['start', 'hold', 'confirm'] as const;
export type RelationRitualPhase = (typeof RELATION_RITUAL_PHASES)[number];

/**
 * Les quatre partages que le rituel présente un à un : titre d'écoute, position en
 * direct, historique de position, alerte de proximité. Explicite, refusable feature
 * par feature, pour TOUS les âges (décision porteur 2026-10-31).
 */
export const RELATION_RITUAL_CONSENT_KEYS = ['listeningTitle', 'locationLive', 'locationHistory', 'locationProximity'] as const;
export type RelationRitualConsentKey = (typeof RELATION_RITUAL_CONSENT_KEYS)[number];
export type RelationRitualConsents = Readonly<Record<RelationRitualConsentKey, boolean>>;

export interface RelationLevelRaisedEventData {
  readonly userId: string;
  readonly level: RelationLevel;
  readonly at: string;
}

export interface RelationRitualStartedEventData {
  readonly token: string;
  readonly userId: string;
  readonly requestId: string;
  readonly expiresAt: string;
  readonly holdWindowMs: number;
}

/** `held` : a tenu l'écran · `confirmed` : a confirmé · `lapsed` : a lâché, le rituel est abandonné. */
export type RelationRitualStage = 'held' | 'confirmed' | 'lapsed';

export interface RelationRitualProgressEventData {
  readonly token: string;
  readonly userId: string;
  readonly stage: RelationRitualStage;
}

export interface RelationRitualCompletedEventData {
  readonly token: string;
  readonly userId: string;
  readonly level: RelationLevel;
  readonly at: string;
}
