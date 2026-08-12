# Itération 122i — Analyse UI/UX iOS : `EmojiPickerSheet`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/EmojiPickerSheet.swift`
**Base** : `main` HEAD (`75d87347`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

La sheet de sélection d'emoji (barre de recherche, onglets de catégories, en-têtes de section,
grilles d'emojis). **0 PR ouverte iOS** au démarrage (list_pull_requests vide) → 0 contention.
Numéro **122i** (121i = `ConversationContextMenuView` mergé #1365).

## Constat (avant 122i)

Le fichier n'importait que `SwiftUI` (pas `MeeshyUI`) → `MeeshyFont` inaccessible. **5
`.font(.system(size:))`** : 4 sont du **texte/glyphe réactif** (glyphe + champ de recherche, croix
d'effacement, glyphe d'en-tête de section) ; 1 est le glyphe d'**onglet de catégorie** dans un
cadre tap **fixe 36×28**. Les grilles d'emojis utilisent déjà `.largeTitle`/`.title2` (sémantiques).

*(`FeedCommentsSheet` inspecté d'abord puis écarté — ses 5 `.system(size:)` sont déjà figés avec
commentaires « Figé » doctrine + texte déjà en `MeeshyFont.relative` → déjà soldé.)*

## Corrections appliquées (1 fichier, 0 logique)

- **`import MeeshyUI`** ajouté (nécessaire pour `MeeshyFont`).
- **4/5 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : glyphe de recherche (14), champ de
  recherche (14), croix d'effacement (14), glyphe d'en-tête de section (12).
- **1/5 glyphe figé** + commentaire doctrine : glyphe d'onglet de catégorie (13 medium, cadre tap
  fixe 36×28, doctrine 82i — l'icône ne doit pas déborder de l'onglet ; l'onglet porte déjà
  `.accessibilityLabel(category.localizedName)` + `.isSelected`).
- **`.accessibilityHidden(true)`** sur le glyphe décoratif d'en-tête de section (le titre adjacent
  `.subheadline` porte le sens).

Palette (`Color.accentColor` de l'onglet actif, gris système) et la croix d'effacement déjà
labellisée → **intactes**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (`emoji.search`, `common.clearSearch`,
  `emoji.*` déjà présentes).

## Statut

**TERMINÉE** — `EmojiPickerSheet` Dynamic Type + a11y soldé. Ne plus re-flagger le glyphe d'onglet figé (36×28).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `EmojiPickerSheet` — `import MeeshyUI` + 4 sites → `relative`, 1 glyphe d'onglet figé (36×28),
  glyphe d'en-tête masqué. **SOLDÉ 122i.**
- `FeedCommentsSheet` — déjà soldé (5 `.system(size:)` déjà figés + commentés) → **ne pas reprendre.**
