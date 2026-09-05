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
 */
const DETTE_HERITEE: Readonly<Record<string, number>> = {
  'services/notifications/NotificationService.ts': 6119,
  'socketio/CallEventsHandler.ts': 5181,
  'socketio/MeeshySocketIOManager.ts': 3816,
  'services/message-translation/MessageTranslationService.ts': 3303,
  'services/MessageReadStatusService.ts': 3194,
  'services/CallService.ts': 3121,
  'services/PostService.ts': 2663,
  'socketio/handlers/MessageHandler.ts': 2336,
  'services/EmailService.ts': 1843,
  'server.ts': 1406,
  'services/PostFeedService.ts': 1401,
  'services/AuthService.ts': 1324,
  'services/MentionService.ts': 1235,
  'services/messaging/MessageProcessor.ts': 1110,
  'services/PushNotificationService.ts': 1053,
  'services/AudioTranslateService.ts': 1038,
  'dma-interoperability/signal-protocol/SignalProtocolEngine.ts': 1027,
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
