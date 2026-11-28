## 2026-11-28 : l'ordre de deux activités de commentaire est AU MIEUX ; la convergence est la garantie, et son chemin n'a aucun appelant

**Issue** : #20414 · **Constat source** : audit adversarial de #20337, constat 4

> **Décision COMPAGNE, écrite en parallèle par une autre session :**
> [2026-11-27 — une activité à compteur ABSOLU ne promet aucun ordre de
> livraison, elle promet une RELECTURE](2026-11-27-les-activites-a-compteur-absolu-ne-promettent-aucun-ordre-de-livraison-20414.md).
> Les deux soldent #20414 et **ne se contredisent pas** : elles ont été
> rapprochées à la main, et chaque site de code cite les deux. Elles se
> partagent la question — la compagne porte la PORTÉE (les six diffusions à
> compteur absolu, commentaire ET post) et ce qui corrige l'écart **par
> client** (iOS persiste et se corrige au prochain chargement REST ; le web ne
> survit pas au rechargement ; Android ne collecte même pas `comment:liked`,
> dette #20745), plus la raison pour laquelle `_seq` ne peut pas estampiller
> ces charges (`emitWithSeq` n'estampille que les émissions vers UN
> destinataire). Celle-ci porte la PRÉMISSE de la convergence — les deux
> transports écrivent les mêmes lignes, et son cliquet le garde — et la mesure
> du chemin de resynchronisation, qui n'a aucun appelant (#20778).
>
> Deux fichiers pour une issue n'est pas l'idéal du dépôt. Ils sont gardés tels
> quels parce qu'ils ont été rapprochés à la main par la session qui est
> arrivée en second : les refondre aurait supprimé le travail de l'autre, ce
> qu'aucune des deux n'avait à décider seule.

### Ce qui a motivé la décision

Deux sites du dépôt portaient des doctrines d'ordonnancement **opposées** pour la
même forme de charge, chacune écrite chez elle :

- `SocialEmissionCore.commentActivitySeparation` (`comment:liked` / `-unliked`) :
  la séparation est résolue **AVANT** la mutation, et « ce n'est pas une
  commodité : rendre ces diffusions asynchrones décorrélait l'ORDRE du fil de
  l'ordre des écritures » ;
- `CommentReactionHandler.separationAround` (`comment:reaction-added` /
  `-removed`) : elle est résolue **APRÈS**, parce que seul `createUpdateEvent`
  produit le roster, et « la fenêtre de réordonnancement s'élargit donc d'un
  `await` ; elle ne s'ouvre pas ».

**Les deux avaient raison sur un point que l'autre ignorait**, et l'issue le dit.
Ce qui manquait est la mesure qui les réconcilie.

### Les quatre événements sont DEUX TRANSPORTS D'UNE SEULE MUTATION

C'est le fait qui dissout la contradiction, et il se mesure :
**exactement deux services écrivent `commentReaction`**, et ce sont les deux
bouts des « deux familles ».

| transport | service | écritures |
|---|---|---|
| REST — `POST`/`DELETE …/comments/:id/like` | `PostCommentService.likeComment` / `unlikeComment` | `commentReaction.upsert`, `commentReaction.deleteMany` |
| socket — `comment:reaction-add` / `-remove` | `CommentReactionService` | `commentReaction.create`, deux `deleteMany` |

`PostCommentService.likeComment` le dit lui-même : « SECOND chemin de création
des réactions de commentaire (le premier est `CommentReactionService.addReaction`,
emprunté par le socket) ». Ce ne sont donc pas deux features aux charges
jumelles : **c'est une seule donnée, écrite par deux portes, annoncée par deux
noms d'événement.**

### Ce que l'ordre garantit : RIEN, et la différence entre les deux chemins est marginale

| ce qu'on croyait | ce qui est mesuré |
|---|---|
| lire la séparation AVANT la mutation rend l'émission « synchrone », donc l'ordre du fil suit l'ordre des écritures | l'émission est bien synchrone après le `await` d'écriture sur le chemin REST — mais **l'ordre de RÉSOLUTION de deux promesses d'écriture concurrentes n'est pas l'ordre des commits**, et rien n'ordonne deux réponses de base. La fenêtre existe à zéro `await` ajouté. |
| « deux lectures concurrentes rendent le même total final » | **faux comme écrit** (l'issue l'avait relevé) : chacune rend le total à l'instant où elle tourne. C'est la LIVRAISON qui peut les inverser. |
| le chemin socket « ouvre » une fenêtre | il l'**élargit** d'un `await`. `createUpdateEvent` est une lecture en base : un `await` siégeait déjà entre la mutation et l'émission. |

Et le facteur qui domine les trois : **l'adaptateur Redis de Socket.IO est
attaché dès que `REDIS_URL` est posée** (`attachSocketIORedisAdapter`, additif),
ce qui est le cas en production. Rien n'ordonne deux écritures servies par deux
instances de passerelle. Aujourd'hui les composes ne portent **aucune clé
`replicas` ni `deploy` sur le service de la passerelle** — une seule instance
tourne, donc c'est un risque INSTRUIT, pas un incident constaté ; mais la montée
à plusieurs instances est une variable d'environnement, et la cible de #9232 est
100 000 utilisateurs derrière une passerelle sans état.

> **Un compte d'`await` entre une écriture et son émission n'achète pas un
> ordre.** Il réduit une fenêtre dont le plancher n'est pas zéro et dont le
> plafond ne dépend pas de lui.

### Ce qui est garanti : la convergence, par DEUX mécanismes dont aucun ne suffit seul

1. **Le compteur est ABSOLU.** La charge ne porte aucun curseur `_seq`
   (vérifié : aucune occurrence dans `packages/shared/types/post.ts`). Toute
   valeur affichée a donc été VRAIE à un instant : l'erreur est bornée à
   « périmée », jamais à une dérive accumulée de ±1 par événement manqué ou
   doublé. **Mais un ordre inversé laisse le client sur un total périmé** — le
   compteur absolu borne l'erreur, il ne la corrige pas.
2. **La resynchronisation corrige.** `comment:reaction-request-sync` rend
   l'agrégat autoritaire lu depuis `commentReaction`, donc la vérité écrite par
   les DEUX transports, sous la même garde de visibilité que la lecture du fil.

### Et son chemin n'a AUCUN appelant — mesuré, sur les trois clients

C'est la moitié de cette décision, et elle corrige ce que les deux sites
affirmaient. Les deux doc-comments invoquaient « un client qui doute
resynchronise » comme la raison de tolérer la fenêtre. Relevé exhaustif
(`comment:reaction-request-sync`, `requestCommentReactionSync`,
`COMMENT_REACTION_REQUEST_SYNC`, hors tests, sur `apps/` et `packages/`) :

| maillon | état |
|---|---|
| serveur `CommentReactionHandler.handleRequestSync` | présent, gardé (visibilité de CONSOMMATION, débit), rend le roster filtré par lecteur |
| SDK iOS `SocialSocketManager.requestCommentReactionSync` | présent — **zéro appelant applicatif** |
| SDK Android `SocialReactionEmitter.requestCommentReactionSync` | présent — **zéro appelant** |
| web | l'événement n'existe dans aucun fichier client |
| sujet iOS `commentReactionSync` | **zéro producteur** : la méthode RETOURNE l'événement de l'ACK, elle ne le publie jamais |
| `FeedSocketHandler.handleCommentReactionSync` (persiste l'agrégat en GRDB) | abonné à ce sujet — donc **injoignable** |
| diffusion serveur d'un `comment:reaction-sync` | n'existe pas, et le contrat l'écrit (« Pas de `COMMENT_REACTION_SYNC` ») |

**Ce qui corrige donc aujourd'hui un total périmé est la relecture REST du fil**,
quand l'utilisateur le rouvre — pas la resynchronisation. Et iOS PERSISTE le
compteur (`FeedPersistenceActor`), donc un total périmé survit au redémarrage
jusqu'à cette relecture.

> **Une facilité peut être câblée de bout en bout sauf l'appel qui la démarre, et
> trois doc-comments de service peuvent s'appuyer dessus sans que personne ne
> vérifie.** C'est la leçon du cycle 122 — « qui AFFICHE ce qu'il élit ? » —
> déplacée d'un correctif vers une JUSTIFICATION : la raison invoquée pour
> accepter un défaut doit être mesurée comme le défaut.

### La décision

1. **L'ordre de livraison de ces quatre événements est AU MIEUX, et aucun site
   ne le présente autrement.** Ni le lieu de la lecture de séparation, ni le
   nombre d'`await` ne l'achètent.
2. **Où la séparation se lit est une conséquence du ROSTER, pas une doctrine** :
   le chemin qui n'a pas de roster à nommer la lit avant l'écriture parce qu'il
   le PEUT ; celui qui en a un la lit après parce qu'il le DOIT. Les deux sont
   justes ; aucun n'est un modèle pour l'autre.
3. **La convergence est la garantie, et elle repose sur le compteur absolu
   (qui borne) ET la relecture autoritaire (qui corrige).**
4. **La resynchronisation est une facilité SANS APPELANT**, et le dire est
   obligatoire partout où on s'y appuie. Son câblage — ou le retrait de ses
   déclarations mortes — est **#20778**, sur les trois clients et pour les deux
   familles (`comment:` et `post:`), avec la question de déclenchement à
   trancher.
5. **Aucun curseur `_seq` n'est introduit par cette décision.** Il faudrait un
   ordre total par commentaire, que ni la base ni l'adaptateur ne donnent, pour
   un gain que la relecture autoritaire obtient plus simplement.

### Le témoin

La décision repose sur « les deux transports écrivent les MÊMES lignes ». Un
troisième écrivain de `commentReaction` — ou un chemin qui changerait l'état de
réaction d'un commentaire SANS écrire cette collection — la casserait en
silence. `comment-reaction-writers-inventory-20414.test.ts` fige donc
l'inventaire des écrivains de production. Quand il tombe, la réparation est de
dire ce que le nouvel écrivain fait de la convergence, jamais d'ajouter une
ligne d'inventaire.

### Les sites alignés

`SocialEmissionCore.commentActivitySeparation`,
`CommentReactionHandler.separationAround` et les deux claims de
`PostReactionHandler` (la famille `post:liked` / `post:reaction-*`, que l'issue
n'avait pas relevée et qui portait la même surévaluation) renvoient désormais
ici. `separatedRooms.ts` ne portait, lui, aucune affirmation d'ordre : la
référence de l'issue à ses lignes 32-38 était périmée.

> **Une énumération de sites porte deux affirmations, et c'est la seconde qui
> casse** : « ces sites portent la doctrine » était vrai de deux sur trois ; « ce
> sont les sites qui la portent » était faux — le troisième ne la portait pas, et
> un quatrième, non cité, la portait.
