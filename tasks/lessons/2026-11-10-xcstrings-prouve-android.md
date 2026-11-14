## 2026-11-10 — Un lot iOS qui touche `Localizable.xcstrings` est AUSSI un lot Android : sa preuve inclut `android.yml` au SHA de tête (#17417, #17428, #17446)

Le lot « libellés des commandes » (#17428, issue #17417) ne touchait que des vues
SwiftUI et le catalogue `apps/ios/Meeshy/Localizable.xcstrings`. Sa preuve a été
faite comme celle d'un lot iOS : `ios.yml` (run 42843425299) et `sdk-tests.yml`
(run 42853523490) en `workflow_dispatch` au SHA de tête `d82047ae`, tous deux
verts. La PR a été fusionnée (merge `a118e41c`).

Or le catalogue iOS est la SOURCE des chaînes Android :
`apps/android/scripts/i18n/xcstrings_to_android.py` en régénère les fichiers
`strings_generated.xml`, et le job « Generated strings are up to date » d'`android.yml`
refuse un dépôt où ils dérivent. Le lot a donc régénéré, comme il le devait, sept
fichiers `apps/android/feature/calls/src/main/res/values*/strings_generated.xml` :
`call_action_minimize` est passé de « Minimize call » à « Minimize ». Le témoin
Compose `CallHeaderBarTest` cherchait encore `onNodeWithContentDescription("Minimize call")`.
Aucun run `android.yml` n'avait tourné sur la branche : sur la PR, la variable
`PR_CI_GEL` saute les jobs Android, et le « Verdict CI » vert ne disait rien d'eux.

`dev` est resté rouge sur `android.yml` pendant trois pushs (`414c9ac5`, `eec6c78f`,
`a9bdeb57`, runs 42892001157, 42894648934, 42898251727) jusqu'à la fusion de #17446,
qui a aligné le témoin sur le libellé « Réduire » de la planche ; le push suivant
(`98c8b970`, run 42898586169) est vert.

> **Un fichier a la plateforme de ses CONSOMMATEURS, pas celle de son répertoire.**
> `Localizable.xcstrings` vit sous `apps/ios`, mais il alimente Android par
> génération : un lot qui le modifie change des chaînes Android, donc des témoins
> Android peuvent tomber. Sa preuve est `ios.yml` + `sdk-tests.yml` **et**
> `android.yml`, tous trois en `workflow_dispatch` au SHA de tête, tous trois en
> `success` avant que la PR ne quitte le brouillon.

Le signal était dans le diff : sept fichiers `apps/android/…/strings_generated.xml`
dans la liste des fichiers d'une PR « iOS ». La question à poser avant d'ouvrir la
PR n'est pas « quelle plateforme ai-je codée ? » mais **« quels répertoires mon
diff touche-t-il, et quel workflow prouve chacun ? »** — `git diff --name-only
origin/dev...HEAD` y répond, et `android.yml` déclare lui-même, dans ses `paths`,
les six catalogues `.xcstrings` qui le déclenchent.

Corollaire : un libellé changé se cherche aussi dans les TÉMOINS des miroirs
(`grep -rn "<ancien libellé anglais>" apps/android apps/web`) — un test Compose
ou happy-dom qui cible un `contentDescription` / un `aria-label` par son texte
est un consommateur de la chaîne au même titre que la vue.
