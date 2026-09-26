## Leçon 568 — Une extraction a DEUX moitiés, et le doc-comment n'en énonce qu'une

2026-09-11, iOS (#6040). `FixedFontSizeGuardTests.bearingFiles` porte en tête
la règle : « toute extraction hors d'un fichier de la liste doit inscrire sa
DESTINATION dans le MÊME commit ». Je l'ai lue, citée au porteur comme le
piège que je m'apprêtais à éviter — et je l'ai appliquée à moitié : la feuille
extraite est entrée dans la liste, le fichier VIDÉ y est resté.

Sa règle 4 (`test_unFichierQuiQuitteLaListeEnEstRetire`) a rougi, avec le
message exact : « ces fichiers n'ont plus aucune taille figée — les RETIRER ».

> **Une liste de fichiers porteurs a deux modes de panne symétriques** : elle
> perd une surface (la destination manquante) ou elle garde un nom sans site
> (la source vidée). Le doc-comment d'en-tête n'énonce que le premier, parce
> qu'il a été écrit le jour où le premier a mordu. Le second vit dans le
> message d'échec de la règle qui l'attrape — c'est-à-dire là où on ne le lit
> qu'APRÈS.

Et une relocalisation n'est pas une disparition : la population ne bouge pas,
donc **ni `totalCeiling` ni `textCeiling` ne baissent** — seul le NOM change.
Le fichier documentait déjà ce cas trois fois (#4014, #4084, #4102) sous le
terme « RELOCALISATION pure ». La règle était écrite, datée, et exemplifiée ;
ce qui manquait n'était pas la connaissance mais la LECTURE des deux sens.

Applicable à toute liste tenue à la main dont les entrées sont des chemins :
`bearingFiles`, `legacyOverBudget`, `moodComposerFiles`, `fullyLocalizedScreens`
— à chaque déménagement, se demander les DEUX questions, pas la première.
