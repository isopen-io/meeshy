/**
 * Le CLIQUET du budget de taille sur TOUT le gateway (#4426).
 *
 * ## Ce que ce cliquet corrige de son aîné
 *
 * `unit/routes/route-file-size-budget.test.ts` (#4284) balaie `routes/`. C'est
 * la langue du critère qui l'a fait naître, mais **ce n'est pas la propriété
 * qu'on veut garder.** La directive 2026-08-28 ne parle pas de `routes/` :
 *
 * > « Le budget vaut pour les sources écrites à la main (Swift, TS, Python) —
 * > pas pour le code généré ni les dépendances. »
 *
 * `routes/` est le mot par lequel les fichiers hors budget ont été TROUVÉS —
 * parce que c'est là que sept issues bloquées voulaient écrire — pas la classe
 * qu'on protège. C'est la leçon 261 appliquée à un cliquet : **un inventaire
 * ferme une classe dans la langue où on l'a énoncée**, et laisse tout le reste
 * dehors sans que personne ne rougisse.
 *
 * Le prix de cet écart se mesure : pendant que le cliquet de `routes/` refusait
 * un neuvième fichier de 1000 lignes, `services/notifications/NotificationService.ts`
 * en portait **6119** — six fois le plafond, dans le fichier le plus dense du
 * dépôt en règles de confidentialité (le Prisme des bannières, `protectedPreview`,
 * `mediaMayTravel`, `maskedAttachment`, les trois éventails). Le cliquet était
 * VERT à côté de lui.
 *
 * ## Pourquoi un inventaire gelé décroissant, et pas zéro tout de suite
 *
 * Découper `NotificationService.ts` n'est pas un lot de refactor : c'est le
 * fichier où vivent les quatre gardes des cycles 123 à 126, et chacune se relit
 * individuellement. Exiger zéro immédiatement bloquerait tout le reste — ce que
 * #4284 a précisément vécu : sept issues bloquées avant leur première ligne,
 * livrées SANS attendre le découpage, pendant que `admin/agent.ts` passait de
 * 1866 à 1977 lignes.
 *
 * La forme retenue est celle du cliquet iOS de #4302, **trois nombres plutôt que
 * dix-sept plafonds** :
 *
 * 1. tout fichier HORS de la liste héritée est sous le seuil — ce qui interdit
 *    le dix-huitième ;
 * 2. la liste héritée ne peut que RÉTRÉCIR ;
 * 3. le cumul de ses lignes ne peut que DESCENDRE.
 *
 * La règle 3 est celle qui mord au quotidien : c'est elle qui aurait rougi sur
 * les 111 lignes prises par `admin/agent.ts`, et sur les 50 que ma propre
 * livraison de #4494 a ajoutées à `admin/users.ts` cette nuit.
 *
 * Un fichier légitimement découpé fait disparaître son nom **sans faire rougir
 * la garde** (les règles 2 et 3 sont des plafonds, jamais des égalités) : c'est
 * ce qui rend le chantier faisable sans bloquer les issues qui doivent écrire
 * dans ces fichiers. Le cliquet borne la dette et force sa décrue ; il ne la
 * solde pas.
 *
 * ## Ce que la liste porte, et ce qu'elle ne porte pas
 *
 * Fichier + nombre de lignes, **jamais un numéro de ligne** — une clé de ligne
 * périme au premier commit et transforme le cliquet en bruit. C'est la même loi
 * que celle inscrite dans `security/response-schema-closure-guard.test.ts`.
 *
 * ## Portée : les sources de PRODUCTION
 *
 * Le balayage écarte `__tests__`, comme le fait la commande de mesure de #4426
 * elle-même. Ce n'est pas un oubli mais un arbitrage, et il a un coût qu'il faut
 * dire : **87 fichiers de témoins dépassent le seuil, pour 160 728 lignes** —
 * quatre fois la dette de production bornée ici. Un témoin long n'a pas la même
 * dette de lisibilité qu'un service long (un cas par ligne d'un tableau produit
 * de longs fichiers sans complexité), mais cette différence est une HYPOTHÈSE,
 * pas une mesure. Elle fait son issue plutôt que d'être tranchée en silence ici.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { statSync } from 'fs';
import { join } from 'path';

import { overBudget, walk } from './helpers/file-size-sweep';

const SRC_DIR = join(__dirname, '..');

/** Le plafond demandé par le porteur, plus strict que la directive (1200 depuis le 2026-09-02). */
const MAX_LINES = 1000;

/**
 * La dette HÉRITÉE, mesurée le 2026-08-31 sur `dev`.
 *
 * Elle ne se regèle PAS à la hausse : une entrée dont le nombre monte fait
 * rougir la règle 3, et c'est le seul moment où quelqu'un relit ce tableau.
 * Une entrée qui disparaît (fichier découpé, ou repassé sous le seuil) peut
 * être retirée d'ici dans le commit qui l'a fait disparaître — mais ne pas la
 * retirer ne rougit rien, par construction des règles 2 et 3.
 *
 * L'écart avec la table de #4426 (18 fichiers, 42 394 lignes) est réel et a été
 * vérifié plutôt que recopié : `services/TrackingLinkService.ts` est repassé
 * sous le seuil, et `services/EmailService.ts` a perdu 254 lignes. Geler les
 * chiffres de l'issue plutôt que la mesure du jour aurait rendu au dépôt une
 * marge de croissance qu'il n'a plus — un cliquet se pose sur ce qu'on MESURE,
 * jamais sur ce qu'un document affirme.
 *
 * `services/notifications/NotificationService.ts` : entrée 6119 → 4494
 * (découpage #7093, 2026-09-19 ; le fichier MESURAIT 6114 avant le lot — le
 * gel d'origine portait une marge de 5 lignes, rendue au dépôt par ce
 * rabaissement). Les lois pures et les quatre éventails batch (plus
 * `member_joined`, cinquième éventail de même forme) sont partis vers
 * `notification-preview.ts`, `push-header.ts`, `post-media-thumbnail.ts` et
 * `fanout/*.ts`, dans le même dossier — la mesure descend, jamais un fichier
 * ne quitte la classe elle-même. Puis 4494 → 4477 (#7342, 2026-09-21) : la
 * carte `data` du push reproduit est partie vers `reproducedNotificationPush.ts`
 * avant d'y recevoir son marqueur — le fichier mesurait 4490. Puis 4477 → 3761
 * (#7632, 2026-09-23) : les quatorze BÂTISSEURS à destinataire NOMMÉ sont
 * partis vers `builders/`, en trois responsabilités — l'engagement sur un post
 * ou un commentaire (`social-engagement.ts`), l'appartenance à une conversation
 * (`conversation-membership.ts`) et la sécurité du compte
 * (`account-security.ts`). Le fichier MESURAIT 4473 avant le lot : la marge de
 * 4 lignes que le gel d'origine portait est rendue au dépôt par ce
 * rabaissement, comme au découpage précédent. Le premier module ne s'appelle
 * PAS `post-engagement.ts` — le `.gitignore` racine porte un `post-*` NON
 * QUALIFIÉ, qui matche par BASENAME à toute profondeur et l'avait avalé en
 * silence : vert en local, absent du dépôt.
 *
 * `socketio/CallEventsHandler.ts` : entrée 5181 → 4631 (#7632, 2026-09-23 ; le
 * fichier MESURAIT 5069 avant le lot — le gel d'origine portait 112 lignes de
 * marge, rendues au dépôt par ce rabaissement), puis 4631 → 4392 (#7632,
 * 2026-09-24). Ce second pas sort une QUATRIÈME responsabilité, et son
 * discriminant n'est plus « ce que le code sait » mais **de quoi il parle** :
 * `call-client-reports.ts` ne fait ni naître, ni joindre, ni terminer un appel
 * — il reçoit ce que l'APPLICATION cliente rapporte sur elle-même (premier
 * plan, capture d'écran, télémétrie de fin). Les quatre gestionnaires
 * partagent une doctrine qui se perdait, diluée, dans les 4631 lignes : le
 * `participantId` du client n'est jamais cru sur parole, et chacun paie une
 * raison DIFFÉRENTE de le résoudre côté serveur. Le cliquet descend par
 * MESURE (`wc -l`), pas par estimation. Trois responsabilités sont
 * parties, et le discriminant est ce que chacune SAIT : `call-recipients.ts`
 * (dans quelle langue parler à un destinataire, depuis quel pays il décroche,
 * son appareil sait-il recevoir un VoIP), `call-participants.ts` (par QUEL
 * identifiant la passerelle connaît un appelant, et à quel titre il a le droit
 * d'écrire sur CET appel — huit gardes distinctes), `call-transcription-relay.ts`
 * (graver un segment, le faire traduire, le servir à chaque auditeur dans SA
 * langue). Le tampon d'offres, le sursis de déconnexion et les notifications
 * d'appel manqué restent : ils partagent des `Map` avec le constructeur, avec
 * `destroy()` / `prepareForShutdown()`, ou sont atteints par 33 sites de
 * témoins — leur sortie ne serait pas mécanique.
 *
 * `socketio/CallEventsHandler.ts` : 4392 → 4341 (#8063, 2026-09-26). L'inscription
 * des bascules de média (audio, vidéo, écran) et la traduction de leurs erreurs
 * sont parties vers `call-media-toggle.ts`, qui porte déjà la bascule.
 *
 * `services/CallService.ts` : entrée 3121 → 3064 (#7545, 2026-09-23). La
 * réservation d'appel (claim / reprise / libération) est partie vers
 * `services/calls/activeCallClaim.ts`, qui notifie la liste de conversations.
 * Puis 3064 → 3049 (#8074, 2026-09-26) : les délais de sonnerie, les grâces et
 * le plafond de participants sont partis vers `@meeshy/shared/types/call-rules`,
 * le jeu unique que la passerelle et les clients lisent. Le même lot rabaisse
 * `services/PushNotificationService.ts` de 1041 à 1035 (le TTL d'appel).
 *
 * `services/PostFeedService.ts` : entrée 1401 → 1204 (#7396, 2026-09-21). L'état
 * du lecteur que cinq lectures recopiaient est parti vers
 * `posts/viewerPostState.ts`, où la page d'un hashtag le lit aussi. Puis
 * 1204 → 1199 (#7406, 2026-09-22) : les humeurs lisent `statusPostSelect`.
 *
 * `services/PostService.ts` : entrée 2663 → 2628 (#7406, 2026-09-22) — le like
 * et le retrait ne réécrivent plus le Json legacy `Post.reactions`.
 *
 * `services/MentionService.ts` : SORTI (1235 → 687, #7852, 2026-09-25). Les
 * suggestions d'autocomplete sont parties vers `services/mentions/`, avec la
 * portée qu'elles partagent désormais avec la validation à l'envoi.
 */
const DETTE_HERITEE: Readonly<Record<string, number>> = {
  'services/notifications/NotificationService.ts': 3761,
  'socketio/CallEventsHandler.ts': 4341,
  'socketio/MeeshySocketIOManager.ts': 3816,
  'services/message-translation/MessageTranslationService.ts': 3303,
  'services/MessageReadStatusService.ts': 3194,
  'services/CallService.ts': 3049,
  'services/PostService.ts': 2628,
  'socketio/handlers/MessageHandler.ts': 2269,
  'services/EmailService.ts': 1032,
  'server.ts': 1406,
  'services/PostFeedService.ts': 1199,
  'services/AuthService.ts': 1324,
  'services/messaging/MessageProcessor.ts': 1110,
  'services/PushNotificationService.ts': 1035,
  'dma-interoperability/signal-protocol/SignalProtocolEngine.ts': 1027,
  'services/AudioTranslateService.ts': 1017,
};

const NOMBRE_HERITE = Object.keys(DETTE_HERITEE).length;
const CUMUL_HERITE = Object.values(DETTE_HERITEE).reduce((somme, lignes) => somme + lignes, 0);

const horsBudget = () => overBudget(SRC_DIR, MAX_LINES);

describe('budget de taille sur tout le gateway (#4426)', () => {
  // Une liste vide passerait les trois règles au vert, et pour la pire des
  // raisons : le balayage ne verrait rien. La borne le dit avant les règles.
  it('voit bien les sources du gateway — sinon un balayage vide passerait au vert', () => {
    expect(statSync(SRC_DIR).isDirectory()).toBe(true);
    expect(walk(SRC_DIR).length).toBeGreaterThan(400);
  });

  it('règle 1 — aucun fichier hors budget qui ne soit déjà dans la dette héritée', () => {
    const nouveaux = horsBudget()
      .filter((file) => DETTE_HERITEE[file.path] === undefined)
      .map((file) => `${file.path} (${file.lines} lignes)`);

    expect(nouveaux).toEqual([]);
  });

  it('règle 2 — la dette héritée ne compte pas plus de fichiers qu\'au gel', () => {
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

  it("la dette héritée porte des LIGNES, jamais des numéros de ligne", () => {
    for (const [chemin, lignes] of Object.entries(DETTE_HERITEE)) {
      expect(chemin.endsWith('.ts')).toBe(true);
      expect(lignes).toBeGreaterThanOrEqual(MAX_LINES);
    }
  });
});
