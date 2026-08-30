# Plan — Iteration-251i : le point que VoiceOver lit à voix haute

**Date** : 2026-08-29 · **Piste** : iOS (`i`) · **Base** : `origin/main` `c14593da`
**Branche** : `claude/intelligent-noether-6zxsbz`
**Analyse** : `docs/analyses/uiux/2026-08-29-iteration-251i-decorative-separator.md`

---

## 1. Périmètre

| # | fichier | action |
|---|---|---|
| 1 | `Meeshy/Features/Main/Components/MetaSeparator.swift` | **neuf** — le point, muet par construction, sans paramètre |
| 2 | 14 fichiers d'app | 28 `Text("·")` → `MetaSeparator()` ; 8 `.accessibilityHidden` devenus redondants retirés |
| 3 | `Meeshy/Features/Main/Views/FeedPostCard.swift` | la paire de drapeaux de l'aperçu s'annonce en UNE phrase |
| 4 | `Meeshy/Features/Main/Components/LanguageFlagChip.swift` | `translationSummary(from:to:)` + `spokenName(for:)` (repli partagé avec `flag(for:)`) |
| 5 | `Meeshy/Localizable.xcstrings` | `a11y.language.translated_from`, 7 locales (3407 → 3408) |
| 6 | `MeeshyTests/Unit/Guards/MetaSeparatorSourceGuardTests.swift` | **neuf** — les deux graphies interdites + borne |
| 7 | `MeeshyTests/Unit/Components/LanguageFlagChipTests.swift` | 3 tests du résumé de traduction |
| 8 | `MeeshyTests/Unit/Lentille/LentilleRowSourceGuardTests.swift` | la garde voisine apprend le NOUVEAU nom (§ 3.4) |

Hors périmètre : `packages/MeeshySDK`, Android, web, gateway.

## 2. Ordre d'exécution

1. Solder d'abord le suivi de 250i **par la mesure** — la famille élargie est
   vide (2 candidats, 2 faux positifs). Un suivi se ferme aussi par la négative.
2. Chercher ce qui fuit ENCORE vers l'arbre d'accessibilité : le point médian,
   28 sites, 8 conformes.
3. Écrire le composant AVANT toute conversion, et **sans paramètre** — un
   `font:` optionnel poserait `.font(nil)`, qui n'hérite pas mais EFFACE.
4. Convertir par échange de jeton (aucun style touché), puis retirer les
   `.accessibilityHidden` redondants.
5. **Relire les gardes qui NOMMENT ce qui vient d'être renommé** — avant le
   push, pas après un rouge.
6. Rejouer les cinq compteurs (251i + les trois de 249i + celui de 250i) et les
   deux cliquets i18n sur les deux arbres.
7. Committer avec `run tests` dans le SUJET.

## 3. Décisions prises, et pourquoi

| décision | alternative écartée | raison |
|---|---|---|
| composant muet par construction | `.accessibilityHidden(true)` ×20 | solderait les 20 sites du jour et rien du 29ᵉ |
| aucun paramètre | `MetaSeparator(font:color:)` | `.font(nil)` efface la police au lieu d'hériter — 8 sites en auraient perdu leur style |
| convertir aussi les 8 sites CONFORMES | ne toucher que les 20 fautifs | une source unique n'en est une que si tout le monde y passe |
| paire de drapeaux : un élément nommé | la masquer entièrement | l'information (« traduit de X vers Y ») est réelle et utile ; la masquer la retirerait au lecteur non voyant |
| pas de `LanguageFlagChip` pour cette paire | réutiliser la puce | la puce est un CONTRÔLE ; ici rien n'est cliquable — annoncer un bouton serait mentir |
| garde bornée au point médian | y ajouter « • », « \| », tirets | aucun site ne les emploie : épingler une graphie qu'on n'écrit pas, c'est la leçon 272 à l'envers |

## 4. Critère de fin

- Compteur « séparateur écrit à la main » à **0** (28 sur `main`).
- Les quatre compteurs de 249i/250i restent à 0 ; catalogue reparsé, 0 orpheline,
  backlog non traduit inchangé.
- CI `iOS Tests` verte, **job `Build app + tests unitaires`**.

## 5. Risques

| risque | parade |
|---|---|
| une garde cherche l'ancienne graphie | `LentilleRowSourceGuardTests` relue et étendue AVANT le push (§ 3.4) |
| le style des 28 sites bouge | conversion par échange de jeton pur ; aucun modificateur touché ; diff relu site par site |
| modificateurs chaînés sur une `View` au lieu d'un `Text` | comportement documenté de SwiftUI (propagation par environnement) — doute assumé, publié au § 4.1 de l'analyse |
