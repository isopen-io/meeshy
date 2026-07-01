# UI/UX Analysis — Iteration 95i (2026-07-01) — ForwardPickerSheet

## Scope
**iOS exclusivement** (suffixe `i`). Thème : **accessibilité — Dynamic Type** sur
`ForwardPickerSheet` (feuille « Forward » : bannière d'aperçu du message + liste de conversations
avec bouton de transfert). Suite thématique de 94i (`SharePickerView`, famille partage/transfert),
sur une surface **hors-radar** de l'essaim d'agents.

> **Contexte de contention** : essaim d'agents iOS très dense (doublons/triplons de PR par surface).
> `ForwardPickerSheet` n'est cité par **aucune** PR ouverte ni liste « next » → collision minimale.
> Numéro **95i** (après 94i `SharePickerView` mergée #1243).

Vérification : CI `ios-tests.yml` — SwiftUI ne compile pas sous Linux. **Aucun test neuf** : sweep
typographique pur + 1 masquage VoiceOver, 0 logique (parité 55i / 74i / 86i / 90i / 93i / 94i).
`MeeshyFont.relative` est accessible **sans import ajouté** : le fichier utilise déjà `MeeshyColors`
(même module `MeeshyUI`) sans `import MeeshyUI` explicite → transitivité confirmée (précédent des
PRs AffiliateView mergées).

## Contexte / point de départ
`ForwardPickerSheet.swift` (261 lignes) est la feuille de transfert d'un message vers une autre
conversation. Bannière d'aperçu (expéditeur + contenu + miniature + croix), liste de conversations
avec bouton d'envoi tri-état. Libellés déjà i18n'd, boutons déjà `.accessibilityLabel`'d, palette
déjà tokenisée. Mais **8 sites** fixaient une taille de police absolue `.font(.system(size:))`.

## iOS Findings

### Dynamic Type — `.font(.system(size:))` → `MeeshyFont.relative(...)` (7/8 sites)
| Ligne | Rôle | Après |
|---|---|---|
| 61 | texte état vide | `relative(15, weight: .medium)` |
| 108 | nom expéditeur (bannière) | `relative(11, weight: .semibold)` |
| 113 | aperçu du message (bannière) | `relative(11)` |
| 125 | croix de fermeture (bannière) | `relative(10, weight: .medium)` |
| 170 | `ConversationTitleLabel(font:)` de la ligne | `relative(15, weight: .medium)` |
| 176 | type de conversation | `relative(12)` |
| 181 | compteur de membres | `relative(12)` |
| 212 | bouton d'envoi `paperplane.circle.fill` | `relative(24)` |

**Note cohérence colonne d'envoi** : l'état « envoyé » (`checkmark.circle.fill`) utilisait **déjà**
le style sémantique scalable `.font(.title2)`. Migrer le bouton « envoyer » (`paperplane`, 24pt) vers
`relative(24)` (≈ `.title2`) **aligne** les deux états sur le même comportement Dynamic Type au lieu
de laisser l'un scaler et l'autre figé. Le `ProgressView` transitoire reste à 24×24 (état bref).

### Héros décoratif ≥40pt — gardé fixe (1/8 site)
| Ligne | Rôle | Décision |
|---|---|---|
| 57 | `bubble.left.and.bubble.right` 40pt (état vide) | figé (doctrine 74i/86i) + commentaire + `.accessibilityHidden(true)` — le libellé adjacent porte le sens. |

## Périmètre délibérément exclu (ne pas re-flagger)
- **Miniature d'attachement** (`ProgressiveCachedImage`, 28×28) : image, pas police — hors scope.
- **Palette** : `Color(hex: accentColor)` (accent déterministe de conv), `MeeshyColors.success`,
  `theme.*` — déjà tokenisée.
- **Héros 40pt** : figé à dessein.

## Anti-repetition check
`list_pull_requests` (2026-07-01) : aucune PR ne touche `ForwardPickerSheet`. Surface hors-radar.
94i (`SharePickerView` #1243) et 93i (`LocationPickerView` #1225) mergées sur `main`.

## Status : ✅ analyse complète + corrections appliquées (7 swaps police → `MeeshyFont.relative` / 1 héros figé documenté + masqué VoiceOver, 1 fichier).
Développement terminé → push branche `claude/upbeat-euler-512kep` + PR ; CI `ios-tests.yml` ; merge
après CI verte. Voir plan `2026-07-01-plan-iteration-95i-forward`.

### Annotation post-correction (ne pas reproduire)
**NE PLUS re-flagger** pour Dynamic Type les 7 sites de `ForwardPickerSheet` ci-dessus. Le héros
`bubble.left.and.bubble.right` 40pt (ligne 57) est **volontairement** figé + masqué VoiceOver. La
colonne d'envoi scale désormais uniformément (checkmark `.title2` + paperplane `relative(24)`).

### Différé prioritaire iOS 96i+
- Surfaces hors-radar restantes : `AddParticipantSheet` (14), `NotificationSettingsView` (10),
  `SupportView` (10), `CommunityLinkDetailView` (10), `UserStatsView` (9), `EditPostSheet` (9).
- Grandes surfaces chaudes à coordonner : `MemberManagementSection`, `StoryViewerView+Content`.
- Palette hexes proches ; Glass `MessageOverlayMenu`.
