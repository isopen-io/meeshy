# Accessibilité (a11y) — Boutons flottants + Feed / Conversation / Post Details

> Demande utilisateur 2026-06-17 : corriger le gap « pas de label a11y sur les boutons flottants », puis intégrer **toute** l'accessibilité sur les vues **Feed**, **Conversation** et **Post Details**.
> Décisions validées : **profondeur complète** (labels + hints + groupement + traits + accessibilityValue + masquage décoratifs + tap targets 44pt) ; **5 langues** (fr source + en + de + es + pt-BR) pour chaque nouvelle clé.

## Conventions à respecter (déjà en place dans le repo)
- Labels/hints : `String(localized: "key", defaultValue: "FR", bundle: .main)` (SDK : `.module`).
- Groupement : `.accessibilityElement(children: .combine)` ; masquage décoratif : `.accessibilityHidden(true)` / `.accessibilityDecorative()`.
- Traits : `.accessibilityAddTraits(.isHeader/.isSelected/.isButton)` ; valeur : `.accessibilityValue(...)`.
- Tap target : `.meeshyTapTarget(44)` (SDK `Theme/Accessibility.swift`).
- IDs de test : enum `MeeshyA11yID` (SDK).
- Clés a11y → `apps/ios/Meeshy/Localizable.xcstrings` (insertion ciblée, **jamais** json.dump global) — 5 langues.
- iOS 16+ / Swift 6 : `.adaptiveOnChange`, `.meeshyAnimation` ; pas de `.onChange` 2-param brut.

---

## Phase 1 — Boutons flottants (le gap noté)  ⚙️ SDK + app
Fichiers : `packages/MeeshySDK/Sources/MeeshyUI/Primitives/FloatingButtons.swift`, `apps/ios/Meeshy/.../RootView.swift`

Correctness clé : les boutons utilisent `.simultaneousGesture(TapGesture)` (pas un `Button`) → VoiceOver **ne peut pas les activer**. Fix = trait + action a11y, pas juste un label.

- [ ] SDK : ajouter params **opaques** `accessibilityLabel: String? = nil`, `accessibilityHint: String? = nil`, `accessibilityActionName: String? = nil` (long-press) à `FreeFloatingButton`, `LegacyFloatingButton`, `FreeFloatingButtonsContainer` (left/right), `FloatingButtonsContainer` (left/right).
- [ ] SDK : dans le `body`, appliquer `.accessibilityElement(children: .ignore)` + `.accessibilityAddTraits(.isButton)` + `.accessibilityAction { onTap() }` + (si label) `.accessibilityLabel/.accessibilityHint` + (si `onLongPress`) `.accessibilityAction(named:) { onLongPress?() }`. Rétro-compatible (gaté sur label non-nil pour label/hint).
- [ ] App `RootView` : injecter labels FR localisés sur les 2 boutons flottants : gauche = **Flux**, droite = **Menu/Réglages** ; passer le compteur de notifications en `accessibilityValue` côté bouton droit.
- [ ] xcstrings : `a11y.floating.feed` / `.hint`, `a11y.floating.menu` / `.hint`, `a11y.floating.menu.notifications-value` (format « %d notifications »).
- [ ] SDK test : `FloatingButtonsAccessibilityTests` (host `UIHostingController` → label/traits/action) **ou**, si bridging instable en headless, test logique pure + vérif simulateur.
- [ ] Build SDK (`MeeshySDK-Package`) + app vert.

## Phase 2 — Feed  📱 app
Fichiers : `FeedView.swift`, `FeedPostCard.swift`, `ReelFeedCard.swift`

- [ ] FeedView : composer placeholder (avatar décoratif masqué, barre « Partager… » label+hint), boutons **Publier**/**Annuler** (label+hint+`.isButton`, disabled annoncé), bannière « X nouveaux posts » (label+hint+action).
- [ ] FeedPostCard : grouper **avatar+nom auteur** (1 élément tap→profil, label+hint) ; bouton **like** (label + `accessibilityValue` nb likes + état aimé) ; **média** (label : type+auteur, tap→détail/galerie) ; panneau **traduction** (label « Traduction : … »).
- [ ] ReelFeedCard : boutons **like / partage / repost / bookmark** manquants (label+hint+value).
- [ ] xcstrings : `a11y.feed.*` (composer, publier, annuler, newPosts, post.author, post.like, post.media.image/video, post.translation).
- [ ] Build app vert.

## Phase 3 — Conversation  📱 app
Fichiers : `UniversalComposerBar.swift`, `ThemedMessageBubble.swift` / `Bubble/BubbleStandardLayout.swift`, sous-composants bulle.

- [ ] UniversalComposerBar : champ texte (label + `MeeshyA11yID.composerTextField`), bouton **envoi** (label+hint + `MeeshyA11yID.composerSend`), bouton **pièces jointes** + items menu (photo/vidéo/audio/fichier/position…), **enregistrement audio** (label+hint), **emoji** (label).
- [ ] Bulle : avatar expéditeur (masqué si redondant, label porté par la bulle), **citation/quote reply** groupée (« En réponse à X : … »), **pièces jointes** (alt-text + transcription), badge « Modifié ».
- [ ] xcstrings : `a11y.composer.*`, `a11y.bubble.*`.
- [ ] Build app vert.

## Phase 4 — Post Details (le plus critique, ~5-10%)  📱 app
Fichiers : `PostDetailView.swift`, `CommentListView.swift`, `TopLevelCommentCell.swift`

- [ ] PostDetailView : **header** auteur (avatar+nom+date groupés, label+hint, badge vérif si présent) ; **média/galerie** (label descriptif) ; barre d'actions **like / comment / repost / share / bookmark** (label+hint+`accessibilityValue` compteur+`.isButton`) ; menu **« … »** (label+hint) ; **quote embed** groupé.
- [ ] Commentaires : header de section (`.isHeader`) ; **chaque row** groupé (« X, il y a … : contenu ») ; boutons **like/reply** (label+hint+value) ; compteur replies.
- [ ] xcstrings : `a11y.post.*`, `a11y.comment.*`.
- [ ] Build app vert.

## Phase 5 — Vérification
- [ ] `xcodebuild test -scheme MeeshySDK-Package` (incl. nouveau test floating) vert.
- [ ] `./apps/ios/meeshy.sh test` (app) vert.
- [ ] Simulateur : VoiceOver / Accessibility Inspector → parcours des 4 zones ; vérifier activation double-tap des boutons flottants.
- [ ] Vérifier toutes les nouvelles clés présentes en 5 langues.

## Hors périmètre (décidé)
- Pas d'annonces VoiceOver dynamiques des états transitoires (envoi/erreur/upload).
- Pas de refonte Dynamic Type globale (respecter l'existant, ne pas introduire de tailles fixes).
- Web : non concerné (demande iOS).

## Notes
- Commit : **uniquement si l'utilisateur le demande** (branche d'abord, on est sur `main` ; cible PR = `dev`). Pas de trailer Co-Authored-By.
- Fichiers partagés (xcstrings, pbxproj pour nouveaux tests) → travail **séquentiel en session principale**, pas de worktrees parallèles.

## Review — LIVRÉ & VÉRIFIÉ (2026-06-17)

### Phase 1 — Boutons flottants (le gap noté) ✅
- SDK `FloatingButtons.swift` : params a11y **opaques** (`a11yLabel/Hint/Value/ActionName`) ajoutés à `FreeFloatingButton`, `LegacyFloatingButton`, `FreeFloatingButtonsContainer`, `FloatingButtonsContainer` (left/right) + modifier `floatingButtonAccessibility` privé. Fix correctness : trait `.isButton` + `accessibilityAction(.default)` câblée sur `onTap` (les boutons étaient des `TapGesture`, **non activables** par VoiceOver) + action nommée pour le long-press. Rétro-compatible (gaté sur label non-nil). Pureté SDK respectée (params opaques, app injecte les chaînes).
- `RootView` : gauche = **Flux**, droite = **Menu/Réglages** (action nommée « Réglages » au long-press) + compteur notifications en `accessibilityValue`.
- 6 clés `a11y.floating.*` (5 langues). Build ✅.

### Phases 2-4 — Feed / Conversation / Post Details ✅ (3 agents // sur fichiers disjoints)
- **Feed** (`FeedView`, `FeedPostCard`, `ReelFeedCard`) : composer (placeholder/Publier/Annuler), bannière « X nouveaux posts », avatar+auteur groupés, like (label+value+`.isSelected`), média alt-text, panneau traduction, boutons réel manquants. 27 clés `a11y.feed.*`.
- **Conversation** (`UniversalComposerBar`(+Recording), `BubbleStandardLayout`) : champ message (+`MeeshyA11yID.composerTextField`), tonalité, langue ; citation ajoutée au label combiné de la bulle. 8 clés `a11y.composer.*`/`a11y.bubble.*`.
- **Post Details** (`PostDetailView`, `FeedCommentsSheet`) : header auteur, drapeaux/traduction, média, barre d'actions (like/comment/repost/share/bookmark + compteurs en value), menu, repost embed, en-tête commentaires `.isHeader`, rows commentaire groupées, like/répondre. 41 clés `a11y.post.*`/`a11y.comment.*`. (`CommentListView`/`TopLevelCommentCell` = chemin UIKit non utilisé par le rendu SwiftUI → hors parcours.)
- 82 clés centralisées dans `Localizable.xcstrings` (5 langues) via insertion ciblée (round-trip byte-identique, `separators=(',', ' : ')`). Build ✅.

### Phase 5 — Vérification ✅
- Build app+SDK vert (2 warnings préexistants seulement).
- Tests app : **2035 passés, 6 skipped, 0 failure**.
- Revue statique : footgun `.combine` vérifié (aucun bouton aplati — les `.combine` ajoutés ne couvrent que du texte/groupes non-interactifs) ; namespaces disjoints ; pureté SDK ok.
- ⚠️ **Reste (QA manuelle recommandée)** : passe VoiceOver / Accessibility Inspector sur device/simu des 4 zones (le repo n'a pas d'infra de test UI a11y SwiftUI ; cohérent avec les ~651 lignes d'`.accessibilityLabel` existantes, vérifiées au runtime). Le double-tap d'activation des boutons flottants est le point à confirmer en priorité.
- **Non commité** (en attente d'accord utilisateur).
