# UI/UX Analysis — Iteration 94i-conversation-list (2026-07-01)

## Scope
**iOS exclusivement** (suffixe `i` — Web et Android couverts par d'autres agents).
Thème : **accessibilité — Dynamic Type + VoiceOver** sur `ConversationListView+Overlays.swift`,
la surface d'accueil (écran racine des conversations) : en-tête repliable (`ConversationListHeaderOverlay`)
+ barre inférieure (`ConversationListBottomBar` : carrousel communautés, filtres, barre de recherche).

Migration mécanique des polices figées `.font(.system(size:))` vers `MeeshyFont.relative(...)`
(scaling Dynamic Type, `weight`/`design` préservés), en-têtes navigables au rotor VoiceOver,
et masquage des glyphes purement décoratifs. Zéro logique / zéro couleur / zéro clé i18n / zéro
test neuf (parité 55i / 74i / 82i / 86i / 88i / 93i).

Vérification : la CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur 18.2) sert de build
de validation — SwiftUI ne compile pas sous Linux. `MeeshyFont` est déjà en scope (`import MeeshyUI`
ligne 3, enum public `DesignTokens.swift` + extension `relative` `Accessibility.swift`).

## Contexte / point de départ
`ConversationListView+Overlays.swift` (611 lignes) est extrait de `ConversationListView.swift`
(découpage anti-crash type-metadata sur iPhone XR/iOS 17.6). Il porte **trois** surfaces visibles :
1. `conversationContextMenu(for:)` — menu long-press (déjà 100 % `Label` natif, accessible).
2. `ConversationListHeaderOverlay` — barre supérieure (titre « Meeshy Chats », actions
   partage-lien / nouvelle-conv en Liquid Glass, notifications, réglages, bouton Feed iPad).
3. `ConversationListBottomBar` — carrousel communautés + filtres + barre de recherche themée.

Les libellés sont déjà i18n (`String(localized:)`) et les tokens couleur déjà conformes
(`MeeshyColors.indigo500/.error/.warning/.info`, aucun hex legacy). Mais **15 sites** fixaient
une taille absolue `.font(.system(size:))` → l'écran d'accueil ignorait entièrement le réglage
Dynamic Type (rupture de la règle a11y CLAUDE.md « never fixed font sizes for body text »).

## iOS Findings

### Dynamic Type — `.font(.system(size:))` → `MeeshyFont.relative(...)` (10/15 sites)
Migration préservant `weight` **et** `design` (`.rounded` du titre) :

| Ligne | Rôle | Avant | Après |
|---|---|---|---|
| 268 | icône bouton Feed (iPad) `square.stack.fill` | `.system(size: 13, weight: .semibold)` | `MeeshyFont.relative(13, weight: .semibold)` |
| 270 | libellé « Feed » | `.system(size: 13, weight: .semibold)` | `MeeshyFont.relative(13, weight: .semibold)` |
| 286 | titre héros « Meeshy Chats » | `.system(size: 28, weight: .bold, design: .rounded)` | `MeeshyFont.relative(28, weight: .bold, design: .rounded)` |
| 423 | titre section « Communautés » | `.system(size: 16, weight: .bold)` | `MeeshyFont.relative(16, weight: .bold)` |
| 438 | bouton « Voir tout » | `.system(size: 12, weight: .semibold)` | `MeeshyFont.relative(12, weight: .semibold)` |
| 450 | X fermer communautés `xmark.circle.fill` | `.system(size: 18)` | `MeeshyFont.relative(18)` |
| 514 | loupe barre de recherche | `.system(size: 16, weight: .medium)` | `MeeshyFont.relative(16, weight: .medium)` |
| 529 | champ de recherche (`TextField`) | `.system(size: 15)` | `MeeshyFont.relative(15)` |
| 550 | bouton tableau de bord `square.grid.2x2` | `.system(size: 16, weight: .medium)` | `MeeshyFont.relative(16, weight: .medium)` |
| 568 | bouton recherche globale `text.magnifyingglass` | `.system(size: 16, weight: .medium)` | `MeeshyFont.relative(16, weight: .medium)` |

**Justification du choix de migration** : la barre de recherche (loupe + champ + dashboard +
recherche globale) forme une rangée dont le champ texte scale → migrer les 4 icônes garde
l'alignement à toute taille Dynamic Type. Le titre « Meeshy Chats » (28pt → `.title`) reste du
texte lisible < 40pt (pas un glyphe décoratif héros), donc il scale. Le bouton Feed (icône+texte)
et le header communautés (« Communautés » + « Voir tout » + X) sont des rangées texte/contrôle
inline sans cadre fixe → scaling préserve leur cohérence.

### VoiceOver
- **En-têtes navigables au rotor** : le titre « Meeshy Chats » (286) et le titre de section
  « Communautés » (423) reçoivent `.accessibilityAddTraits(.isHeader)` → navigables au rotor
  « En-têtes » (convention 86i/93i).
- **Glyphe décoratif masqué** : l'icône `square.stack.fill` du bouton Feed (267) reçoit
  `.accessibilityHidden(true)` — le libellé « Feed » adjacent porte le sens ; VoiceOver ne
  prononce plus « square stack, Feed » mais « Feed ».

## Périmètre délibérément exclu (ne pas re-flagger)

### 5 glyphes chrome de l'en-tête — gardés FIXES (commentaire d'exception ajouté ligne 293)
La rangée d'actions supérieure reste à taille de point fixe :

| Ligne | Glyphe | Raison |
|---|---|---|
| 304 | `link.badge.plus` (18pt) | Contrôle chrome dans **cercle Glass fixe 40×40** (`adaptiveGlass(in: Circle())`) |
| 315 | `plus` (18pt) | Contrôle chrome dans **cercle Glass fixe 40×40** |
| 331 | `bell.fill` (18pt) | Action chrome alignée sur la rangée des cercles Glass |
| 336 | compteur notifications (9pt) | Texte dans **badge fixe 16×16** (doctrine badge dimension fixe 86i) |
| 353 | `gearshape.fill` (18pt) | Action chrome alignée sur la rangée |

Doctrine 82i (contrôles chrome/transport à cadre fixe) + 86i (glyphe contraint dans badge de
dimension fixe) : scaler ces glyphes casserait la grille de la barre d'outils (deux sont
verrouillés dans des cercles Glass 40×40, les deux autres s'alignent visuellement dessus).
**Ne plus re-flagger.**

### Déjà conforme (aucune action)
- `conversationContextMenu(for:)` : 100 % `Label(_, systemImage:)` natif → accessible par
  construction, aucune police figée.
- Tokens couleur : `MeeshyColors.indigo*/.error/.warning/.info` — palette conforme, aucun hex.
- Liquid Glass : `AdaptiveGlassContainer` + `.adaptiveGlass(in: Circle(), interactive: true)`
  déjà en place sur les deux actions primaires (gating/fallback SDK Compatibility) → intact.
- `.ultraThinMaterial` des panneaux communautés/recherche : adaptatif dark/light, stroke
  `theme.inputBorder` themé → intact.

## Résultat
1 fichier, **10** polices figées → `relative`, **5** figées à dessein (commentées), **2** traits
`.isHeader`, **1** masquage VoiceOver décoratif. 0 logique / 0 couleur / 0 clé i18n / 0 test neuf.
Gate = CI `ios-tests.yml`.

## Statut : ✅ COMPLÈTE ET CORRIGÉE (mergée dans main — voir branch-tracking.md)

### Différés prioritaires iOS 95i+ (surfaces à fort volume `.font(.system(size:))`, non prises)
- `StoryViewerView+Content` (31 — coordonner avec i18n) ; `ConversationView+Composer` (22, lot prudent) ;
  `MessageOverlayMenu` (21 — coupler avec adoption Glass `AdaptiveGlassContainer`) ;
  `OnboardingAnimations`/`OnboardingFlowView`/`OnboardingStepViews` (flux onboarding, non touché) ;
  `ConversationView+MessageRow` (16, bulle) ; `FeedView+Attachments` (14) ; `FeedPostCard+Media` (13).
- **NE PAS re-flagger** : `ConversationListView+Overlays` (soldé 94i-conversation-list ; chrome header figé à dessein).
