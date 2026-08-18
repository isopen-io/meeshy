/**
 * V4bis/R4-1 — pendant Lentille de `focal/behaviour-matrix-parity.test.ts`
 * (WF-113). Réserve REV-4 (`tasks/lentille-workshop-execution.md` §8, ligne
 * V4) : « pendant Lentille de `behaviour-matrix-parity` manquant (10 id L ni
 * classés ni justifiés — le filet qui aurait attrapé B2/B3) ». B2 et B3
 * étaient déjà des trous SUR LES id L17 et L07 : ce fichier est exactement le
 * filet qui les aurait fait échouer PLUS TÔT — désormais ARMÉ, jamais en
 * `describe.skip` (précédent REV-3/B1 : la garde d'ensemble iOS a appris
 * cette leçon la première).
 *
 * MÊME mécanique que le Focal (extraite dans
 * `apps/web/__tests__/support/behaviour-matrix-scan.ts` — réutilisée, pas
 * dupliquée) : scanner en-process, borné aux sources, une seule traversée.
 *
 * Ce fichier ne pose AUCUN jeton `behaviour-matrix:*` lui-même (même règle
 * que le Focal) — les jetons réels vivent au plus près du comportement
 * qu'ils prouvent, ailleurs. L01/L06/L08/L10/L11/L12/L16/L17 portaient déjà
 * le leur (B2/B3) ; L02/L04/L07-visuel/L15 gagnent le leur PAR ce lot :
 *
 *   L01 → components/conversations/lentille/__tests__/LentilleRow.test.tsx
 *   L02 → idem (précédence brouillon, jeton posé par ce lot)
 *   L04 → idem (branche pièce jointe, jeton posé par ce lot) +
 *         components/conversations/conversation-item/message-formatting.tsx
 *   L06 → idem
 *   L07 → components/conversations/lentille/__tests__/LentillePeek.actions.test.tsx (B3, actions)
 *         + LentilleRow.tsx/LentilleRow.test.tsx (V4bis/R4-1, part VISUELLE — comblée par ce lot)
 *   L08 → components/conversations/lentille/__tests__/LentilleFocusCard.test.tsx
 *   L10 → LentilleRow.test.tsx
 *   L11 → LentilleRow.test.tsx, hooks/lentille/__tests__/lentille-focus-election.test.tsx
 *   L12 → components/conversations/lentille/__tests__/LentillePeek.test.tsx
 *   L15 → components/conversations/lentille/__tests__/LentilleRow.memo.test.tsx (jeton posé par ce lot)
 *   L16 → LentilleRow.test.tsx
 *   L17 → LentilleConversationListMount.test.tsx (B2), useLoadMoreSentinel.test.tsx,
 *         __tests__/components/conversations/ConversationList.lentille-mux.test.tsx
 *
 * L03, L05, L09, L13, L14 : NON couverts — justifiés-absents, chacun
 * RE-PROUVÉ (grep/lecture, fichier:ligne) dans sa classification ci-dessous,
 * jamais affirmé de complaisance.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { indexBehaviourTokens as indexBehaviourTokensShared } from '../support/behaviour-matrix-scan';

const MATRIX_PATH = join(
  __dirname,
  '../../../../packages/shared/fixtures/conformance/behaviour-matrix.json'
);

const WEB_ROOT = join(__dirname, '../..');

/** MÊME scanner que le Focal (B5) — voir `../support/behaviour-matrix-scan.ts`. */
function indexBehaviourTokens(): ReadonlyMap<string, readonly string[]> {
  return indexBehaviourTokensShared(WEB_ROOT, /^L\d{2}$/);
}

type MatrixEntry = { readonly id: string; readonly surface: string; readonly behaviour: string };

function loadLentilleMatrixEntries(): readonly MatrixEntry[] {
  const matrix = JSON.parse(readFileSync(MATRIX_PATH, 'utf8')) as MatrixEntry[];
  return matrix.filter((entry) => entry.id.startsWith('L'));
}

/**
 * Classification WEB_COVERAGE — tenue à jour MANUELLEMENT en miroir des
 * jetons réels. `covered: true` ⇒ un jeton `behaviour-matrix:<id>` DOIT
 * exister quelque part sous `apps/web/` (vérifié par le test ci-dessous, pas
 * seulement affirmé en commentaire) ; `covered: false` ⇒ une raison VÉRIFIÉE
 * (fichier:ligne re-prouvé par grep/lecture au moment de ce lot, 2026-08-17),
 * jamais une exclusion de confort — précisément ce que le récit L07 (part
 * visuelle) interdit : la matrice exigeait un visuel que la peau n'avait
 * pas, ce trou a été COMBLÉ (implémenté) plutôt que dressé en faux
 * « justifié-absent ».
 */
const WEB_COVERAGE: Readonly<Record<string, { readonly covered: boolean; readonly reason: string }>> = {
  L01: {
    covered: true,
    reason: 'typing multi-membres, sélection déterministe (ordre alphabétique), dot forcé vert (LentilleRow.tsx, LentilleRow.test.tsx).',
  },
  L02: {
    covered: true,
    reason:
      "précédence typing > brouillon > pont/préview RÉELLE et testée (LentilleRow.tsx, test « précédence : brouillon prime sur pont et préview ») ; " +
      "label « ✎ Brouillon » en couleur d'erreur AVEC le texte du brouillon en tertiaire — RÉEL, plus un écart : deux spans distincts désormais " +
      "(LentilleRow.tsx, `lentille-row-draft-label` en `text-destructive`, `lentille-row-draft-content` hérite `text-muted-foreground` du conteneur " +
      "ligne 2), là où un unique span `text-destructive` couvrait auparavant le label ET `draft.content`. Réserve R4-3 (« L02 brouillon tout-destructive », " +
      "tasks/lentille-workshop-execution.md §8 ligne V4) SOLDÉE par V4ter/R4-3 — testé « behaviour-matrix:L02 — R4-3 : le label est en erreur, le texte " +
      "du brouillon reste tertiaire » (LentilleRow.test.tsx).",
  },
  L03: {
    covered: false,
    reason:
      "justifié-absent — jamais construit sur AUCUNE plateforme web, ni avant ni après la Lentille. Re-preuve : `grep -rn 'viewOnce|ephemeral|expired|hidden' " +
      "apps/web/components/conversations/conversation-item/*.tsx apps/web/components/conversations/lentille/*.tsx` → 0 occurrence de logique de glyphe de " +
      "kind (2026-08-17). Les DONNÉES existent côté modèle (`packages/shared/types/message-types.ts:161` `viewOnceCount`, `:167` `expiresAt`) mais aucun " +
      "composant — ni `ConversationItem` historique (le modèle que `LentilleRow` réutilise), ni `LentilleRow` neuf — n'en dérive de glyphe en tête de " +
      "ligne 2. « SF Symbols » (le vocabulaire de la ligne de matrice) est un vocabulaire iOS ; hors périmètre WL-100..108, qui ne demande explicitement " +
      "que rang plat/pont/perspective/menu (workshop §5, V4).",
  },
  L04: {
    covered: true,
    reason:
      "branche pièce jointe sans texte réutilisée VERBATIM par `LentilleRow` (`formatLastMessage`, `message-formatting.tsx:198-228`, fichier partagé avec " +
      "`ConversationItem`, non modifié) — glyphe + méta W×H, « +N », Prisme exclu de cette branche par construction (le prisme ne porte que sur " +
      "`lastMessage.content`). Jeton posé au plus près (`message-formatting.tsx:198`) + test dédié `LentilleRow.test.tsx`.",
  },
  L05: {
    covered: false,
    reason:
      "justifié-absent — le champ `lastMessageLocation` n'existe NULLE PART dans le modèle web. Re-preuve : `grep -rn lastMessageLocation " +
      "packages/shared apps/web` → 0 occurrence (2026-08-17) ; le type `Conversation` (`packages/shared/types/conversation.ts:330-360`, bloc " +
      "`===== MESSAGES =====`) ne porte que `lastMessage`/`lastMessageAt`/`messageCount`/`unreadCount`/`lastMessageTranslations`/" +
      "`lastMessageOriginalLanguage` — aucun champ de localisation (`canSendLocations`, une permission d'ENVOI sans rapport, est le seul hit " +
      "`Location*` du fichier, `:619`). Jamais construit sur aucune plateforme web, hors périmètre WL-100..108.",
  },
  L06: {
    covered: true,
    reason: 'badge rouge 99+ supprimé → point accent 8px + pont ✦, heure conservée (LentilleRow.tsx, LentilleRow.test.tsx).',
  },
  L07: {
    covered: true,
    reason:
      "DEUX parts, toutes deux réelles désormais. (a) Les swipes/six actions (épingle, sourdine, verrou non applicable web, archive, blocage) : REV-4/B3, " +
      "`useConversationItemActions` monté par `LentillePeek` (`LentillePeek.actions.test.tsx`). (b) Part VISUELLE — ABSENTE avant ce lot (re-preuve " +
      "2026-08-17 : `grep -rn 'isPinned|isMuted|📌|🔕' apps/web/components/conversations/lentille/LentilleRow.tsx` → 0 occurrence avant édition), donc " +
      "un trou RÉEL, pas dressée en justifiée-absente : COMBLÉE par ce lot — `LentilleRow.tsx` lit `useConversationPreference` (MÊME magasin que " +
      "`LentillePeek`, aucune seconde source), rend 📌 avant le nom si épinglé et 🔕 + opacité `--lentille-list-muted-opacity` (`list.muted.opacity`, " +
      "`lentille-tokens.json`, déjà consommée côté iOS `LentilleMetrics.Muted`, jusqu'ici morte côté web) sur le RANG ENTIER si en sourdine. Testé : " +
      "`LentilleRow.test.tsx`, describe « pin/sourdine visibles ».",
  },
  L08: {
    covered: true,
    reason:
      "badge de type absorbé par la focus card (chip groupe/canal/bot + memberCount, anneau accent) : réel et testé (`LentilleFocusCard.tsx`, " +
      "`LentilleFocusCard.test.tsx`). SECONDE part — les tags utilisateur, « au plus 3 pastilles de 6 px après le nom » — désormais RÉELLE : réserve " +
      "R4-2 (« L08 tags non implémentés (tokens morts) », workshop §8 ligne V4) SOLDÉE le 2026-08-17. `LentilleRow.tsx` lit les tags du MÊME magasin que " +
      "pin/sourdine/favori (`useConversationPreference` — aucune prop neuve à faire traverser le montage, aucune seconde source), les plafonne par " +
      "`LENTILLE_LIST_TAGS_MAX_COUNT` (miroir de `list.tags.maxCount`, gardé contre la dérive par `lentille-tags-max-count.parity.test.ts`) et les rend " +
      "à la cote `--lentille-list-tags-size` : les tokens `list.tags.{size,maxCount,emojiSize}`, vivants côté iOS (`LentilleMetrics.Tags`) et morts côté " +
      "web, sont branchés. Teinte par `getTagColor`, le MÊME hachage que le rang historique — une seule loi de couleur de tag dans le dépôt. Testé : " +
      "`LentilleRow.line1-grammar.test.tsx`, describe « pastilles de tags » (plafond, cote, teintes distinctes, absence sans tag).",
  },
  L09: {
    covered: false,
    reason:
      "justifié-absent — `hasPendingSync` n'existe pas sur le modèle `Conversation` web. Re-preuve : `grep -rn hasPendingSync packages/shared apps/web` " +
      "→ 0 occurrence (2026-08-17) ; seule une notion d'outbox de MESSAGES existe (`apps/web/lib/conversations/delta-sync.ts:119`, " +
      "`__tests__/services/socketio/orchestrator.service.test.ts:896` « outbox FIFO durability »), sans rapport avec un indicateur PAR CONVERSATION " +
      "dans la liste. Jamais construit sur aucune plateforme web, hors périmètre WL-100..108.",
  },
  L10: {
    covered: true,
    reason: 'mood badge vs dot présence conservé ; dots aussi pour les groupes, agrégat `resolveLentillePresenceEntries` (LentilleRow.tsx, LentilleRow.test.tsx).',
  },
  L11: {
    covered: true,
    reason: 'sélection iPad devenue le style de la focus card persistant (isSelected OU élection) — LentilleRow.tsx, LentilleRow.test.tsx, lentille-focus-election.test.tsx.',
  },
  L12: {
    covered: true,
    reason: 'deux chemins de long press (clic droit, appui long 420 ms), LentillePeekView = LentillePeek, sous-menu « Mode de lecture » (LentillePeek.tsx, LentillePeek.test.tsx).',
  },
  L13: {
    covered: false,
    reason:
      "justifié-absent — `liveCall` reste `null` sur TOUTES les plateformes aujourd'hui, pas seulement le web : `hooks/lentille/use-lentille-sections.ts:10` " +
      "(« `liveCall` reste `null` : aucune plateforme ne porte cette donnée ») et `components/conversations/hooks/useConversationSorting.ts:41` (« `liveCall` " +
      "n'existe sur aucune plateforme aujourd'hui »). La donnée arrive par la Rampe gateway (G-123 « `suggestedMode` précalculé », G-124 bascule " +
      "d'injection, plan §5/V5) — hors périmètre WL-100..108 PAR CONSTRUCTION tant que G-123/G-124 n'ont pas livré la source.",
  },
  L14: {
    covered: false,
    reason:
      "justifié-absent — aucun mécanisme de tick indépendant construit dans `LentilleRow` : `time` (`LentilleRow.tsx:229`) est calculé UNE fois par rendu " +
      "(`formatConversationDate`, pas de `setInterval`/`TimelineView`-équivalent) ; re-preuve `grep -n 'setInterval|useEffect' " +
      "apps/web/components/conversations/lentille/LentilleRow.tsx` → aucune horloge. La branche « durée d'appel » est de toute façon sans support " +
      "puisque L13 (liveCall) est structurellement absente aujourd'hui (mêmes citations). Infra temps réel non reprise par ce lot, comme F01 côté Focal.",
  },
  L15: {
    covered: true,
    reason:
      "web n'a PAS de portillon `.equatable()` manuel (contrairement à iOS) : `LentilleRow` est enveloppé `memo(fn)` SANS second argument comparateur " +
      "(`LentilleRow.tsx`, `export const LentilleRow = memo(function LentilleRow(...))`) — React compare donc TOUTES les props par défaut, `bridge` " +
      "inclus, sans qu'aucun code n'ait eu à l'y inscrire explicitement. Structurellement, il n'existe côté web AUCUNE façon d'omettre `bridge` de la " +
      "comparaison : rien à étendre. Prouvé par construction ET par test : `LentilleRow.memo.test.tsx`, « un pont qui apparaît sur UN rang le re-rend, " +
      "seul ».",
  },
  L16: {
    covered: true,
    reason:
      "aria-label « {nom}, {heure}, {n non lus}, {pont ou préview} », RÉELLEMENT produit et éprouvé — V4ter/B1 a corrigé trois mensonges du verdict " +
      "REV-4bis, re-prouvés RED puis GREEN (LentilleRow.test.tsx). (1) Nombre nu émis même à 0 : désormais mention SEULEMENT si `unreadCount > 0`, " +
      "localisée/pluralisée (`resolveUnreadAriaSegment`, `lentille.a11y.unreadOne/Other`, 4 locales) — précédent iOS " +
      "`ThemedConversationRow.swift:290-291`. (2) `typeof previewNode === 'string'` portait sur le FRAGMENT JSX enveloppant (toujours faux, donc l'aria " +
      "retombait TOUJOURS sur `conversation.lastMessage?.content`, l'original, jamais la traduction Prisme) : `formatLastMessage(...)` est désormais " +
      "calculé UNE fois (`lastMessagePreview`) et sa forme texte réutilisée par l'aria (`lastMessagePreviewText`) — témoin de discrimination « traduction " +
      "Prisme disponible ⇒ aria = traduction, JAMAIS l'original ». (3) Le pont n'était jamais annoncé (aria = `lastMessage.content` même sous " +
      "`hasBridge`) : l'aria appelle désormais `resolveLentilleBridgeAriaText` (LentilleBridgeLine.tsx, EXPORTÉE par ce lot — MÊME fonction que le rendu " +
      "visuel, jamais un second chemin) — témoin « pont présent ⇒ aria = libellé du pont, jamais la préview ». « Ignore la perspective décorative » : " +
      "vrai par construction, `perspectiveRef`/`useLentillePerspective` n'écrivent que `opacity`/`transform` sur le WRAPPER interne, jamais sur la racine " +
      "porteuse de `aria-label`. Écart VÉRIFIÉ et assumé, HORS `LentilleRow` : « lit les stickers comme des en-têtes de section » demande l'INVERSE de ce " +
      "que porte `LentilleSticker.tsx` (l'en-tête de section sticky, PAS le rang) — `aria-hidden=\"true\"` explicite, contrat LWS-10 « pilule et stickers " +
      "`aria-hidden` » (`LentilleSticker.tsx:9-12`, re-prouvé 2026-08-17). Sous-trou réel, documenté, pas caché — hors périmètre de ce lot (V4ter/B1 ne " +
      "touche que `LentilleRow`) ; le format aria-label DU RANG (nom/heure/non-lus/pont-ou-préview) est lui intégralement réel et éprouvé.",
  },
  L17: {
    covered: true,
    reason:
      "pull-to-refresh/pagination (sentinelle + `ConversationListLoadMore`) et branches vides (skeleton, recherche vide, première conversation) : " +
      "REV-4/B2, `LentilleConversationListMount.test.tsx`, `useLoadMoreSentinel.test.tsx`, `ConversationList.lentille-mux.test.tsx`. Écart VÉRIFIÉ et " +
      "assumé pour UNE seule des quatre branches vides citées par la matrice : « erreur sync » (`ConversationListEmptyBranch.syncError`) est un concept " +
      "iOS UNIQUEMENT — `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:89-94` (`enum ConversationListEmptyBranch { case skeleton, " +
      "searchNoResults, syncError, createFirstConversation }`). Re-preuve web : `grep -rln 'syncError' apps/web/components apps/web/hooks` → 0 " +
      "occurrence (2026-08-17) ; `EmptyConversations.tsx` ne distingue que « recherche sans résultat » vs « aucune conversation » — le web n'a pas de " +
      "concept de synchronisation qui échoue silencieusement à ce niveau (portée par les stores query, pas par la liste). Cette SEULE sous-branche est " +
      "donc justifiée-absente ; le reste de L17 (pagination, skeleton, deux autres branches vides) reste RÉELLEMENT couvert.",
  },
};

describe('Parité comportementale L01..L17 — web (V4bis/R4-1)', () => {
  const entries = loadLentilleMatrixEntries();
  const tokenIndex = indexBehaviourTokens();

  it('la matrice porte bien 17 entrées L01..L17 (RE-PREUVE, §0)', () => {
    expect(entries).toHaveLength(17);
  });

  it('la classification WEB_COVERAGE couvre EXACTEMENT les 17 ids de la matrice (aucun oubli, aucun id inventé)', () => {
    const matrixIds = entries.map((e) => e.id).sort();
    const classifiedIds = Object.keys(WEB_COVERAGE).sort();
    expect(classifiedIds).toEqual(matrixIds);
  });

  it("le mécanisme de balayage n'est pas aveugle (témoin de discrimination, B5)", () => {
    expect(tokenIndex.size).toBeGreaterThan(0);
    expect(tokenIndex.get('L99')).toBeUndefined();
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
        expect(v.reason.trim().length).toBeGreaterThan(10);
      });
  });

  it('résumé : 12 ids couverts, 5 justifiés-absents (L03/L05/L09/L13/L14) — V4bis/R4-1 solde la réserve REV-4', () => {
    const covered = Object.values(WEB_COVERAGE).filter((v) => v.covered).length;
    const notCovered = Object.values(WEB_COVERAGE).filter((v) => !v.covered).length;
    expect(covered).toBe(12);
    expect(notCovered).toBe(5);
    expect(covered + notCovered).toBe(17);
  });
});
