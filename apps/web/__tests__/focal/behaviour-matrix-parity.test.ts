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
 * F01, F02, F10, F11, F12, F14, F15 : NON couverts (mise à jour Q-140,
 * 2026-08-17) — raisons individuelles ci-dessous, RE-PROUVÉES à cette date.
 * Aucun n'est « impossible en soi » sur le web.
 *
 * RECLASSÉS Q-140 (2026-08-17) : F04, F05, F07 étaient classés `false`
 * (« non demandés par WF-110..113 ») ; le lot `focal-parity` (da167d4a,
 * 2026-08-17, directive produit « toutes les données du message ») les a
 * rendus RÉELS — accusés dans l'identité, réactions visibles, audio/vidéo/
 * PDF rendus via les composants réutilisés du tronc (`MessageAttachments`,
 * `DeliveryIndicator`, `MessageReactions`) — sans que ce fichier de
 * classification n'ait suivi le mouvement avant Q-140. Ce même lot a AUSSI
 * touché F10/F11/F15 partiellement (édition visible, transfert visible mais
 * mal placé, notices d'appel visibles) sans en couvrir la clause
 * principale : ces trois id restent classés non-couverts, raisons
 * actualisées plutôt que réécrites en `true` par confort.
 *
 * Les id encore non couverts appartiennent soit à des workstreams Focal iOS
 * plus larges jamais demandés au web par WF-110..113 (F01, F02, F12, F14),
 * soit à des trous réels partiellement comblés mais pas soldés (F10, F11,
 * F15, voir raisons individuelles) — ils restent à faire dans une vague
 * ultérieure, pas un oubli de Q-140.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { indexBehaviourTokens as indexBehaviourTokensShared } from '../support/behaviour-matrix-scan';

const MATRIX_PATH = join(
  __dirname,
  '../../../../packages/shared/fixtures/conformance/behaviour-matrix.json'
);

const WEB_ROOT = join(__dirname, '../..');

/**
 * REV-4/B5 — l'INDEX des jetons, construit UNE fois, en process, BORNÉ aux
 * sources. Mécanique complète (pourquoi un scan en-process borné remplace
 * `execSync('grep -rl …')`) documentée UNE fois dans
 * `apps/web/__tests__/support/behaviour-matrix-scan.ts`, réutilisée telle
 * quelle par le pendant Lentille (`__tests__/lentille/behaviour-matrix-parity.test.ts`,
 * V4bis/R4-1) — deux familles d'id (F.. et L..), un seul scanner, jamais deux
 * mécaniques à faire diverger en silence.
 */
function indexBehaviourTokens(): ReadonlyMap<string, readonly string[]> {
  return indexBehaviourTokensShared(WEB_ROOT, /^F\d{2}$/);
}

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
  F01: { covered: false, reason: "temps réel (insertion live + pilule « nouveaux messages ») hors périmètre WF-110..113 — infra socket existante non reprise par ce lot. Re-preuve Q-140 (2026-08-17) : `FocalRow.tsx`/`FocalThread.tsx` ne référencent ni diffable-insertion ni pilule ; le focal-parity du 2026-08-17 (da167d4a) n'a touché que le CONTENU d'une rangée déjà présente, jamais son insertion." },
  F02: { covered: false, reason: "rangée typing du fil non construite par ce lot (mécanisme d'exclusion du pass générique, lui, est structurel : un rang non enregistré via registerRow n'est jamais transformé — mais aucune rangée typing concrète n'existe encore pour l'exercer honnêtement). Re-preuve Q-140 (2026-08-17) : inchangé." },
  F03: { covered: true, reason: 'dot de présence sur la pastille 22, réutilisation verbatim de ParticipantPresenceIndicator (WL-102).' },
  F04: {
    covered: true,
    reason:
      "RECLASSÉ Q-140 (2026-08-17, était `false` — « non demandés »). `focal-parity` (da167d4a) monte désormais `DeliveryIndicator` (RÉUTILISÉ, même règle `showReadReceipts`) DANS `FocalIdentityHeader` pour les messages « Toi », jamais en pied — exactement le déplacement que F04 demande. Testé : " +
      "`FocalRow.parity.test.tsx`, « un message de MOI porte l'indicateur de livraison/lecture DANS l'identité » (behaviour-matrix:F04 posé par ce lot).",
  },
  F05: {
    covered: true,
    reason:
      "RECLASSÉ Q-140 (2026-08-17, était `false` — « non demandées »). `focal-parity` (da167d4a) monte `MessageReactions` (RÉUTILISÉ) en méta de `FocalMetaRow` — la DONNÉE réaction n'est plus absente. Écart VÉRIFIÉ et assumé : le composant réutilisé garde son habillage « bulle » (fond blanc/gris, ombre, anneau) — " +
      "il n'a PAS été restylé en pilule plate à jetons `--lentille-thread-*` (`backgroundSecondary`/`inputBorder`, 11pt) comme le décrit la matrice ; seule la présence est prouvée. Testé : `FocalRow.parity.test.tsx`, « les réactions posées sont visibles » (behaviour-matrix:F05 posé par ce lot).",
  },
  F06: {
    covered: true,
    reason:
      "résolution Prisme via resolveFocalMessageText — MÊME loi (resolveLastMessagePreview) que la liste. Raison corrigée Q-140 (2026-08-17, texte périmé) : le chip 🌐 N'EST PLUS absent — `focal-parity` (da167d4a) l'a ajouté à `FocalMetaRow` " +
      "(`focal-translated`, drapeaux origine→affiché, testé « un message AFFICHÉ TRADUIT porte le témoin”), sans en faire un cross-fade ANIMÉ (transition instantanée, pas de durée de transition observée) — seul le mot « animé » de l'ancienne raison reste inexact.",
  },
  F07: {
    covered: true,
    reason:
      "RECLASSÉ Q-140 (2026-08-17, était `false` — « non demandé »). `focal-parity` (da167d4a) route les pièces jointes non-image (vocal, audio, vidéo, PDF, document) vers `MessageAttachments` (RÉUTILISÉ — MÊME lecteur audio/waveform, MÊME transcription traduite en italique que la vue Bulles, jamais une copie), " +
      "posé NU (sans conteneur bulle, `FocalMediaBlock.tsx`). Le carrousel multi-pistes hérite du même composant réutilisé, non re-testé séparément ici. Testé : `FocalRow.parity.test.tsx`, « un vocal/audio SEUL est rendu », « une vidéo SEULE est rendue », « un document/PDF SEUL est rendu » (behaviour-matrix:F07 posé par ce lot).",
  },
  F08: { covered: true, reason: 'médias nus radius 16 (FocalMediaBlock) ; géométrie exacte des slots 1/2/3/4+ non reproduite (documenté dans le test et le composant).' },
  F09: { covered: true, reason: 'citation filet 2.5 couleur de l\'auteur cité + ligne tronquée + tap-jump (FocalQuotedReply).' },
  F10: {
    covered: false,
    reason:
      "raison mise à jour Q-140 (2026-08-17, restait `false` — texte périmé : « non demandés par WF-110..113 » ne tient plus intégralement). La matrice bundle TROIS comportements : (a) menu long-press contextuel — TOUJOURS absent, re-preuve `grep -n 'contextMenu\\|onLongPress' apps/web/components/conversations/focal` → 0 hit ; " +
      "(b) « modifié » en méta — DÉSORMAIS RÉEL (`focal-parity`, da167d4a, `FocalMetaRow` porte `isEdited`, testé « un message ÉDITÉ le dit ») mais SANS jeton `behaviour-matrix:F10` posé (id resté classé non-couvert, ce sous-comportement seul ne suffit pas à couvrir F10 dans son ensemble) ; " +
      "(c) rangée fantôme supprimée (BubbleDeletedView sans fond) — TOUJOURS absente, re-preuve `grep -n isDeleted apps/web/components/conversations/focal/FocalRow.tsx` → 0 hit. Deux des trois clauses restent un TROU RÉEL, non un simple hors-périmètre : F10 était en scope produit dès WF-110..113 (rangée = contenu ET son état), l'ancienne raison le sous-déclarait.",
  },
  F11: {
    covered: false,
    reason:
      "raison mise à jour Q-140 (2026-08-17, restait `false` — texte périmé). `focal-parity` (da167d4a) rend désormais un badge « transféré » (`focal-forwarded`, testé) — MAIS dans `FocalMetaRow`, SOUS le contenu, alors que la matrice exige les badges " +
      "« au-dessus de l'identité » : positionnement INVERSE de la spec, pas un simple détail de cote. Les trois autres badges (éphémère, épinglé, vue-unique plein écran) restent structurellement absents — re-preuve `grep -n 'isPinned\\|isViewOnce\\|ephemeral' apps/web/components/conversations/focal/FocalRow.tsx` → 0 hit. " +
      "1 clause sur 4, mal placée : trou réel majoritaire, F11 reste non-couvert.",
  },
  F12: { covered: false, reason: "bannière épinglée déjà hors du mux (rendue par ConversationView, jamais touchée par ce lot — donc structurellement inchangée, mais non couverte par un test dédié économique à ce lot) ; le saut de recherche vers la bande de focus n'est pas câblé (scrollToMessage/scrollToMessageFast inchangés). Re-preuve Q-140 (2026-08-17) : inchangé." },
  F13: { covered: true, reason: 'plafond optimiste alpha = min(0.7, alphaPerspective), confirmé à 1.0 (useFocalPerspective.setAlphaCeiling + FocalRow).' },
  F14: { covered: false, reason: "NON APPLICABLE par construction : la géométrie web n'est PAS inversée (DOM en ordre naturel, RE-PREUVE ConversationMessages.tsx) — l'inset de tête compensatoire (headInset) répond à un besoin PUREMENT iOS (UICollectionView inversée). La préservation d'offset au prepend appartient à l'infra de pagination existante, inchangée par ce lot." },
  F15: {
    covered: false,
    reason:
      "raison mise à jour Q-140 (2026-08-17, restait `false` — texte périmé). La matrice ouvre F15 sur « les effets (bitfield) s'appliquent au bloc contenu » — TOUJOURS absent côté web, re-preuve `grep -rn 'effects' apps/web/components/conversations/focal/FocalRow.tsx` → 0 hit exécutable. " +
      "« mentions et hashtags gardent leurs tokens » — mentions RÉELLES depuis `focal-parity` (mentionsToLinks, testé « une MENTION validée part en lien »), hashtags NON vérifiés (aucun rendu distinct trouvé). « notices d'appel/système deviennent des rangées centrées plates » — DÉSORMAIS RÉEL pour les appels (`CallSystemMessage` réutilisé, testé « un résumé d'appel monte CallSystemMessage »), " +
      "mais sans conserver la garde « sans capsule » de la matrice (composant web à sa propre mise en page, non vérifiée contre ce critère). 2 des 3 clauses partiellement réelles, la clause d'ouverture (effets) reste un trou entier : F15 reste non-couvert.",
  },
};

/**
 * R5-9 (REV-4ter, `tasks/lentille-workshop-execution.md` §8 ligne V4bis+V4ter)
 * — « raisons Focal sous le standard de preuve » : durci par Q-140
 * (2026-08-17), même patron que `EXCLUDED_DEAD_FAMILIES`
 * (`packages/shared/__tests__/ci/lentille-tokens-consumption-gate.test.ts`) —
 * une raison de non-couverture datée, attribuée, et RE-PROUVÉE PAR LE TEST
 * lui-même (un grep 0-hit borné aux fichiers de la peau Focal), jamais
 * seulement une phrase de commentaire qu'on croit sur parole.
 *
 * TYPE, vocabulaire amendé REV-4ter (critère de porte, 32 id) :
 *   - `absent-structurel`      : la plateforme ne porte structurellement pas
 *                                ce que la ligne de matrice suppose (pas un
 *                                manque d'implémentation — une différence de
 *                                nature entre plateformes) ;
 *   - `source-amont-attendue`  : la donnée/l'API amont n'existe pas encore,
 *                                aucune peau ne peut l'exploiter avant elle ;
 *   - `hors-périmètre-du-lot`  : implémentable, non demandé par le plan
 *                                d'exécution qui a livré ce lot.
 *
 * Les 7 id non couverts F01/F02/F10/F11/F12/F14/F15 y entrent TOUS : chaque
 * grep porte sur le ou les fichiers exacts où le comportement DEVRAIT
 * apparaître s'il existait, jamais un balayage large qui risquerait un faux
 * négatif (motif absent PARCE QUE mal cherché, plutôt que parce que le
 * comportement est réellement absent).
 */
type TypedAbsenceReason = 'absent-structurel' | 'source-amont-attendue' | 'hors-périmètre-du-lot';

interface TypedAbsence {
  readonly id: string;
  readonly type: TypedAbsenceReason;
  readonly since: string;
  readonly owner: string;
  /** Fichiers scrutés, relatifs à `apps/web/`. */
  readonly files: readonly string[];
  /** Motif dont la PRÉSENCE réfuterait l'absence documentée — doit rendre 0 hit aujourd'hui. */
  readonly pattern: RegExp;
  readonly note: string;
}

const FOCAL_ROW_DIR = 'components/conversations/focal';

const TYPED_ABSENCES: readonly TypedAbsence[] = [
  {
    id: 'F01',
    type: 'hors-périmètre-du-lot',
    since: '2026-08-17',
    owner: 'Q-140',
    files: [`${FOCAL_ROW_DIR}/FocalRow.tsx`, `${FOCAL_ROW_DIR}/FocalThread.tsx`],
    pattern: /diffable|Snapshot|newMessagesPill/,
    note: "l'insertion temps réel + la pilule « nouveaux messages » restent la propriété de l'infra de liste existante — aucun marqueur Focal-spécifique ne les réimplémente.",
  },
  {
    id: 'F02',
    type: 'hors-périmètre-du-lot',
    since: '2026-08-17',
    owner: 'Q-140',
    files: [`${FOCAL_ROW_DIR}/FocalRow.tsx`],
    pattern: /typing/i,
    note: 'aucune cellule typing construite dans la peau Focal — même garde que son ancrage iOS jumeau (`FocalRealtimeMatrixTests.test_F02_typingIndicatorIsNotReimplementedInFocalRow`).',
  },
  {
    id: 'F10',
    type: 'hors-périmètre-du-lot',
    since: '2026-08-17',
    owner: 'Q-140',
    files: [`${FOCAL_ROW_DIR}/FocalRow.tsx`, `${FOCAL_ROW_DIR}/FocalThread.tsx`, `${FOCAL_ROW_DIR}/FocalMetaRow.tsx`],
    pattern: /contextMenu|onLongPress|isDeleted/i,
    note: "deux des trois clauses de F10 (menu long-press, rangée fantôme supprimée) restent absentes — seule « modifié » (isEdited) est réelle, hors du champ de ce grep par construction.",
  },
  {
    id: 'F11',
    type: 'hors-périmètre-du-lot',
    since: '2026-08-17',
    owner: 'Q-140',
    files: [`${FOCAL_ROW_DIR}/FocalRow.tsx`],
    pattern: /isPinned|isViewOnce|ephemeral/i,
    note: 'trois des quatre badges de F11 (épinglé, vue-unique, éphémère) restent absents — seul « transféré » est réel, et mal placé (méta, pas au-dessus de l’identité).',
  },
  {
    id: 'F12',
    type: 'hors-périmètre-du-lot',
    since: '2026-08-17',
    owner: 'Q-140',
    files: [`${FOCAL_ROW_DIR}/FocalRow.tsx`, `${FOCAL_ROW_DIR}/FocalThread.tsx`],
    pattern: /landOnFocusBand|scrollToMessageFast/,
    note: "le saut de recherche vers la bande de focus n'est câblé par AUCUN fichier de la peau Focal — le mécanisme d'atterrissage dédié (précédent iOS : `landOnFocusBand`) n'a pas de pendant web.",
  },
  {
    id: 'F14',
    type: 'absent-structurel',
    since: '2026-08-17',
    owner: 'Q-140',
    files: [`${FOCAL_ROW_DIR}/FocalRow.tsx`, `${FOCAL_ROW_DIR}/FocalThread.tsx`],
    pattern: /headInset|hasReachedOldest/,
    note: "la géométrie web n'est PAS une collection inversée (DOM en ordre naturel) — l'inset de tête compensatoire répond à un besoin PUREMENT iOS ; aucun pendant web ne peut exister PAR CONSTRUCTION, pas seulement par manque de temps.",
  },
  {
    id: 'F15',
    type: 'hors-périmètre-du-lot',
    since: '2026-08-17',
    owner: 'Q-140',
    files: [`${FOCAL_ROW_DIR}/FocalRow.tsx`],
    pattern: /\.effects\b|messageEffects/,
    note: "le bitfield d'effets (confettis, etc.) n'est appliqué par AUCUN fichier de la peau Focal — seules les clauses mentions/notices-d'appel de F15 sont réelles (hors du champ de ce grep par construction).",
  },
];

describe('R5-9 — les 7 raisons de non-couverture Focal sont RE-PROUVÉES par le test, pas seulement affirmées', () => {
  it('TYPED_ABSENCES couvre EXACTEMENT les id classés `covered: false` (aucun oubli, aucun surplus)', () => {
    const notCoveredIds = Object.entries(WEB_COVERAGE)
      .filter(([, v]) => !v.covered)
      .map(([id]) => id)
      .sort();
    expect(TYPED_ABSENCES.map((a) => a.id).sort()).toEqual(notCoveredIds);
  });

  it('chaque exclusion porte une date, un porteur et un motif non vides', () => {
    for (const absence of TYPED_ABSENCES) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(absence.since)) {
        throw new Error(`${absence.id} : date manquante ou mal formée ("${absence.since}").`);
      }
      if (absence.owner.trim().length === 0) {
        throw new Error(`${absence.id} : porteur manquant.`);
      }
      if (absence.note.trim().length <= 20) {
        throw new Error(`${absence.id} : motif trop court.`);
      }
      if (absence.files.length === 0) {
        throw new Error(`${absence.id} : aucun fichier scruté.`);
      }
    }
    expect(TYPED_ABSENCES.length).toBeGreaterThan(0);
  });

  it.each(TYPED_ABSENCES)(
    '$id ($type) : le motif de réfutation rend bien 0 hit dans ses fichiers aujourd’hui',
    ({ id, files, pattern, note }) => {
      const hits: string[] = [];
      for (const rel of files) {
        const abs = join(WEB_ROOT, rel);
        let content: string;
        try {
          content = readFileSync(abs, 'utf8');
        } catch {
          throw new Error(`${id} : fichier introuvable (${rel}) — cette exclusion doit être re-pointée.`);
        }
        if (pattern.test(content)) hits.push(rel);
      }
      if (hits.length > 0) {
        throw new Error(
          `${id} : le motif ${pattern} EST maintenant présent dans ${hits.join(', ')} — ` +
            `l'absence documentée (« ${note} ») est PÉRIMÉE : reclasser cet id dans WEB_COVERAGE ` +
            'plutôt que de laisser une exclusion qui ne tient plus.'
        );
      }
      expect(hits).toEqual([]);
    }
  );
});

describe('Parité comportementale F01..F15 — web (WF-113)', () => {
  const entries = loadFocalMatrixEntries();
  const tokenIndex = indexBehaviourTokens();

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

  it("le mécanisme de balayage n'est pas aveugle (témoin de discrimination du remplacement de scanner, B5)", () => {
    // Il VOIT : au moins un jeton réel indexé, dans un fichier de source
    // existant — sinon le test suivant passerait pour de mauvaises raisons.
    expect(tokenIndex.size).toBeGreaterThan(0);
    // Il DISCRIMINE : un id absent de l'arbre ne se voit attribuer aucun
    // fichier — un scanner qui répondrait « trouvé » à tout serait vert et
    // vide de sens. F99 n'existe dans aucune matrice (F01..F15).
    expect(tokenIndex.get('F99')).toBeUndefined();
  });

  it('chaque id classé `covered: true` est RÉELLEMENT référencé par un jeton behaviour-matrix:<id> sous apps/web/', () => {
    Object.entries(WEB_COVERAGE)
      .filter(([, v]) => v.covered)
      .forEach(([id]) => {
        const files = tokenIndex.get(id) ?? [];
        if (files.length === 0) {
          throw new Error(`${id} classé covered:true mais aucun jeton behaviour-matrix:${id} trouvé sous apps/web/`);
        }
        expect(files.length).toBeGreaterThan(0);
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

  it('résumé Q-140 (2026-08-17) : 8 ids couverts (F03/F04/F05/F06/F07/F08/F09/F13), 7 non couverts (F01/F02/F10/F11/F12/F14/F15)', () => {
    const covered = Object.values(WEB_COVERAGE).filter((v) => v.covered).length;
    const notCovered = Object.values(WEB_COVERAGE).filter((v) => !v.covered).length;
    expect(covered).toBe(8);
    expect(notCovered).toBe(7);
    expect(covered + notCovered).toBe(15);
  });
});
