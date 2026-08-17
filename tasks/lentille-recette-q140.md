# Recette Q-140 — Matrice §5.3/§5 (32 id) rejouée drapeau ON, iOS + web

> Vague V6. Prérequis REV-5 (2 blockers levés le jour même, `b3a8803a`/`0c5adf65`) et
> Porte V2 (REV-4ter) tenus. Référentiel re-prouvé le 2026-08-17 :
> `packages/shared/fixtures/conformance/behaviour-matrix.json` = **32 entrées**
> (17 `list` L01..L17, 15 `thread` F01..F15) — jamais 44 (voir
> `packages/shared/__tests__/vectors/behaviour-matrix.test.ts`, garde d'ensemble armée
> depuis Porte V1, toujours verte).
>
> **Méthode** : chaque id a été rejoué CE JOUR (2026-08-17) — web par `jest` (suites
> réelles exécutées, pas relues de mémoire), iOS par lecture datée + grep du code de
> production ET du fichier XCTest qui le prouve (pas de toolchain Xcode disponible ici ;
> tout ce qui exige un simulateur/device est nommé « re-jouable seulement par le CI »
> dans la colonne iOS). Toute raison de non-couverture antérieure a été RE-GREPÉE
> aujourd'hui, jamais recopiée telle quelle.
>
> **Base** : worktree `feat/v6-q140`, tête `main` = `9a639429` au départ, **rebasé sur
> `origin/main` = `91e8314c`** avant clôture (2 commits d'audit, hors périmètre Lentille/
> Focal, zéro conflit).

---

## 1. Verdict global

| | |
|---|---|
| Web (jest) | **687 suites / 13 386 tests verts** (21 skip pré-existants, non touchés), suite complète |
| Shared (vitest) | **83 suites / 2 168 tests verts** |
| Garde d'ensemble `behaviour-matrix` (déclarés == couverts, toute plateforme) | **verte** |
| `scripts/check-law-literals.sh` | **vert** |
| iOS | pas de toolchain — 32/32 id référencés par un test XCTest RÉEL (re-preuve de présence + cohérence faite ligne par ligne ci-dessous) ; exécution réelle **re-jouable seulement par le CI** |
| Reclassements opérés | 3 web (F04/F05/F07 : `false`→`true`), 1 raison web corrigée sans changer le verdict (F06 — chip 🌐 déjà réel, texte périmé), 3 raisons web durcies/actualisées sans changer le verdict (F10/F11/F15), 7 raisons Focal web durcies en grep 0-hit re-jouable (R5-9) |
| **Trous bloquants neufs découverts** | **1** — L16 iOS, volet contenu de l'aria (voir §4) |
| Trous connus, non bloquants, à tâcher | L13 (les 2 OS), L14 web, F10/F11/F15 web (hors périmètre WF-110..113 déjà tracé) |

Aucun composant de production n'a été modifié par Q-140 : seuls
`apps/web/__tests__/focal/behaviour-matrix-parity.test.ts` et
`apps/web/components/conversations/focal/__tests__/FocalRow.parity.test.tsx` (jetons +
durcissement) ont été édités.

---

## 2. Table des 32 id — iOS × web × verdict

Légende verdict : **≡** parité tenue · **écart justifié** divergence documentée et
acceptée (raison typée re-prouvée, non bloquante) · **TROU** absence non prouvée
comme acceptable, à combler avant activation.

### Surface `list` — L01..L17 (vol. 5 §5.3)

| id | Comportement (résumé) | iOS | Web | Verdict |
|---|---|---|---|---|
| L01 | Typing multi-membres + dot présence forcé vert | ✅ `LentilleRowBehaviourAnchorTests.test_L01_typingDots_restAtTheHighPhase_underReduceMotion` + `test_L01_presenceDot_isForcedOnline_whenTyping` (sélection déterministe : `ConversationListViewModelTests`) | ✅ `LentilleRow.tsx`/`LentilleRow.test.tsx` | ≡ |
| L02 | Précédence ligne 2 : typing > brouillon > pont > preview | ✅ `LentilleFlatRowTests` (`Line2Kind.resolve` × 4 témoins) | ✅ `LentilleRow.tsx`, R4-3 soldée (label brouillon en erreur, contenu tertiaire) | ≡ |
| L03 | Glyphes SF des kinds (expired/hidden/viewOnce/ephemeral) | ✅ `LentilleRowBehaviourAnchorTests.test_L03_previewKindGlyphs_areRestoredToTheFlatRow` (FERMÉ V3ter) | ❌ **hors-périmètre-du-lot**, re-preuve 2026-08-17 : `grep -rn 'viewOnce\|ephemeral\|expired\|hidden' apps/web/components/conversations/{conversation-item,lentille}/*.tsx` → 0 logique de glyphe de kind (webL_COVERAGE.L03) | écart justifié (jamais demandé à WL-100..108) |
| L04 | Pièce jointe sans texte : icône+méta+« +N », Prisme exclu | ✅ `LentilleRowBehaviourAnchorTests.test_L04_attachmentOnlyBranch_rendersIconMetaPlusN_neverThroughThePrisme` | ✅ `message-formatting.tsx:198-228` (partagé, non modifié) + `LentilleRow.test.tsx` | ≡ |
| L05 | Fallback localisation (mappin + nom du lieu) | ✅ `LentilleRowBehaviourAnchorTests.test_L05_locationFallbackBranch_rendersMappinAndPlaceName` | ❌ **absent-structurel** — `lastMessageLocation` n'existe PAS dans le modèle `Conversation` web, re-preuve `grep -rn lastMessageLocation packages/shared apps/web` → 0 hit (2026-08-17) | écart justifié (donnée absente du modèle, pas un oubli d'UI) |
| L06 | Badge 99+ retiré → point accent 8px + pont ✦, heure tertiaire | ✅ `LentilleRowBehaviourAnchorTests.test_L06_timestampColor_isTertiary_neverErrorOnUnread` (FERMÉ V3ter) + `LentilleFlatRowTests` (badge retiré) | ✅ `LentilleRow.tsx`/test ; enrichi le jour même par `512e630c` (ligne 2 grasse si non-lu, pont grisé en sourdine) | ≡ |
| L07 | Swipes intacts + glyphe 📌 + sourdine visible (rang 0.55 + 🔕) | ✅ `LentilleRowBehaviourAnchorTests.test_L07_pinnedGlyph_isPresentInTheRow` (FERMÉ V3ter) + `LentilleRowSourceGuardTests` (sourdine) + `SectionDropTargetTests` (section épingle) | ✅ actions (`LentillePeek.actions.test.tsx`) + visuel pin/mute (`LentilleRow.test.tsx`, comblé V4bis/R4-1) | ≡ |
| L08 | Badge type absorbé par focus card + tags ≤3 pastilles | ✅ `LentilleRowBehaviourAnchorTests.test_L08_typeBadgeAndMemberCount_areAbsorbedByTheFocusCard` (FERMÉ V3ter) + `test_L08_tagPastilles_...` | ✅ `LentilleFocusCard.test.tsx` (badge type) + `LentilleRow.line1-grammar.test.tsx` (tags, R4-2 soldée) | ≡ |
| L09 | Glyphe `hasPendingSync` (outbox) conservé, accent 70% | ✅ `LentilleRowBehaviourAnchorTests.test_L09_hasPendingSyncGlyph_isConserved_accentSeventyPercent` (jamais testé avant cet audit, réel) | ❌ **absent-structurel** — `hasPendingSync` n'existe pas sur `Conversation` web, re-preuve `grep -rn hasPendingSync packages/shared apps/web` → 0 hit (2026-08-17), seule une notion d'outbox de MESSAGES existe | écart justifié |
| L10 | Mood vs dot présence (1 coin, mood gagne) + dots pour groupes | ✅ `LentilleRowBehaviourAnchorTests.test_L10_presenceDot_isShownForGroupsToo` (FERMÉ V3ter) + `test_L10_moodAndPresence_...` | ✅ `LentilleRow.tsx` (`resolveLentillePresenceEntries`) | ≡ |
| L11 | Sélection iPad → style focus card persistant (barre 3pt) | ✅ `LentilleRowBehaviourAnchorTests.test_L11_selectedRow_rendersThreePointAccentSidebar_notABackground` | ✅ `LentilleRow.tsx`/test | ≡ |
| L12 | 2 chemins long-press → `LentillePeekView` + sous-menu « Mode de lecture » | ✅ `PeekViewModelTests` (chemin < iOS 26 ET chemin natif iOS 26+, I-067ter comblé) | ✅ `LentillePeek.tsx`/test | ≡ |
| L13 | Appel en cours (Scène) : point pulsant + « n voix·durée » + Rejoindre | ⚠️ **source-amont-attendue** — rang PRÊT (`LentilleRowBehaviourAnchorTests.test_L13_liveCallBanner_isConsumedByTheRow`), mais AUCUN site de production ne l'alimente : `ConversationListView.swift:1214` passe `liveCall: nil`, `LocalLiveCallProvider` (existe, `LentilleProviders.swift:260`) n'est appelé par AUCUN fichier de production — re-preuve 2026-08-17. **La prémisse « G-123 a livré le payload » est FAUSSE** : G-123 (`f4efb893`) livre `bridge`/`suggestedMode` (mode de lecture), sujet disjoint de `liveCall`/Scène — confirmé par `ae9e011d` (commit du jour même) qui re-cite L13 comme structurellement `null` sur toute plateforme | ❌ **source-amont-attendue** — `liveCall` reste `null`, re-confirmé par `use-lentille-sections.ts:10` et `useConversationSorting.ts:41`, tous deux cités par le commit `ae9e011d` du jour même | écart connu, **accepté** (documenté « écart restant, assumé » depuis V3ter) — symétrique, non bloquant Q-140, tâche de câblage à ouvrir séparément |
| L14 | Timestamp ticker 60s hors gate Equatable, sert aussi durée d'appel | ✅ `LentilleRowBehaviourAnchorTests.test_L14_timestampTicker_livesOutsideTheEquatableGate` (`TimelineView(.periodic(…, by: 60))`) | ❌ **absent-structurel**, re-preuve 2026-08-17 : `grep -n 'setInterval\|useEffect\|TimelineView' LentilleRow.tsx` → aucune horloge, `time` calculé UNE fois par rendu (`formatConversationDate`) | **ÉCART RÉEL, asymétrique** — iOS vivant, web statique jusqu'au prochain re-render (message reçu, etc.) ; non bloquant immédiatement (dégradation cosmétique : l'heure relative peut devenir périmée entre deux re-renders web) mais **recommandé en tâche de suivi** |
| L15 | `renderFingerprint` étendu (bridge) — portillon ne gèle pas le pont | ✅ `BridgeFingerprintTests` (5+ témoins discriminants, apparition/texte/traduction/unreadCount/suggestedMode) | ✅ `LentilleRow` = `memo(fn)` SANS comparateur — structurellement rien à omettre, testé (`LentilleRow.memo.test.tsx`) | ≡ |
| L16 | aria-label étendu (nom, heure, non-lus, pont/preview) + stickers lus comme en-têtes | ⚠️ **TROU réel, neuf** (voir §4) — volet structurel ✅ (`StickySectionStructureTests`), volet CONTENU (aria doit annoncer le pont) ❌ : `LentilleConversationRow.accessibilityLabel` réutilise VERBATIM `ThemedConversationRow.conversationAccessibilityLabel`, qui ne référence JAMAIS `bridge`/`pont` — re-preuve 2026-08-17 (grep `bridge` dans les deux fichiers → 0 hit à proximité de l'aria) | ✅ V4ter/B1 : aria annonce nom/heure/non-lus PLURALISÉ/pont-ou-préview réellement (3 mensonges REV-4bis corrigés, `LentilleRow.test.tsx`) ; écart ASSUMÉ documenté (R5-3) sur « stickers lus comme en-têtes » : `LentilleSticker.tsx` porte `aria-hidden="true"` explicite (LWS-10), l'inverse littéral de la ligne de matrice | **TROU iOS** (contenu aria, neuf, non tracé avant Q-140) à combler avant activation — web déjà couvert avec écart connu (R5-3) |
| L17 | Pull-to-refresh + pagination + branches vides inchangés, restylés plats | ✅ `LentilleRowBehaviourAnchorTests.test_L17_emptyBranchResolver_stillHasExactlyItsFourOriginalCases` + `test_L17_allFourEmptyBranches_areRestyledUnderTheLentilleFlag` (FERMÉ V3ter) | ✅ pagination/skeleton (`LentilleConversationListMount.test.tsx`, `useLoadMoreSentinel.test.tsx`) ; 1 branche (« erreur sync ») **absent-structurel** — concept iOS uniquement (`ConversationListEmptyBranch.syncError`), re-preuve `grep -rln syncError apps/web/components apps/web/hooks` → 0 hit | ≡ (exception mineure documentée, concept iOS-only) |

### Surface `thread` — F01..F15 (vol. 4 §5)

| id | Comportement (résumé) | iOS | Web | Verdict |
|---|---|---|---|---|
| F01 | Message entrant live : insertion + focus suit / pilule s'incrémente | ✅ `FocalRealtimeMatrixTests.test_F01_newlyArrivedRowAtFocusLine_isElectedImmediately` + `test_F01_insertionMechanicsAreInheritedNotFocalOwned` | ❌ **hors-périmètre-du-lot** — re-preuve 2026-08-17 (`R5-9`, grep `diffable\|Snapshot\|newMessagesPill` sur `FocalRow.tsx`/`FocalThread.tsx` → 0 hit) ; élection démarre en prod depuis REV-4ter/B1 mais AUCUN test ne prouve qu'elle suit un message tout juste inséré | écart non-bloquant, à tester dans un lot futur |
| F02 | Typing indicator plat, exclu de la perspective | ✅ `FocalRealtimeMatrixTests.test_F02_typingIndicatorIsNotReimplementedInFocalRow` | ❌ **hors-périmètre-du-lot** — aucune cellule typing dans `FocalThread.tsx`, re-preuve grep 0-hit (R5-9) | écart justifié (aucune cellule typing web en mode Focal, y compris héritée) |
| F03 | Dot de présence sur la pastille 22 de l'identité | ✅ `FocalRealtimeMatrixTests.test_F03_presenceStateIsPropagatedNotReinterpreted` | ✅ `FocalIdentityHeader.test.tsx` (WL-102) | ≡ |
| F04 | Accusés ✓/✓✓/lu déplacés dans l'identité « Toi » | ✅ `FocalRealtimeMatrixTests.test_F04_deliveryCheckLivesInIdentityHeader_notInTheFooterRow` | ✅ **RECLASSÉ Q-140** (était `false`) — `focal-parity` (`da167d4a`) monte `DeliveryIndicator` réutilisé DANS `focal-identity-header` ; testé, jeton posé `FocalRow.parity.test.tsx` | ≡ |
| F05 | Réactions live → pilule plate méta (11pt, tokens) | ✅ `FocalRealtimeMatrixTests.test_F05_reactionsAreRenderedSomewhereInFocalRow` — pilule 11pt RÉELLE (F-083ter, `BubbleReactionsOverlay` réutilisé déjà au bon format) | ⚠️ **RECLASSÉ Q-140** (était `false`) — données réelles (`MessageReactions` réutilisé, jeton posé) MAIS habillage NON restylé (garde le chip « bulle » — fond blanc/gris, ombre, anneau — pas les jetons `--lentille-thread-*`/`backgroundSecondary`/`inputBorder` de la matrice) | écart partiel (donnée ≡, habillage diverge — non bloquant) |
| F06 | Résolution Prisme inchangée + chip 🌐 swap traduction tardive | ✅ `FocalRealtimeMatrixTests.test_F06_translatedTextSwapsInPlace_prismeUnchanged` + `test_F06_globeChipSignalsTranslation_inFocalRow` (F-083ter) | ✅ (raison corrigée Q-140 — texte périmé affirmait le chip absent) `focal-row-utils.test.ts` (swap) + `FocalMetaRow.tsx`/`FocalRow.parity.test.tsx` (chip 🌐 réel, `focal-translated`, posé par `da167d4a`) ; seul le mot « animé » restait inexact (transition instantanée) | ≡ |
| F07 | Audio nu (waveform, pistes) + transcription traduite | ✅ `FocalRealtimeMatrixTests.test_F07_mixedThreeTrackAudio_isNeverCarousel` (routage complet couvert par `FocalAudioRoutingTests`, 8 témoins) | ✅ **RECLASSÉ Q-140** (était `false`) — `MessageAttachments` réutilisé (MÊME lecteur/waveform/transcription que la vue Bulles), posé nu (`FocalMediaBlock.tsx`) ; jeton posé | ≡ |
| F08 | Grilles médias 1/2/3/4+ nues, radius 16 | ✅ `FocalRealtimeMatrixTests.test_F08_gridCellRadius_comesFromTheToken_neverALiteral` (géométrie exhaustive : `FocalMediaGridLayoutTests`) | ✅ `FocalMediaBlock.test.tsx` — radius par token ; géométrie EXACTE des slots 1/2/3/4+ non reproduite (documenté, grille CSS simple `grid-cols-2`) | écart de cote mineur documenté, non bloquant |
| F09 | Citation : filet 2.5 + ligne tronquée + tap-jump | ✅ `FocalRealtimeMatrixTests.test_F09_quotedReplyTap_triggersOnReplyTap_...` (rendu exhaustif : `FocalDynamicTypeTests`) | ✅ `FocalQuotedReply.test.tsx` | ≡ |
| F10 | Long-press menu + « modifié » méta + rangée fantôme supprimée | ✅ **INTÉGRALEMENT réel** (F-083ter) — `FocalRealtimeMatrixTests.test_F10_deletedMessage_isAGhostRowWithoutBackground` (`FocalDeletedRow`) + `test_F10_editedLabel_isVisibleSomewhereInFocalRow` (`BubbleEditedIndicator`) ; menu long-press = menu contextuel existant, hérité | ❌ **hors-périmètre-du-lot, durci R5-9** — SEULE la clause « modifié » est réelle (`focal-edited`, testé) ; menu contextuel ET rangée fantôme supprimée ABSENTS, re-preuve grep 0-hit `contextMenu\|onLongPress\|isDeleted` sur `FocalRow.tsx`/`FocalThread.tsx`/`FocalMetaRow.tsx` | **ÉCART réel iOS>web** (2 clauses sur 3 manquantes côté web), déjà hors périmètre WF-110..113 tracé, non bloquant Q-140 — à faire |
| F11 | Badges éphémère/épinglé/transféré au-dessus de l'identité + flou contenu | ✅ **INTÉGRALEMENT réel** (F-083ter) — `FocalRealtimeMatrixTests.test_F11_blurAppliesToTheMediaBlock_neverToIdentityOrText` + `test_F11_pinnedForwardedEphemeralBadges_appearAboveIdentityInFocalRow` (`BubblePinnedIndicator`/`BubbleForwardedIndicator`/`FocalEphemeralBadge`, AU-DESSUS de l'identité) | ❌ **hors-périmètre-du-lot, durci R5-9** — SEUL « transféré » est réel (`focal-forwarded`, testé), ET **mal placé** : `FocalMetaRow` (sous le contenu), pas au-dessus de l'identité comme l'exige la matrice ; épinglé/vue-unique/éphémère ABSENTS, re-preuve grep 0-hit `isPinned\|isViewOnce\|ephemeral` | **ÉCART réel iOS>web** (3 badges sur 4 manquants + position inversée côté web), non bloquant Q-140 — à faire |
| F12 | Bannière épinglée inchangée + recherche saute à la bande de focus | ✅ `FocalRealtimeMatrixTests.test_F12_searchAndQuoteJump_shareTheSameLandingMechanism` (`landOnFocusBand` partagé, prouvé par `FocalHostSourceGuardTests`) | ❌ **hors-périmètre-du-lot, durci R5-9** — aucun mécanisme d'atterrissage recherche→bande de focus côté web, re-preuve grep 0-hit `landOnFocusBand\|scrollToMessageFast` ; bannière elle-même inchangée des DEUX côtés (hors du mux Focal) | écart non-bloquant, tracé depuis WF-112 |
| F13 | Rangée optimiste alpha = min(0.7, alphaPerspective) | ✅ `FocalRealtimeMatrixTests.test_F13_confirmedRow_ceilingNeverRestrictsBelowTheCurve` (exhaustif : `FocalScrollPassGeometryTests`) | ✅ `use-focal-perspective.test.ts` (`setAlphaCeiling`) | ≡ |
| F14 | Chargement haut préserve offset + inset tête si 1ère page atteinte | ✅ `FocalRealtimeMatrixTests.test_F14_headInsetIsGovernedByHasReachedOldest_theNameF14Expects` (exhaustif : `FocalHostInsetCompositionTests`) | ❌ **absent-structurel, durci R5-9** — DOM web PAS inversé (ordre naturel, re-preuve `ConversationMessages.tsx`), `headInset` répond à un besoin PUREMENT iOS (`UICollectionView` inversée) ; re-preuve grep 0-hit `headInset\|hasReachedOldest` | écart JUSTIFIÉ par construction — jamais un trou (différence de plateforme légitime, pas un manque) |
| F15 | Effets bitfield + mentions/hashtags tokens + notices plates centrées | ✅ **INTÉGRALEMENT réel** (F-083ter) — `FocalRealtimeMatrixTests.test_F15_mentionsAndHashtags_useTheExistingColorTokens` + `test_F15_systemAndCallNotices_areFlatWithoutCapsule` + `test_F15_effectsBitfield_isAppliedSomewhereInFocalRow` (`.messageEffects(input.effects)`) | ❌ **hors-périmètre-du-lot, durci R5-9** — mentions RÉELLES (`mentionsToLinks`, testé) + notices d'appel RÉELLES (`CallSystemMessage` réutilisé, testé) MAIS sans garantie « sans capsule » vérifiée côté web ; hashtags NON vérifiés ; effets bitfield ABSENTS, re-preuve grep 0-hit `\.effects\b\|messageEffects` sur `FocalRow.tsx` | **ÉCART réel iOS>web** (clause d'ouverture — effets — entièrement absente côté web, pas iOS), non bloquant Q-140 — à faire |

---

## 3. Reclassements opérés (avant → après, avec preuve)

Tous dans `apps/web/__tests__/focal/behaviour-matrix-parity.test.ts` et
`apps/web/components/conversations/focal/__tests__/FocalRow.parity.test.tsx` — le
fichier Lentille (`__tests__/lentille/behaviour-matrix-parity.test.ts`) n'a pas eu
besoin de reclassement : sa dernière écriture (`5d7ae39e`) est postérieure aux
correctifs L02/L07/L08/L16 qu'elle documente déjà correctement ; les commits du jour
qui l'ont suivie (`512e630c` ligne 2, `ae9e011d` rail des vivants, `7a21494e` avatar→
profil) n'ajoutent que du détail à des id déjà `covered: true`, re-vérifié sans écart.

| id | Avant | Après | Preuve |
|---|---|---|---|
| F04 | `false` — « non demandés par WF-110..113 » | `true` | `DeliveryIndicator` monté dans `FocalIdentityHeader` (`da167d4a`), testé « un message de MOI porte l'indicateur … DANS l'identité », jeton `behaviour-matrix:F04` posé |
| F05 | `false` — « non demandées » | `true` (partiel documenté) | `MessageReactions` monté en méta (`da167d4a`), testé « les réactions posées sont visibles », jeton posé ; écart d'habillage documenté dans la raison |
| F07 | `false` — « non demandé » | `true` | `MessageAttachments` route désormais vocal/vidéo/PDF (`da167d4a`), testé sur les 3 types + mixte, jeton posé |
| F06 | `true` (inchangé) | `true` (raison corrigée) | La raison affirmait « chip 🌐 non construit » — FAUX depuis `da167d4a` (`focal-translated`, `FocalMetaRow.tsx:140-145`, testé) ; texte corrigé, verdict inchangé |
| F10 | `false` — « non demandés par WF-110..113 » | `false` (raison actualisée + durcie R5-9) | « modifié » est désormais réel (`da167d4a`) — noté explicitement ; menu + rangée fantôme confirmés absents par grep 0-hit re-jouable |
| F11 | `false` — « non demandés » | `false` (raison actualisée + durcie R5-9) | « transféré » réel mais mal placé — noté explicitement ; 3 badges sur 4 confirmés absents par grep 0-hit re-jouable |
| F15 | `false` — « non demandés » | `false` (raison actualisée + durcie R5-9) | Mentions + notices d'appel réels — notés explicitement ; clause d'ouverture (effets) confirmée absente par grep 0-hit re-jouable |

**Comptage** : 5 couverts / 10 non couverts (avant Q-140) → **8 couverts / 7 non
couverts** (après Q-140), test `résumé Q-140 (2026-08-17)` mis à jour en conséquence.

**Durcissement R5-9** (raisons Focal sous le standard de preuve) : les 7 id restants
non couverts portent désormais chacun une entrée `TYPED_ABSENCES` — type
(`absent-structurel`/`source-amont-attendue`/`hors-périmètre-du-lot`), date, porteur, et
un **grep 0-hit borné aux fichiers exacts**, rejoué par le test lui-même
(`it.each`, patron `EXCLUDED_DEAD_FAMILIES` de
`packages/shared/__tests__/ci/lentille-tokens-consumption-gate.test.ts`) — une raison
qui cesserait de tenir ferait échouer la build, pas seulement vieillir en commentaire.

---

## 4. Trou bloquant — L16 iOS, volet contenu de l'aria (découverte Q-140)

**Ce qui était supposé fermé.** Porte V1 déclare « garde d'ensemble matrice ARMÉE,
32/32 id déclarés == couverts » et la ligne V3 cite L16 parmi les 8 trous fermés par
V3ter. Le token `behaviour-matrix:L16` existe bien côté iOS —
mais **seulement pour le volet structurel** (`StickySectionStructureTests`, « le sticker
occupe le slot `header:` d'une `Section` »).

**Ce que la matrice exige en plus** : « Le label VoiceOver est étendu à
« {nom}, {heure}, {n} non lus, {pont ou preview} » ». Re-preuve du 2026-08-17 :

```
LentilleConversationRow.swift:155-158
  private var accessibilityLabel: String {
      ThemedConversationRow(conversation: conversation, preferredContentLanguages: …)
          .conversationAccessibilityLabel
  }
```

`ThemedConversationRow.conversationAccessibilityLabel`
(`ThemedConversationRow.swift:259-299`) compose nom, preview/expired/hidden/viewOnce/
localisation, heure relative, non-lus, sourdine, épingle, pending-sync — **jamais**
`bridge`/pont. `grep -n bridge apps/ios/.../LentilleConversationRow.swift` place bien
`showsBridge`/`Line2Kind.bridge` (rendu VISUEL), mais aucune occurrence à proximité de
`accessibilityLabel`. **Aucun test XCTest ne couvre ce volet** — ni positif (l'aria
annonce le pont) ni négatif (documentant l'absence comme acceptée).

**Conséquence produit** : sur iOS, quand un rang affiche le pont ✦ (résumé de
conversation généré, `unreadCount > 0 ∧ bridge != nil`), VoiceOver continue d'annoncer
l'ancien `lastMessage` traduit — jamais le texte du pont — alors que web (V4ter/B1) l'a
précisément corrigé pour la même raison (« … deux mensonges du verdict REV-4bis »).
C'est **l'écart symétrique inverse** de ce que REV-4bis avait détecté côté web.

**Ce que Q-140 fait, et ne fait pas.** Conformément au mandat (« Q-140 CONSTATE »),
aucune ligne de production n'est éditée ici. Ce trou est **NOMMÉ** comme trou bloquant
pour l'activation (l'a11y VoiceOver de la Lentille sur iOS est un critère du contrat,
pas une réserve produit optionnelle) et **à porter en tâche** (`Q-14x` à assigner par
Fable) : étendre `LentilleConversationRow.accessibilityLabel` pour lire `bridge` quand
`showsBridge` est vrai — MÊME logique que web (`resolveLentilleBridgeAriaText`, déjà
écrite et testée côté TS, portable en Swift), et poser le témoin XCTest RED d'abord
(la voie que documente déjà `LentilleRowBehaviourAnchorTests` pour tous les trous qu'il
a fermés).

---

## 5. Trous connus, non bloquants — récapitulatif

| id | Nature | Statut |
|---|---|---|
| L13 (Scène/appel) | Symétrique — les deux OS attendent une source amont (câblage `ConversationLiveCallProviding`/`liveCall`) | Connu et accepté depuis V3ter (« écart restant, documenté et assumé ») ; **prémisse de la mission (« G-123 a livré le payload ») réfutée** par re-preuve — G-123 concerne le pont/`suggestedMode`, sujet disjoint. Tâche de câblage à ouvrir séparément, hors Q-140 |
| L14 (ticker web) | Asymétrique — iOS vivant (60s), web statique | Dégradation cosmétique, pas fonctionnelle ; recommandé en tâche de suivi |
| F01, F02, F12 | Web hors périmètre WF-110..113 (infra temps réel/typing/recherche non reprise par le lot) | Déjà tracé depuis V4 ; non bloquant |
| F10, F11, F15 (web) | Partiellement comblés par `focal-parity` (`da167d4a`) mais clause principale de chacun reste absente côté web (menu+suppression, badges positionnés, effets bitfield) | Déjà hors périmètre WF-110..113 tracé ; asymétrie iOS>web à résorber dans une vague future, non bloquant Q-140 |
| F14 (web) | Différence de plateforme légitime (DOM non inversé) | JAMAIS un trou — accepté par construction |
| L03, L05, L09 (web) | Web hors périmètre / donnée absente du modèle | Déjà tracé, accepté |
| L16 (web, stickers-en-en-tête) | Écart assumé (`aria-hidden` volontaire, LWS-10) | Déjà tracé (R5-3), accepté |

---

## 6. Ce que Q-140 n'a PAS fait (mandat « constate, n'implémente pas »)

- Aucun correctif de `LentilleConversationRow.accessibilityLabel` (L16 iOS) — nommé en
  tâche, non exécuté ici.
- Aucun câblage `liveCall`/`ConversationLiveCallProviding` (L13) — nommé en tâche.
- Aucun ajout de ticker web (L14) — nommé en tâche.
- Aucune extension des surfaces F10/F11/F15 web (menu long-press, badges, effets) —
  déjà hors périmètre du plan produit qui a livré WF-110..113 ; non improvisé ici.

---

## 7. Suites rejouées (preuves d'exécution)

```
apps/web$ npx jest __tests__/lentille/behaviour-matrix-parity.test.ts \
                    __tests__/focal/behaviour-matrix-parity.test.ts \
                    components/conversations/focal/__tests__/FocalRow.parity.test.tsx
PASS __tests__/lentille/behaviour-matrix-parity.test.ts
PASS __tests__/focal/behaviour-matrix-parity.test.ts
PASS components/conversations/focal/__tests__/FocalRow.parity.test.tsx
Test Suites: 3 passed, 3 total · Tests: 60 passed, 60 total

apps/web$ npx jest
Test Suites: 687 passed, 687 total
Tests:       21 skipped, 13386 passed, 13407 total

packages/shared$ npx vitest run
Test Files  83 passed (83)
     Tests  2168 passed (2168)

packages/shared$ npx vitest run __tests__/vectors/behaviour-matrix.test.ts
Test Files  1 passed (1) · Tests  15 passed (15)

$ bash scripts/check-law-literals.sh
✓ No law literals found in skin files
```

iOS : pas de toolchain dans cet environnement — chaque témoin XCTest cité ci-dessus a
été lu intégralement et confronté au code de production qu'il prétend garder
(présence + cohérence re-prouvées, 2026-08-17). L'exécution réelle (build + run de la
suite `MeeshyTests`) reste **re-jouable seulement par le CI**.

---

## 8. Fichiers touchés par Q-140

- `apps/web/__tests__/focal/behaviour-matrix-parity.test.ts` — reclassements F04/F05/F07,
  raison F06 corrigée, raisons F10/F11/F15 actualisées, durcissement R5-9
  (`TYPED_ABSENCES`, 7 grep 0-hit re-jouables), résumé mis à jour.
- `apps/web/components/conversations/focal/__tests__/FocalRow.parity.test.tsx` — jetons
  `behaviour-matrix:F04`/`F05`/`F07` posés au plus près des témoins réels, notes de
  traçabilité Q-140 sur F10/F11/F15 (pas de jeton, verdict inchangé).
- `tasks/lentille-recette-q140.md` — ce rapport.

Aucun fichier de production (`apps/web/components/**` hors `__tests__/`,
`apps/ios/Meeshy/**`, `packages/shared/**` hors fixtures déjà existantes) n'a été
modifié.
