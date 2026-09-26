## Un groupe que sa relecture n'a pas vu n'est pas livrable, même poussé « en jalon » (2026-09-26, #7945)

Pendant la passe d'application du lot 6, un jalon a été commité puis poussé
sur la branche de la PR (fafd48f2) pour « protéger le travail » : 31 groupes de
constats appliqués, 189 constats. Aucun n'avait été relu. Le workflow
enchaînait pourtant « appliquer → relire → corriger » en `pipeline()`, mais
avec deux agents concurrents le planificateur a exécuté les 69 applications
AVANT la première relecture. Le porteur a fusionné la PR après avoir corrigé à
la main quatre ruptures : une erreur de compilation (`MeeshySDK.TranscriptionSegment`
écrit dans l'app, alors que l'enum `MeeshySDK` masque le module), deux gardes
de source (un compte de `requestDeleteMessage(`, un `location: pendingPlace`)
et le cliquet de `FileSizeBudgetGuardTests` (un fichier repassé sous le
budget doit quitter la liste). Trois de ces ruptures dormaient dans des groupes
dont la relecture n'avait jamais tourné. La quatrième avait été relevée par sa
relecture, mais l'agent correcteur était mort sur la limite d'usage.

> **Un jalon poussé sur la tête d'une PR est une livraison : le porteur peut
> la fusionner.** N'y pousser que des groupes dont la relecture adverse ET les
> corrections sont terminées. Pour protéger un travail en cours, commiter en
> local ou sur une référence hors PR, jamais sur la tête de la PR.

Deux vérifications qui l'auraient évité :

1. **Lire l'ordre réel des étapes, pas l'ordre écrit.** Un `pipeline()` sous
   plafond de concurrence peut vider l'étape 1 avant d'entamer l'étape 2 :
   compter, dans le journal, les résultats par étiquette (`appliquer:` contre
   `relire:`) avant de considérer un groupe comme relu.
2. **Un rapport d'échec d'agent est une case vide, pas un « ok ».** La sortie
   finale du workflow listait les 26 échecs ; seul un tableau groupe par groupe
   (appliqué / relu / corrigé) rend visibles les groupes à retenir.
