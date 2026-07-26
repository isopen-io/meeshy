# Plan — Itération 221i : localiser `MeeshyShareExtension`

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-221i-shareextension-localization.md`
**Base** : `main` HEAD `16f8197` · **Branche** : `claude/quirky-curie-52be0w`

## Objectif

Solder la piste n° 4 de 220i. Le diagnostic hérité (« 3 chaînes crues ») s'est
révélé incomplet : la cible ne livrait **aucun** catalogue, donc ses 5 appels
`String(localized:)` préexistants retombaient eux aussi sur leur `defaultValue`
anglais. La feuille de partage était anglophone dans les 7 locales.

## Étapes

- [x] Rebaser la branche de travail sur `origin/main` (`16f8197`) — 220i replacée
      au-dessus, sans conflit.
- [x] Confirmer que le frein de la piste (#2319) est mergé.
- [x] Inventorier la surface : 5 `String(localized:)` sans catalogue + 3
      littéraux crus (`Button("Cancel")`, `Button("Send")`,
      `.navigationTitle("Share to Meeshy")`).
- [x] Établir le précédent de câblage : `MeeshyNotificationExtension` porte son
      `Localizable.xcstrings` via le seul globbing récursif `sources:` →
      **0 édition de `project.yml`**.
- [x] Établir la liste de locales autoritaire : `Meeshy/Info.plist`
      `CFBundleLocalizations` = `fr, en, de, es, pt-BR, it, ar` (7).
- [x] Vérifier que `knownRegions` du projet couvre les 7 locales.
- [x] `ShareViewController.swift` : router les 3 littéraux vers
      `String(localized:defaultValue:)` dans le namespace `share.*`.
- [x] Créer `MeeshyShareExtension/Localizable.xcstrings` (8 clés × 7 locales,
      toutes `translated`), en **copiant verbatim** les valeurs déjà relues du
      catalogue de l'app pour 6 clés sur 8.
- [x] `MeeshyShareExtension/Info.plist` : `CFBundleLocalizations` += `it`, `ar`.
- [x] Ajouter `ShareExtensionLocalizationTests` (4 invariants, balayage sur
      disque façon `NavigationContainerMigrationTests`).
- [x] Simuler les 4 assertions hors Xcode contre les fichiers réels → toutes
      vertes (8/8 clés, 0 orpheline, 0 problème de locale, 0 littéral restant).
- [x] Rédiger l'analyse et ce plan.
- [x] Committer et pousser sur `claude/quirky-curie-52be0w`.

## Contraintes respectées

- 0 logique métier, 0 réseau, 0 layout, 0 palette, 0 changement de comportement.
- Anglais strictement inchangé (les `defaultValue` sont conservés mot pour mot).
- 0 édition de `project.yml` et de `project.pbxproj` (globbing récursif des deux
  cibles concernées ; la CI lance `xcodegen generate`).
- Aucune traduction inventée là où une valeur relue existait (6 clés sur 8
  copiées verbatim).

## Hors périmètre — assumé et documenté

`ContactPreview.sampleContacts` (« John Doe », « Jane Smith », « Bob Johnson »)
s'affiche en **production** au premier lancement, via le fallback de
`loadRecentContacts()`. C'est le défaut le plus grave de la surface, mais le
remède est un changement de comportement (état vide) qui exige son propre
arbitrage produit. Consigné en tête de la piste 222i+.

## Gate

CI `iOS Tests` (compile Xcode 26.1.1 / run simu iOS 18.2). Aucun toolchain Apple
dans l'environnement d'exécution : la validation locale se limite à la
vérification statique décrite ci-dessus.
