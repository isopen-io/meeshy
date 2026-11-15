## Leçon 560 — Un lot qui RENOMME rend ANTI-CORRÉLÉ tout garde qui reconnaissait par le nom

`apps/web/__tests__/public/sw.v3-zone.test.ts` gardait la frontière entre le
service worker du legacy et la zone `/__v3/` d'une seconde application servie
sur la même origine. Il reconnaissait le legacy par son NOM D'IMAGE :

```js
const IMAGE_DU_LEGACY = /^\s*image:.*isopen\/meeshy-(?:frontend|web):/m;
```

Son doc-comment était juste, explicite, et anticipait déjà un piège voisin :
« On lit l'IMAGE et non le nom du service : `frontend-staging` a gardé son nom
en changeant d'occupant, donc le nom ne dit plus qui est là. »

#5882 a fait exactement ce que ce raisonnement n'avait pas prévu, un cran plus
loin : donner le nom d'image du LEGACY à la v3.1 qui le remplace. Le
discriminant n'est pas devenu imprécis — il est devenu **anti-corrélé** : sur
un staging qui sert la v3.1, il déclarait le legacy PRÉSENT, et exigeait donc
là-bas un routeur de zone que la directive du 2026-09-07 avait précisément
supprimé. Il aurait fait rougir la conformité et passer la non-conformité.

> **Un garde qui reconnaît une chose par son NOM tombe le jour où un lot déplace
> le nom.** Et il ne tombe pas en s'éteignant — il continue de rendre un verdict,
> à l'envers. C'est pire qu'un garde muet : un garde muet se remarque au premier
> vert suspect, un garde inversé se croit.

CE QUI SAUVE, ET COMMENT ON LE TROUVE. Le témoin portait sa propre réponse dans
la phrase qui justifiait son existence : « sa juridiction sur la zone v3 suppose
DEUX occupants de la même origine ». Le discriminant juste n'était donc pas
« quelle image est là ? » mais **« combien de routeurs revendiquent cet hôte ? »**
— une propriété STRUCTURELLE, que renommer une image ne touche pas :

```js
const partagees = originesPartagees(compose);   // hôtes réclamés par ≥ 2 routeurs
if (partagees.size === 0) return [];            // pas deux occupants ⇒ rien à garder
```

**La raison d'être d'un garde, écrite dans son doc-comment, est en général un
meilleur discriminant que celui qu'il utilise** — parce qu'elle nomme le
mécanisme, pendant que le code nomme un indice observable de ce mécanisme. Quand
un lot casse l'indice, relire la raison d'être avant de bricoler l'indice.

COROLLAIRE — LA NON-VACUITÉ A UN TROISIÈME ÉTAT. Le même fichier gardait
`expect(chemins.length).toBeGreaterThan(0)` : le refus de sortir vert sans avoir
rien éprouvé. Le sujet ayant disparu (plus aucune origine partagée nulle part),
cette assertion tombait sur du CONFORME. Le retirer aurait rendu le témoin muet
pour toujours ; le garder aurait interdit un état légitime. La sortie est un
troisième état qui **assère la raison de son vide** — et qui rougit encore si
une origine redevient partagée sans que le témoin en tire un chemin.

DEUX AUTRES FORMES DU MÊME DÉFAUT, DANS LE MÊME LOT — les sondes de self-test
de `check-ci-summary-coverage.mjs` et `check-ci-build-order.mjs` mutaient des
jobs supprimés (`lifecycle-v3, chaines-v3,`, `a11y-v3`). Une sonde dont la cible
a disparu ne mute RIEN : `String.replace` d'un motif absent rend la chaîne
intacte, le garde ne voit aucune violation, et la sonde **sort verte**. L'une
des deux l'a dit (« la mutation n'a RIEN changé — elle ne prouve rien ») parce
que son auteur avait prévu le cas ; l'autre a JETÉ (« job introuvable »), ce qui
est mieux. Les deux se réancrent sur une cible vivante — jamais on ne retire la
sonde.

> **Après tout lot qui supprime, renomme ou déplace : chercher les gardes dont
> l'ANCRE textuelle visait ce qui vient de bouger.** `grep` le nom disparu dans
> TOUT le dépôt est de trente secondes ; un garde inversé vit des mois. Le lot
> qui déplace est le seul moment où l'on sait quoi chercher.

QUATRIÈME OCCURRENCE, ET ELLE CORRIGE LA CONSIGNE CI-DESSUS. J'avais écrit
« grep dans `scripts/` et `__tests__/` » — deux endroits choisis parce que c'est
là que VIVAIENT les trois premiers. La CI en a rendu un quatrième depuis
`services/gateway/src/__tests__/security/claude-md-paths-exist-guard.test.ts` :
un cliquet qui compte les chemins cités par les `CLAUDE.md` et qui n'existent
pas, dette déclarée **7**, mesurée **8**.

Le huitième était `scripts/v3-rapport.mjs` — **le fichier que le lot supprimait,
cité dans la phrase du `CLAUDE.md` qui annonçait sa suppression.** Écrire « son
agrégateur `scripts/v3-rapport.mjs` est parti avec elle » apprend au lecteur un
chemin mort ; le garde a raison, et la phrase se dit sans le chemin (« son
agrégateur des sept mesures »).

> **Un document qui ANNONCE une suppression est le premier endroit où un chemin
> mort apparaît** — on nomme ce qu'on retire, au présent, dans le même geste. Et
> le garde qui l'attrape n'est pas dans le territoire du lot : il est chez le
> service qui a écrit le cliquet, ici le gateway. La consigne juste est donc
> « grep le nom disparu dans TOUT le dépôt », sans présumer d'où un garde
> surveille — un garde de DOCUMENT peut vivre à côté d'un service qui n'a
> aucun rapport avec le document.
