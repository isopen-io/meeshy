# Plan — Itération 121i (iOS) : `ConversationContextMenuView`

**Base** : `main` HEAD (`ead4451c`, 0 PR iOS sur cette surface) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (menu contextuel de message)
**Gate** : CI `iOS Tests`

## Constat

120i mergé (#1360, `ConversationAnimatedBackground`) → **121i**. `TwoFactorSetupView` inspecté puis
écarté (déjà conforme). `ConversationContextMenuView` : **7 `.font(.system(size:))`**, toutes du
texte/glyphe réactif dans des rangées `minHeight: 44` (emoji favori, icône+libellé d'action,
indicateurs, en-tête de retour).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Emoji favori (22) | `relative(22)` |
| Icône de rangée d'action (17 medium) | `relative(17, .medium)` |
| Libellé de rangée d'action (16 regular) | `relative(16)` |
| Checkmark d'état (13 semibold) | `relative(13, .semibold)` |
| Chevron de disclosure (13 semibold) | `relative(13, .semibold)` |
| Chevron gauche de l'en-tête (15 semibold) | `relative(15, .semibold)` |
| Titre de l'en-tête (16 semibold) | `relative(16, .semibold)` |

## Règles respectées

1. Aucun glyphe dans un cadre de dimension fixe (les `frame(width: 24)` sont des colonnes
   d'alignement en rangée `minHeight: 44`) → **0 gel**, tout migre.
2. a11y déjà exhaustive (labels de bouton + `.isButton`) → non touchée.
3. Palette (`accent`, `MeeshyColors.error`) déjà conforme → non touchée.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (121i car 120i mergé) ; `TwoFactorSetupView` écarté (conforme) ; `ConversationContextMenuView` non réclamée.
2. [x] 7 migrations `relative` ; 0 gel.
3. [x] Vérifier : 0 `.system(size:)` restant + 7 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 122i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent). Fresh à texte réel : `FeedCommentsSheet` (5),
`EmojiPickerSheet` (5), `FeedView` (7, dont grille d'icônes 20pt à évaluer),
`ConversationContextMenuView` **soldé**. `FeedPostCard` (9) = chrome d'action-bar → gel documenté.
Ensuite : passe de revue state-of-the-art (audit palette hexes, cohérence dark/light, gestes).
