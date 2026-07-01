# Itération 92i — Fix artefact de merge `AffiliateView` (VoiceOver dédup)

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`)
**Surface** : `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift` — helper `affiliateStatCard`
**Type** : Correctif (nettoyage modificateur dupliqué)
**Base** : `main` HEAD (`8aea0e4e`, post-merge #1234)

## Contexte / cause racine

L'itération **91i** (PR #1234, `AffiliateView` Dynamic Type + VoiceOver) et une itération
**parallèle** d'un autre agent touchant le **même fichier** ont mergé dans `main` à quelques minutes
d'intervalle. Le merge automatique (sans conflit textuel car les hunks ne se chevauchaient pas
ligne à ligne) a **combiné les deux ajouts** de `.accessibilityElement(children: .combine)` sur la
carte de stat :

- une occurrence après `.padding(.vertical, 14)` (avant `.background`) ;
- une occurrence après `.background(...)`.

→ **modificateur `.accessibilityElement(children: .combine)` dupliqué** sur `affiliateStatCard`
(lignes 127 et 136 de `main`). Comportement runtime inoffensif (SwiftUI ne garde que l'englobant)
mais **code mort / incohérent** — exactement le type de « mauvais agencement » que la routine doit
détecter et solder.

## Diagnostic

- 1 seul défaut réel : double `.accessibilityElement(children: .combine)` sur la carte de stat.
- Le reste des traits combinés du fichier (méta de token, en-tête de section) est **unique** — pas
  d'autre duplication (vérifié : scan `awk` des modificateurs adjacents identiques = 0 hit).
- Les `.accessibilityHidden(true)` sur les glyphes d'icône (stat + section) proviennent de
  l'itération parallèle et sont **corrects** (glyphes décoratifs appariés à un texte) → conservés.

## Correction appliquée

Suppression de l'occurrence **interne** (avant `.background`), conservation de l'unique
`.accessibilityElement(children: .combine)` appliquée à la carte **entièrement décorée** (après
`.background`) — forme idiomatique unique qui groupe icône + valeur + libellé en un seul élément
VoiceOver.

## Portée & vérification
- **1 fichier de production**, suppression d'1 ligne (dé-duplication pure).
- **0 logique modifiée, 0 clé i18n, 0 test neuf.**
- Scan de contrôle post-fix : aucun modificateur d'accessibilité dupliqué résiduel.
- Gate = CI `iOS Tests` (SwiftUI ne compile pas sous Linux).

## Leçon (anti-collision multi-agents)
Quand **deux agents touchent le même fichier** en parallèle et mergent tous deux, un auto-merge
« propre » (sans marqueur de conflit) peut néanmoins produire des **modificateurs SwiftUI
dupliqués** si chacun ajoute la même chaîne à un endroit différent de la même vue. Après merge d'une
surface prise en parallèle, **re-scanner le fichier** pour modificateurs adjacents/redondants.
`AffiliateView` est désormais **soldé** (91i typo/VoiceOver + 92i dé-dup) — ne plus re-flagger.
