/**
 * Les métadonnées des notifications de cercle et d'état du téléphone : retour d'un contact,
 * connaissance, batterie, téléphone injoignable, « Tout va bien ? », alerte d'inactivité et partage
 * de position. Elles vivent ici pour que `notification.ts` tienne sous son budget (#4532) ;
 * `notification.ts` les réexporte, rien ne change pour qui les importe.
 */
import type { BaseNotificationMetadata } from './notification.js';

/**
 * Metadata pour contact_recently_active (#8285) — « X était sur Meeshy
 * récemment ». `userId` est la personne revenue : le toucher ouvre son profil.
 * Aucune heure de connexion ne voyage — la notification dit « récemment »,
 * jamais « à 14 h 02 ».
 */
export interface ContactRecentlyActiveNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'view_profile';
  readonly userId: string;
}

/**
 * Metadata pour relation_acquaintance (#13932) — la Connaissance née toute seule.
 * `userId` est l'AUTRE personne : le toucher ouvre son profil. Aucun compte
 * d'interactions ne voyage : la notification dit le résultat, pas la mesure.
 */
export interface RelationAcquaintanceNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'view_profile';
  readonly userId: string;
  readonly relationLevel: 'ACQUAINTANCE';
  readonly origin: 'auto-acquaintance';
}

/**
 * Metadata pour device_battery (#14147) — la batterie d'un Proche ou d'un Sang.
 * `userId` est l'ÉMETTEUR : le toucher ouvre son profil. Seul le palier se range :
 * ni le niveau (il n'est que dans le corps), ni l'appareil, ni l'estimation, ni
 * l'heure du relevé. La ligne expire avec l'état (24 h) : aucun historique.
 */
export interface DeviceBatteryNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'view_profile';
  readonly userId: string;
  readonly batteryKind: 'critical' | 'probably-off' | 'back-on' | 'charging' | 'recharged';
}

/**
 * Metadata pour device_unreachable (#18737) — le téléphone d'un Proche ou d'un Sang.
 * `userId` est l'ÉMETTEUR : le toucher ouvre son profil. Seuls le genre et la cause probable se
 * rangent ; l'heure du dernier signe de vie n'est que dans le corps. La ligne expire avec l'état.
 */
export interface DeviceUnreachableNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'view_profile';
  readonly userId: string;
  readonly reachabilityKind: 'unreachable' | 'reachable';
  readonly cause?: 'battery' | 'network';
}

/**
 * Metadata pour wellness_check (#18738) — adressée à SOI : le toucher, ou l'action « Je vais bien »,
 * répond par `POST /me/wellness/ok`. Rien d'autre ne se range.
 */
export interface WellnessCheckNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'none';
  readonly wellnessCheck: true;
}

/**
 * Metadata pour inactivity_alert (#18738) — `userId` est la personne restée inactive : le toucher
 * ouvre son profil, où la dernière position et la dernière batterie se lisent si elles sont déjà
 * partagées. Ni position ni batterie ne se rangent dans la notification.
 */
export interface InactivityAlertNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'view_profile';
  readonly userId: string;
  readonly inactivityKind: 'alert' | 'responded';
}

/**
 * Metadata pour location_share_started (#19204). `userId` est l'ÉMETTEUR : le toucher ouvre sa
 * carte. Seule la durée choisie se range : ni position, ni précision, ni autre destinataire.
 * La ligne expire au terme du partage.
 */
export interface LocationShareStartedNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'view_profile';
  readonly userId: string;
  readonly durationMinutes: number;
}

/**
 * Metadata pour location_share_requested (#19204). `userId` est le DEMANDEUR : le toucher ouvre
 * le partage vers lui. Aucune position ne voyage : il n'en a pas, il en demande une.
 */
export interface LocationShareRequestedNotificationMetadata extends BaseNotificationMetadata {
  readonly action: 'view_profile';
  readonly userId: string;
  readonly requestKind: 'extend' | 'reask';
}
