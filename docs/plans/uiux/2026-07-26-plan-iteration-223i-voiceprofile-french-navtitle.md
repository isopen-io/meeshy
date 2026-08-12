# Plan — Iteration 223i

**Date** : 2026-07-26
**Surface** : profil vocal (`VoiceProfileManageView`, `VoiceProfileWizardView`)
**Axes** : typographie française (langue SOURCE) · intégration plateforme (HIG)
**Base** : `main` HEAD `ccb4ad974` · Branche `claude/quirky-curie-2pvzn1`

## Pourquoi cette surface

Piste (b) du pointeur 221i (`addSamplesSheet` sans `navigationTitle`). L'audit
mené pour ce correctif a révélé un défaut plus lourd sur la même surface : ses
**17 chaînes françaises sont écrites sans accents**, alors que le français est la
**langue source** du catalogue — donc du texte expédié, pas une traduction en
attente.

Numéro 223i > 222i (#2362 en vol). `VoiceProfileManageView` absent de toute PR
ouverte → 0 collision.

## Objectifs

1. Rétablir les accents des 17 chaînes `fr`, **dans le catalogue ET dans les
   `defaultValue`** des sources (un `defaultValue` désaccordé est une seconde
   copie silencieuse de la chaîne).
2. Rendre son titre à la barre de navigation de `addSamplesSheet` : la barre est
   déjà visible pour le bouton « Fermer », seul son emplacement de titre est vide.

## Étapes

1. Catalogue : remplacer les 17 valeurs `fr` **et rien d'autre** (diff = lignes
   `"value"` uniquement).
2. Sources : aligner les `defaultValue` (2 fichiers, 3 clés partagées avec le
   wizard).
3. `addSamplesSheet` : `.navigationTitle` + `.navigationBarTitleDisplayMode(.inline)`,
   suppression du `Text` titre du corps.
4. `VoiceProfileFrenchTypographyTests` : catalogue accentué, `defaultValue`
   concordants, titre dans la barre et pas dans le corps.

## Non-objectifs

- Ne pas toucher aux autres locales, ni aux clés elles-mêmes.
- Ne pas étendre le balayage « français sans accents » aux autres surfaces dans
  cette itération — la liste complète mérite d'être traitée surface par surface.
- Ne pas toucher au SDK (`VoiceProfileWizardView` côté MeeshyUI reste hors
  périmètre ; seul le fichier app est modifié).
