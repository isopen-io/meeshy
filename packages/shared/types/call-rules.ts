/**
 * Les règles d'appel — UN jeu, lu par la passerelle et par les clients (#8074).
 *
 * Avant ce fichier, la sonnerie durait 45 s chez les clients, 60 s au serveur
 * et 120 s au nettoyage ; le plafond de groupe valait 9999 ; la poussée d'appel
 * vivait 60 s. Trois nombres pour une même chose, et chacun pouvait bouger
 * sans que les autres le sachent. Les relations entre eux sont gardées par
 * `__tests__/call-rules.test.ts`, et le miroir Swift
 * (`packages/MeeshySDK/.../Models/CallRules.swift`) est comparé des deux côtés.
 *
 * Chaque valeur est un LITTÉRAL : le miroir Swift se lit par motif, et une
 * expression ferait taire la comparaison au lieu de la faire échouer.
 */

/**
 * Sonnerie : 45 s partout. C'est ce que l'appelant vivait déjà (le client iOS
 * raccrochait à 45 s) — les 15 s de plus du serveur n'étaient visibles de
 * personne. Le serveur arme SON minuteur à la création de l'appel, avant
 * l'accusé que reçoit le client : à valeur égale, c'est lui qui tranche
 * « manqué », et le minuteur client reste un filet.
 */
export const CALL_RING_TIMEOUT_MS = 45_000;

/**
 * Nettoyage d'un appel resté `initiated`/`ringing` : la sonnerie plus 30 s de
 * marge. Il ne rattrape que l'appel dont le minuteur de sonnerie s'est perdu
 * (redémarrage du processus hors réhydratation) ; plus long, il laissait un
 * appel fantôme bloquer la conversation pendant deux minutes.
 */
export const CALL_RING_GC_MS = 75_000;

/**
 * Attente de l'offre SDP par l'appelé qui vient de décrocher : au-delà, l'appel
 * échoue proprement plutôt que de rester sur « Connexion… ».
 */
export const CALL_OFFER_TIMEOUT_MS = 30_000;

/**
 * Grâce accordée par le serveur à un appel décroché qui n'a pas encore produit
 * de battement — elle doit couvrir l'attente de l'offre.
 */
export const CALL_CONNECTING_GRACE_MS = 90_000;

/** Cadence des battements d'un client en appel. */
export const CALL_HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Silence au-delà duquel le serveur déclare un participant au premier plan
 * perdu : douze battements, pour absorber une bascule Wi-Fi ↔ cellulaire.
 */
export const CALL_HEARTBEAT_TIMEOUT_MS = 120_000;

/**
 * Même chose pour un participant en arrière-plan : iOS suspend la socket après
 * ~45 s alors que CallKit garde le flux RTP vivant.
 */
export const CALL_BACKGROUND_HEARTBEAT_TIMEOUT_MS = 300_000;

/**
 * Durée de vie d'une poussée d'appel (APNs `expiry`, FCM `ttl`, Web Push) :
 * la sonnerie, pas une seconde de plus — une poussée livrée après elle ferait
 * sonner un appel déjà manqué.
 */
export const CALL_PUSH_TTL_MS = 45_000;

/**
 * Plafond de participants SIMULTANÉS. Sans SFU, chaque pair envoie son flux à
 * tous les autres : à N participants, N−1 envois montants par appareil. À 6,
 * cinq flux vidéo (~500 kb/s chacun) tiennent dans la voie montante d'un
 * mobile en 4G ; au-delà, le maillage se dégrade pour tout le monde.
 */
export const CALL_MAX_PARTICIPANTS = 6;

/** Borne haute que le plafond ne franchit pas tant qu'il n'y a pas de SFU. */
export const CALL_MESH_CEILING = 8;
