## Leçon 297 — « Cette clé n'a plus de consommateur » est une affirmation sur le DÉPÔT, pas sur le répertoire qu'on édite (2026-08-27, itération 248i)

**Le fait.** 248i consolidait neuf tables « nature du média → étiquette » en une
seule source, côté iOS. Le catalogue de l'app portait DEUX familles de clés au
contenu strictement identique en sept locales — `attachment.label.*` et
`attachment.kind.*` — plus un `media.summary.audio` sans appelant apparent.
Une fois les neuf sites convertis, un `grep` sur `apps/ios/Meeshy*` rendait SIX
clés orphelines. J'ai écrit la suppression des six.

Le balayage de contrôle, lancé sur **tous** les `sourceRoots` que le cliquet
`LocalizationConsistencyTests` déclare — donc `packages/MeeshySDK/Sources`
inclus — a montré que **quatre d'entre elles sont lues par le SDK** :

```
packages/MeeshySDK/.../Models/AttachmentKind.swift      NSLocalizedString("attachment.kind.{video,audio,file}", …)
packages/MeeshySDK/.../Models/NotificationModels.swift  String(localized: "media.summary.audio", …)
```

Et elles les lisent **`bundle: .main`** — c'est-à-dire sur le catalogue de
l'**APP**, pas sur le leur. Quatre surfaces auraient rendu leur identifiant brut
(« attachment.kind.video » à l'écran), et
`test_everyAppCatalogIdentifierKeyIsReferencedInCode` aurait rougi au passage.

**La règle.** Un catalogue de localisation est une **ressource de bundle** : il
est lu par TOUT ce qui se lie à ce bundle, y compris depuis des cibles dont la
piste courante interdit de toucher le code. Avant de retirer une clé, chercher
son littéral sur **l'union des racines que le cliquet lui-même déclare**, jamais
sur le répertoire qu'on est en train d'éditer. Le périmètre d'une PISTE
(« iOS seulement », « pas le SDK ») borne ce qu'on a le droit de MODIFIER — il ne
borne pas ce qui LIT ce qu'on modifie.

Corollaire de forme, hérité de la règle du `CLAUDE.md` (« quand cette liste dit
*jumelles*, compter les clients avant de la croire ») : une suppression de
ressource est le seul type de changement où le nombre de consommateurs doit être
prouvé à ZÉRO, et non simplement « pas trouvé là où j'ai regardé ».

**Et la leçon jumelle, sur le cliquet lui-même.** Les dix-sept étiquettes gravées
qu'a soldées cette itération vivaient sous le nez de
`FrenchDefaultValueRatchetTests`, vert depuis 225i. Son extracteur ne lit que les
appels `String(localized:)` porteurs d'un `defaultValue` : **une chaîne française
qui n'est jamais devenue une clé ne franchit jamais son extracteur.** Un cliquet
vert prouve l'absence de la FORME qu'il inspecte, jamais l'absence du défaut — la
question à lui poser n'est pas « passe-t-il ? » mais « quelle écriture du même
défaut lui échappe ? ». Même forme qu'en 247i, où la garde de 241i était
contournée par une `private func`.

Sites : `apps/ios/Meeshy/Features/Main/Components/MediaKindLabel.swift` (la
source unique), `apps/ios/MeeshyTests/Unit/Guards/MediaLabelSourceGuardTests.swift`
(la garde de forme, qui nomme les copies SDK plutôt que de les taire),
`docs/analyses/uiux/2026-08-27-iteration-248i-media-kind-label.md` § 3.3.

**Addendum 248i — deux corollaires d'inventaire, mesurés par la CI du même lot.**

**(a) Un inventaire d'HÔTES suit l'hôte, il ne se raccourcit pas.** Ce lot a
supprimé `ComposerModels.formatDur` (son dernier appelant avait disparu) et
déplacé la composition de la durée dans `MediaKindLabel.voiceRecording(duration:)`.
`NumericAccessibilityValueGuardTests.test_convertedDurationHostsNameTheSingleSource`
a rougi : il exige que chacun des onze hôtes convertis par 247i NOMME
`LocalizedNumber`. Son message écrivait l'alternative en entier — « soit la
minuterie a disparu (mettre la liste à jour), soit la règle a été réécrite sur
place ». La minuterie avait DÉMÉNAGÉ : la liste suit l'hôte, onze entrées avant,
onze après. Retirer l'entrée au lieu de la remplacer aurait rendu la garde verte
d'un cran de couverture en moins — le mode d'échec silencieux que son propre
doc-comment décrit. Avant de supprimer un helper de formatage, chercher les
gardes qui **nomment son fichier**, pas seulement celles qui testent son
comportement.

**(b) Sur ce dépôt, un check iOS vert sur une PR ne prouve QUE la compile, sauf
si son NOM dit le contraire.** Le premier run de la PR affichait
`Build app (app + cibles de test)`, vert — le nom que `.github/workflows/ios.yml:250`
donne au job quand `scope.run_tests` est faux. La suite ne tourne, sur une
branche ou une PR, que si le SUJET du commit de tête porte `smoke test`,
`run test` ou `to test`, ou sur `workflow_dispatch`. Quinze checks verts, dont
un dont le nom commence par les trois mêmes mots que le vrai gate, ne disaient
rien des deux suites neuves du lot. C'est la leçon 240i (c) qui se referme une
fois de plus : **le nom du check n'est pas décoratif, il EST le discriminant.**
Corollaire opérationnel : mettre le mot-clé dans le sujet du commit qui LIVRE —
et se souvenir du piège que le workflow documente lui-même, qu'un commit de docs
poussé par-dessus remplace silencieusement le run demandé par une compile.
