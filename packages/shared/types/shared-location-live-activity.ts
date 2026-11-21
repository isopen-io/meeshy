/**
 * LA FIN D'UN PARTAGE DE POSITION, PORTÉE À L'APPAREIL SUSPENDU (#19463).
 *
 * L'Activité en direct iOS (« Léo partage sa position 41:20 »), l'écran verrouillé et la
 * notification en cours Android vivent app suspendue : la socket est fermée et
 * `location:share-ended` ne les atteint pas. À chaque fin SERVIE (arrêt, remplacement, baisse
 * sous Ami, blocage, retrait, compte fermé), la passerelle pousse donc au seul destinataire
 * qu'elle servait :
 *
 * 1. une poussée SILENCIEUSE de données `LocationShareEndedPushData` (APNs background, FCM
 *    data) — qui, quand, rien d'autre : ni coordonnée, ni précision, ni autre destinataire ;
 * 2. pour chaque jeton d'Activité en direct que l'appareil a enregistré pour ce sujet
 *    (`POST /api/v1/me/live-activity-tokens`), une poussée APNs `liveactivity`, `event: end`,
 *    dont l'état final est `SharedLocationLiveActivityEndState`.
 *
 * Additif : un ancien client ne reçoit rien de neuf (plancher de routage par version) ; la
 * socket et `GET /relations/locations` restent la vérité à la reprise.
 */
import { z } from 'zod';

export const LOCATION_SHARE_ENDED_PUSH_TYPE = 'location_share_ended' as const;

export const LIVE_ACTIVITY_TOKEN_KINDS = ['shared-location'] as const;
export type LiveActivityTokenKind = (typeof LIVE_ACTIVITY_TOKEN_KINDS)[number];

/** Au plus autant de jetons vivants par compte lecteur : le plus ancien cède sa place. */
export const LIVE_ACTIVITY_TOKENS_PER_ACCOUNT_MAX = 16;

export const LIVE_ACTIVITY_TOKEN_ERROR_CODES = {
  INVALID: 'LIVE_ACTIVITY_TOKEN_INVALID',
  NOT_SHARED: 'LIVE_ACTIVITY_NOT_SHARED',
} as const;

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

export const liveActivityTokenRegistrationSchema = z
  .object({
    kind: z.enum(LIVE_ACTIVITY_TOKEN_KINDS),
    subjectUserId: objectId,
    token: z.string().regex(/^[0-9a-f]{32,1024}$/i),
    apnsEnvironment: z.enum(['development', 'production']).optional(),
  })
  .strict();
export type LiveActivityTokenRegistration = z.infer<typeof liveActivityTokenRegistrationSchema>;

/** La réponse : le jeton vit jusqu'à l'échéance du lecteur, puis s'efface de lui-même. */
export type LiveActivityTokenRegistered = { readonly expiresAt: string };

/** La charge de données de la poussée silencieuse (chaînes : APNs et FCM data). */
export type LocationShareEndedPushData = {
  readonly type: typeof LOCATION_SHARE_ENDED_PUSH_TYPE;
  readonly userId: string;
  readonly endedAt: string;
};

/** L'état final (`content-state`) d'une Activité en direct de partage close par la passerelle. */
export type SharedLocationLiveActivityEndState = { readonly endedAt: string };
