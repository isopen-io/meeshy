# Itération 135i — Analyse UI/UX iOS : `SyncPill`

**Date** : 2026-07-04
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift`
**Base** : `main` HEAD (`1fbda962`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`SyncPill` est la pastille rotative discrète en haut d'écran qui liste les signaux de synchronisation
(état de connexion, opérations en file offline, travail inflight bloqué) — un seul chip capsule qui fait
tourner ses entrées. Surface **fraîche** : 3 `.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`.
**7 PR ouvertes au démarrage — gateway (#1438/#1437/#1435/#1429) + calls (#1436 gateway+CallManager, #1433
CallManager/BubbleCallNoticeView)** → **aucune ne touche `SyncPill`** → **0 contention**. Numéro **135i**
(134i = `AchievementBadgeView` mergé #1430).

## Constat (avant 135i)

**3 `.font(.system(size:))`** — tous **inline, sans cadre fixe** :
- libellé principal `label + animatedDots` (11 medium) — vrai texte ;
- compteur `index/count` (10 regular, `monospacedDigit`) — vrai texte ;
- icône de statut inline `Image(systemName: iconName)` (11 semibold) — glyphe de statut (`wifi.slash`,
  etc.) apparié au libellé dans le même `HStack`.

## Corrections appliquées (1 fichier, 0 logique)

- **3/3 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (mêmes tailles/poids) : libellé
  (`relative(11, weight: .medium)`), compteur (`relative(10, weight: .regular)` + `monospacedDigit`
  conservé), icône de statut (`relative(11, weight: .semibold)`) → l'ensemble du chip **scale sous
  Dynamic Type**, l'icône de statut restant alignée avec son libellé.

Aucun gel : aucun de ces éléments n'est borné par un cadre de dimension fixe (la capsule se dimensionne au
contenu via `.padding`). → **`relative`, pas figé**.

Accessibilité déjà conforme → **intacte** : le chip porte `.accessibilityElement(children: .ignore)` +
`.accessibilityLabel` (résumé des signaux) + `.accessibilityHint` → l'icône de statut est déjà aplatie
(pas de `.accessibilityHidden` nécessaire). Palette (`MeeshyColors.brandGradient/warning/success/error`,
capsule tint) déjà conforme → non touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. `import MeeshyUI`
  déjà présent. Le modèle `SyncPillEntry`, l'enum `SyncPillDotStyle` et le `SyncPillRotator` ne sont
  **pas** touchés.
- Les 3 tests référençant `SyncPill` (`SyncPillLabelsTests`, `SyncPillViewModelDeriveTests`,
  `SyncPillRotatorTests`) exercent les **libellés / la dérivation / la rotation**, **pas** les polices →
  aucune régression.

## Statut

**TERMINÉE** — `SyncPill` Dynamic Type soldé (3/3 éléments inline → `relative`, a11y déjà en place). Ne plus
re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `SyncPill` — 3/3 éléments inline (libellé, compteur monospacedDigit, icône de statut) →
  `MeeshyFont.relative` ; aucun gel (capsule dimensionnée au contenu) ; a11y déjà en place (chip
  `children:.ignore` labellisé). **SOLDÉ 135i.**
