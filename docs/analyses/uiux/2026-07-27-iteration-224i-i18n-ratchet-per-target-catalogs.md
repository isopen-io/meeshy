# Iteration-224i — Le ratchet i18n résout chaque clé contre le catalogue de SON target

**Date :** 2026-07-27 · **Piste :** iOS UI/UX (suffixe `i`) · **Domaine :** Localisation (outillage)
**Fichier :** `apps/ios/MeeshyTests/Unit/LocalizationConsistencyTests.swift`
**Base :** `main` HEAD `f8ddff95` — **portage manuel sur la structure 225i**, à la demande de la revue.

## Le défaut

Le balayage de 220i vérifie les sources de **tous** les targets iOS contre
`apps/ios/Meeshy/Localizable.xcstrings` — le catalogue de l'**app**.

C'est faux pour une extension. Une extension d'application est un **bundle
séparé** : un `String(localized:)` dans ses sources résout contre **son**
`Localizable.xcstrings`, jamais celui de l'app hôte. Une clé parfaitement
traduite dans le catalogue qui l'accompagne était donc comptée comme non
traduite dès que son target avait son propre catalogue — c'est-à-dire au moment
précis où quelqu'un faisait le travail correctement.

## Le correctif

`CatalogIndex` porte, **par catalogue** : les traductions, les locales requises
(locales expédiées moins **sa propre** `sourceLanguage`), la langue source et
les valeurs sources. `Environment.catalog(resolvedFor:)` résout un fichier vers
le catalogue de son bundle ; à défaut, celui de l'app.

Les **trois** tests qui consultent des traductions passent par ce résolveur :
`fullyLocalizedScreens`, la parité `defaultValue`↔source (225i) et le backlog.
La parité en bénéficie doublement : elle comparait à la langue source de l'app
(`fr`) même pour un écran d'extension, dont la source est `en`.

`untranslatableKeys` (225i) est **conservé tel quel**.

## Le plafond : re-mesuré, inchangé à 1 606

La revue l'exigeait, et à raison — la sémantique de comptage change dès qu'un
target résout contre son propre catalogue, donc le nombre ne peut pas être
déduit.

**Mesure : 1 606 avant, 1 606 après.** Le delta est nul, et la raison est
instructive : les 5 clés du share extension (`share.cancel`, `share.send`,
`share.title`, `share.sendTo`, `share.searchContacts`) sont **actuellement
dupliquées dans le catalogue de l'app**, traduites dans les 7 locales des deux
côtés. Elles étaient donc déjà comptées comme traduites par l'ancien modèle.

Cette duplication est le **symptôme** du défaut corrigé ici : les clés ont été
ajoutées au catalogue de l'app pour satisfaire un contrôle qui regardait au
mauvais endroit, alors que l'app ne les lit jamais — seule l'extension les
demande. Le correctif rend la duplication inutile ; **la retirer est un
nettoyage distinct**, laissé hors de ce portage (voir Reste à faire).

## Vérification

Méthode : portage fidèle du scanner Swift hors Xcode (pas de toolchain macOS
sur l'environnement d'exécution), **validé d'abord contre un nombre connu** —
il reproduit le 1 606 épinglé par 225i sur `main` **exactement**, ce qui établit
que le port et le scanner Swift comptent la même chose avant toute mesure neuve.

| Contrôle | Résultat |
|---|---|
| Port reproduit le 1 606 de `main` | **exact** ✅ (validation du port) |
| Backlog, résolution par target | **1 606** ✅ (plafond inchangé) |
| `fullyLocalizedScreens` × 2 écrans | propres ✅ |
| Parité `defaultValue` ↔ source × 2 écrans | propres ✅ |
| Références résiduelles aux champs supprimés | **aucune** ✅ |
| Équilibrage accolades/parenthèses/crochets | 0/0/0 ✅ |

**Piège d'isolation, déjà payé une fois en CI :** la suite est `@MainActor`,
mais `Environment` est un type **imbriqué**, qui **n'hérite pas** de l'acteur
global de son englobant — un `static` déclaré sur la suite serait donc illisible
depuis `catalog(resolvedFor:)`, nonisolated. La table vit dans `Environment`.

## Portée

1 fichier de test. 0 source de production, 0 clé i18n, 0 logique, 0 visuel.

## Reste à faire

1. **Retirer les 5 clés `share.*` dupliquées du catalogue de l'app.** L'app ne
   les lit jamais ; seule l'extension les demande, et elle a les siennes. À
   traiter comme un nettoyage à part — et à vérifier contre
   `test_everyAppCatalogIdentifierKeyIsReferencedInCode`, qui les voit
   référencées dans les sources de l'extension et les considère donc vivantes.
2. **Résorber le backlog de 1 606 clés**, écran par écran, en descendant le
   plafond et en alimentant `fullyLocalizedScreens`.

## Leçon

Un garde outillé qui traverse plusieurs targets doit résoudre **par bundle**.
Dès qu'une assertion agrège des cibles aux frontières de ressources distinctes,
elle doit porter la frontière dans son modèle — sinon elle produit un faux
positif le jour où une cible gagne sa propre ressource, et pousse à contourner
le symptôme (ici : dupliquer les clés) plutôt qu'à corriger le modèle.
