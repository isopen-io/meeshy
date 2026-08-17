# Cycle 61 bis — la pastille de reconnexion existait, et le serveur la refusait à la moitié de sa population

> **Note d'intégration.** Une AUTRE exécution de la routine a livré un cycle 61
> pendant celui-ci (PR #3179, « les lois gelées franchissent enfin la frontière
> `dist/` »). Les deux sont indépendants et ont fusionné **sans conflit** ; ce
> journal est donc renuméroté *bis*, suivant la convention des cycles
> 54/56/57/60. Aucun recouvrement de fichier : l'autre cycle porte sur la parité
> `dist/` des lois partagées de lecture (`packages/shared`, `apps/web/__tests__/
> lentille/`), celui-ci sur la résolution du lecteur au reconnect
> (`services/gateway/src/socketio`, `apps/web/hooks/queries`).

## 1. D'où vient la piste

De la piste n°1 du cycle 60 bis, et elle s'est révélée fausse **dans son
diagnostic**, juste dans sa cible.

Le cycle 60 bis avait instruit ceci : `_drainedEventName` ne mappe que des
événements de MESSAGE, donc la file hors-ligne rejoue l'aperçu, le rang et la
promotion en tête de la ligne de liste, mais jamais la PASTILLE. Il en concluait
qu'il fallait **ajouter** au gateway une émission de `conversation:unread-updated`
sur la vidange de file, et annonçait « un cycle à part entière (contrat
d'événement, calcul par curseur côté serveur, jumeaux iOS/Android) ».

Le balayage préalable a rendu autre chose : **cette émission existe déjà**, sur
le même chemin de connexion, et elle couvre un SUR-ENSEMBLE de ce que la piste
proposait d'ajouter. Elle était simplement refusée à la moitié de sa population.

Ajouter le fan-out proposé aurait donc créé un **troisième écrivain** du même
compteur — exactement la classe de défaut que cette routine passe ses cycles à
supprimer — au lieu de brancher celui qui était déjà là.

## 2. Le défaut

`MeeshySocketIOManager._emitUnreadCountsSnapshot` est le seul signal qui remet
une pastille d'aplomb à la reconnexion. Il lit les compteurs par curseur
(`getUnreadCountsForUser`, UNE requête batchée pour N conversations) et émet un
`conversation:unread-updated` par conversation.

Sa résolution de participant ne lisait qu'une colonne :

```ts
where: { userId, isActive: true }     // ← ne matche RIEN pour un invité
```

Or la clé de connexion porte un `Participant.id` pour un invité de lien partagé,
jamais un `User.id` — c'est la convention de tout le reste du chemin
(`enqueueForOfflineParticipants` enfile sous `p.userId ?? p.id`,
`_dropEndedMemberships` et `_emitDeliveryForDrainedMessages` lisent sous les deux
colonnes, `ROOMS.user()` prend `userId ?? id`). La requête rendait donc zéro
ligne, la méthode sortait en silence par son `if (participantRows.length === 0)
return`, et le site d'appel enterrait le trou sous un gate :

```ts
if (!isAnonymous) {
  this._emitUnreadCountsSnapshot(socket, userId).catch(...)
}
```

Ce gate **donnait l'omission pour une règle produit**. Il n'en exprimait aucune :
il masquait une requête incomplète. Le brancher sans corriger la lecture aurait
été un no-op silencieux — c'est la raison exacte pour laquelle le trou a survécu.

### 2.1 La règle était écrite vingt lignes plus haut, dans la MÊME méthode

`_emitUnreadCountsSnapshot` est appelé depuis `_emitPresenceSnapshot`. Vingt
lignes au-dessus de l'appel, dans le corps de cette même méthode, l'instantané de
PRÉSENCE résout pourtant les deux identités correctement :

```ts
const participantRows = isAnonymous
  ? await this.prisma.participant.findMany({ where: { id: userId, isActive: true }, ... })
  : await this.prisma.participant.findMany({ where: { userId: userId, isActive: true }, ... });
```

Même méthode, même clé, même requête, deux traitements. Le cycle 60 bis avait
nommé cette classe — « une règle écrite au bon endroit et démentie par le
voisin » — sur un commentaire en CAPITALES à vingt lignes du handler qui le
violait. Ici la voisine n'est pas un commentaire : c'est la même requête, écrite
juste, vingt lignes plus haut.

## 3. Ce que ça coûtait, par population

L'invité de lien partagé est la population **DOMINANTE** d'une conversation
ouverte par lien — l'audience même de ce transport.

| lecteur | client | pastille à la reconnexion |
|---|---|---|
| inscrit | web | poussée par socket, **sans plafond** (+ N lectures REST redondantes) |
| inscrit | iOS / Android | poussée par socket, sans plafond |
| **invité** | web | **N lectures REST, PLAFONNÉES à 10** — au-delà, abandonnées |
| **invité** | iOS / Android | **JAMAIS corrigée** |

La dernière ligne est la plus grave, et elle tient à un fait vérifié
mécaniquement ce cycle : **ni iOS ni Android n'a de lecteur pour
`message:pending-delivered`.** Aucune occurrence de l'événement dans
`packages/MeeshySDK/Sources`, `apps/ios` ni `apps/android`. Les deux n'avaient
donc AUCUN recours : le badge mentait jusqu'au prochain message ou au prochain
montage complet.

Le badge ne devient pas périmé. Il **ment** : la conversation remonte en tête
avec un nouvel aperçu, visiblement, et la pastille affiche la valeur d'avant la
coupure.

## 4. Le correctif

**Gateway** — la lecture connaît les deux identités, et le gate disparaît :

```ts
where: isAnonymous
  ? { id: readerKey, isActive: true }
  : { userId: readerKey, isActive: true },
```

Le paramètre est renommé `readerKey` et `isAnonymous` voyage AVEC lui, pour la
même raison que dans `_emitDeliveryForDrainedMessages` : supposer la clé
utilisateur est précisément ce qui a fait sauter le signal pour la moitié
anonyme. `getUnreadCountsForUser` résolvait DÉJÀ les deux identités en interne
(`OR: [{ id: userId }, { userId }]`) — seule la lecture de participants au-dessus
ne connaissait qu'une colonne.

Corriger ICI corrige les **trois** clients d'un coup : les trois consomment déjà
`conversation:unread-updated` (web `handleUnreadUpdated`, iOS
`MessageSocketManager`/`ConversationSyncEngine`, Android `MessageSocketManager`).
Zéro ligne de client à écrire — le contraire de ce que la piste annonçait.

**Web** — `refreshUnreadCountsFromServer` et son plafond
`PENDING_UNREAD_REFRESH_LIMIT` sont SUPPRIMÉS (~70 lignes). Ils sont strictement
dominés : le serveur pousse le compteur sur le même chemin de connexion, pour
TOUTES les conversations du lecteur et sans plafond. Ce que la compensation
cliente ajoutait, c'était N `GET /conversations/:id` sur le lien le plus
contraint qui existe — un mobile qui vient de revenir — et l'abandon explicite
des pastilles au-delà de la dixième.

Bénéfice d'élégance qui n'était pas cherché : `handleUnreadUpdated` porte déjà la
garde de conversation OUVERTE que la lecture REST devait dupliquer (elle la
portait, en troisième exemplaire, avec son propre commentaire sur le moment de
lire `activeConversationId`). Router la pastille par l'événement ramène cette
garde à **un seul site**.

## 5. Vérification

- RED confirmé pour la bonne raison AVANT le fix : 2 des 7 nouveaux témoins
  échouaient, et sur l'assertion exacte —
  `Received: {"where": {"isActive": true, "userId": "anon-part-3"}}` là où
  `{"id": "anon-part-3"}` était attendu. Les 5 autres passaient déjà (ils
  décrivent le comportement inscrit, correct, et la sémantique best-effort) : la
  moitié anonyme SEULE était cassée, ce qui est la forme attendue.
- Le témoin web de suppression prouvé NON vacuous : la lecture REST a été
  temporairement réintroduite, le témoin est passé au ROUGE, puis le fichier a
  été restauré. Sans cette vérification il aurait été vert par vacuité — l'ancien
  code filtrait sur les lignes déjà en cache, et le harnais partagé démarre avec
  un cache vide. Le témoin sème donc les deux conversations explicitement.
- `services/gateway` : **741/741 suites, 18006/18006 tests verts** sous bun
  (couverture globale 95.15 % st / 89.19 % br / 95.81 % li).
- `apps/web` : 28 suites / 1018 tests verts sur `hooks/queries`,
  `services/socketio`, `lib/conversations` ; `use-socket-cache-sync` 75/75.
- `tsc --noEmit` gateway : **0 erreur**. Web : 1803 lignes d'erreurs
  AVANT comme APRÈS le diff (mesuré par `git stash`, à l'identique) — bruit
  pré-existant dans des fichiers de test non touchés (`a11y/river-thread`,
  `admin/users/[id]`), zéro erreur introduite, zéro erreur dans les fichiers de
  ce diff.

## 6. Écarté, et pourquoi

**Le fan-out sur la vidange de file, tel que la piste n°1 le décrivait.** Écarté
sur mesure : il aurait été un troisième écrivain du même compteur, sur un
sous-ensemble de ce que l'instantané couvre déjà, sur le même chemin de
connexion. Vérifié que l'instantané est bien un sur-ensemble : il émet pour
TOUTES les conversations actives du lecteur, et une conversation drainée dont
l'appartenance a pris fin est déjà écartée en amont par `_dropEndedMemberships`.

**Garder la lecture REST comme filet de sécurité.** Écarté : les deux lisent la
même base par les mêmes curseurs. Une panne qui fait échouer l'instantané fait
échouer la lecture. Le filet ne couvre rien qu'il ne partage.

**Attacher le pont ✦ (G-123) aux émissions de l'instantané.** Hors sujet ici :
l'instantané ne l'attachait pas davantage pour les inscrits, la parité anonyme se
fait donc à forme constante. Un `bridge` sur ce chemin est une décision à part.

## 7. Découvert en chemin, traité en partie

**`presenceSnapshot.test.ts` teste une COPIE, pas la production** — et c'est la
cause racine de la survie du défaut.

Ce fichier RÉ-IMPLÉMENTE le corps des méthodes du manager dans des helpers
`*Impl`, puis teste ces copies. Aucune de ses assertions ne peut donc passer au
ROUGE quand la production change. Conséquence directe, mesurée ce cycle : après
le fix, **la suite est restée VERTE** en attestant toujours l'ancien
comportement, y compris son témoin nommé « does NOT call
`_emitUnreadCountsSnapshot` for anonymous users ».

Il y en avait **DEUX exemplaires**, dans le même fichier, gelant le même symptôme
— et rien ne pouvait le signaler, puisque ni l'un ni l'autre ne peut tomber.

Traité : les deux témoins sont corrigés, la copie est réalignée, et un
avertissement en tête de fichier dit ce que le fichier peut et ne peut pas
prouver, avec pour consigne que toute NOUVELLE garde de comportement aille dans
`socketio/__tests__/MeeshySocketIOManager.test.ts` (vrai manager, vraies
méthodes). Les 7 témoins de ce cycle y sont.

Non traité : le repli complet du fichier. C'est un cycle à part — voir piste n°1.

**Un flake NON identifié dans `packages/shared`, observé une fois.** Après le
merge de `main`, le premier `bun run test` de `packages/shared` a rendu
`1 failed | 82 passed (83)` / `2167 passed, 1 failed (2168)`. Les **quatre**
exécutions suivantes, sans aucune modification entre-temps, ont rendu
`83 passed (83)` / `2168 passed (2168)`. Le nom du test fautif n'a pas pu être
capturé (la sortie du run fautif était déjà consommée). Signalé tel quel plutôt
qu'écarté : un échec non reproduit reste un échec observé, et ce diff ne touche
aucun fichier de `packages/shared`. À traiter comme piste si un run de CI le
reproduit — voir piste n°2 bis.

**Aucun jumeau du défaut lui-même.** Balayage mécanique : les trois autres
`if (!isAnonymous)` du gateway sont légitimes (`routes/reactions.ts` traite
explicitement les deux branches), et `socketio/utils/participant-resolver.ts` —
le résolveur partagé — résout correctement les deux identités. Les lookups
`where: { userId }` restants de `socketio/` portent tous un `User.id` véritable.
`_emitUnreadCountsSnapshot` était l'unique exception.

## 8. Pistes pour le cycle 62 — repérées, NON livrées

1. **Replier `presenceSnapshot.test.ts` dans le harnais du vrai manager** (§7).
   Nouvelle, entièrement instruite ce cycle, et c'est la piste la plus utile du
   carnet : elle ne corrige pas un défaut, elle retire un dispositif qui
   FABRIQUE des défauts verts. Le critère est mécanique et grep-able : tout
   helper de test nommé `*Impl` qui recopie un corps de méthode de production.
   Vérifier s'il en existe d'autres dans le dépôt fait partie de la piste.
2. **Identifier le flake de `packages/shared`** (§7). Observé une fois, non
   reproduit en quatre exécutions. La piste utile n'est pas de le chercher à
   l'aveugle mais de faire en sorte que le prochain le NOMME : lancer avec un
   reporter qui persiste la sortie (`vitest run --reporter=json
   --outputFile=…`) dès qu'un run de CI de `packages/shared` rougit sans cause
   évidente.
3. **Le garde « aucun `invalidateQueries` sur un PRÉFIXE d'une clé de query
   infinite paginée par OFFSET »** (cycle 60 bis piste n°2) — intacte. Toujours
   une seule exemption légitime (le `.catch` de `handleConversationNew`).
4. **`conversation:unread-updated` sans `bridge` sur le chemin de reconnexion**
   (§6). Décision de contrat, pas correctif : les deux instantanés de reconnexion
   émettent la forme courte, alors que le fan-out d'envoi
   (`emitUnreadCountsToRecipients`) sait attacher le pont. Savoir si un lecteur en
   a besoin au reconnect est une question produit.
5. **`conversations.infinite()` en pagination keyset** (cycles 59/60) — intacte,
   changement de contrat de route.
6. **La file hors-ligne par APPAREIL** (cycle 58 §7) — intacte, plusieurs cycles.
7. **`attachment:reaction-*` et `message:consumed` sans lecteur web** (cycle 57
   §8-3) — décision produit.
8. **Le mock inerte de `presence.service.test.ts`** (cycle 56 §5) — intacte. À
   rapprocher de la piste n°1 : même famille (un témoin qui ne peut rien prouver).
9. **Le code mort des trois hooks de préférences React Query** (cycle 55) —
   intacte.
10. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
    intacte, bloquée sur l'absence de Xcode.
11. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte,
    cosmétique.
12. **Les DEUX sockets web sont-elles la bonne architecture ?** (cycle 58 §8-8) —
    intacte. Ce cycle ajoute une nuance à la classe générale : ici le défaut
    n'était pas « deux mécanismes pour un job », c'était **un mécanisme correct,
    débranché pour une moitié de sa population, et une compensation cliente
    plafonnée bâtie par-dessus le débranchement**. La compensation prouvait que
    quelqu'un avait vu le symptôme sans remonter à la cause.
