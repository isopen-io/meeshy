/**
 * WF-113 — recette de parité comportementale F01..F15, web ↔ iOS.
 *
 * Ce fichier ne pose AUCUN jeton `behaviour-matrix:*` lui-même (règle de la
 * mission : « ne fabrique JAMAIS un jeton sans test réel ») — les jetons
 * réels vivent au plus près du comportement qu'ils prouvent :
 *
 *   F03  → components/conversations/focal/__tests__/FocalIdentityHeader.test.tsx
 *   F06  → components/conversations/focal/__tests__/focal-row-utils.test.ts
 *   F08  → components/conversations/focal/__tests__/FocalMediaBlock.test.tsx
 *   F09  → components/conversations/focal/__tests__/FocalQuotedReply.test.tsx
 *   F13  → hooks/lentille/__tests__/use-focal-perspective.test.ts
 *
 * Ce fichier a un rôle différent : DOCUMENTER, id par id, la décision de
 * couverture — couvert (avec sa preuve), ou non couvrable/hors périmètre
 * CE LOT (avec sa raison) — et verrouiller cette classification contre la
 * dérive silencieuse (un id qui change de colonne sans que ce fichier ne
 * bouge est un signal que la classification a été oubliée, pas mise à
 * jour).
 *
 * F01, F02, F04, F05, F07, F10, F11, F12, F14, F15 : NON couverts par ce lot
 * — raisons individuelles ci-dessous. Aucun n'est « impossible en soi » sur
 * le web ; tous sont hors du périmètre EXACT de WF-110..113 (workshop §5,
 * V4), qui ne demande que : rangée plate + densité Script (WF-110),
 * perspective + élection + pilule jour·heure (WF-111), citation + médias +
 * capsule date + rangée pont/agent (WF-112). Le reste (temps réel, accusés
 * de lecture, réactions, audio, menu long-press, badges éphémère/épinglé/
 * vue-unique, notices système, tête de fil) appartient à des workstreams
 * Focal iOS plus larges (F-080..F-090 du plan d'exécution) jamais demandés
 * au web par ce plan — ils restent à faire dans une vague ultérieure, pas
 * un oubli de celle-ci.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const MATRIX_PATH = join(
  __dirname,
  '../../../../packages/shared/fixtures/conformance/behaviour-matrix.json'
);

type MatrixEntry = { readonly id: string; readonly surface: string; readonly behaviour: string };

function loadFocalMatrixEntries(): readonly MatrixEntry[] {
  const matrix = JSON.parse(readFileSync(MATRIX_PATH, 'utf8')) as MatrixEntry[];
  return matrix.filter((entry) => entry.id.startsWith('F'));
}

/**
 * Classification WF-113 — tenue à jour MANUELLEMENT en miroir des jetons
 * réels (liste ci-dessus). `covered: true` ⇒ un jeton `behaviour-matrix:<id>`
 * DOIT exister quelque part sous `apps/web/` (vérifié par le test
 * ci-dessous, pas seulement affirmé en commentaire).
 */
const WEB_COVERAGE: Readonly<Record<string, { readonly covered: boolean; readonly reason: string }>> = {
  F01: { covered: false, reason: "temps réel (insertion live + pilule « nouveaux messages ») hors périmètre WF-110..113 — infra socket existante non reprise par ce lot." },
  F02: { covered: false, reason: "rangée typing du fil non construite par ce lot (mécanisme d'exclusion du pass générique, lui, est structurel : un rang non enregistré via registerRow n'est jamais transformé — mais aucune rangée typing concrète n'existe encore pour l'exercer honnêtement)." },
  F03: { covered: true, reason: 'dot de présence sur la pastille 22, réutilisation verbatim de ParticipantPresenceIndicator (WL-102).' },
  F04: { covered: false, reason: 'accusés ✓/✓✓/lu non demandés par WF-110..113 (aucune surface construite).' },
  F05: { covered: false, reason: 'réactions live non demandées par WF-110..113 (aucune surface construite).' },
  F06: { covered: true, reason: 'résolution Prisme via resolveFocalMessageText — MÊME loi (resolveLastMessagePreview) que la liste ; le cross-fade/chip 🌐 animé non construit (documenté dans le test).' },
  F07: { covered: false, reason: 'lecteur audio non demandé par WF-110..113 (aucune surface construite).' },
  F08: { covered: true, reason: 'médias nus radius 16 (FocalMediaBlock) ; géométrie exacte des slots 1/2/3/4+ non reproduite (documenté dans le test et le composant).' },
  F09: { covered: true, reason: 'citation filet 2.5 couleur de l\'auteur cité + ligne tronquée + tap-jump (FocalQuotedReply).' },
  F10: { covered: false, reason: 'menu long-press / rangées modifié·supprimé non demandés par WF-110..113.' },
  F11: { covered: false, reason: 'badges éphémère/épinglé/vue-unique non demandés par WF-110..113.' },
  F12: { covered: false, reason: "bannière épinglée déjà hors du mux (rendue par ConversationView, jamais touchée par ce lot — donc structurellement inchangée, mais non couverte par un test dédié économique à ce lot) ; le saut de recherche vers la bande de focus n'est pas câblé (scrollToMessage/scrollToMessageFast inchangés)." },
  F13: { covered: true, reason: 'plafond optimiste alpha = min(0.7, alphaPerspective), confirmé à 1.0 (useFocalPerspective.setAlphaCeiling + FocalRow).' },
  F14: { covered: false, reason: "NON APPLICABLE par construction : la géométrie web n'est PAS inversée (DOM en ordre naturel, RE-PREUVE ConversationMessages.tsx) — l'inset de tête compensatoire (headInset) répond à un besoin PUREMENT iOS (UICollectionView inversée). La préservation d'offset au prepend appartient à l'infra de pagination existante, inchangée par ce lot." },
  F15: { covered: false, reason: 'effets/mentions/notices système centrées non demandés par WF-110..113.' },
};

describe('Parité comportementale F01..F15 — web (WF-113)', () => {
  const entries = loadFocalMatrixEntries();

  it('la matrice porte bien 15 entrées F01..F15 (RE-PREUVE, §0)', () => {
    expect(entries).toHaveLength(15);
    expect(entries.map((e) => e.id)).toEqual([
      'F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07', 'F08',
      'F09', 'F10', 'F11', 'F12', 'F13', 'F14', 'F15',
    ]);
  });

  it('la classification WF_COVERAGE couvre EXACTEMENT les 15 ids de la matrice (aucun oubli, aucun id inventé)', () => {
    const matrixIds = entries.map((e) => e.id).sort();
    const classifiedIds = Object.keys(WEB_COVERAGE).sort();
    expect(classifiedIds).toEqual(matrixIds);
  });

  it('chaque id classé `covered: true` est RÉELLEMENT référencé par un jeton behaviour-matrix:<id> sous apps/web/', () => {
    const webRoot = join(__dirname, '../..');
    const { execSync } = require('child_process') as typeof import('child_process');

    Object.entries(WEB_COVERAGE)
      .filter(([, v]) => v.covered)
      .forEach(([id]) => {
        let matchCount = 0;
        try {
          const output = execSync(
            `grep -rl "behaviour-matrix:${id}\\b" "${webRoot}" --include=*.ts --include=*.tsx || true`,
            { encoding: 'utf8' }
          );
          matchCount = output.split('\n').filter(Boolean).length;
        } catch {
          matchCount = 0;
        }
        if (matchCount === 0) {
          throw new Error(`${id} classé covered:true mais aucun jeton behaviour-matrix:${id} trouvé sous apps/web/`);
        }
        expect(matchCount).toBeGreaterThan(0);
      });
  });

  it('chaque id classé `covered: false` porte une raison non vide (documentation honnête, jamais un silence)', () => {
    Object.entries(WEB_COVERAGE)
      .filter(([, v]) => !v.covered)
      .forEach(([id, v]) => {
        if (v.reason.trim().length <= 10) {
          throw new Error(`${id} : raison vide ou trop courte`);
        }
        expect(v.reason.trim().length).toBeGreaterThan(10);
      });
  });

  it('résumé : 5 ids couverts (F03/F06/F08/F09/F13), 10 documentés hors périmètre', () => {
    const covered = Object.values(WEB_COVERAGE).filter((v) => v.covered).length;
    const notCovered = Object.values(WEB_COVERAGE).filter((v) => !v.covered).length;
    expect(covered).toBe(5);
    expect(notCovered).toBe(10);
  });
});
