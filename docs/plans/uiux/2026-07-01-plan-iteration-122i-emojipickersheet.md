# Plan — Itération 122i (iOS) : `EmojiPickerSheet`

**Base** : `main` HEAD (`75d87347`, 0 PR iOS ouverte) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (sheet de sélection d'emoji) — doctrine 82i
**Gate** : CI `iOS Tests`

## Constat

121i mergé (#1365, `ConversationContextMenuView`) → **122i**. `FeedCommentsSheet` inspecté puis
écarté (déjà figé/soldé). `EmojiPickerSheet` : 5 `.font(.system(size:))` (recherche, onglets,
en-têtes) ; fichier n'importait pas `MeeshyUI`.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| `import MeeshyUI` | Ajouté (pour `MeeshyFont`) |
| Glyphe + champ de recherche (14/14) | `relative(14)` |
| Croix d'effacement (14) | `relative(14)` |
| Glyphe d'en-tête de section (12) | `relative(12)` + `accessibilityHidden` (décoratif) |
| Glyphe d'onglet de catégorie (13 medium, cadre fixe 36×28) | **FIGÉ** + commentaire 82i |

## Règles respectées

1. Glyphe dans cadre tap de dimension fixe (36×28) → figé (doctrine 82i) ; onglet déjà labellisé + `.isSelected`.
2. Glyphe décoratif d'en-tête → masqué du rotor (titre porte le sens).
3. Palette (`accentColor`) + croix déjà labellisée → non touchés.
4. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (122i car 121i mergé) ; `FeedCommentsSheet` écarté (soldé) ; `EmojiPickerSheet` non réclamée.
2. [x] `import MeeshyUI` ; 4 migrations `relative` ; 1 gel commenté ; 1 masquage.
3. [x] Vérifier : 1 `.system` figé (commenté) + 4 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 123i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent), `FeedView` (7, dont grille d'icônes 20pt).
`FeedPostCard` (9) = chrome d'action-bar → gel documenté. Ensuite : passe de revue
state-of-the-art (audit palette hexes, cohérence dark/light, gestes standards).
