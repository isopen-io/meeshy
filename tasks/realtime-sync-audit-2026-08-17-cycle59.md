# Cycle 59 — la dérogation avait une jumelle, et un second chemin que personne n'avait relié au premier

## 1. D'où vient la piste

Du carnet du cycle 58, piste n°1 — puis pas d'elle.

Le garde de source « tout `CLIENT_EVENTS` a un handler gateway » a bien été
instruit d'abord (§7). Il tient, il est sans faux positif, et il ne cache
**aucun défaut vivant** : les sept entrées qu'il mettrait au jour sont l'une une
déclaration parasite (`user:status` est un événement SERVEUR→client, jamais émis
par un client) et six un design suspendu documenté. Un garde préventif, donc,
pas un correctif — et le balayage de PHASE 2/PHASE 4 mené en parallèle a rendu
quelque chose de vivant.

## 2. Le défaut — deux chemins, un seul déclencheur

Le QueryClient web global tourne en `staleTime: Infinity` avec **deux** filets
de sécurité : `refetchOnWindowFocus: 'always'` et `refetchOnReconnect: 'always'`.

Sur une `useInfiniteQuery`, ces deux réglages rejouent **toutes les pages
chargées** et REMPLACENT le cache. `use-conversations-delta-sync.ts` détaille en
en-tête les trois dommages que cela coûte sur la liste de conversations :

1. dix pages de scroll = dix requêtes sur une route lourde (participants,
   dernier message avec traductions et pièce jointe, compteurs par curseur) ;
2. tout ce que la socket écrit pendant la séquence est **écrasé** ;
3. la route pagine par **OFFSET** sur un tri `lastMessageAt` décroissant : un
   message arrivé entre la page k et la page k+1 promeut sa conversation en tête
   et décale toutes les suivantes d'un cran — **une ligne dupliquée à la
   frontière, une autre disparue**.

Le troisième n'est pas un coût, c'est une **faute de correction**.

### 2.1 (a) La dérogation posée sur UN déclencheur sur deux

`useInfiniteConversationsQuery` porte `refetchOnWindowFocus: false`, avec un
commentaire de huit lignes qui énumère les trois dommages ci-dessus. Il ne porte
**pas** `refetchOnReconnect: false`. Le réglage global s'applique donc, et le
refetch destructeur reste armé — sur un déclencheur bien plus ordinaire qu'un
retour d'onglet : **toute transition réseau du navigateur** (sortie de tunnel,
bascule Wi-Fi/4G, réveil de machine).

Sa jumelle `useConversationMessagesRQ` porte les DEUX (`refetchOnWindowFocus:
false` + `refetchOnReconnect: false`). C'est, à nouveau, la forme que ce dépôt
produit le plus souvent : non pas un défaut inconnu, mais une règle **déjà
écrite, déjà appliquée une fois, et laissée intacte sur la branche d'à côté**.

Le fichier savait. À dix lignes au-dessus du hook :

> « Rattrapage après une coupure SOCKET — que `refetchOnMount` (montage) et
> `refetchOnReconnect` (réseau navigateur) laissent tous deux découverte. »

`refetchOnReconnect` est nommé, et son insuffisance instruite — sans que
personne ne remarque qu'il était toujours **actif**, à faire du mal.

### 2.2 (b) Le second chemin, sur le même déclencheur

`useInvalidateOnReconnect` (`use-socket-cache-sync.ts`), monté dans
`ConversationLayout`, écoutait `window.online` et invalidait en bloc :

```ts
queryClient.invalidateQueries({ queryKey: queryKeys.conversations.all });
queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
```

`queryKeys.conversations.all` = `['conversations']` est un **PRÉFIXE** de
`queryKeys.conversations.infinite()` = `['conversations','infinite']`. Sur une
query infinite ACTIVE — et elle l'est dès que la sidebar est montée —
l'invalidation rejoue toutes les pages chargées : **exactement (a), par une
autre porte**.

Son propre commentaire s'appuyait sur le défaut de (a) pour se justifier :

> « React Query's `refetchOnReconnect: 'always'` already handles most cases.
> This hook provides additional invalidation for socket reconnection. »

Deux erreurs en une phrase. `refetchOnReconnect` ne « handle » rien de bon ici,
c'est le premier chemin destructeur ; et `window.online` ne prouve **aucune
reconnexion de socket** — un redémarrage gateway, un drop de load balancer ou un
échec d'upgrade de transport tuent la socket sans bouger `navigator.onLine`.

### 2.3 Le point de jonction — et pourquoi corriger UN SEUL ne corrigeait rien

C'est le cœur de ce cycle.

(a) et (b) pendent au **même** déclencheur utilisateur. Désarmer (a) seul laisse
(b) rejouer les pages à chaque sortie de tunnel ; retirer (b) seul laisse (a)
faire de même. **La panne visible est inchangée dans les deux cas** — et le
témoin qui garde (a) passe au VERT, parce qu'il ne monte pas le hook de (b).

C'est le piège que le §4.2 du cycle 58 décrivait dans une autre forme : un
témoin vert au-dessus d'un défaut vivant. Il est ici structurel et non
accidentel, et la seule défense a été de prouver les deux ROUGES **séparément**,
avant de toucher au code (§4.1).

## 3. Le correctif

Deux gestes, dont un est une suppression.

1. **`refetchOnReconnect: false` sur `useInfiniteConversationsQuery`**, jumelle
   explicite de la dérogation de focus, avec la raison pour laquelle le
   rattrapage n'est pas perdu (§3.1).

2. **`useInvalidateOnReconnect` retiré** — hook, appel dans
   `ConversationLayout`, export du barrel. Ses deux clés sont déjà rattrapées,
   mieux et sans remplacement de cache :
   - conversations → `useConversationsDeltaSync` Trigger 1 (front `false → true`
     de `isSocketConnected`) : **une** requête `updatedSince` bornée, fusion
     non destructrice, plus la réconciliation complète 1×/24 h ;
   - notifications → `notificationSocketIO.onSyncDesync` → `scheduleResync`
     (`notifications.lists()` + `unreadCount()`), voie que le **cycle 58** vient
     précisément de rendre fiable, plus `refetchOnMount: 'always'` sur la liste.

Un commentaire de dix lignes remplace le hook à son emplacement, parce que la
question « pourquoi n'y a-t-il pas d'invalidation au reconnect ici ? » a une
réponse non évidente, et que la prochaine relecture la posera.

### 3.1 Pourquoi la couverture est STRICTEMENT meilleure, pas seulement égale

Le raisonnement qui autorise la suppression, et qu'il faut savoir refaire :

- **Coupure vue par le navigateur** (tunnel) : la socket tombe aussi, donc le
  front `false → true` survient au retour → le delta tourne. Couvert.
- **Coupure NON vue par le navigateur** (redémarrage gateway, drop de LB, échec
  d'upgrade de transport) : `navigator.onLine` ne bouge pas — **l'ancien chemin
  ne se déclenchait pas du tout**, le delta si. Couvert, et il ne l'était pas.
- **`navigator.onLine` qui vacille sans que la socket tombe** : aucun event
  n'a été manqué, donc il n'y a rien à rattraper. Le refetch était pur coût.

Les trois cas se ferment. Il n'existe pas de quatrième où l'ancien chemin
apportait quelque chose.

Restent deux fenêtres aveugles, **préexistantes et propres au delta** : son
garde `inFlight` et son plafond `DELTA_COOLDOWN_MS` (5 s) sautent un reconnect
qui suit un delta de moins de 5 s. C'est le comportement déjà en vigueur pour le
trigger de focus depuis son introduction ; ce cycle ne l'aggrave pas et ne le
traite pas.

## 4. Gates

- **Suite web COMPLÈTE** : **592 suites / 12 530 témoins verts**, 21 ignorés,
  sortie 0. Aucune régression ailleurs. (Cycle 58 relevait 582/12 485 : `main` a
  grossi entre-temps.)
- **`tsc --noEmit` web** : **1235 erreurs sur `main`, 1235 sur la branche**,
  mesurées sur le MÊME arbre (`git stash` entre les deux relevés). **Zéro erreur
  nouvelle.**
- **ESLint sur les 7 fichiers touchés** : sortie **identique au caractère** entre
  `main` et la branche (54 erreurs préexistantes, 3 avertissements, tous sur des
  lignes non touchées). Comparaison par empreinte triée, pas par total.
- **Parité locale** : `bun install --frozen-lockfile --ignore-scripts`,
  `prisma generate --generator client`, puis `packages/shared` reconstruit.

### 4.1 Preuve par mutation — les deux ROUGES, séparément

Le témoin livré (`use-conversations-query.test.tsx`, « ne relit PAS ses pages au
retour de connexion réseau, malgré le défaut global ») a été écrit AVANT le
correctif et observé rouge :

| état | témoin |
|---|---|
| `main` (aucune dérogation reconnect) | **ROUGE** — `getConversations` appelé 1× avec `{limit:20, offset:0}` |
| après `refetchOnReconnect: false` | **VERT** |

Le second chemin a été prouvé par un témoin **jetable**, monté exprès pour
l'isoler : `useInvalidateOnReconnect` + `useInfiniteConversationsQuery` dans un
QueryClient à `refetchOnReconnect: false` (pour que seul (b) puisse rejouer une
page), puis un `window` `online`.

| état | témoin jetable |
|---|---|
| hook présent, (a) déjà neutralisé | **ROUGE** — page rejouée |

C'est la mesure qui compte : elle montre que (a) corrigé seul **ne ferme pas la
panne**. Le témoin a été retiré avec le hook — il ne peut pas survivre à la
suppression de son sujet — et c'est pour cela qu'il est chiffré ici plutôt que
livré.

Le témoin livré passe par les **vrais** événements `window` (`offline` puis
`online`), et non par `onlineManager.setOnline()`, parce que c'est la forme sous
laquelle la panne atteint un porteur — et parce que c'est aussi la forme par
laquelle (b) l'atteignait.

### 4.2 Deux témoins retirés, et pourquoi ce n'est pas une perte de couverture

`use-socket-cache-sync.test.tsx` portait deux témoins de
`useInvalidateOnReconnect` : « invalide les queries sur l'event online » et
« nettoie l'écouteur au démontage ». Le premier épinglait, par assertion sur
`invalidateQueries`, **exactement le geste destructeur** qui motive la
suppression du hook : il verrouillait le défaut. Le second gardait un cycle de
vie qui n'existe plus.

Aucun des deux ne mesurait un comportement observable. L'invariant qu'ils
prétendaient tenir vit désormais dans `use-conversations-query.test.tsx`, en
termes de pages rejouées ou non — et **là**, il est discriminant (§4.1).

## 5. Portée — qui était touché

Tout porteur web authentifié ayant la liste de conversations montée, à **chaque**
transition réseau du navigateur : sortie de tunnel ou d'ascenseur, bascule
Wi-Fi ↔ 4G, réveil de machine, reprise d'onglet suspendu sur mobile. C'est-à-dire
plusieurs fois par trajet sur un usage mobile.

Conséquences par ordre de gravité :

1. **une ligne dupliquée et une ligne perdue** dans la liste, dès qu'un message
   arrive pendant la séquence de refetch (≥ 2 pages scrollées) ;
2. les écritures socket concurrentes (aperçu de dernier message, compteur de
   non-lus, promotion en tête) **écrasées** par la réponse REST en vol ;
3. N requêtes sur une route lourde, N = nombre de pages scrollées — 100 KB+ par
   transition, sur le lien le plus contraint qui existe (mobile qui vient de
   revenir).

La liste de MESSAGES n'était pas touchée : elle porte les deux dérogations
depuis leur introduction. Et rien à l'écran ne signalait la panne — une liste
qui se réordonne au retour de réseau ressemble à une liste qui se met à jour.

**Le défaut était déjà écrit dans le dépôt.**
`docs/bandwidth-analysis/01-socketio.md` le porte en **MOYENNE-15**, avec le bon
fichier et les bonnes lignes — mais classé en gaspillage de bande passante
(« 100 KB par reconnexion »), la conséquence la moins grave des trois. Le
préfixe de clé n'y est pas relevé, donc ni le rejeu de TOUTES les pages, ni la
ligne dupliquée à la frontière. Sa correction recommandée — « utiliser le
timestamp de déconnexion pour ne demander que les changements depuis ce
timestamp » — est *littéralement* ce que `useConversationsDeltaSync` implémente
depuis, sans que l'entrée soit refermée. Elle l'est maintenant, avec sa sévérité
relevée.

## 6. Écarté délibérément

**Garder le hook en le restreignant à `notifications.all`.** Une ligne, et le
chemin destructeur disparaît. Écarté : la moitié notifications est elle aussi
redondante (§3-2), et garder un hook pour un geste qu'un autre mécanisme fait
déjà mieux reconstitue la classe de défauts « deux voies pour un job, une seule
maintenue » dont ce cycle est la énième occurrence.

**Passer `queryKeys.conversations.infinite()` en pagination keyset**, comme la
liste de notifications l'a fait. C'est la correction qui rendrait un refetch de
pages inoffensif — donc qui supprimerait la CAUSE du dommage n°3 au lieu de
retirer ses déclencheurs. Écarté : c'est un changement de contrat de route
(`GET /conversations` pagine par offset, `routes/conversations/core.ts`), donc un
cycle entier, et le défaut constaté ici ne l'exige pas — le delta borné est déjà
la bonne réponse au rattrapage.

**Désactiver `refetchOnReconnect` globalement dans le QueryClient.** Tentant :
il ferme la classe d'un coup. Écarté : ce filet est LÉGITIME pour toute query
non infinite (détail de conversation, profil, préférences), où un refetch est
une lecture propre et non un remplacement de pages. Le désactiver globalement
aurait échangé un défaut contre un autre, plus discret.

**Un garde de source « toute query infinite porte les deux dérogations ».** Ce
serait la défense structurelle contre la répétition. Écarté ce cycle, mais le
dépouillement fait en attendant la CI le rend BEAUCOUP plus simple que prévu
(§7.1) : le critère n'est pas « toute query infinite » — c'est « toute query
infinite paginée par OFFSET », et il n'y en a que **deux** dans tout le dépôt.
Zéro liste d'exemptions à instruire. Cela reste un cycle à part entière (écrire
le garde, choisir sa forme — règle ESLint locale ou témoin de source), mais ce
n'est plus l'instruction de huit cas que ce cycle croyait devoir payer.

## 7. Découvert en chemin, NON traité

**Le garde `CLIENT_EVENTS` → handler gateway est sans faux positif, et sans
défaut vivant à révéler.** Dépouillement refait mécaniquement ce cycle
(`CLIENT_EVENTS` × tous les `socket.on` de `services/gateway/src`, en tenant
compte de `CALL_EVENTS`) : les mêmes sept que le cycle 57, à l'identique.
Instruit plus avant, la ventilation est désormais nette :

- `user:status` est une **déclaration parasite** : c'est un événement
  SERVEUR→client (`SERVER_EVENTS.USER_STATUS`, écouté par `presence.service.ts`,
  `websocket.service.ts`, iOS `PresenceManager`), et **aucun client ne l'émet**.
  Il n'a rien à faire dans `CLIENT_EVENTS` ; l'y garder est ce qui donne au
  garde un septième cas à exempter.
- les six `call:*` portent une décision de CONSERVATION explicite en commentaire
  (design leader/follower suspendu, pas abandonné).

Le garde coûterait donc six exemptions pour attraper une déclaration parasite.
La piste utile n'est pas le garde : c'est **retirer `USER_STATUS` de
`CLIENT_EVENTS`** — un geste d'une ligne, à instruire seul.

**Vérifié NON défaut en chemin** (pour que le carnet ne les reprenne pas) : la
liste de MESSAGES porte bien les deux dérogations et son Trigger 1 est correct ;
la liste de NOTIFICATIONS garde les deux filets globaux **à raison** — son
`getNextPageParam` est keyset (ancré sur une LIGNE), donc l'insertion en tête ne
décale pas le curseur et le rejeu ne peut pas dupliquer de frontière.

### 7.1 Le dépouillement qui simplifie la piste n°1 — les NEUF autres queries infinite

Fait en attendant la CI, et il change la taille de la piste. Les neuf autres
`useInfiniteQuery` du dépôt paginent **toutes par curseur keyset** :

| fichier | `getNextPageParam` |
|---|---|
| `use-feed-query.ts` (×2) | `lastPage.meta?.nextCursor` |
| `use-feed-variants.ts` (×4) | `lastPage.meta?.nextCursor` |
| `use-comments-query.ts` (×2) | `lastPage.meta?.nextCursor` |
| `use-reels-feed-query.ts` | `lastPage.pagination?.nextCursor` |
| `use-notifications-query.ts` | keyset, avec repli offset documenté |

Un curseur keyset est ancré sur une LIGNE : une insertion en tête ne le déplace
pas, donc un rejeu de pages ne peut **pas** dupliquer de frontière. Elles ne
portent aucune dérogation, et **c'est correct** — le dommage n°3 leur est
structurellement impossible. Ne reste que le coût (N requêtes), qui est le
compromis assumé du filet global.

Les **seules** queries infinite paginées par OFFSET du dépôt sont les deux du
couloir messagerie — `conversations.infinite()` et `messages.infinite(convId)` —
et elles portent maintenant toutes deux les deux dérogations.

**Conséquence pour le cycle 60** : la règle à garder n'est pas « toute query
infinite porte les deux dérogations » (faux, et neuf exemptions à justifier),
c'est « **toute query infinite paginée par OFFSET porte les deux dérogations** ».
Deux sujets, zéro exemption, un critère mécaniquement vérifiable. C'est la
formulation qui rend le garde écrivable.

## 8. Pistes pour le cycle 60 — repérées, NON livrées

1. **Le garde « toute query infinite paginée par OFFSET porte les deux
   dérogations »** (§6, §7.1). Nouvelle, entièrement instruite ce cycle : les
   neuf autres queries infinite sont keyset donc structurellement immunes, les
   deux sujets du garde sont `conversations.infinite()` et
   `messages.infinite(convId)`, et toutes deux sont désormais correctes. Le
   travail restant est la FORME du garde (règle ESLint locale ? témoin de
   source ?), pas l'instruction des cas. C'est la seule défense structurelle
   contre la répétition de ce cycle.
2. **`USER_STATUS` retiré de `CLIENT_EVENTS`** (§7) — une ligne, désormais
   entièrement instruite. Nouvelle.
3. **La file hors-ligne par APPAREIL** (cycle 58 §7) — intacte, chiffrée à deux
   moitiés, et toujours plusieurs cycles.
4. **`attachment:reaction-*` et `message:consumed` sans lecteur web** (cycle 57
   §8-3) — décision produit, pas correctif.
5. **Le mock inerte de `presence.service.test.ts`** (cycle 56 §5) — intacte.
6. **Le code mort des trois hooks de préférences React Query** (cycle 55) —
   intacte.
7. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, toujours bloquée sur l'absence de Xcode.
8. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte,
   cosmétique.
9. **Les DEUX sockets web sont-elles la bonne architecture ?** (cycle 58 §8-8) —
   intacte. Ce cycle ajoute un argument à la question : il n'y avait pas deux
   sockets en cause ici, mais **deux mécanismes de rattrapage** pour la même
   liste, dont un seul était juste. La classe est la même — « corrigé d'un côté,
   pas de l'autre » — et elle ne se limite pas aux sockets.
