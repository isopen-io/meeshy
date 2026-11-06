## Chaque écriture de « Mes stickers » atteint les autres appareils du compte

**Date** : 2026-11-06 · **Issue** : #16515 (suite LIVE de #4720) · **Milestone** : « Les stickers d'un compte le suivent d'un appareil à l'autre »

### Contexte

`UserSticker` (#7938) est une table **par utilisateur**. Son écrivain unique,
`services/stickers/StickerLibrary.ts`, a quatre chemins d'écriture : création,
remontée d'une image déjà connue (dédoublonnage par empreinte SHA-256),
remontée au départ d'un message (`POST /me/stickers/:id/use`), retrait.

**Aucun ne diffusait.** Il n'existait aucun événement `sticker:*` dans
`packages/shared/types/socketio-events`, et ni le service ni la route
n'importaient `broadcastToUser`.

Les trois clients tiennent pourtant la liste en cache, et le web avec une
péremption de cinq minutes dont la justification écrite était :

> « aucune autre personne ne la modifie — l'écran l'écrit au geste (création,
> retrait), le réseau confirme »

Vraie d'une autre **personne**, fausse d'un autre **appareil**.

Deux voisines immédiates portaient déjà l'obligation : l'étagère de packs
(`pack:installation-updated`, #10148) et le décor de profil
(`profile:decor-updated`, #10632). Le défaut n'était pas caché — il était
voisin, et il n'appartenait pas à la phrase du lot qui avait fermé les autres.

### Décision

**1. Un événement NEUF, `sticker:library-updated`, sur `user:<id>`.** Pas un
élargissement d'un événement existant : un décodeur client strict fait échouer
le décodage de l'événement ENTIER sur un membre qu'il ne connaît pas, et
l'élargissement coûte alors plus cher que le nom neuf. Un ancien client ne
l'écoute pas, et rien ne change pour lui.

**2. Sa charge est une union DISCRIMINÉE, et elle nomme ce qui a été ÉCRIT.**
`added` et `promoted` portent la définition servie — c'est elle qui porte le
`lastUsedAt` neuf dont dépend l'ORDRE de la grille ; `removed` ne porte qu'un
identifiant, la ligne n'existant plus. Un objet plat à champs optionnels ne
peut pas dire la troisième forme.

`added` et `promoted` sont distingués parce que le serveur SAIT lequel des deux
il a fait. Les deux se posent sur un cache par la même opération (« ce sticker
passe en tête, en remplaçant toute entrée de même id ») ; la distinction sert le
diagnostic, pas la réconciliation.

**3. L'obligation vit chez l'écrivain ; le transport est injecté.**
`StickerLibrary` reçoit un `announce` (`StickerLibraryAnnounce`) et l'appelle
après chaque écriture **réelle** — jamais pour un identifiant inconnu ni le
sticker d'autrui, un « rien n'a changé » diffusé enverrait les autres appareils
réconcilier un non-événement. Le service reste sans Fastify et sans Socket.IO ;
`services/stickers/stickerLibraryAnnounce.ts` porte le transport
(`broadcastToUser`, porte typée). C'est la forme de
`personalMessageVisibilitySync` : un cinquième chemin d'écriture ne peut plus
honorer la persistance sans la diffusion.

**4. La diffusion est un canal LATÉRAL, et le `try` est au site d'appel.** Une
écriture qui a eu lieu ne se rapporte jamais comme un échec — l'utilisateur
rejouerait un geste qui a déjà pris effet. `broadcastToUser` avale déjà ses
erreurs, mais c'est une propriété du collaborateur, pas une garantie du site
d'appel.

**5. Le web APPLIQUE la charge, il n'invalide pas.** Un `invalidateQueries`
relancerait le réseau pour apprendre ce que la charge dit déjà, et ferait
clignoter une grille que l'utilisateur regarde. Et la liste n'est touchée que
si elle existe déjà : sans liste en cache il n'y a rien à réconcilier, et la
poser depuis un seul événement servirait une bibliothèque d'un sticker à un
écran qui n'a jamais lu la vraie.

### Alternatives rejetées

- **Un `sticker:library-invalidated` sans charge.** Un aller-retour réseau par
  geste, et un clignotement — alors que la charge suffit, ce qu'Android écrit
  déjà pour `pack:installation-updated`.
- **Ne pas diffuser la remontée (`promoted`).** L'ordre de la grille EST
  `lastUsedAt desc` : sans elle le second appareil garde un ordre faux dès le
  premier envoi, et le symptôme ne ressemble pas à une désynchronisation mais à
  un tri cassé.
- **Diffuser depuis la route plutôt que depuis le service.** C'est exactement
  ce qui laisse un écrivain futur n'honorer que la moitié du contrat.

### Conséquences

- Le cliquet `preference-writer-sweep` énumérait TROIS tables par utilisateur ;
  il en manquait deux. `userSticker` — le défaut ci-dessus — et
  `userConversationCategory`, dont les quatre verbes diffusaient déjà : rien
  n'y était cassé, et un cinquième écrivain muet n'aurait fait rougir personne.
  L'inventaire passe de 13 à 22 sites.
- Les miroirs **iOS** et **Android** de ce consommateur sont des issues de
  suite : l'événement existe, la dimension 13 (complétude) ne sera mûre qu'une
  fois les trois clients branchés.

### Preuve

`StickerLibrary.announce.test.ts` (l'écrivain annonce sur les quatre chemins,
se tait sur les non-écritures, et une annonce qui lève ne fait pas échouer
l'écriture) · `sticker-library-broadcast.test.ts` (la route RÉELLE câble la
diffusion jusqu'à `user:<id>` — prouvé rouge en retirant le seul `announce:` du
site de construction) · `apps/web/src/lib/stickers/library-sync.test.ts` (la
liste LUE change, et un événement d'un autre compte ou malformé est ignoré
entier) · `tsc --noEmit` à zéro sur `packages/shared`, `services/gateway` et
`apps/web`.
