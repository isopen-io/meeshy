# Cycle 227 — deux doctrines d'ordonnancement opposées, et aucune des deux n'était vraie (#20414)

**Date** : 2026-11-27 (livré dans la nuit du 27 au 28) · **Branche** :
`claude/exciting-planck-l8vh18` · **Issue** : #20414 · **Décision** :
`services/gateway/decisions/2026-11-27-les-activites-a-compteur-absolu-ne-promettent-aucun-ordre-de-livraison-20414.md`

## Le défaut

Les quatre événements d'activité d'un commentaire — `comment:liked` /
`-unliked`, `comment:reaction-added` / `-removed` — portent la même forme de
charge (compteur ABSOLU, sans curseur, persisté par iOS) et deux doctrines
d'ordonnancement **contradictoires**, chacune écrite chez elle :

| camp | ce qu'il écrivait | où |
|---|---|---|
| #20236 | la séparation est résolue AVANT la mutation, *pour que l'émission reste synchrone juste après elle* | `socialEmissionCore`, 3 routes, 3 harnais |
| #20337 | elle est lue APRÈS ; la fenêtre s'élargit d'un `await`, elle ne s'ouvre pas ; *deux lectures concurrentes rendent le même total final* | `CommentReactionHandler` |

#20337 avait corrigé SON doc-comment et qualifié d'« inexacte ici » la raison du
frère, sans toucher le frère. L'audit adversarial du même lot avait en outre
mesuré **fausse** la phrase en italique du second camp — elle y était restée
cinq jours.

## Ce que ce lot ajoute, et qui décide

**Les deux camps avaient tort du même côté.** L'issue dit déjà pourquoi chacun
avait raison contre l'autre. Ce que personne n'avait écrit : **lire la
séparation AVANT la mutation ne donne aucune garantie d'ordre non plus.** Deux
gestes concurrents sur le même commentaire sont deux gestionnaires de requête
indépendants ; leurs accusés Mongo reviennent sur des connexions poolées
distinctes et peuvent s'inverser par rapport à l'ordre de commit — **le
mécanisme que `emitWithSeq` documente déjà**, dans le même répertoire, pour
l'allocation de `_seq` (« deux appels concurrents […] dont les réponses peuvent
revenir DANS LE DÉSORDRE »).

Résoudre avant la mutation RESSERRE la fenêtre d'un `await`. Elle ne se ferme
pas. Les deux arrangements sont justes ; c'est la **garantie que chacun
s'attribuait** qui était fausse.

> **Une émission synchrone n'est pas une émission ordonnée.** « Synchrone juste
> après la mutation » décrit la POSITION de l'appel dans une fonction, et se
> relit comme une propriété du FIL. Entre les deux il y a deux requêtes
> concurrentes et un pool de connexions, que la phrase ne nomme pas.

**Et la garantie n'est pas disponible à bas coût.** `emitWithSeq` n'estampille
que les émissions vers UN destinataire, le curseur étant par utilisateur ; ces
six diffusions (les quatre du commentaire, plus les deux familles du post, même
forme) sont des diffusions de ROOM. Les stamper exigerait un éventail par
lecteur, et le contrat du curseur dit pourquoi on ne le fait pas à la légère :
un curseur global observé PARTIELLEMENT est pire que pas de curseur.

La décision est donc : **aucun ordre n'est promis ; ce qui rattrape l'écart est
une RELECTURE autoritative**, mesurée par client.

## Les trois mesures du lot

**1. Ce qui rattrape l'écart, par client** (demandé par le critère de fin de
l'issue — « resynchronisation ? curseur ? ») :

| client | ce que l'événement écrit | ce qui le corrige |
|---|---|---|
| iOS | GRDB, **durable** (`FeedPersistenceActor.updateCommentLikeCount`) | le prochain chargement REST du détail (`PostDetailViewModel` → `insertComment` → `save`, un upsert) ; en plus, pour le ROSTER seulement, l'ACK de `comment:reaction-request-sync` |
| web | cache react-query, en mémoire (`applyCommentLikeEvent`) | le prochain `refetch` ; rien ne survit au rechargement |
| Android | les deux réactions sont collectées ; **le cœur ne l'est par RIEN** | sans objet — il ne bouge pas en direct (**#20745**, ouverte par ce lot) |

**2. La famille du cœur n'a aucune resynchronisation ciblée** là où celle des
réactions en a une (`comment:reaction-request-sync`). Mesuré : `SERVER_EVENTS`
ne porte que `COMMENT_REACTION_REQUEST_SYNC` et `POST_REACTION_REQUEST_SYNC`.
Rien n'est ajouté au fil pour autant — aucun client ne lirait un curseur ni un
ACK de resynchronisation du cœur, et un champ que personne n'affiche ne garde
rien (précédent #14319).

**3. Android : `comment:liked` / `comment:unliked` sont ROUTÉS, EXPOSÉS, et
collectés par personne.** La charge arrive, est décodée, et tombe dans un
`SharedFlow` qu'aucun collecteur de production n'écoute — pendant que les
réactions emoji du MÊME commentaire, dans la MÊME liste, suivent en direct
(`PostCommentsViewModel`, `StoryCommentsViewModel`). C'est la forme la plus
silencieuse qui soit : aucune erreur, aucun log, un test de routage vert.
Issue : **#20745**.

## Le cliquet, et pourquoi il fallait qu'il lise les COMMENTAIRES

`services/gateway/src/socketio/__tests__/activity-ordering-doctrine.ts`
(+ son test) balaie `src/` entier, ne lit QUE les commentaires, et exige de
chaque passage de doctrine qu'il **renvoie à la décision** et ne reprenne
**aucune formule qui promet un ordre** (trois motifs, chacun avec sa raison).

> **Les quatre cliquets de porte d'émission voisins commencent tous par
> `stripComments`.** Une doctrine qui vit dans des commentaires leur est
> invisible PAR CONSTRUCTION — et c'est en commentaire qu'elle vivait, en deux
> exemplaires contradictoires. Ce balayage est leur symétrique, et c'est la
> seule forme capable de voir le défaut de ce lot.

## L'inventaire des sites n'était pas la liste des sites

L'issue en nommait **trois** (`SocialEventsHandler.ts:662-674`,
`separatedRooms.ts:32-38`, `CommentReactionHandler.separationAround`). Le
balayage en rend **douze**, et l'un des trois nommés n'en est pas un :

| ce que l'issue disait | ce qui est mesuré |
|---|---|
| `SocialEventsHandler.ts:662-674` | a déménagé dans `socialEmissionCore.ts` (#20440, cycle 222) |
| `separatedRooms.ts:32-38` | **ne porte plus aucun énoncé d'ordonnancement** — la note citée a été réécrite depuis ; ses lignes 32-38 parlent de `keep` |
| `CommentReactionHandler.separationAround` | exact |
| — | **+ 7 passages de production non nommés** : `routes/posts/comments.ts`, `routes/posts/interactions.ts` (×2), `PostReactionHandler.ts` (×3) et `routes/social/events.ts` (le seul qui citait déjà #20414, en « suivi ») |
| — | **+ 3 dans les harnais**, dont **deux copies du MÊME commentaire** (`__tests__/unit/SocialEventsHandler.test.ts` et `socketio/handlers/__tests__/SocialEventsHandler.test.ts`) |

C'est la leçon 261 par son instrument le plus banal : **une clé de LIGNE dérive
à la première édition**, et un inventaire de sites porte toujours deux
affirmations — « ces sites disent X » (vérifiable) et « ce sont LES sites »
(presque jamais vérifiée).

**Le harnais était le pire des douze.** `comment-activity-separated-20236.test.ts`
affirmait en tête que l'émission synchrone « rend à ces deux événements l'ordre
que leur charge absolue exige » — une garantie, dans le fichier même qui est
censé la prouver, et qu'aucun de ses témoins n'exerce (ils gardent l'AUDIENCE).
Ce sont les harnais qui propagent une forme morte : le prochain lot l'aurait
copiée en croyant citer une preuve.

## Le périmètre s'est élargi d'une famille, et c'était obligatoire

L'issue parle des QUATRE événements du commentaire. Les DEUX familles du post —
`post:liked` / `-unliked`, `post:reaction-added` / `-removed` (#20338) — portent
la même charge et la même doctrine, dans quatre passages. Les laisser aurait
reproduit exactement la faute de #20337 : corriger un camp et laisser le frère
affirmer le contraire, un fichier plus loin. **« Cette entité a-t-elle une
jumelle ? » se pose au moment du correctif.**

## Ce que ce lot NE fait pas

- **Il ne rend pas la garantie réelle.** Sérialiser les émissions par
  commentaire (une chaîne de promesses, comme `emitWithSeq` le fait par
  utilisateur) ne vaudrait que dans UN processus, et ces mutations arrivent
  aussi par REST, sans adhérence d'instance. Ce serait « une porte annoncée plus
  stricte qu'elle n'est », que ce dépôt refuse ailleurs — et le prochain lot s'y
  appuierait.
- **Il ne touche à aucune charge, aucune route, aucun contrat de fil.** Rien à
  rétrocompatibiliser (#9223).
- **Il ne corrige pas Android** (#20745) : hors périmètre, et sans compilateur
  Android dans ce conteneur.

## Preuve

**RED prouvé AVANT la correction**, mesuré sur un export de l'arbre d'avant
(`git archive HEAD`, jamais sur l'arbre vivant) : **12 passages** et
**15 violations** — 4 promesses d'ordre et 11 citations absentes — chacune avec
son fichier et sa raison.

| mutation | ce qui tombe |
|---|---|
| retirer la citation d'un seul passage | « aucun passage ne promet un ordre » ⇒ 1 rouge nommant le fichier |
| faire disparaître le passage d'un site connu (renommage, extraction) | « le balayage regarde quelque chose » ⇒ 1 rouge nommant le site |
| réécrire une des trois promesses | les fixtures négatives du cliquet (4 témoins) |

```
npx tsc --noEmit -p tsconfig.json                      → 0 erreur
npx jest src/socketio src/routes/posts
         src/__tests__/unit/routes/social
         src/__tests__/unit/SocialEventsHandler.test.ts → 235 suites, 3 639 témoins verts
npx jest src/socketio/__tests__/activity-ordering-doctrine.test.ts → 12/12
```

## Ce que le lot a payé pour lui-même

**La garde de texte ne peut pas CITER ce qu'elle refuse.** Son doc-comment
reproduisait les deux énoncés d'origine, pour raconter l'histoire — et le seul
rouge restant après l'alignement des douze passages était **son propre
doc-comment**. Les deux énoncés vivent désormais dans la décision, où aucun
cliquet ne les cherche.

> Un cliquet de texte est le seul outil dont la documentation est dans son
> périmètre. Écrire sa propre histoire est un cas de test gratuit — et ici c'est
> l'erreur commise en l'écrivant qui a rendu la contrainte visible.

## Ce que ce lot ouvre

- **#20745** — Android : le cœur d'un commentaire ne bouge jamais en direct.
- La famille du cœur sans resynchronisation ciblée : consigné dans la décision,
  sans issue, parce qu'il n'y a rien à faire tant que la relecture REST est le
  chemin nominal. Le jour où un client décide de REJETER une charge périmée, le
  curseur devient un lot avec son lecteur.
