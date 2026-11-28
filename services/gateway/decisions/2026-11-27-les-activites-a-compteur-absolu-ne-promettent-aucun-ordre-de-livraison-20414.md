## 2026-11-27 : une activité à compteur ABSOLU ne promet aucun ordre de livraison — elle promet une RELECTURE

**Statut** : Accepté le 2026-11-27 (#20414). Réconcilie deux doctrines écrites
chez elles et contradictoires depuis #20337 : celle de
`SocialEventsHandler`/`socialEmissionCore` (« résolue AVANT la mutation, pour
que l'émission reste synchrone juste après elle ») et celle de
`CommentReactionHandler.separationAround` (« lue APRÈS, la fenêtre s'élargit
d'un `await` ; elle ne s'ouvre pas »). Ni #20236 ni #20337 n'ont de fichier de
décision : leur doctrine ne vivait QUE dans des doc-comments, et c'est la cause
de la contradiction que ce fichier solde.

**Contexte** — ce que chaque camp avait raison de dire, et ce qu'aucun ne disait.

#20236 a raison que l'ordre de LIVRAISON de deux charges ABSOLUES peut
s'inverser, et qu'un client qui se fige sur le mauvais total le PERSISTE (iOS le
fait, mesuré ci-dessous). #20337 a raison que `createUpdateEvent` était **déjà**
un `await` entre la mutation et l'émission : la fenêtre préexistait à son lot.

L'audit adversarial de #20337 avait en outre mesuré FAUSSE une phrase de ce
second doc-comment — « deux lectures concurrentes rendent le même total
final » — qui y est restée jusqu'à ce lot. Chacune rend le total à l'instant où
elle tourne ; c'est la LIVRAISON qui peut les inverser.

Et ni l'un ni l'autre ne disait la chose qui décide : **lire la séparation avant
la mutation ne donne aucune garantie d'ordre non plus.** Deux gestes concurrents
sur le même commentaire sont deux gestionnaires de requête indépendants ; leurs
accusés Mongo reviennent sur des connexions poolées distinctes et peuvent
revenir dans le désordre par rapport à l'ordre de commit — le mécanisme que
`socketio/utils/emitWithSeq.ts` décrit déjà pour l'allocation de `_seq`
(« deux appels concurrents […] dont les réponses peuvent revenir DANS LE
DÉSORDRE »). Résoudre avant la mutation RESSERRE la fenêtre d'un `await`. Elle
ne se ferme pas.

**Décision**

1. **Les six diffusions d'activité à compteur ABSOLU ne promettent aucun ordre
   de livraison**, et aucun de leurs sites ne l'écrit : `comment:liked` /
   `comment:unliked`, `comment:reaction-added` / `comment:reaction-removed`,
   `post:liked` / `post:unliked` et `post:reaction-added` /
   `post:reaction-removed` (la famille de #20338, même forme de charge, même
   doctrine — la chercher dans le seul commentaire serait la laisser contredite
   un fichier plus loin).

2. **Ce que la charge ABSOLUE promet est la CONVERGENCE, pas l'ordre.** Un
   compteur absolu ne cumule pas l'erreur d'une double livraison — une
   réécriture idempotente pose la même valeur — mais un réordonnancement FIGE un
   total faux jusqu'à une relecture. C'est la propriété qui rend ces diffusions
   acceptables sans curseur, et c'est la seule qu'on ait le droit d'écrire.

3. **Ce qui rattrape l'écart est une lecture AUTORITATIVE, mesurée par
   client** — jamais un ordre supposé :

   | client | ce que l'événement écrit | ce qui le corrige |
   |---|---|---|
   | iOS | GRDB, durable (`FeedPersistenceActor.updateCommentLikeCount`, `updateCommentReactionSummary`) | le prochain chargement REST du détail (`PostDetailViewModel` → `insertComment` → `save`, un upsert) — et **lui seul** : l'ACK de `comment:reaction-request-sync`, qui remplacerait le ROSTER, n'a AUCUN appelant applicatif (mesuré, décision du 2026-11-28 ; #20778) |
   | web | cache react-query, en mémoire (`applyCommentLikeEvent`) | le prochain `refetch` de la clé ; rien ne survit au rechargement |
   | Android | `comment:reaction-added` / `-removed` sont collectés (`PostCommentsViewModel`, `StoryCommentsViewModel`) ; **`comment:liked` / `comment:unliked` ne sont collectés par RIEN** (mesuré le 2026-11-27 : la route existe, le `SharedFlow` est exposé, aucun collecteur de production) | sans objet pour le cœur : il ne bouge pas en direct (dette ouverte, #20745) |

4. **Le `_seq` ne peut pas stamper ces événements, et ce n'est pas un oubli.**
   `emitWithSeq` n'enrichit QUE les émissions vers UN destinataire
   (`ROOMS.user(userId)`), le curseur étant par utilisateur ; ces six-là sont des
   diffusions de ROOM (`ROOMS.post(postId)` et la feed room de l'auteur). Les
   stamper exigerait un éventail par lecteur, et son propre contrat dit pourquoi
   on ne le fait pas à la légère : **un curseur global observé partiellement est
   PIRE que pas de curseur** — il fabrique des trous là où rien n'a été perdu.
   Aucune garantie d'ordre n'est donc disponible à bas coût ici.

5. **L'endroit où la séparation se lit reste une conséquence de ce que la charge
   doit PORTER, et de rien d'autre.** Le roster des réacteurs (#20337) n'est
   produit que par `createUpdateEvent`, donc nommer ses réacteurs EXIGE de lire
   après la mutation ; la famille du cœur n'a aucun roster à nommer, donc elle
   lit avant et ne paie pas l'`await`. Les deux arrangements sont justes. Ce qui
   était faux, c'est la garantie que chacun s'attribuait.

6. **Les sites disent la MÊME chose, et une seule fois.** Chacun des cinq
   doc-comments de production renvoie à cette décision au lieu de réexpliquer la
   doctrine chez lui, et aucun ne reprend une formule qui promet un ordre. Un
   cliquet le tient :
   `services/gateway/src/socketio/__tests__/activity-ordering-doctrine.test.ts`.

**Alternatives rejetées**

- *Rendre la garantie RÉELLE en sérialisant les émissions par commentaire* (une
  chaîne de promesses en mémoire, comme `emitWithSeq` le fait par utilisateur).
  Rejetée : elle ne vaut QUE dans un processus, et ces mutations arrivent aussi
  par REST, sans adhérence d'instance. Elle produirait exactement ce que le
  dépôt refuse ailleurs — « une porte annoncée plus stricte qu'elle n'est vaut
  moins que pas de porte » — et le prochain lot s'y appuierait.
- *Porter un curseur par commentaire dans la charge.* Rejetée pour ce lot :
  aucun client ne lit un curseur sur ces événements (mesuré), et un champ que
  personne n'affiche ne garde rien (précédent #14319). La question se repose si
  un client décide de rejeter une charge périmée — ce serait un lot avec son
  lecteur.
- *Aligner le camp du cœur sur « lire après ».* Rejetée : elle ÉLARGIT la
  fenêtre sans rien acheter, le cœur n'ayant aucun roster à nommer.
- *Ne corriger que la phrase fausse.* Rejetée : elle laisse deux doctrines
  opposées chez elles, c'est-à-dire la cause, et #20337 a déjà payé la moitié de
  ce correctif sans que la contradiction disparaisse.

**Conséquences**

- Un lot qui ajoute une diffusion d'activité à compteur absolu renvoie à cette
  décision et ne promet pas d'ordre ; le cliquet le lui demande.
- Un client qui veut un total juste APRÈS un réordonnancement n'a qu'un moyen :
  relire. C'est écrit ici, et plus dans cinq commentaires.
- Deux dettes ouvertes à la mesure de ce lot : le cœur d'un commentaire ne bouge
  pas en direct sur Android (#20745), et la famille du cœur n'a aucune
  resynchronisation ciblée.

**Et ce point a été repris le 2026-11-28, parce que cette décision le disait trop
bien de la famille des réactions.** Elle écrivait que celles-ci « en ont une »
(`comment:reaction-request-sync`), ce qui est vrai du SERVEUR et des deux SDK, et
faux de toute APPLICATION : relevé exhaustif, zéro appelant sur iOS comme sur
Android, l'événement n'existe pas côté web, et le sujet iOS qui porterait son ACK
n'a aucun producteur. **Les deux familles sont donc dans le même état** — seule la
relecture REST corrige —, la dette est symétrique, et son câblage (ou le retrait
de ses déclarations mortes) est #20778. Mesure et chaîne maillon par maillon :
`decisions/2026-11-28-l-ordre-de-deux-activites-de-commentaire-est-au-mieux-la-convergence-est-sa-garantie-20414.md`.

> Une facilité peut être câblée de bout en bout SAUF l'appel qui la démarre, et
> des doc-comments de service peuvent s'appuyer dessus sans que personne ne
> vérifie. **La raison invoquée pour accepter un défaut se mesure comme le
> défaut.**
