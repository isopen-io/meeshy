# Plan — Iteration 53i (2026-06-30)

## Objectif
Adopter le Liquid Glass natif iOS 26 sur la **capsule flottante du quick-reaction picker**
(`EmojiReactionPicker`, SDK `MeeshyUI`), en préservant le rendu actuel pré-iOS-26. Lot 3 de
la série Glass (51i → 52i → 53i). Borné, épuré, sans changement de comportement.

## Base de départ
- Branche : `claude/upbeat-euler-b625oe`, créée depuis `main` HEAD (resync au début).
- 52i (`MentionSuggestionPanel` + `MiniAudioPlayerBar`, commit `f777a95`) déjà mergé dans
  `main` mais son doc d'analyse/plan n'avait pas été committé et le tracking n'avait pas été
  mis à jour → corrigé dans cette itération (entrées History + Current State).

## Étapes
1. [x] Resync sur `main`, vérifier l'état réel du code (52i mergé : Mention/MiniAudio ont
       déjà `adaptiveGlass`).
2. [x] Identifier la cible propre restante : `EmojiReactionPicker.stripBackground`.
3. [x] Vérifier les 4 call-sites du picker (inline strip, overlay, story, attachment) et la
       sémantique du paramètre `style`.
4. [x] Refactor `EmojiReactionPicker.swift` :
       - `quickEmojiStrip` + `scrollableQuickEmojiStrip` : `.background(stripBackground)` →
         `.modifier(QuickReactionStripChrome(style:))`.
       - Nouveau `private struct QuickReactionStripChrome: ViewModifier` :
         iOS 26 → `.adaptiveGlass(in: Capsule())` neutre + ombre `style`-driven ;
         pré-26 → matériau/voile/liseré/ombre identiques à l'actuel (zéro régression).
       - Supprimer le computed `stripBackground` mort.
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit, push `-u origin claude/upbeat-euler-b625oe`.
7. [ ] Ouvrir PR, attendre CI `iOS Tests` verte.
8. [ ] Merger dans `main`, mettre à jour `branch-tracking.md`, supprimer la branche.

## Hors scope (différé volontaire)
- `EmojiFullPickerSheet.sheetBackground`, `EmojiKeyboardPanel` : surfaces de contenu, pas
  des chromes flottants (verre derrière scroll = anti-lisibilité HIG). Laissés en matériau.
- Wrapper `BubbleStandardLayout+Media` (réactions pièce jointe) : call-site, hors capsule.

## Vérification
- Pas de build SwiftUI local (Linux) → la CI `ios-tests.yml` (compile Xcode 26.1 + tests
  simu 18.2) est le gate. Le smoke test `CompatibilityLayerTests.test_adaptiveGlass_*` reste
  vert (API atome inchangée). Aucun test n'assied le rendu du strip ; comportement (onReact,
  haptique, entrée wave) inchangé.

## Risques
- `style` forcé `.dark` pré-26 sur fond clair système : couvert par le gate local (fallback
  conserve le matériau `style`-driven). iOS 26 : verre échantillonne le contenu → OK partout.
iOS only. **Accessibilité Dynamic Type** : migrer les `.font(.system(size:))` figés de
`GlobalSearchView` (surface de recherche primaire, jamais traitée) vers l'atome
`MeeshyFont.relative(...)` pour que le texte scale avec le réglage Dynamic Type.
Itération bornée, « épurée » : 1 fichier, swaps mécaniques 1:1, aucune surcharge ajoutée.

## Base
- Branche : `claude/upbeat-euler-891xaa` (resynchronisée sur `main` HEAD `6a2a8f6`, post #1075 / iter 52i).

## Changements

### `apps/ios/.../Views/GlobalSearchView.swift` (app)
- [x] 31 × `.font(.system(size: N, weight:))` → `.font(MeeshyFont.relative(N, weight:))`
      (header, onglets, états, lignes messages/conversations/utilisateurs, run surligné
      `AttributedString`, `ConversationTitleLabel(font:)`, libellés `lastMessage` *italic*).
- [x] 2 badges numériques laissés figés avec commentaire d'exception inline (badge onglet
      `size:9` à offset absolu ; badge non-lus `size:11` capsule compacte).

## Vérification
- [x] Le fichier importe déjà `MeeshyUI` (où vit `MeeshyFont.relative`).
- [x] Aucun label/hint a11y modifié (migration police uniquement).
- [x] Aucune édition `project.pbxproj` (XcodeGen globbe les `.swift`).
- [x] Grep de clôture : 2 `.font(.system(size:))` restants = les 2 badges documentés.
iOS only. **Adoption native iOS 26 Liquid Glass — lot 3** sur les **3 surfaces flottantes
sœurs de la couche `CallEffectsOverlay`** (effets pendant un appel), via l'atome SDK
`adaptiveGlass`. Itération bornée, « épurée » : 3 swaps 1:1 fidèles, aucune surcharge.

## Base
- Branche : `claude/upbeat-euler-8qmu0h` (resynchronisée sur `main` HEAD `a11d271`, post #1076/#1079).

## Changements

### 1. `apps/ios/.../Views/AudioEffectsPanel.swift` (app)
- [x] `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg))`
      avant le `.clipShape(...)` existant. Neutre (chrome OS). Doc-comment inline.

### 2. `apps/ios/.../Views/VideoFiltersPanel.swift` (app)
- [x] Idem panneau parent. **`VideoFilterControlView` imbriqué laissé en `.ultraThinMaterial`**
      (matériau-sur-verre HIG ; jamais verre-dans-verre). Doc-comment inline.

### 3. `apps/ios/.../Views/CallEffectsOverlay.swift` (app — `secondaryToolbar`)
- [x] `.background(.ultraThinMaterial)` → `.adaptiveGlass(in: Capsule())` avant le
      `.clipShape(Capsule())` existant (1:1 `FloatingCallPillView`/`MiniAudioPlayerBar`).
      Doc-comment inline.

## Vérification
- [x] Les 3 fichiers importent déjà `MeeshyUI` (où vit `adaptiveGlass`).
- [x] Aucune édition `project.pbxproj` (XcodeGen globbe les `.swift`).
- [x] `VideoFilterControlView` n'est utilisé qu'au sein de `VideoFiltersPanel` (grep) →
      pas de régression de migration partielle.
- [x] 0 `ultraThinMaterial` résiduel hors commentaires dans les 3 fichiers.
- [ ] CI `ios-tests.yml` verte (compile + tests simulateur).
iOS only. **Adoption native iOS 26 Liquid Glass — lot 3** + **a11y** ciblé sur
`StatusBubbleOverlay` (dernier overlay flottant content-agnostic propre). Itération
bornée, « épurée » : 1 fichier, 2 changements orthogonaux, aucune surcharge ajoutée.

## Base
- Branche : `claude/upbeat-euler-esd2le` (resynchronisée sur `main` HEAD `43f2c24`, post #1076 = 52i).

## Changements

### `apps/ios/.../Components/StatusBubbleOverlay.swift` (app)
- [x] Bulle principale : `.background(RoundedRectangle.fill(.ultraThinMaterial).overlay(stroke).shadow)`
      → `.adaptiveGlass(in: RoundedRectangle(cornerRadius: 14, style: .continuous))`
      **+** `.overlay(stroke dégradé accent)` **+** `.shadow(...)` conservés en surcouche.
- [x] Doc-comment inline (HIG, glass + stroke superposé, pas de glass-sur-glass).
- [x] a11y : `accessibilityLabel` dynamique localisé sur le bouton play/stop audio
      (`status.bubble.audio.play` / `status.bubble.audio.stop`), miroir de `MiniAudioPlayerBar`.

## Vérification
- [x] Le fichier importe déjà `MeeshyUI` (où vit `adaptiveGlass`).
- [x] Convention i18n respectée : `String(localized:defaultValue:bundle:)` inline (cohérent avec
      les clés `status.bubble.*` existantes, hors `.xcstrings`).
- [x] Aucune édition `project.pbxproj` (XcodeGen globbe les `.swift`).
- [x] `StatusBubbleControllerTests` / `…ReplyTests` testent le controller (présentation/reply) →
      inchangés, non impactés par le rendu glass.
- [ ] CI `ios-tests.yml` verte (compile Xcode 26.1.x + tests simulateur 18.2).

## Merge
- [ ] PR → `main`, merge après CI verte. Supprimer la branche.
- [ ] `branch-tracking.md` : dernière itération iOS = 53i, base suivante = main post-merge.
</content>
# Plan — Iteration 53i (2026-06-30) — iOS

## Objectif
Épuration palette : éliminer les 4 hex hors-marque codés en dur dans les **composants de
contexte message** (`ContactCardView`, `MessageInfoSheet`) et les remplacer par les tokens
sémantiques `MeeshyColors`. Conforme à la charte (« conversation-context components MUST use
… semantic colors via `MeeshyColors`, never hardcode »).

## Périmètre (2 fichiers, 4 swaps)
1. `apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift`
   - L67 `Color(hex: "2ECC71")` (téléphone) → `MeeshyColors.success`
   - L82 `Color(hex: "3498DB")` (email) → `MeeshyColors.info`
2. `apps/ios/Meeshy/Features/Main/Components/MessageInfoSheet.swift`
   - L257 `Color(hex: "8E8E93")` (Distribué) → `MeeshyColors.neutral400`
   - L270 `Color(hex: "34B7F1")` (Lu) → `MeeshyColors.readReceipt`

## Étapes
- [x] Resync branche assignée sur `main` HEAD
- [x] Explorer les candidats différés (Explore agent) → choix lot épuré
- [x] Vérifier absence de test snapshot asservissant ces hex (aucun)
- [x] Appliquer les 4 swaps (imports MeeshySDK déjà présents, tokens déjà utilisés en place)
- [x] Rédiger analyse + plan
- [ ] Commit + push sur `claude/upbeat-euler-agmynm`
- [ ] Ouvrir PR ; attendre CI iOS verte
- [ ] Merger dans `main` ; mettre à jour `branch-tracking.md` (pointeur iOS → 53i)

## Risque
Minimal : swaps 1:1 hex→token, aucun changement de layout/structure, aucun test ne vérifie
ces couleurs. Tokens déjà importés et utilisés ailleurs dans les deux fichiers.

## Validation
CI `ios-tests.yml` (compile Xcode 26.1.1 / run simu iOS 18.2). Pas de build local SwiftUI.
**iOS only.** Adoption native iOS 26 Liquid Glass — **lot 3** sur 2 surfaces flottantes
restées en `.ultraThinMaterial`, via l'atome SDK `adaptiveGlass`. Bornée, fidèle, « épurée ».

## Base
- Branche de travail tirée de `main` HEAD (resync systématique avant de commencer).
- Dernière itération iOS mergée : **52i** (`MentionSuggestionPanel` + `MiniAudioPlayerBar`).

## Changements

### 1. `apps/ios/Meeshy/Features/Main/Components/LocationPickerView.swift`
3 panneaux flottants au-dessus de la `Map` :
- `searchBar` : `.background(RoundedRectangle(12).fill(.ultraThinMaterial).shadow)` →
  `.adaptiveGlass(in: RoundedRectangle(12)).clipShape(…).shadow(0.1, r8, y2)`.
- `searchResultsList` : idem `RoundedRectangle(12)` + `.shadow(0.15, r10, y4)`.
- `bottomCard` : `RoundedRectangle(20, continuous)` + `.shadow(0.1, r12, y-4)`.
- Verre **neutre** (chrome sur carte). Boutons internes (CTA accent, « Ma position »)
  inchangés (fills sur le verre).

### 2. `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift`
- `bubbleContent` : `.adaptiveGlass(in: RoundedRectangle(14, continuous)).clipShape(…)` +
  **liseré dégradé teinté avatar conservé en `.overlay`** + ombre — idiome `FloatingCallPillView`.
- `thoughtCircle` (cercles décoratifs 4/7/10 pt) : **laissés en material** (atomes décoratifs,
  risque clipping inutile).

## Hors périmètre (différé, documenté)
- `MessageInfoSheet.sectionBackground` (cartes de contenu en sheet → glass-everywhere =
  anti-pattern HIG), `MessageOverlayMenu` (glass-in-glass), `InviteFriendsSheet`,
  `ContactCardView` (écarté 52i).

## Vérification
- Pas de build SwiftUI local (Linux) → **CI `ios-tests.yml`** (compile Xcode 26.1.x + tests
  simu 18.2) est le gate.
- Aucun test n'asserte le fond matériau de ces vues (grep Tests = 0) → aucun test à mettre à jour.
- XcodeGen globe les `.swift` → pas d'édition `project.pbxproj`.

## Merge
- PR → CI verte → merge dans `main` → suppression de la branche → mise à jour
  `branch-tracking.md` (Dernière itération iOS = 53i).
# Plan — Iteration 53i (2026-06-30) — réconciliation collision 52i + cohérence teinte glass

## Objectif
iOS only. Rétablir la cohérence **code ↔ doc** sur `main` après la collision de deux agents
iOS « 52i », et figer la règle de teinte canonique pour le glass.

## Base
- Branche : `claude/upbeat-euler-mekcd1` (resynchronisée sur `main` post-#1083).

## Étapes
1. [x] `MentionSuggestionPanel` : retirer la teinte → `.adaptiveGlass(in: Rectangle())` + commentaire.
2. [x] `LocationPickerView` dropdown : retirer la teinte → `.adaptiveGlass(in: RoundedRectangle(12))` + commentaire.
3. [x] Dé-dupliquer `2026-06-30-plan-iteration-52i.md` (un plan consolidé, 3 surfaces).
4. [x] Réécrire `2026-06-30-iteration-52i.md` cohérent (3 surfaces, rationale neutre).
5. [x] `branch-tracking.md` : 52i ✅, lignes ⏳ dupliquées résolues, pointeur autoritaire MAJ.
6. [ ] Commit + push branche.
7. [ ] CI `ios-tests.yml` verte.
8. [ ] Merge dans `main`, marquer 53i ✅, supprimer la branche.

## Vérification
- `accentColor` toujours utilisé (avatars/icônes) → pas de var inutilisée.
- Aucune édition pbxproj (XcodeGen globbe les `.swift`).
- Pas de build local → CI iOS = gate.

## Non-objectifs (différés → 54i+)
`MessageOverlayMenu`, `MessageInfoSheet`, `InviteFriendsSheet`, `StatusBubbleOverlay`,
`CallEffectsOverlay`, `GlobalSearchView`, ladder catégoriel, polices figées.
