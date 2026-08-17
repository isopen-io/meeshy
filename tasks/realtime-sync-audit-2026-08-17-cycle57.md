# Cycle 57 — le rattrapage du cycle 56 dépensait le budget dont il dépend

## 0. La voie

`tasks/lane-cursor.md` est à `lane=ANDROID android_streak=3
last_run=discover-email-invite`. Ce fichier appartient à la routine **Android**
(leçon 111) : ce cycle ne l'écrit pas.

Comme aux cycles 54-bis, 55 et 56, l'environnement d'exécution est un conteneur
Linux sans Xcode ni toolchain Swift (`which xcodebuild swift swiftc` → rien) :
les deux gates obligatoires du couloir iOS restent inexécutables ici.

Voie retenue : le couloir temps réel, sur une surface entièrement gatable
(web jest + tsc, gateway jest + tsc). Le cycle précédent en est la matière
première — la consigne est de « se baser sur le précédent développement de la
routine », et c'est exactement là que le défaut se trouvait.

## 1. D'où vient la piste

Le cycle 56 a mis en service la réconciliation des réactions au retour de la
connexion — celle que `ReactionHandler` promet cinq fois et que personne ne
faisait. Le correctif est juste. Son **volume** ne l'était pas, et le cycle 56
l'a écrit lui-même sans en tirer la conséquence :

> §3.1 — « Une demande par bulle montée au franchissement, sous la même limite
> `SOCKET_RATE_LIMITS.REACTION_SYNC` (120 req/60 s) que le gateway applique
> déjà. C'est exactement le volume, déjà admis, de l'ouverture d'un fil. »

L'assimilation est fausse sur un point décisif : **l'ouverture d'un fil est un
événement rare, un franchissement de connexion ne l'est pas.** Une connexion qui
bat — le cas même pour lequel la réconciliation existe — produit un
franchissement par battement, et chaque franchissement rejoue la rafale entière.

## 2. Le constat

### 2.1 La rafale n'est bornée par rien

`useReactionsQuery` est monté **par bulle**, sans condition sur la présence de
réactions (`BubbleMessageNormalView.tsx:104` — `enabled: !!currentUser ||
!!currentAnonymousUserId`). L'effet de réconciliation s'abonne donc une fois par
bulle rendue, et `emitStatusChange` les notifie **toutes dans le même tick** :

| Fait | Valeur |
|---|---|
| Abonnés par fil | 1 par bulle rendue (N) |
| Demandes par franchissement | N, émises dans le même tick |
| Budget serveur | 120 / 60 s **par utilisateur** (`REACTION_SYNC`) |
| Coût d'un fil de 40 bulles | 40 demandes par battement |

Trois battements en une minute sur un fil de 40 bulles franchissent le plafond.
Une bulle ne peut pas savoir combien de voisines partagent son budget : aucune
ne pouvait décider seule d'attendre.

### 2.2 Et le refus se doublait lui-même

Au-delà du plafond, `handleReactionSync` répond
`{ success: false, error: 'Rate limit exceeded' }` (`ReactionHandler.ts:383`).
Côté web, `fetchReactions` en faisait une `Error` générique, que la politique de
réessai traitait comme une panne :

```ts
retry: (failureCount, error) =>
  error instanceof ReactionSocketUnavailableError ? false : failureCount < 1,
```

Chaque bulle refusée repartait donc **une seconde fois**, dans la fenêtre qui
venait précisément de la refuser. La rafale qui épuise le budget le creusait
ensuite : jusqu'à 2N demandes pour N bulles, et le refus final laissait la bulle
sur son état d'avant la coupure, `staleTime: Infinity` interdisant toute
relecture jusqu'au franchissement SUIVANT.

Le cycle 56 avait écrit le bon raisonnement — pour l'autre refus :

> §3.1 — « L'erreur ne se réessaie pas : tant que la connexion n'est pas
> revenue, la n-ième tentative échouera comme la première. »

Un budget épuisé est le même cas, mot pour mot : la fenêtre du serveur n'a pas
bougé entre deux tentatives immédiates. Il manquait seulement d'être reconnu.

### 2.3 Le résultat net

La réconciliation échouait exactement dans le scénario qui la justifie. Une
connexion stable (un franchissement isolé, fil court) la voyait réussir ; une
connexion qui bat sur un fil long la voyait se refuser toute seule, et les
réactions restaient fausses — l'état que le cycle 56 existait pour corriger.

## 3. Le correctif

Deux gestes, un par défaut constaté, plus le partage du chiffre dont les deux
dépendent.

1. **Le budget serveur devient partagé.** `REACTION_SYNC_BUDGET`
   (`packages/shared/types/socketio-events.ts`) porte les deux nombres ;
   `SOCKET_RATE_LIMITS.REACTION_SYNC` les consomme et ne garde que son
   `keyPrefix` (la clé Redis est une affaire de serveur, le budget non). Un
   client qui se cadence sur un plafond qu'il DEVINE le devine faux au premier
   ajustement — c'est la règle « single source of truth » appliquée à un nombre
   qui vient de traverser la frontière client/serveur.

2. **La rafale prend un tour d'émission.** `RECONCILE_SPACING_MS` n'est pas
   choisi : c'est `windowMs / maxRequests`, donc le débit le plus rapide qui, par
   construction, ne peut pas épuiser la fenêtre. Un compteur de module attribue
   un créneau à chaque bulle réveillée et se remet à zéro en microtâche — les
   abonnés d'un même franchissement sont notifiés synchronement, donc ils ont
   tous pris leur créneau quand elle s'exécute, et le franchissement suivant
   repart de zéro. **Une bulle seule garde le créneau 0 et part immédiatement** :
   le chemin nominal n'a pas changé. Le minuteur meurt avec le composant — une
   bulle sortie de l'écran ne dépense pas un budget pour un observateur démonté.

3. **Un refus n'est plus une panne.** `RATE_LIMIT_REFUSAL_MESSAGE` est partagé
   (le client doit pouvoir séparer « pas maintenant » de « raté » sans analyser
   une prose que chaque client re-devinerait) ; `fetchReactions` en fait une
   `ReactionSyncRateLimitedError`, que `retry` refuse de réessayer — au même
   titre, et pour la même raison, que le canal absent du cycle 56.

### 3.1 Ce que le correctif ne fait pas

Il n'invente aucun transport et ne déplace pas la réconciliation ailleurs. La
demande reste `reaction:request-sync`, une par bulle, par le chemin que le
serveur a choisi (l'ACK). Il ne PLAFONNE rien non plus : aucune bulle n'est
sacrifiée, N bulles convergent en N × 500 ms. Pas de troncature silencieuse.

## 4. Gates

- **Suite web complète** : **582 suites / 12 472 témoins verts**, 21 ignorés,
  0 échec (`bun x jest`, 224 s). Base cycle 56 : 12 464 → **+5 témoins de ce
  cycle**, le reste venant de `main`.
- **Suite gateway complète** : voir §4.1.
- **Preuve par mutation, dans les deux sens** — chaque mutation tue exactement
  les témoins qui la visent :

  | Mutation | Témoins rouges |
  |---|---|
  | cadencement neutralisé (tout le monde au créneau 0) | **2** |
  | minuteur non purgé au démontage | **1** |
  | refus de budget redevenu réessayable | **1** |
  | TOUT échec rendu non-réessayable | **1** |
  | espacement cessant de dériver du budget serveur | **1** |

- **`tsc --noEmit` web** : **1234 erreurs avant, 1234 après** — mesuré sur le
  même arbre, `main` puis la branche. **Zéro erreur nouvelle.** (Même dette
  préexistante qu'aux cycles 55 et 56.)
- **`tsc --noEmit` gateway** : voir §4.1.
- **Parité locale** : `bun install --frozen-lockfile --ignore-scripts`,
  `prisma generate --generator client`, puis `packages/shared` reconstruit avant
  chaque campagne (`moduleNameMapper` pointe sur `dist/`).

### 4.1 Résultats gateway

Renseigné à la fin du run — voir la section « Gates » du commit.

## 5. Découvert en chemin, NON traité

**Sept événements client→serveur déclarés sans handler gateway ET sans émetteur
client** : `user:status`, `call:audio-chunk`, `call:quality-feedback`,
`call:translation-request`, `call:translation-response`,
`call:transcription-capability`, `call:transcription-role`. Dépouillement
mécanique : `CLIENT_EVENTS.*` croisé avec tous les `socket.on(...)` de
`services/gateway/src`, en tenant compte de la seconde table `CALL_EVENTS`
(`packages/shared/types/video-call.ts`), qui est l'autorité réelle du couloir
appels. C'est la forme CLIENT→SERVEUR du §2.4-2 du cycle 56, et contrairement à
la direction serveur→client elle n'a **aucune indirection** : pas de relais
Redis, pas de `mapEventTypeToServerEvent`. Un garde de source y serait donc sans
faux positif — ce que le cycle 56 n'avait pas pu obtenir dans l'autre sens.

Non traité ici parce que quatre des sept portent une décision explicite de
CONSERVATION dans `CALL_EVENTS` (« le design leader/follower est suspendu, pas
abandonné ») : les retirer de `CLIENT_EVENTS` sans instruire cette décision
opposerait deux tables du même dépôt. La duplication elle-même — deux tables
pour les mêmes noms de fil, dont une seule porte les `@deprecated` — est la
piste, pas les sept entrées.

**Le drain de la file hors-ligne est destructif et clé par UTILISATEUR**
(`MeeshySocketIOManager._drainPendingMessages`, clé `userId ?? participantId`).
Deux appareils d'une même personne hors ligne, le premier à revenir consomme
l'arriéré des deux : le second ne reçoit rien. Le code documente l'émission vers
la user-room comme l'atténuation, ce qui ne couvre que les appareils connectés
à CET instant. Réel, mais la correction est une file par appareil — une
instruction à part entière.

## 6. Écarté délibérément

**Un `reaction:request-sync` par lot (N messageIds en une demande).** C'est la
correction qui supprimerait la rafale au lieu de la cadencer, et elle est
tentante. Écartée : c'est un nouveau contrat serveur (événement, validation,
quota, ACK), donc un cycle à elle seule — et le défaut constaté ici ne l'exige
pas. Le cadencement rend la réconciliation correcte pour tout N ; le lot la
rendrait plus rapide. Optimiser avant d'être juste aurait inversé l'ordre.

**Plafonner la rafale à K bulles.** Aurait borné le volume en laissant N − K
bulles durablement fausses, sans que rien ne le dise — la troncature silencieuse
que le dépôt s'interdit.

**Déplacer `SOCKET_RATE_LIMITS` entier dans `packages/shared`.** Seul le budget
`REACTION_SYNC` a traversé la frontière client/serveur ; les autres n'ont aucun
lecteur client. Déplacer la table entière aurait touché huit fichiers gateway
pour une seule ligne utile.

## 7. Pistes pour le cycle 58 — repérées, NON livrées

1. **Le garde de source « tout `CLIENT_EVENTS` a un handler gateway »** (§5) —
   la seule direction où il est sans faux positif, et la duplication
   `CLIENT_EVENTS` / `CALL_EVENTS` qu'il mettrait au jour.
2. **Le drain hors-ligne par utilisateur et non par appareil** (§5).
3. **`attachment:reaction-added` / `attachment:reaction-removed` : émetteur
   serveur COMPLET (handler, rejeu hors-ligne) et zéro référence web**, ni
   émission ni écoute — confirmé ce cycle. Fonctionnalité non portée, pas défaut
   de synchronisation. Même statut pour `message:consumed` (view-once) : le
   gateway l'émet, `MessagingService.onMessageConsumed` existe, et **aucune vue
   web ne rend le view-once** (`isViewOnce` n'est lu par aucun composant). Les
   deux demandent une décision produit, pas un correctif.
4. **Le mock inerte de `presence.service.test.ts`** (cycle 56 §5) — intacte.
5. **Le code mort des trois hooks de préférences React Query** (cycle 55) —
   intacte.
6. **`handleMessageDeleted` renonce quand le cache messages est vide** — RE-PROUVÉ
   NON DÉFAUT ce cycle : `emitConversationPreviewUpdate` fane un
   `conversation:updated` recalculé vers la user-room de chaque participant sur
   la suppression, donc l'aperçu de liste ne dépend pas du cache messages. La
   piste peut sortir du carnet.
7. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, bloquée sur l'absence de Xcode.
8. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte.
