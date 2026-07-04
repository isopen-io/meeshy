# Itération 134i — Analyse UI/UX iOS : `AchievementBadgeView`

**Date** : 2026-07-04
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/AchievementBadgeView.swift`
**Base** : `main` HEAD (`60fb2238`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`AchievementBadgeView` est la tuile de badge d'accomplissement (anneau de progression circulaire fixe
56×56 + icône centrale + nom + compteur `current/threshold`). Surface **fraîche** : 3
`.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **8 PR ouvertes au démarrage — toutes
gateway/web/affiliate** (#1429/#1428/#1427/#1426/#1425/#1424 gateway, #1423 web) → **aucune ne touche
iOS** → **0 contention**. Numéro **134i** (133i = `ReelRepostEmbedCell` mergé #1422).

## Constat (avant 134i)

**3 `.font(.system(size:))`** :
- icône d'accomplissement `Image(systemName: achievement.icon)` (22 semibold) — **bornée par l'anneau de
  progression circulaire de dimension fixe 56×56** ;
- nom `achievement.name` (11 bold) — **vrai libellé texte**, sans cadre fixe ;
- compteur `current/threshold` (9 medium rounded) — **vrai libellé texte**, sans cadre fixe.

## Corrections appliquées (1 fichier, 0 logique)

- Ajout de **`import MeeshyUI`** (absent — le fichier n'importait que SwiftUI/Combine/MeeshySDK) requis
  pour `MeeshyFont.relative`.
- **1/3 icône FIGÉE** + commentaire doctrine **86i** : bornée par le cercle de progression fixe 56×56 — un
  glyphe borné par une vignette circulaire de dimension fixe garde `.font(.system(size:))` (le scaler le
  ferait déborder du cercle qui, lui, ne grandit pas).
- **2/3 libellés texte → `MeeshyFont.relative(...)`** : nom (`relative(11, weight: .bold)`) et compteur
  (`relative(9, weight: .medium, design: .rounded)`) → ces **vrais textes** scalent désormais sous
  Dynamic Type.

Accessibilité déjà conforme → **intacte** : la tuile porte `.accessibilityElement(children: .combine)` +
un `.accessibilityLabel` complet (nom + verrouillé/déverrouillé + progression) → l'icône est déjà aplatie
(pas de `.accessibilityHidden` nécessaire). Palette (`Color(hex: achievement.color)`, `theme.textMuted`,
`surfaceGradient`) déjà conforme → non touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve (les libellés
  verrouillé/déverrouillé sont déjà `String(localized:)`).
- Aucun test ne référence `AchievementBadgeView` → aucune régression de test.

## Statut

**TERMINÉE** — `AchievementBadgeView` Dynamic Type + a11y soldé (2 textes → `relative`, 1 icône figée
commentée 86i, `import MeeshyUI` ajouté). Ne plus re-flagger l'icône figée (bornée par l'anneau fixe).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `AchievementBadgeView` — 2 libellés (nom, compteur) → `MeeshyFont.relative` ; 1 icône figée (bornée par
  l'anneau de progression fixe 56×56) commentée « doctrine 86i » ; `import MeeshyUI` ajouté ; a11y déjà en
  place (tuile `children:.combine` labellisée). **SOLDÉ 134i.**
