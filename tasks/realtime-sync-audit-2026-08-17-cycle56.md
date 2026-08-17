# Cycle 56 — la question de la leçon 217, posée à la promesse du SERVEUR

## 0. La voie

`tasks/lane-cursor.md` est à `lane=ANDROID android_streak=1
last_run=notification-cache-first-stream`. Comme aux cycles 54-bis et 55,
l'environnement d'exécution est un conteneur Linux sans Xcode ni toolchain Swift
(`which xcodebuild swift swiftc` → rien) : les deux gates obligatoires du couloir
iOS sont inexécutables ici. Le curseur reste intact pour le prochain run
disposant d'un Xcode.

Voie retenue : le couloir temps réel, sur une surface entièrement gatable ici
(web jest + tsc, gateway jest + tsc).

## 1. D'où vient la piste

La leçon 217 (cycle 55) laisse une question de suivi, et elle est mécanique :

> Avant de déclarer qu'un événement « est traité », suivre sa charge utile
> jusqu'au composant MONTÉ qui la relit. Le suivi s'arrête à un `() => void`, à
> une clé de cache sans observateur, ou à une action de store sans appelant —
> trois formes de la même impasse, et aucune ne produit d'erreur.

Le cycle 55 l'a posée aux six écrivains de l'ORDRE de la liste. Ce cycle-ci la
pose à l'ensemble du contrat : **pour chaque événement déclaré dans
`ServerToClientEvents`, quel fichier web le lit VRAIMENT ?** Le dépouillement
(94 constantes `SERVER_EVENTS`, croisées avec l'arbre `apps/web` hors tests)
isole une classe d'événements dont l'unique référence vit dans la couche
service — abonnés, jamais relus. `reaction:sync` en fait partie, et c'est celui
dont le serveur dépend le plus.

## 2. Le constat

### 2.1 Le serveur écrit sa promesse cinq fois

`services/gateway/src/socketio/handlers/ReactionHandler.ts` justifie chacun de
ses chemins dégradés par la même phrase :

| Ligne | Situation | Justification écrite |
|---|---|---|
| 149 | la diffusion échoue après écriture | « leave peers uninformed until the next reaction:sync » |
| 195 | agrégation dégradée | « self-heals on the next sync » |
| 210 | diffusion best-effort | « Peers reconcile on the next reaction:sync » |
| 338 | idem, au retrait | « Peers reconcile on the next reaction:sync » |
| 513 | retrait non annoncé | « reaction:sync reconciles » |

**L'argument de cohérence des réactions repose entièrement sur un sync client
ultérieur.** Le serveur ne se rattrape pas lui-même ; il délègue, et il le dit.

### 2.2 Il n'y avait pas de sync ultérieur

Le tableau du rendu, remonté depuis la bulle :

| Fait | Valeur |
|---|---|
| Source rendue | `useReactionsQuery` → `['reactions', messageId]` |
| Fraîcheur | `staleTime: Infinity` |
| Remplissage à froid | `reaction:request-sync` (ACK), **une seule fois**, au montage |
| Mises à jour vivantes | `reaction:added` / `reaction:removed` |
| Rattrapage à la reconnexion | **aucun** |

Aucun `refetchOnReconnect` (désactivé de fait par `staleTime: Infinity`), aucun
abonnement au cycle de vie du socket. Pour un fil resté ouvert, « le prochain
sync » n'arrivait jamais. Tout ce que la coupure a manqué — les
`reaction:added` / `reaction:removed` émis pendant l'absence, qui ne sont pas
rejoués — restait absent de la bulle **indéfiniment**.

### 2.3 Et le remplissage à froid pouvait mémoriser un mensonge

`fetchReactions` ouvrait sur :

```ts
if (!socket?.connected) {
  resolve({ reactions: [], userReactions: [] });   // ← succès
  return;
}
```

Un **succès** vide, mémorisé sous `staleTime: Infinity`. Le montage d'un fil
précède couramment la poignée de main du socket : la requête partait, se
résolvait à vide sans qu'un seul `reaction:request-sync` soit émis, et plus rien
ne la relisait pour la vie du composant. `isLoading: false`, `error: null` — un
consommateur qui fait confiance au succès lit « ce message n'a aucune
réaction ».

Les deux défauts sont le même vu deux fois : **la requête n'avait qu'une seule
occasion d'être juste, et cette occasion courait contre la connexion.**

### 2.4 Le seul écouteur qui portait le mot « réconciliation » était mal branché

`apps/web/services/socketio/presence.service.ts` :

```ts
// Reaction sync (full state reconciliation after reconnect)
socket.on(SERVER_EVENTS.REACTION_SYNC as any, (data: any) => {
  this.reactionAddedListeners.forEach(listener => listener(data));
});
```

Trois défauts empilés :

1. **La charge est disjointe de celle du seau.** `ReactionSyncEventData` est un
   INSTANTANÉ — `{ messageId, reactions[], totalCount, userReactions[] }` ;
   `ReactionUpdateEventData` est un DELTA — `{ messageId, conversationId,
   participantId, userId?, emoji, action, aggregation, timestamp }`. Aucun champ
   commun hors `messageId`. Versé dans `handleReactionAdded`, l'instantané
   produit `existing = old.reactions.find(r => r.emoji === undefined)` →
   `undefined`, puis `newReactions = [...old.reactions, event.aggregation]` :
   **`undefined` poussé dans la liste d'agrégations rendue.**

2. **Aucun serveur ne l'émet.** Le sync des réactions est une requête/réponse :
   le client émet `reaction:request-sync`, `ReactionHandler.handleReactionSync`
   répond dans l'ACK. `SERVER_EVENTS.REACTION_SYNC` n'a **zéro émetteur** dans
   tout le dépôt ; le nom `reaction:sync` n'y subsiste que comme étiquette de
   journal et préfixe de quota. Le défaut était donc latent — mais il était armé.

3. **Le double `as any`** — sur le nom de l'événement ET sur la donnée —
   supprimait la seule vérification qui l'aurait refusé.

Le commentaire annonçait la réconciliation. Le code la rendait impossible.

### 2.5 Pourquoi cela avait survécu

Le témoin existant l'avait **épinglé comme une fonctionnalité** :

```ts
it('forwards reaction:sync events to reactionAdded listeners (full reconciliation)', …)
```

Un test qui décrit le mis-routage avec le vocabulaire de l'intention. C'est la
forme la plus solide de camouflage : la ligne est abonnée, elle fait quelque
chose, et un témoin vert affirme que c'est la bonne chose.

## 3. Le correctif

Trois gestes, un par défaut constaté.

1. **`fetchReactions` REJETTE quand le canal est absent**
   (`ReactionSocketUnavailableError`). Une absence de canal se signale comme un
   échec ; elle ne se raconte pas comme une absence de réaction. L'erreur ne se
   réessaie pas — `retry` la reconnaît et rend `false` : tant que la connexion
   n'est pas revenue, la n-ième tentative échouera comme la première. C'est le
   RETOUR DE LA CONNEXION, pas un compteur, qui relance la demande.

2. **Le retour de la connexion redemande l'instantané.** Le hook s'abonne à
   `meeshySocketIOService.onStatusChange` et ne redemande qu'au franchissement
   injoignable → joignable. C'est la réconciliation que le gateway annonce cinq
   fois, mise en service pour la première fois côté web. Elle répare aussi, par
   construction, le montage à froid du §2.3.

3. **`reaction:sync` cesse d'être un canal serveur→client.** L'abonnement est
   retiré de `presence.service.ts`, et l'entrée est retirée de
   `ServerToClientEvents` **et** de `SERVER_EVENTS` : déclarer un canal sans
   émetteur est ce qui a rendu le mis-routage crédible. `ReactionSyncEventData`
   reste — il décrit l'ACK de `CLIENT_EVENTS.REACTION_REQUEST_SYNC`, sa seule
   vraie place.

### 3.1 Volume

Une demande par bulle montée au franchissement, sous la même limite
`SOCKET_RATE_LIMITS.REACTION_SYNC` (120 req/60 s) que le gateway applique déjà.
C'est exactement le volume, déjà admis, de l'ouverture d'un fil : `initialData`
n'est fourni qu'aux messages porteurs d'un `reactionSummary`, donc le montage
d'une liste émet déjà une demande par bulle sans résumé.

### 3.2 Ce que le correctif ne fait pas

Il ne recalcule rien côté client et n'invente aucune diffusion. L'instantané
vient du serveur, par le chemin que le serveur a choisi (l'ACK). La borne est
celle des cycles 54-bis et 55 : ne jamais rejouer dans le client une règle qui
appartient au serveur.

## 4. Gates

- **Suite web complète** : **581 suites / 12 464 témoins verts**, 21 ignorés,
  0 échec (`bun x jest`, 101 s). Base cycle 55 : 12 459 → **+5 témoins**.
- **Suite gateway complète** : **740 suites / 17 928 témoins verts**, 0 échec
  (434 s) — le retrait de la constante partagée ne touche aucun chemin serveur.
- **Preuve par mutation, dans les deux sens** — chaque mutation tue exactement
  les témoins qui la visent :

  | Mutation | Témoins rouges |
  |---|---|
  | `fetchReactions` re-résout à vide au lieu de rejeter | **2** |
  | refetch de reconnexion neutralisé | **2** |
  | refetch sur TOUT changement d'état (sans franchissement) | **1** |
  | garde `isPersisted` retirée de l'effet | **1** |
  | écouteur `reaction:sync` réinjecté (constante retirée) | **1** |
  | état d'AVANT complet réinjecté (constante + écouteur) | **1** |

- **`tsc --noEmit` web** : **1234 erreurs avant, 1234 après**. Listes triées et
  normalisées sur les numéros de ligne : identiques à 4 messages près, dont
  l'ORDRE des membres d'union varie d'un run à l'autre — même non-déterminisme
  que celui documenté au cycle 55. **Zéro erreur nouvelle.**
- **`tsc --noEmit` gateway** : **0 erreur**.
- **Gardes de dépôt** : `check-law-literals.sh` et `check-swift-viewbuilder.sh`
  verts.
- **Parité locale** : `bun install --frozen-lockfile --ignore-scripts` (le
  postinstall de `grpc-tools` télécharge un binaire précompilé inaccessible
  depuis ce conteneur ; il ne concerne aucun chemin testé), `prisma generate`
  (client 6.19.3, binaire épinglé du workspace) + `packages/shared` reconstruit
  avant chaque campagne (`moduleNameMapper` pointe sur `dist/`).

## 5. Découvert en chemin, NON traité

**Le `jest.mock('@meeshy/shared/types/socketio-events', …)` de
`presence.service.test.ts` est inerte.** `moduleNameMapper` réécrit
`^@meeshy/shared/(.*)$` vers `packages/shared/dist/$1` : la fabrique de mock,
enregistrée sous le spécifieur non mappé, n'intercepte jamais le module
réellement chargé. Le test tourne donc contre le vrai contrat compilé — ce qui
se voit à ce que `SERVER_EVENTS.REACTION_SYNC` valait `undefined` sous mutation,
et non `'reaction:sync'`. Sans conséquence sur la justesse (le vrai contrat est
la meilleure référence possible), mais la table de 21 constantes recopiée en
tête de fichier est du code mort qui se lit comme une source de vérité.

## 6. Écarté délibérément

**Consommer `reaction:sync` comme une diffusion, avec sa propre sortie typée.**
C'est ce que la leçon 217 prescrit pour un événement qui porte une charge — mais
seulement pour un événement qui EXISTE. Ici aucun serveur n'émet, et le sync a
déjà son transport (l'ACK). Brancher un consommateur aurait ajouté du code
spéculatif là où le geste juste est de retirer la déclaration.

**Étendre le retrait aux autres membres de la classe** — `attachment:reaction-*`
(zéro consommateur web), `post:reaction-sync`, `comment:reaction-sync`,
`location:live-*`, `message:consumed`. Ils appartiennent au même dépouillement
(§1) mais chacun demande sa propre instruction : `attachment:reaction-*` est un
émetteur serveur COMPLET (handler dédié, rejeu de file hors-ligne) sans UI web —
une fonctionnalité non implémentée, pas un défaut de synchronisation. Piste n°1
du cycle 57.

**Un garde de source « tout événement de `ServerToClientEvents` doit avoir un
émetteur gateway ».** C'est la forme générale du §2.4-2 et elle serait
mécanique. Écarté faute d'avoir pu la rendre sans faux positifs : plusieurs
familles (appels, agent admin) émettent par indirection
(`mapEventTypeToServerEvent`, relais Redis), qu'un grep ne suit pas. À instruire
avant d'être livrée.

## 7. Pistes pour le cycle 57 — repérées, NON livrées

1. **`attachment:reaction-added` / `attachment:reaction-removed` : émetteur
   serveur complet, zéro consommateur web** (§6). Décider s'il s'agit d'une
   fonctionnalité à porter ou d'un contrat à réduire.
2. **`message:consumed` (view-once) n'a aucun abonné possible sur web** :
   `MessagingService.onMessageConsumed` existe, mais n'est exposé ni par
   l'orchestrateur ni par la façade — le `Set` d'écouteurs ne peut pas être
   peuplé. Impasse de la leçon 217, quatrième forme.
3. **Le mock inerte de `presence.service.test.ts`** (§5) — et la question de
   savoir combien d'autres suites recopient un contrat qu'elles n'utilisent pas.
4. **Le code mort des trois hooks de préférences React Query** (piste n°1 du
   cycle 55) — intacte.
5. **`handleMessageDeleted` renonce quand le cache messages est vide** —
   intacte, à re-prouver avant d'y consacrer un cycle.
6. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, bloquée sur l'absence de Xcode.
7. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte.
