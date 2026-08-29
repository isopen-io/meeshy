# Plan — Iteration-249i : la puce de langue se dessine à UN endroit

**Date** : 2026-08-29 · **Piste** : iOS (`i`) · **Base** : `origin/main` `b1eeb470`
**Branche** : `claude/intelligent-noether-6zxsbz`
**Analyse** : `docs/analyses/uiux/2026-08-29-iteration-249i-language-flag-chip.md`

---

## 1. Périmètre

| # | fichier | action |
|---|---|---|
| 1 | `Meeshy/Features/Main/Components/LanguageFlagChip.swift` | **neuf** — `LanguageFlagChip` + `TranslationsBadge` |
| 2 | `Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift` | `footerFlagPill` → puce `.compact` |
| 3 | `Meeshy/Features/Main/Views/FeedPostCard.swift` | rangée méta → puce `.standard` + badge actif ; haptique retirée de `handleFlagTap` |
| 4 | `Meeshy/Features/Main/Views/PostDetailView.swift` | rangée de la publication ET du repartage ; badge actif / décoratif |
| 5 | `Meeshy/Features/Main/Views/FeedCommentsSheet.swift` | deux puces + badge décoratif |
| 6 | `Meeshy/Features/Main/Views/StoryViewerView+Content.swift` | `languageSwitcher` → deux puces `.overlay` ; helper `languageFlag` supprimé |
| 7 | `Meeshy/Features/Main/Views/ReelsPlayerView.swift` | puce `.overlay` |
| 8 | `Meeshy/Localizable.xcstrings` | 2 renommages, 3 suppressions (3409 → 3406) |
| 9 | `MeeshyTests/Unit/Components/LanguageFlagChipTests.swift` | **neuf** — vocabulaire, replis, cibles |
| 10 | `MeeshyTests/Unit/Guards/LanguageFlagChipSourceGuardTests.swift` | **neuf** — 3 règles de forme + 2 bornes |
| 11 | `MeeshyTests/Unit/Views/BubbleFooterAccessibilityTests.swift` | la garde SUIT son hôte (délégation + annonce) |

Hors périmètre par règle de piste : `packages/MeeshySDK` (`LanguageDisplay`,
`meeshyTapTarget`, `MeeshyFont` restent inchangés), Android, web, gateway.

## 2. Ordre d'exécution

1. Mesurer la famille sur `origin/main` (3 compteurs, cf. § 4 de l'analyse).
2. Écrire la source unique, registres inclus, AVANT toute conversion — pour que
   chaque conversion soit une SUPPRESSION, jamais une réécriture.
3. Convertir les huit copies, la plus riche en dernier (`BubbleFooter`, la seule
   dont le comportement gestuel est contraint par son hôte).
4. Éditer le catalogue **textuellement** (un `json.dump` réordonnerait 3406
   entrées) puis relire par `JSONSerialization`.
5. Rejouer les 3 compteurs + les 2 cliquets i18n sur la branche.
6. Committer avec `run tests` dans le SUJET — sans quoi le job iOS de la PR
   s'appelle `Build app (…)` et ne prouve que la compile.

## 3. Décisions prises, et pourquoi

| décision | alternative écartée | raison |
|---|---|---|
| `Button` natif | réordonner `contentShape` avant `onTapGesture` | supprime la question d'ordre au lieu d'y répondre ; apporte traits, clavier complet, pointeur iPad |
| 3 registres de cible (44 / 32 / 22) | une seule valeur | 44 partout grandirait chaque bulle traduite et prendrait 44 pt au tap de lecture d'un reel ; 22 partout renoncerait à la HIG là où la rangée peut l'héberger |
| cadre réel | `padding` négatif pour élargir sans coûter de place | zones sensibles voisines qui se CHEVAUCHENT — une frappe imprécise servirait la MAUVAISE langue |
| haptique dans la puce | la laisser aux six fermetures appelantes | une puce vibre à l'appui, toujours ; six sites → un |
| clés renommées `a11y.language.*` | garder `a11y.post.*` pour tous | une clé au nom d'un écran ne se réutilise pas sans mentir (doctrine 248i) |
| pas d'`accessibilityElement(children: .ignore)` | le garder « par sécurité » | un `Button` est déjà un élément unique ; le reconstruire peut lui coûter son trait |

## 4. Critère de fin

- Les 3 compteurs à **0** sur la branche (8 / 8 / 4 sur `main`).
- Catalogue reparsé, 0 clé orpheline, backlog non traduit en baisse.
- CI `iOS Tests` verte, **job `Build app + tests unitaires`** — le nom relu avant
  la couleur.

## 5. Risques

| risque | parade |
|---|---|
| la rangée méta du fil déborde en Dynamic Type XXL | suivi § 7.1 de l'analyse ; le remède est le passage à la ligne, pas la réduction de cible |
| `BubbleFooter` est une cellule de liste (perf) | la puce est une `struct` à entrées `let` + fermeture, sans `@ObservedObject` sur un singleton — contrat « Zero Unnecessary Re-render » préservé |
| trois doutes de compile | publiés au § 4.1 de l'analyse, à solder au retour de CI |
