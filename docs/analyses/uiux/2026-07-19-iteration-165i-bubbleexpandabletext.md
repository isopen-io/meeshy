# Iteration 165i — `BubbleExpandableText` Dynamic Type (« Voir plus »)

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`)
**Branche** : `claude/laughing-thompson-l19kam`
**Base** : `main` HEAD `efedb69e4`
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleExpandableText.swift`

## Résumé
Migration Dynamic Type du **libellé texte réel** « Voir plus » (`bubble.expand.more`)
du bouton de dépliage des messages tronqués (> 512 caractères) dans la bulle.
**1/1** `.font(.system(size: 12, weight: .semibold))` → `MeeshyFont.relative(12, weight: .semibold)`.

## Pourquoi ce fichier
Le balayage Dynamic Type a solde tous les gros lots (fichiers à 3+ `.system`), et la
plupart des libellés à 1–2 `.system` sont soit migrés soit figés (glyphes décoratifs
bornés, doctrine 82i/84i/86i). En ratissant la traîne, `BubbleExpandableText` ressortait
comme un **vrai libellé texte non migré** dans un composant chaud (chaque bulle de
message longue) — le meilleur reliquat migrable.

## Analyse
| Élément | L | Avant | Après | Décision |
|---|---|---|---|---|
| Bouton « Voir plus » | 80 | `.system(size: 12, weight: .semibold)` | `MeeshyFont.relative(12, weight: .semibold)` | **Migré** — libellé texte réel |

### Migration franche (pas un gel)
- Le conteneur du libellé utilise `.frame(maxWidth: .infinity, minHeight: 24, alignment: .trailing)`.
  `minHeight` = hauteur **minimale**, pas figée → le texte grandit sans troncature aux
  grandes tailles Dynamic Type.
- La cible tactile 44pt (HIG) provient de `DownwardExtendedTapShape(extraBottom: 20)` sur
  `.contentShape`, **indépendante** de la taille de police → aucune contrainte de gel.
- Aucun glyphe décoratif dans ce fichier → aucune annotation de gel 82i/84i/86i requise.

### A11y — déjà complète (inchangée)
- `.accessibilityAddTraits(.isButton)` + `.accessibilityLabel("Voir plus")` +
  `.accessibilityIdentifier("bubble.expand.more")` déjà en place.
- Le libellé scale désormais correctement pour les utilisateurs Dynamic Type sans casser
  le hit-testing du geste `highPriorityGesture(TapGesture)`.

### Palette / i18n / tokens
- Aucune couleur inline (utilise `textColor.opacity(0.6)` dérivé du thème) → 0 swap token.
- `bubble.expand.more` déjà localisé → 0 clé neuve.

## Portée
- 1 fichier, 1 migration de police, 1 commentaire de doctrine.
- 0 logique (dépliage à sens unique, gestures, `exceeds`/`truncateAtWord` inchangés).
- 0 test neuf, 0 clé i18n neuve, 0 import neuf (`import MeeshyUI` présent L3).

## Vérification
- `MeeshyFont.relative(_:weight:design:)` (`MeeshyUI/Theme/Accessibility.swift`) — signature
  confirmée, swap mécanique identique à la doctrine documentée dans ce même fichier.
- Aucun `.font(.system(size:)` résiduel dans `BubbleExpandableText.swift` après le changement.
- Gate = CI `ios-tests` (build Xcode local indisponible sur environnement Linux).

## Statut
- ✅ **`BubbleExpandableText` Dynamic Type SOLDÉ** — ne plus reprendre.
- **Traîne des libellés texte réels non migrés = tarie.** Les `.system(size:)` restants
  échantillonnés (StatusBarView, IncomingCallView, ReelRepostEmbedCell, FeedView composer,
  ConversationBackgroundComponents, StoryExpiredContent, StoryViewerContainer, ChangePasswordView,
  FriendRequestListView, MessageDetail*…) sont **tous des glyphes décoratifs/chrome figés**
  avec doctrine documentée.
- **Prochaine itération (141i+)** : démarrer la passe state-of-the-art (hex inline vs tokens
  sémantiques `MeeshyColors`) OU ouvrir un nouvel axe de polish natif Apple.
