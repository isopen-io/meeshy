## Une énumération de CONSOMMATEURS corrigée reste une énumération — et celle qui raconte sa propre erreur passée est la plus crédible de toutes

*2026-11-15, #18602 / #18601 (cycle 168). Mesure : la passerelle estampille le
curseur `_seq` sur UN événement ; iOS et Android l'observent ; `apps/web`
n'observe rien, et quatre doc-comments affirmaient le contraire.*

### Ce qui s'est passé

`emitWithSeq` écrit un curseur monotone par compte, et la règle qui le rend sûr
est écrite dans son doc-comment : un client qui n'observe qu'un sous-ensemble
des événements estampillés **voit un trou à chaque événement non observé**. La
règle est juste. Elle nommait ses porteurs : « sur les TROIS clients qui la
portent : iOS …, web (`observeSyncSeq`, `notification-socketio.singleton`) et
Android … ».

Ce fichier appartenait à l'application web LEGACY, sortie du dépôt au #7668. Le
web n'observe aucun curseur. Trois autres sites recopiaient l'affirmation,
dont `MessageSocketManager.kt` — « observer le `_seq` AVANT de livrer l'event,
**comme le web** » — et le contrat partagé lui-même.

### Le point qui mérite d'être retenu

Le quatrième site, `packages/shared/types/socketio-events/notification.ts`,
**racontait sa propre erreur passée** :

> Ce paragraphe a dit « les trois le lisent » pendant que **Android le jetait** :
> son décodeur déposait le champ, et la preuve citée n'assertait rien sur
> `_seq`. Une citation n'est pas une mesure.

Il avait raison sur le mécanisme, il l'avait écrit, il l'avait daté — et il
était faux **au moment où je l'ai lu**, sur une autre plateforme. Le cycle 108
avait corrigé la ligne ; il n'avait rien donné au paragraphe pour rester vrai.

> **Corriger une énumération ne lui donne aucun moyen de le rester.** Et le récit
> de sa faute passée la rend PLUS crédible, pas moins : il se lit comme la preuve
> que quelqu'un a déjà vérifié. C'est la leçon 261 (« une énumération porte deux
> affirmations, dont une n'est presque jamais vérifiée ») poussée d'un cran — ici
> l'énumération portait une TROISIÈME affirmation, implicite et fausse : *celle-ci
> a été instruite, tu peux t'y fier.*

### La règle que j'en tire

Devant une énumération de consommateurs, de porteurs ou de miroirs :

1. **La mesurer, toujours** — y compris, et surtout, quand elle documente sa
   propre correction antérieure. Un paragraphe qui a eu tort une fois est un
   paragraphe dont personne n'a réparé le MÉCANISME.
2. **Ne pas la corriger sur place comme livrable.** Une liste juste aujourd'hui
   est une liste qui dérivera : le seul correctif durable est de sortir l'état de
   la prose et de le faire dériver des sources par un cliquet, la prose ne gardant
   que la RÈGLE et l'adresse où l'état se lit.
3. **Chercher les recopies.** Une affirmation fausse se propage par citation :
   celle-ci avait quatre exemplaires, et le plus dangereux (`comme le web`)
   n'était ni dans le fichier d'origine ni sur la même plateforme.

### Le piège suivant, mesuré sur ma propre garde

Le cliquet que j'ai écrit pour porter la règle a d'abord mesuré l'inventaire
« cette plateforme n'observe aucun curseur » sur le relevé **LIÉ** (occurrences
rattachées à une route). Sous cette forme, ajouter un observateur au web
laissait le témoin **VERT** : l'occurrence neuve n'était liée à aucune route,
donc invisible. Le second sens du cliquet ne pouvait pas tomber dans le sens
qu'il nommait.

> **Une affirmation d'ABSENCE se mesure sur les OCCURRENCES, jamais sur le relevé
> enrichi** — l'enrichissement a le droit d'échouer, et chaque échec se lit
> comme une absence. Même famille que « un témoin qui ne peut pas tomber n'est
> pas un témoin », trouvée en exécutant les six mutations au lieu de quatre.
