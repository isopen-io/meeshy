# Cycle 109 — L'accusé de réception des réactions disait autre chose que ce qu'il envoyait

**Branche** : `claude/keen-hamilton-5a30oh`
**Portée** : Phase 3 (livraison — acquittements), Phase 8 (architecture — gouvernance
de contrat), suivi hérité du cycle 107 bis (bivariance / `strictFunctionTypes`).

---

## 1. Le point de départ : un suivi différé depuis trois cycles

Le cycle 108 ter a clos sur cette ligne, héritée de 107 bis :

> **La bivariance reste la limite, et elle est générale.** `strictFunctionTypes:
> false` ⇒ aucune porte typée n'attrape une charge divergente assignable dans un
> seul sens. Décision à instruire, elle dépasse Socket.IO.

Trois cycles l'ont recopiée sans la mesurer. **Elle se mesure en une commande** :
`strictFunctionTypes: true` sur la passerelle rend **52 erreurs** dans 19
fichiers. Deux familles :

| famille | erreurs | nature |
|---|---|---|
| gestionnaires de route Fastify | 43 | `UnifiedAuthRequest` là où Fastify passe `FastifyRequest` — un lot à part |
| **acquittements Socket.IO** | **9** | `MeeshySocketIOManager`, les trois familles de réactions |

Les neuf sont le domaine de cette routine, et ils nommaient un défaut réel.

## 2. Ce que les neuf erreurs disaient

```
src/socketio/MeeshySocketIOManager.ts(1562,74): error TS2345:
  Argument of type '(response: SocketIOResponse<ReactionUpdateEventData>) => void'
  is not assignable to parameter of type '(response: SocketIOResponse<unknown>) => void'.
```

Le contrat (`ClientToServerEvents`) promet une charge PRÉCISE ; le gestionnaire
prend `SocketIOResponse<unknown>`, **qui accepte tout**. Les deux moitiés du fil
ne se vérifiaient donc pas l'une l'autre — et elles étaient en désaccord :

| événement | ce que le contrat promettait | ce que la passerelle envoyait |
|---|---|---|
| `reaction:add` | `ReactionUpdateEventData` | `ReactionData` — la ligne persistée brute |
| `reaction:remove` | `ReactionUpdateEventData` | `{ message: 'Reaction removed successfully' }` |
| `reaction:remove` (idempotent) | `ReactionUpdateEventData` | `{ message: 'Reaction already absent' }` |

## 3. Ce n'était pas un premier incident, c'était le QUATRIÈME

Le dépôt porte l'histoire dans ses propres commentaires. La même famille a coûté
**trois** incidents de décodage à l'iOS avant ce cycle, chacun réparé seul :

1. **REST `POST /reactions`** — « le decoder strict precedent levait un
   `DecodingError` sur une reponse 2xx pourtant valide — l'envoi etait donc
   compte comme un echec ». Contourné en ignorant le corps
   (`DiscardedReactionResponse`).
2. **Accusé `post:reaction-*`** — « Renvoyer la `reaction` brute (sans
   action/aggregation) cassait le décodage iOS (`malformedResponse`) ». Corrigé
   en posant la règle **« Contrat ACK == broadcast »**.
3. **Accusé `comment:reaction-*`** — le même, corrigé de la même façon.

**Le quatrième site — la famille MESSAGE — n'a jamais été corrigé.** Il envoyait
exactement les deux formes que les corrections 2 et 3 avaient explicitement
remplacées : la ligne brute, et « un simple {message} ». Rien ne le nommait,
parce que `SocketIOResponse<unknown>` ne nomme rien.

> **Une famille qui repousse à chaque itération se ferme par une GARDE, pas par
> un correctif** (leçon 237i). Trois corrections successives ont chacune réparé
> ce qu'elles voyaient ; aucune n'a empêché la suivante.

## 4. Le geste : lire le contrat, ne plus le recopier

Deux dérivations dans `packages/shared/types/socketio-events.ts` :

```ts
export type AckOf<E extends keyof ClientToServerEvents> =
  NonNullable<Parameters<ClientToServerEvents[E]>[1]>;

export type AckResponseOf<E extends keyof ClientToServerEvents> =
  Parameters<AckOf<E>>[0];
```

`AckOf<'reaction:add'>` n'est pas une COPIE du contrat, c'est une **LECTURE** :
il n'existe plus qu'une seule déclaration. Les neuf rappels des quatre familles
de réactions la prennent, ainsi que les 34 locales
(`const successResponse: AckResponseOf<'reaction:remove'>`) — sans quoi la
locale rouvrait la porte que la signature venait de fermer.

## 5. Le compilateur a nommé DEUX sites que la lecture du code avait manqués

À la première compilation sous la porte typée :

```
CommentReactionHandler.ts(291,57): error TS2353:
  'message' does not exist in type 'CommentReactionUpdateEventData'.
PostReactionHandler.ts(338,57): error TS2353:
  'message' does not exist in type 'PostReactionUpdateEventData'.
```

**Les familles COMMENTAIRE et POST n'étaient réparées qu'à MOITIÉ.** Leur chemin
nominal suivait « ACK == broadcast » ; leur chemin **idempotent** — « la réaction
est déjà absente » — portait encore la phrase anglaise, recopiée du site message
avec le commentaire qui l'avoue :

```ts
// Mirrors ReactionHandler.handleReactionRemove (message reactions).
if (callback) callback({ success: true, data: { message: 'Reaction already absent' } });
```

Et ce chemin-là est précisément celui que déclenche **le double-tap qu'un accusé
idempotent existe pour absorber** — donc le plus fréquent des trois.

> **La porte typée a trouvé en une compilation ce que quatre relectures
> successives du même code avaient laissé passer.** C'est la mesure qui justifie
> le lot : pas le nombre d'erreurs fermées, mais le fait qu'aucun humain n'avait
> vu ces deux-là.

## 6. La décision de forme : un accusé est un REÇU, pas une charge

Deux options se présentaient, et **copier les familles comment/post aurait été
une régression** :

- Elles acquittent **APRÈS** l'agrégation, ce qui leur permet de porter
  l'`updateEvent`.
- La famille MESSAGE acquitte **dès la persistance**, délibérément, avec sa
  raison écrite : *« A transient failure in those reads must NOT flip the ACK to
  failure — that would make the client roll back a reaction already committed to
  the DB. »*

C'est la MEILLEURE sémantique de livraison des deux, et elle interdit
structurellement de porter l'agrégation. Le contrat a donc été aligné sur ce que
son émetteur PEUT tenir, famille par famille :

| accusé | déclaré désormais | pourquoi |
|---|---|---|
| `reaction:add` | `SocketIOResponse<ReactionData>` | la ligne persistée, disponible sans lecture supplémentaire |
| `reaction:remove` | `SocketIOResponse<never>` | un retrait ne laisse rien qui mérite le fil |
| `reaction:request-sync` | `SocketIOResponse<ReactionSyncEventData>` | inchangé — déjà vrai |
| `attachment:reaction-*` | `SocketIOResponse<never>` | grave ce que ce handler faisait déjà correctement |
| `comment:` / `post:reaction-*` | leur `updateEvent` | inchangé — leurs handlers acquittent après agrégation |

`never` plutôt que « pas de `data` » : il rend la charge **inexprimable**, là où
`unknown` acceptait tout — c'est-à-dire exactement l'opacité qui a laissé les
trois autres familles diverger.

### Les phrases anglaises retirées ne sont pas un détail cosmétique

`{ message: 'Reaction removed successfully' }` est un texte **anglais non
localisé sur le fil**, dans un produit dont la promesse entière est le Prisme
Linguistique. Aucun des trois clients ne le lit aujourd'hui (le web n'inspecte
que `success`/`error` — à travers un `(response: any)` ; l'iOS passe par le REST
et jette le corps ; Android n'émet pas ces événements). C'est un **piège armé**,
au sens de la règle du cycle 84 : le premier client qui l'affiche montre de
l'anglais à un francophone.

## 7. La garde : `ack-door-sweep`

Deux cliquets, et aucun ne subsume l'autre :

- **le COMPILATEUR** garde ce que la porte refuse — c'est lui qui a nommé les
  deux sites du §5 ;
- **`socketio/__tests__/ack-door-sweep.test.ts`** garde qu'il n'y ait pas de
  DIXIÈME porte. Une porte relâchée et une porte contournée sont deux
  régressions distinctes ; rien n'oblige un nouveau handler à lire `AckOf<…>`.

Jumeau exact, dans le sens ENTRANT, de `server-emit-door-sweep` (cycle 104-108).

**Et il a immédiatement trouvé une QUATRIÈME famille que mon `grep` avait
manquée** : `AttachmentReactionHandler` nomme son paramètre `r`, pas `response`.
Le discriminant du balayage porte sur le **TYPE**, jamais sur le nom — c'est la
règle du cycle 107 (« un balayage qui cherche UN idiome mesure sa popularité,
pas une propriété ») appliquée dans le bon sens, et elle a payé le jour même.

**RED prouvé** sur les deux assertions : rétablir un seul
`callback?: (response: SocketIOResponse<unknown>) => void` fait tomber le
cliquet en NOMMANT le fichier.

### Pourquoi l'inventaire est GELÉ (11) et non VIDE

Onze rédactions manuelles subsistent hors des réactions. **Elles ont été ouvertes
une par une, et aucune ne ment** : `MessageHandler` déclare
`SocketIOResponse<{ messageId: string }>` là où le contrat déclare
`MessageSendResponseData`, qui **EST** `{ messageId: string }` ; les autres
déclarent l'enveloppe nue, que le contrat déclare nue aussi.

Ce sont des **jumeaux structurels** — la famille `ReactionUpdateEvent` /
`ReactionUpdateEventData` — donc un risque de DÉRIVE, pas une divergence. La
distinction commande la manœuvre : les portes qui MENTAIENT sont fermées dans le
lot qui les a trouvées ; celles qui redisent la même chose deux fois se ferment
sans urgence, et **surtout pas dans le même lot** — quatre d'entre elles sont sur
le chemin d'envoi de message, le plus fréquenté du produit.

## 8. Mesures

| gate | résultat |
|---|---|
| `tsc --noEmit` passerelle | **0 erreur** |
| Tests passerelle | **842/842 suites, 19276/19276 témoins** |
| Tests `packages/shared` | **106/106 fichiers, 2549/2549** |
| Tests `apps/web` | **758/758 suites, 14034 passés** |
| Cliquet de dette web | **1196 — inchangé** |
| `strictFunctionTypes` passerelle | **52 → 43** ; les 9 de `socketio/` à **0** |

## 9. Suivis

- [ ] **Neuf** — les 11 portes d'accusé manuscrites gelées (`FROZEN_ACK_DOORS`),
      à DRAINER. Le lot `MessageHandler` (4 sur le chemin d'envoi) exige ses
      propres témoins.
- [ ] **Neuf** — les **43** erreurs `strictFunctionTypes` restantes, toutes de la
      famille « gestionnaire de route Fastify typé `UnifiedAuthRequest` ». Elles
      nomment une vraie question : **rien ne vérifie qu'un `preHandler` d'auth a
      bien attaché `authContext`** sur une route dont le gestionnaire le lit.
      C'est un lot de sécurité, pas de typage.
- [ ] **Neuf** — le REST `DELETE /reactions/:id/:emoji` sert encore
      `{ message: 'Reaction removed successfully' }` (`reactions-routes.test.ts`).
      Même phrase anglaise, autre surface — non touchée ici pour ne pas élargir.
- [ ] Hérité — `ReactionUpdateEvent` / `ReactionUpdateEventData`, jumeaux
      structurels dans deux fichiers. Ce lot les a **cadrés** (chaque famille
      déclare ce que son émetteur envoie) sans les fusionner.
- [ ] Hérité (106) — la LECTURE depuis Redis reste non validée à l'exécution.
- [ ] Hérité — `_seq` n'est déclaré que sur `NotificationEventData` — **mesuré
      correct** ce cycle : ses deux seuls sites d'appel émettent
      `NOTIFICATION_NEW`. Le suivi devient « ne pas étendre `emitWithSeq` sans
      étendre la déclaration », pas un défaut.
- [ ] Hérité — `ConversationUpdatedEventData` et sa signature d'index.

## 10. Ce que ce cycle apprend

> **Un suivi hérité est une AFFIRMATION** (leçon du cycle 107). Celui-ci a été
> recopié trois fois comme « une grande décision à instruire » ; il se mesurait
> en une commande, et neuf de ses 52 erreurs nommaient un défaut de production
> vieux de quatre incidents.

> **Typer une porte, c'est découvrir ce qui la traversait.** Le cycle 105 l'avait
> écrit pour l'émission (`_seq`, `location`) ; c'est vrai à l'identique pour
> l'acquittement. Les deux sites du §5 n'ont été trouvés par aucune relecture —
> ils ont été trouvés par la première compilation qui avait le droit de les
> refuser.

> **Ne pas aligner une famille sur sa jumelle sans lire ce que chacune
> GARANTIT.** La tentation était de copier « ACK == broadcast » sur la famille
> message. C'eût été échanger une bonne sémantique de livraison (acquitter dès la
> persistance) contre une contrainte de décodage qu'aucun client de ce chemin
> n'a. Trois familles, trois émetteurs, trois déclarations — la consistance
> juste est que **chacune déclare ce qu'elle envoie**, pas qu'elles envoient
> toutes la même chose.
