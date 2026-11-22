# Cycle 218 — l'activité d'un commentaire se tait chez qui un blocage sépare (#20236)

**Date** : 2026-11-22 · **Branche** : `claude/exciting-planck-diecrr` · **Issue** : #20236

## Ce que ce cycle a livré

#20216 a fermé les diffusions qui portent le **CONTENU** d'un commentaire :
création, édition, média, traductions du texte, de la légende et de l'alt ne
partent plus vers un compte qu'un blocage sépare du commentateur. Son audit
adversarial a nommé ce qui restait : **deux familles qui ne portent aucun
contenu**, et qui disent pourtant quelque chose.

| événement | site | ce qu'il annonce |
|---|---|---|
| `comment:liked` / `comment:unliked` | `SocialEventsHandler` | le commentaire d'untel reçoit (ou perd) des cœurs |
| `comment:reaction-added` / `comment:reaction-removed` | `CommentReactionHandler` | untel vient de réagir à un commentaire |

Les quatre partaient vers `ROOMS.post(postId)` **sans aucune exclusion**. Un
lecteur qui garde le détail d'un post ouvert voyait donc l'activité d'un compte
qu'il a bloqué — ou qui l'a bloqué — pendant que la liste REST, elle, se tait
depuis #20205.

## Le point qui décide du correctif : DEUX sujets, pas un

Une diffusion de **contenu** n'a qu'un sujet : celui qui a écrit. Une diffusion
d'**activité** en a deux, et taire un seul des deux ne tait rien :

- l'**ACTEUR**, que la charge nomme (`userId`) ;
- l'**AUTEUR du commentaire**, parce que c'est son commentaire dont le compteur
  bouge.

C'est ce qui a dicté la forme des témoins : chacun pose le blocage autour de
**chaque sujet séparément**. Un vecteur qui les bloquerait tous les deux
ensemble passerait au vert sous un correctif qui n'en garde qu'un — mesuré, les
deux mutations tombent sur des témoins différents.

## Le coût, et ce qui le borne

`getBlockRelatedUserIds` répond pour UN sujet en deux lectures. L'appeler par
sujet en aurait fait quatre, sur un chemin qui tire à chaque cœur posé.

La loi unique (`socketio/separatedRooms.ts`) lit les **deux sens pour tous les
sujets à la fois** — `blockedUserIds: { hasSome: sujets }` d'un côté, `id: { in:
sujets }` de l'autre : **deux lectures quel que soit le nombre de sujets**.

Et elle garde sa réponse dans un cache **PARTAGÉ** par le processus, clé par
tuple de sujets trié. Ce n'est pas du confort : la traduction d'un commentaire
diffuse une fois **par langue cible**, chaque résultat arrivant séparément du
pipeline — il n'existe aucune boucle où « passer le résultat ».

**La fraîcheur ne tient PAS au TTL, et c'est l'audit qui l'a mesuré.** Le
premier jet branchait le cache dans `commentEmitter`, que **sept diffusions de
CONTENU** partagent : une fenêtre d'expiration y rouvrait #20216 pendant toute
sa durée — le TEXTE et les MÉDIAS d'un commentaire livrés à qui vient de
bloquer, et `MeeshySocketIOManager` ne construisant qu'UN handler, la fenêtre
était réelle en production. Le doc-comment qui affirmait « au pire UN événement
d'activité » était donc faux, écrit en tête du fichier qu'il décrivait.

La fraîcheur tient à l'**INVALIDATION** : `blockedUserIds` n'a que **deux
écrivains** dans tout le dépôt (`routes/directory/blocks.ts`, la pose et le
retrait — mesuré), et tous deux appellent `invalidateSeparationAround`. Le TTL
reste comme second filet, jamais comme garantie. Le cache est borné (512
entrées, vidé au plafond) : un cache qui grandit avec le trafic est une fuite.

> **Ce cache sert une AUDIENCE, jamais une AUTORISATION.** La décision de
> laisser quelqu'un commenter, traduire, liker ou réagir se lit toujours à frais
> neufs (`commentAuthorSeparatedFrom` → `isBlockedWithAny`). L'audit a confronté
> cette affirmation-là et l'a trouvée vraie ; c'est la PORTÉE du cache, pas sa
> nature, qui était le défaut.

`commentEmitter` (#20216) s'adosse à la même loi : une seule règle, et la
traduction gagne le cache au passage.

## `keep` : seul l'ACTEUR s'exempte

Un sujet ne s'exclut pas de son propre événement. Le premier jet en a fait
« tout sujet », au motif — écrit en commentaire — que « la porte de l'action a
déjà refusé le cas où les deux sujets se séparent ».

**Mesuré FAUX par l'audit, sur un chemin vivant.** Retirer sa réaction reste
permis après un blocage — décision écrite de #20216 — donc
`DELETE …/comments/:id/like` et `comment:reaction-remove` n'ont PAS la porte
`commentAuthorSeparatedFrom`. A, que B a bloqué, y retire sa réaction au
commentaire de B : les sujets sont `[A, B]`, la lecture met bien B dans
l'ensemble séparé, et l'exemption l'en retirait. B se voyait annoncer
l'activité de A.

Sur **deux adresses**, de surcroît : la room du post, et la **feed room de
l'auteur**, qui n'était gardée par rien — et qui partait AVANT la lecture des
blocages, donc même quand celle-ci échouait. Un fail-closed partiel n'est pas un
fail-closed.

> Le « défensif » était plus large que sa justification : celle-ci parle de
> **celui qui vient d'émettre**, et le code exemptait les deux. Dans le cas
> nominal, exempter l'auteur est un no-op ; il ne devient agissant que là où
> c'est précisément lui qu'il faut taire.

## L'ORDRE du fil, perdu puis rendu

Rendre ces diffusions asynchrones décorrélait l'ordre des émissions de l'ordre
des écritures — et leur charge est ABSOLUE (`likeCount`), donc le dernier arrivé
gagne : un `comment:unliked` qui double son `comment:liked` fige chez le lecteur
un compteur que la base contredit, et iOS le **persiste**.

La séparation se résout donc **AVANT la mutation** — le tuple de sujets est
connu dès `loadCommentPostAcl` — et l'émission redevient **synchrone** juste
après elle. C'est le « passage du résultat » que le critère de fin de l'issue
offrait en alternative au cache : les deux coexistent, chacun là où il vaut.

## Fermé

Une lecture qui échoue rend `null`, et l'appelant **n'émet rien** — on ne
diffuse pas une activité sans savoir à qui la taire. C'est la règle que
`commentEmitter` portait déjà pour le contenu, étendue aux quatre.

## Preuve

25 témoins dans `comment-activity-separated-20236.test.ts`, **17 rouges
d'abord** au premier jet. Le couple `(événement, charge)` est relevé tel qu'il
part sur le fil — une adresse juste ne dit rien de ce qui y arrive.

| mutation | ce qui tombe |
|---|---|
| n'observer que l'AUTEUR | 2 rouges + les deux sens |
| n'observer que l'ACTEUR | 5 rouges |
| fail-OPEN sur la panne de lecture | 4 rouges |
| retrait du cache | 1 rouge (le témoin de coût) |
| exempter TOUS les sujets (le défaut trouvé par l'audit) | 2 rouges |
| invalidation neutralisée | 1 rouge |
| feed room de l'auteur émise sans condition | 1 rouge |
| feed room émise AVANT la lecture (fail-closed partiel) | 3 rouges |

Les quatre dernières lignes sont les témoins NEUFS du tour d'audit. Deux d'entre
elles ne pouvaient tomber que sur leur vecteur propre — « l'AUTEUR a bloqué
l'ACTEUR » sur les deux chemins de retrait, « un blocage posé entre deux
diffusions de CONTENU est vu par la seconde » — et le témoin de fail-closed a dû
être ÉLARGI à toutes les adresses : posé sur la seule room du post, il restait
vert quand la feed room partait avant la lecture.

`tsc --noEmit` (gateway) : 0. Suites touchées : 369/369.

## Les doubles qui ont dû suivre

Quatre harnais décrivaient un monde que la production a quitté, et les mettre à
jour fait partie du correctif :

- `SocialEventsHandler.comment-separated-20216.test.ts` — la lecture a changé de
  forme (`findUnique` → second `findMany`) ; assertions inchangées ;
- les deux suites `CommentReactionHandler` — `prisma.user` manquait (une lecture
  ABSENTE ferme la diffusion, c'est voulu), et `io.to()` peut désormais recevoir
  `.except()` ;
- `comments-like-delete.test.ts` — les doubles de diffusion rendaient
  `undefined` là où la route attend une promesse à `.catch`.

## Ce que l'audit a ouvert, et que ce lot ne corrige pas

- **#20337** — `aggregation.userIds` : la charge de `comment:reaction-*` nomme
  TOUS les réacteurs. Une exclusion de rooms ne peut pas la protéger (la charge
  est la même pour tous), et `PostReactionAggregation` a déjà reçu la coupe
  (« NO userIds, count only ») six lignes plus loin dans le même fichier. Second
  site, même famille : `handleRequestSync`.
- **#20338** — six familles de diffusion d'ACTIVITÉ qui nomment un acteur et ne
  filtrent aucun blocage, dont `post:liked`, jumelle exacte de `comment:liked`.

Et un suivi non chiffré : la panne de lecture ferme le direct pour **tout le
monde**, journalisée et **sans métrique** — une diffusion fermée en silence ne
se distingue pas, en exploitation, d'un fil calme.

## Un dommage collatéral, trouvé par la suite complète

Le cliquet `journal-one-file-per-entry-guard` rougissait sur `dev` **depuis la
fusion de #20333** : la leçon du cycle 217 y était écrite en `# ` avec des
sous-titres, là où le gate exige UN titre `## ` et rien d'autre. Un lot
DOCUMENTAIRE, livré sur la foi de gates `apps/web`, avait cassé un cliquet qui
vit dans la suite du GATEWAY.

> **Un lot qui ne touche aucun code peut casser un gate d'un autre paquet.** Les
> gates se choisissent sur ce que le lot ÉCRIT (ici : un fichier de `tasks/`),
> pas sur le paquet qu'on croit toucher.
