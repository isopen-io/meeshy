# Itération 165i — Analyse UI/UX iOS : `SyncPill` (localisation des chaînes VoiceOver)

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift`
**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-2v80lm`
**Gate** : CI `iOS Tests`
**Catégorie** : Localisation (i18n) — chaînes VoiceOver codées en dur

## Contexte

`SyncPill` est la pastille rotative discrète en haut d'écran (montée par `ConnectionBanner` via
`.safeAreaInset(edge: .top)` sur `RootView` / `iPadRootView`). Elle liste les signaux de
synchronisation — état de connexion (`Hors ligne` / `En ligne` / `Reconnexion` / `Synchronisation`),
opérations de l'outbox offline — sous forme d'un seul chip capsule qui fait tourner ses entrées.

Sa **typographie Dynamic Type a été soldée en 135i** (3/3 `.font(.system(size:))` → `MeeshyFont.relative`).
135i a **explicitement conclu « a11y déjà conforme »** — mais cette conclusion a **manqué** un défaut réel :
les **deux chaînes VoiceOver** de la surface sont des **littéraux français codés en dur**, jamais localisés.

Numéro **165i** : strictement au-dessus du plus haut en vol observé (164i = `InviteFriendsSheet`).

## Constat (avant 165i)

Le chip est un seul élément VoiceOver (`.accessibilityElement(children: .ignore)`) porté par deux textes
d'accessibilité **entièrement rédigés en français dans le code**, sans `String(localized:)` :

1. **`accessibilityHint`** (ligne 163) — `"Touchez pour ouvrir l'emplacement de l'opération."` : rendu
   **en français pour tous les locales**, y compris un utilisateur anglophone/hispanophone sous VoiceOver.
2. **`accessibilityText`** (ligne 230, cas ≥ 2 signaux) — `"\(entries.count) signaux. Actif : \(entry.label)."` :
   même problème, avec en prime une **interpolation Swift directe** (non ré-ordonnable en RTL, non extractible
   par Xcode pour traduction).

Les **libellés** des entrées (`Hors ligne`, `En ligne`, …) sont eux **déjà** localisés via
`String(localized:)` côté `ConnectionBanner` — seules les deux chaînes **a11y** de `SyncPill` échappaient
à l'i18n. C'est une violation directe de la règle « Avoid hardcoded strings » (CLAUDE.md § Localisation).

## Corrections appliquées (1 fichier, 0 logique, 0 changement visuel)

- **`accessibilityHint` → `String(localized: "sync.a11y.tap_hint", defaultValue: "Touchez pour ouvrir
  l'emplacement de l'opération.", bundle: .main)`** — le défaut français reste la source (parité avec le
  reste du codebase, base FR), l'extraction Xcode alimente le catalogue pour traduction.
- **`accessibilityText` (cas ≥ 2) → `String(format: String(localized: "sync.a11y.active_signal",
  defaultValue: "%1$d signaux. Actif : %2$@.", bundle: .main), entries.count, entry.label)`** —
  format **positionnel** `%1$d` / `%2$@` (ré-ordonnable / RTL-safe), conforme au pattern déjà présent
  dans le codebase (`"Traduction en %1$@ : %2$@"`, `"🔗 Story de %1$@ : %2$@"`). Le cas ≤ 1 signal
  retourne toujours `entry.label` (déjà localisé) — inchangé.

**2 clés i18n neuves, suffixées `.a11y`** (VoiceOver-only, référencées code-only via `defaultValue` —
0 édition xcstrings, parité 100i/104i/164i) : `sync.a11y.tap_hint`, `sync.a11y.active_signal`.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 changement de layout / couleur / copie **visible**,
  0 test neuf. Substitution pure de littéraux par `String(localized:)` — aucun risque de compilation
  (le pattern `String(format: String(localized: …), arg)` est déjà utilisé, ex. `FeedCommentsSheet:1444`).
- Dynamic Type **déjà soldé 135i** → non re-traité. Les couleurs / la rotation / le modèle `SyncPillEntry`
  ne sont **pas** touchés.
- Les 3 suites référençant `SyncPill` (`SyncPillLabelsTests`, `SyncPillViewModelDeriveTests`,
  `SyncPillRotatorTests`) exercent **libellés / dérivation / rotation** — **pas** les chaînes a11y →
  aucune régression.

## Statut

**TERMINÉE** — les deux chaînes VoiceOver de `SyncPill` sont désormais localisées (hint + résumé
multi-signaux), plus jamais rendues en français dur pour les locales non-FR. Dynamic Type déjà soldé
135i. Ne plus re-flagger cette surface pour i18n ni Dynamic Type.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `SyncPill` — **135i** : Dynamic Type (3/3 éléments inline → `relative`). **165i** : localisation des 2
  chaînes VoiceOver (`accessibilityHint` + `accessibilityText` multi-signaux) via `String(localized:)` /
  `String(format:)` positionnel, 2 clés `.a11y` neuves. **SOLDÉ.**
