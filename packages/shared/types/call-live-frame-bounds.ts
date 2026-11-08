/**
 * LES BORNES DU CADRE EN DIRECT, SANS VALIDATEUR (#16943) — ce que les clients
 * lisent de `call-live-frame.ts` pour relire `call:frame-selected` : la forme
 * d'un identifiant, les longueurs, les réponses. Le schéma `zod` de la
 * frontière du socket reste dans `call-live-frame.ts`, qui RÉEXPORTE ces
 * valeurs : une seule source, et un client web qui n'en lit que les bornes ne
 * télécharge pas `zod` classique (budgets.json › `zod`).
 */

export const CALL_LIVE_FRAME_ID_MAX = 96;
export const CALL_LIVE_FRAME_TEXT_MAX = 64;

/** La forme d'un identifiant du catalogue : `ambiance.motif[.tranche]`, minuscules, chiffres, tirets. */
export const CALL_LIVE_FRAME_ID_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$/;

/**
 * La réponse à une proposition (#9287) : le cadre ne s'impose jamais à l'autre. Sans
 * `reply`, l'événement PROPOSE un cadre (ou retire la proposition, `frameId: null`) ;
 * avec `reply`, il dit à l'émetteur si son cadre a été appliqué ou refusé.
 */
export const CALL_LIVE_FRAME_REPLIES = ['accepted', 'declined'] as const;
export type CallLiveFrameReply = (typeof CALL_LIVE_FRAME_REPLIES)[number];
