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

Et elle garde sa réponse **5 s**, par tuple de sujets trié. Ce n'est pas du
confort : la traduction d'un commentaire diffuse une fois **par langue cible**,
chaque résultat arrivant séparément du pipeline — il n'existe aucune boucle où
« passer le résultat ».

> **Ce cache sert une AUDIENCE, jamais une AUTORISATION.** La décision de
> laisser quelqu'un commenter, traduire, liker ou réagir se lit toujours à frais
> neufs (`commentAuthorSeparatedFrom` → `isBlockedWithAny`) : un blocage tout
> juste posé refuse l'action à l'instant même. Ce que la fenêtre peut coûter est
> au pire UN événement d'activité livré à qui vient de bloquer. L'inverse —
> relire les blocages à chaque langue d'un même commentaire — est un coût
> certain pour une fraîcheur que personne n'observe.

Le cache est borné (512 entrées, vidé au plafond) : un cache qui grandit avec le
trafic est une fuite, pas une optimisation.

`commentEmitter` (#20216) s'adosse à la même loi : une seule règle, et la
traduction gagne le cache au passage.

## Fermé

Une lecture qui échoue rend `null`, et l'appelant **n'émet rien** — on ne
diffuse pas une activité sans savoir à qui la taire. C'est la règle que
`commentEmitter` portait déjà pour le contenu, étendue aux quatre.

## Preuve

22 témoins dans `comment-activity-separated-20236.test.ts`, **17 rouges
d'abord** (les 5 verts sont les non-régressions : « n'exclut personne sans
blocage », et la charge servie). Le couple `(événement, charge)` est relevé tel
qu'il part sur le fil — une adresse juste ne dit rien de ce qui y arrive.

| mutation | ce qui tombe |
|---|---|
| n'observer que l'AUTEUR | 2 rouges (`comment:liked`, `comment:unliked` sur l'acteur) + les deux sens |
| n'observer que l'ACTEUR | 5 rouges |
| fail-OPEN sur la panne de lecture | 4 rouges |
| retrait du cache | 1 rouge (le témoin de coût) |

`tsc --noEmit` (gateway) : 0. Suites touchées : 290/290.

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

## Ce que ce cycle laisse

La panne de lecture ferme le direct pour **tout le monde**, journalisée et
**sans métrique** — l'issue le nomme comme un coût, son critère de fin ne le
demande pas. À instruire séparément : une diffusion fermée en silence ne se
distingue pas, en exploitation, d'un fil calme.
