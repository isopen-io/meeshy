/**
 * Le CLIQUET du budget de taille sur les SUITES du gateway (#4531).
 *
 * ## L'exemption qu'il remplace était une phrase, pas une mesure
 *
 * `file-size-sweep.ts` a porté, de #4284 au 2026-08-31, cette justification :
 *
 * > « Les suites de tests ont leur propre économie (un témoin par ligne d'un
 * > tableau produit de longs fichiers sans dette de lisibilité) et sortent du
 * > périmètre. »
 *
 * Elle est plausible, elle n'a jamais été confrontée aux fichiers qu'elle
 * exempte, et elle tenait **160 730 lignes** — quatre fois la dette de
 * production bornée par #4426 — hors de toute mesure. La directive 2026-08-28
 * n'exempte pas les tests ; l'exemption venait entièrement de cette phrase.
 *
 * C'est la forme que #4426 reprochait à son aîné, rejouée d'un cran : **une
 * classe fermée dans la langue où on l'a énoncée.** « Les tests ont leur propre
 * économie » est une langue. Personne n'avait regardé si elle décrit les 87
 * fichiers.
 *
 * ## Ce que la mesure du 2026-08-31 rend
 *
 * L'issue demandait de distinguer deux formes sur les dix plus gros : le
 * TABLEAU DE CAS DÉROULÉ (dette faible) et l'EMPILEMENT DE CONTEXTES (dette
 * réelle). Le verdict n'est pas partagé — la première forme est absente :
 *
 * | | mesure |
 * |---|---:|
 * | `it` / `test` dans les 87 fichiers | 7778 |
 * | engendrés par un tableau (`.each`, `forEach`) | **3** — 0,04 % |
 * | fichiers dont ≥ 50 % des cas sont engendrés | **0** |
 * | dans les DIX plus gros : cas engendrés | **0** |
 * | fichiers qui ROUVRENT un `describe` de premier niveau | **60 sur 87** |
 * | `describe` de premier niveau nommés « coverage »/« extension »/« pass N » | 40 |
 *
 * Ces fichiers ne sont pas longs parce qu'ils déroulent un tableau : ils sont
 * longs parce qu'on y a EMPILÉ. Et sous la variante la plus chère de
 * l'empilement — non pas des sujets sans rapport, mais **le même sujet rouvert
 * au premier niveau** : 52 réouvertures dans `MeeshySocketIOManager.test.ts`,
 * 20 dans `CallService.test.ts`, 18 dans `messages-routes.test.ts`, où
 * `GET /conversations/:id/messages` ouvre CINQ blocs de premier niveau distants
 * de milliers de lignes. Savoir ce qui est déjà testé d'une route y demande de
 * lire les cinq — et la réaction rationnelle, mesurable dans les titres, est
 * d'en ouvrir un sixième plutôt que d'aller voir.
 *
 * > Un témoin illisible ne se corrige pas : il se contourne. La dette d'une
 * > suite ne se paie pas en lecture, elle se paie en TÉMOINS QU'ON N'ÉCRIT PAS
 * > au bon endroit — et un doublon qui gèle un symptôme est exactement ce que
 * > le cycle 61 a payé pendant des mois avec des témoins verts.
 *
 * ## Pourquoi un cliquet SÉPARÉ, et pas l'élargissement de celui de #4426
 *
 * Deux dettes gelées ensemble se COMPENSENT : découper `NotificationService.ts`
 * achèterait le droit de faire grossir `MeeshySocketIOManager.test.ts` de six
 * mille lignes sans qu'un cumul ne bouge. Les deux chantiers n'ont ni les mêmes
 * lots, ni les mêmes risques, ni le même ordre. La règle 3 ne mord que si elle
 * borne une population homogène.
 *
 * ## La forme : les trois nombres de #4302, repris tels quels
 *
 * 1. tout fichier HORS de la liste héritée est sous le seuil — ce qui interdit
 *    le quatre-vingt-huitième ;
 * 2. la liste héritée ne peut que RÉTRÉCIR ;
 * 3. le cumul de ses lignes ne peut que DESCENDRE.
 *
 * La règle 3 est celle qui mord au quotidien : ajouter un `describe` de plus au
 * bas d'un fichier déjà hors budget la fait rougir, et c'est précisément le
 * geste qui a produit les 40 blocs « coverage extension ».
 *
 * Un fichier légitimement découpé fait disparaître son nom **sans faire rougir
 * la garde** (les règles 2 et 3 sont des plafonds, jamais des égalités). Le
 * cliquet borne la dette et force sa décrue ; il ne la solde pas — découper ces
 * 87 fichiers est un lot par fichier, pas un lot de refactor.
 *
 * ## Ce que la liste porte, et ce qu'elle ne porte pas
 *
 * Fichier + nombre de lignes, **jamais un numéro de ligne** — une clé de ligne
 * périme au premier commit et transforme le cliquet en bruit.
 *
 * ## La racine est `src/`, pas `src/__tests__/`
 *
 * Onze des 87 fichiers vivent hors de `src/__tests__` — dont le PLUS GROS
 * (`socketio/__tests__/MeeshySocketIOManager.test.ts`) et le quatrième. Un
 * cliquet enraciné sur `src/__tests__` en manquerait 26 968 lignes en se
 * croyant exhaustif. Ce qui distingue ce cliquet de celui de #4426 est le
 * SÉLECTEUR (`isHandWrittenTest`), jamais la racine — et les deux sélecteurs
 * partitionnent `src/`, ce que le dernier témoin vérifie plutôt que de le
 * supposer.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { statSync } from 'fs';
import { join } from 'path';

import { overBudget, walk, isHandWrittenSource, isHandWrittenTest } from './helpers/file-size-sweep';

const SRC_DIR = join(__dirname, '..');

/** Le même plafond que le cliquet de production (#4426), et que la mesure de #4531. */
const MAX_LINES = 1000;

/**
 * La dette HÉRITÉE des SUITES, mesurée le 2026-08-31 sur `dev`, avec le
 * `lineCount` de ce dépôt — jamais recopiée depuis l'issue.
 *
 * #4531 annonce 160 728 lignes ; la mesure du jour en rend **160 730**. L'écart
 * est de deux lignes et il est sans importance ; ce qui en a, c'est que geler
 * le chiffre d'un document plutôt que la mesure du jour rendrait au dépôt une
 * marge de croissance qu'il n'a pas — c'est la règle que #4426 s'était déjà
 * appliquée à elle-même, et les chiffres de #4426 avaient bougé en une nuit.
 *
 * Elle ne se regèle PAS à la hausse : une entrée dont le nombre monte fait
 * rougir la règle 3, et c'est le seul moment où quelqu'un relit ce tableau.
 */
const DETTE_HERITEE: Readonly<Record<string, number>> = {
  'socketio/__tests__/MeeshySocketIOManager.test.ts': 8158,
  '__tests__/unit/services/CallService.test.ts': 6145,
  '__tests__/unit/services/MessageReadStatusService.test.ts': 5738,
  'socketio/__tests__/CallEventsHandler.test.ts': 4650,
  '__tests__/unit/routes/messages-routes.test.ts': 4330,
  '__tests__/unit/handlers/MessageHandler.core.test.ts': 4263,
  '__tests__/unit/routes/conversation-core.test.ts': 4020,
  '__tests__/unit/routes/conversation-messages-advanced.test.ts': 3556,
  '__tests__/unit/services/PushNotificationService.test.ts': 3290,
  'socketio/handlers/__tests__/MessageHandler.test.ts': 3083,
  '__tests__/unit/services/MessagingService.test.ts': 3011,
  '__tests__/unit/routes/participants.test.ts': 2938,
  '__tests__/unit/services/MessageTranslationService.audio.test.ts': 2833,
  '__tests__/unit/PostService.test.ts': 2649,
  '__tests__/unit/services/ZmqTranslationClient.test.ts': 2476,
  '__tests__/unit/services/AuthService.test.ts': 2472,
  '__tests__/unit/routes/calls-routes.test.ts': 2154,
  '__tests__/unit/routes/admin/admin-routes-group2.test.ts': 2153,
  '__tests__/unit/services/MessageTranslationService.test.ts': 2085,
  '__tests__/unit/services/MentionService.test.ts': 2063,
  '__tests__/unit/services/VoiceProfileService.test.ts': 1911,
  '__tests__/unit/services/PasswordResetService.test.ts': 1823,
  '__tests__/unit/routes/posts/interactions.test.ts': 1733,
  '__tests__/unit/services/RedisDeliveryQueue.test.ts': 1723,
  '__tests__/unit/routes/posts/comments.test.ts': 1671,
  '__tests__/unit/routes/posts/core.test.ts': 1654,
  'socketio/handlers/__tests__/AuthHandler.test.ts': 1645,
  '__tests__/unit/services/MessageTranslationService.branches.test.ts': 1631,
  '__tests__/unit/services/CallCleanupService.test.ts': 1619,
  '__tests__/unit/routes/sync.test.ts': 1616,
  'socketio/handlers/__tests__/MessageHandlerEditDelete.test.ts': 1611,
  '__tests__/unit/services/PostFeedService.test.ts': 1607,
  '__tests__/unit/services/ReactionService.test.ts': 1605,
  '__tests__/unit/services/NotificationService.storycomments.test.ts': 1602,
  '__tests__/unit/services/messaging/MessageProcessor.test.ts': 1601,
  '__tests__/unit/routes/conversation-search-threads.test.ts': 1574,
  '__tests__/unit/routes/admin/admin-routes-group3.test.ts': 1564,
  '__tests__/unit/services/SessionService.test.ts': 1524,
  '__tests__/unit/routes/admin/system-rankings.test.ts': 1482,
  '__tests__/unit/socketio/PostReactionHandler.test.ts': 1482,
  '__tests__/unit/utils/rate-limiter.test.ts': 1472,
  '__tests__/unit/routes/admin/admin-user-routes.test.ts': 1468,
  '__tests__/unit/services/EmailService.test.ts': 1410,
  '__tests__/unit/services/ConversationStatsService.test.ts': 1408,
  '__tests__/unit/routes/users-contact-change.test.ts': 1382,
  '__tests__/unit/services/AttachmentTranslateService.test.ts': 1355,
  '__tests__/unit/utils/sanitize.test.ts': 1325,
  'socketio/handlers/__tests__/StatusHandler.test.ts': 1323,
  '__tests__/unit/services/CommentReactionService.test.ts': 1318,
  '__tests__/unit/services/NotificationService.friendcontent.test.ts': 1301,
  '__tests__/unit/routes/conversation-leave-ban-delete-stats.test.ts': 1300,
  '__tests__/unit/services/PostReactionService.test.ts': 1278,
  '__tests__/unit/routes/admin/agent-routes-extra.test.ts': 1276,
  '__tests__/unit/routes/conversation-sharing.test.ts': 1258,
  '__tests__/unit/routes/admin/admin-routes-group1.test.ts': 1255,
  '__tests__/unit/routes/users/profile.test.ts': 1255,
  '__tests__/unit/routes/links-messages.test.ts': 1253,
  '__tests__/unit/routes/reactions-routes.test.ts': 1250,
  '__tests__/unit/services/messageNotificationFanOut.test.ts': 1234,
  '__tests__/unit/services/UploadProcessor.test.ts': 1231,
  '__tests__/unit/middleware/auth-extended.test.ts': 1230,
  '__tests__/unit/utils/circuitBreaker.test.ts': 1221,
  '__tests__/unit/routes/admin/agent-routes-coverage.test.ts': 1202,
  '__tests__/unit/socketio/CallEventsHandler-end.test.ts': 1187,
  '__tests__/unit/routes/links-admin.test.ts': 1181,
  '__tests__/unit/routes/me-preferences.test.ts': 1160,
  '__tests__/unit/services/AudioTranslateService.test.ts': 1156,
  '__tests__/unit/services/ZmqMessageHandler.test.ts': 1150,
  '__tests__/unit/routes/friends-routes.test.ts': 1141,
  '__tests__/unit/services/ConversationMessageStatsService.test.ts': 1139,
  '__tests__/unit/services/MagicLinkService.test.ts': 1136,
  '__tests__/unit/SocialEventsHandler.test.ts': 1134,
  'services/zmq-translation/__tests__/ZmqMessageHandler.test.ts': 1121,
  '__tests__/unit/services/NotificationService.pushMessage.test.ts': 1090,
  '__tests__/unit/routes/admin/admin-content-routes.test.ts': 1087,
  '__tests__/unit/services/EncryptionService.test.ts': 1044,
  '__tests__/unit/services/MetadataManager.test.ts': 1044,
  '__tests__/unit/routes/posts/interactions2.test.ts': 1039,
  '__tests__/unit/routes/communities-presence-gate.test.ts': 1038,
  '__tests__/unit/services/PostService.test.ts': 1028,
  'socketio/handlers/__tests__/ConversationHandler.test.ts': 1026,
  '__tests__/unit/services/AttachmentService.direct.test.ts': 1023,
  'routes/uploads/__tests__/tus-handler.test.ts': 1017,
  '__tests__/unit/services/VoiceAnalysisService.test.ts': 1015,
  'socketio/handlers/__tests__/ReactionHandler.test.ts': 1015,
  '__tests__/unit/services/PostCommentService.test.ts': 1009,
  'socketio/__tests__/message-new-producer-parity.test.ts': 1000,
};

const NOMBRE_HERITE = Object.keys(DETTE_HERITEE).length;
const CUMUL_HERITE = Object.values(DETTE_HERITEE).reduce((somme, lignes) => somme + lignes, 0);

const horsBudget = () => overBudget(SRC_DIR, MAX_LINES, isHandWrittenTest);

describe('budget de taille sur les suites du gateway (#4531)', () => {
  // Une liste vide passerait les trois règles au vert, et pour la pire des
  // raisons : le balayage ne verrait rien. C'est exactement ce que rendait
  // `overBudget(src/__tests__, 1000)` avant #4531 — zéro fichier, cliquet vert.
  // La borne le dit avant les règles.
  it('voit bien les suites du gateway — sinon un balayage vide passerait au vert', () => {
    expect(statSync(SRC_DIR).isDirectory()).toBe(true);
    expect(walk(SRC_DIR, isHandWrittenTest).length).toBeGreaterThan(1000);
  });

  it('règle 1 — aucune suite hors budget qui ne soit déjà dans la dette héritée', () => {
    const nouveaux = horsBudget()
      .filter((file) => DETTE_HERITEE[file.path] === undefined)
      .map((file) => `${file.path} (${file.lines} lignes)`);

    expect(nouveaux).toEqual([]);
  });

  it("règle 2 — la dette héritée ne compte pas plus de suites qu'au gel", () => {
    expect(horsBudget().length).toBeLessThanOrEqual(NOMBRE_HERITE);
  });

  it('règle 3 — le cumul des lignes hors budget ne remonte pas', () => {
    const cumul = horsBudget().reduce((somme, file) => somme + file.lines, 0);

    // Le message porte le détail : sans lui, un dépassement de trois lignes
    // n'apprend pas QUEL fichier a grossi, et la première réaction est de
    // regeler le nombre — c'est-à-dire de ne plus lire le cliquet.
    const detail = horsBudget()
      .filter((file) => file.lines > (DETTE_HERITEE[file.path] ?? 0))
      .map((file) => `${file.path} : ${DETTE_HERITEE[file.path] ?? 0} → ${file.lines}`);

    expect({ cumul, aGrossi: detail }).toEqual({ cumul: expect.any(Number), aGrossi: [] });
    expect(cumul).toBeLessThanOrEqual(CUMUL_HERITE);
  });

  it('la dette héritée porte des LIGNES, jamais des numéros de ligne', () => {
    for (const [chemin, lignes] of Object.entries(DETTE_HERITEE)) {
      expect(chemin.endsWith('.ts')).toBe(true);
      expect(lignes).toBeGreaterThanOrEqual(MAX_LINES);
    }
  });

  /**
   * Le témoin qui interdit qu'une troisième catégorie échappe aux DEUX cliquets.
   *
   * L'exemption que #4531 remplace n'était pas visible comme un trou : elle
   * était un `!` dans un prédicat, et ce que ce `!` laissait dehors n'était
   * énuméré nulle part. La partition est donc VÉRIFIÉE — tout `.ts` de `src/`
   * qui n'est pas un `.d.ts` est retenu par exactement UN des deux sélecteurs.
   */
  it('les deux sélecteurs PARTITIONNENT les sources — rien ne tombe entre les deux cliquets', () => {
    const production = walk(SRC_DIR, isHandWrittenSource);
    const suites = walk(SRC_DIR, isHandWrittenTest);
    const tousLesTs = walk(SRC_DIR, (p) => p.endsWith('.ts') && !p.endsWith('.d.ts'));

    expect(production.length).toBeGreaterThan(400);
    expect(suites.length).toBeGreaterThan(1000);
    expect(production.length + suites.length).toBe(tousLesTs.length);
    expect(production.filter((p) => suites.includes(p))).toEqual([]);
  });
});
