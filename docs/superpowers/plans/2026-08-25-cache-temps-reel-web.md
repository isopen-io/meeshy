# Web — les messages cessent d'arriver, et recharger ne les rend pas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fermer les DEUX symptômes que l'utilisateur décrit — un message qui arrive et ne s'affiche pas (A), et un rechargement qui ne rend pas les derniers messages (B) — puis, **et seulement ensuite**, réduire le nombre de caches qui détiennent un message.

**Directive produit:** 2026-08-25, mot pour mot — « L'application web n'affiche pas les messages en temps réel, TROP bogué. Quand on recharge la conversation on n'a pas les derniers messages. » Contrainte de fond, mot pour mot : « ne pas avoir trop de solutions dupliquées de mise en cache et de gestion de cache ».

**Tech Stack:** Next.js 15, React Query v5 (`@tanstack/react-query`), Socket.IO client, Jest + jest-environment-jsdom (`apps/web/jest.config.js`), Playwright (`tests/`).

---

## ⛔ LE FAIT QUI GOUVERNE TOUT LE PLAN : A ET B N'ONT PAS LA MÊME CAUSE

C'est l'information la plus utile de cet audit, et c'est elle qui explique pourquoi ceci a déjà été « corrigé » plusieurs fois sans jamais l'être.

| | Symptôme A — un message arrivant ne s'affiche pas | Symptôme B — recharger ne rend pas les derniers |
|---|---|---|
| Couche | **JS applicatif** — hook React, écrivain socket | **Service Worker** — sous tout le JS applicatif |
| Fichier | `apps/web/hooks/queries/use-conversation-messages-rq.ts:328` + absence de `useSocketCacheSync` sur `BubbleStreamPage` | `apps/web/public/sw.js:112` |
| Écrans touchés | `/` (accueil) et `/chat` **seulement** — `/conversations/[id]` est sain | **toutes** les routes, toutes les lectures GET du gateway |
| Survit à un F5 ? | non | **oui — indéfiniment** |
| Testé aujourd'hui ? | oui (2 000+ lignes de tests sur `use-socket-cache-sync`) | **zéro test dans tout le dépôt** |

**Corriger l'un ne corrige pas l'autre.** Pire : B *empoisonne le filet de sécurité de A* (voir la chaîne A ci-dessous, dernier maillon), ce qui donne l'illusion d'une cause unique. Deux correctifs sont nécessaires, et ils touchent deux fichiers qui n'ont aucun rapport l'un avec l'autre.

---

## A. Les deux chaînes du défaut — MESURÉES le 2026-08-25, fichiers ouverts, pas citées de seconde main

Tout ce qui suit a été lu ligne à ligne dans `/Users/smpceo/Documents/v2_meeshy-composer`. Ce qui ne l'a pas été est marqué **non vérifié**.

### Chaîne B — recharger sert l'état d'AVANT (la plus grave : elle survit au geste de rattrapage)

> L'utilisateur **recharge la page** (F5) sur une conversation
> → React Query **émet réellement une requête réseau** : `refetchOnMount: 'always'`, dérogation explicite au `staleTime: Infinity` global — **`use-conversation-messages-rq.ts:231`** (vérifié ; le commentaire au-dessus, l. 224-230, dit mot pour mot « un message manquant ne réapparaissait jamais, même après plusieurs F5 »)
> → cette requête part en `fetch` natif vers `…/conversations/<id>/messages?limit=20&offset=0` — **`apps/web/services/api.service.ts:207`**, URL construite en **`messages.service.ts:53-66`** (mode `offset`, aucun paramètre variable)
> → un Service Worker enregistré **inconditionnellement au layout racine** (`apps/web/app/layout.tsx:93` → `ServiceWorkerInitializer` → `apps/web/utils/service-worker.ts:16`, scope `/`) l'intercepte, parce que la branche **`sw.js:100`** attrape `url.pathname.startsWith('/api/') || url.hostname.includes('gate.')` — les deux vraies
> → **et parce que `apps/web/public/sw.js:112` fait `return cachedResponse || fetchPromise;`**, la réponse RÉSEAU n'est jamais rendue à l'appelant quand une entrée existe : `fetchPromise` continue en tâche de fond et écrit dans le cache (`sw.js:107`) **pour la prochaine fois**
> → **donc l'utilisateur voit la conversation telle qu'elle était au rechargement PRÉCÉDENT.** Recharger deux fois de suite fait apparaître les messages — d'où « TROP bogué » plutôt que « ça ne marche jamais ».

Ce qui rend cette interception **déterministe sur la lecture de montage, et sur elle seule** : la clé de Cache Storage est l'URL complète.

| lecture | URL | stabilité | conséquence |
|---|---|---|---|
| montage (`refetchOnMount:'always'`) | `?limit=20&offset=0` | **strictement constante** | **HIT garanti ⇒ toujours périmé** |
| pagination (`before=<id>`) | varie | miss | inoffensif (historique immuable) |
| rattrapage (`after=<ISO>`, `messages.service.ts:59`) | horodatage variable | **miss systématique** | atteint toujours le réseau |

**Prédiction vérifiable qui distingue cette cause de toute autre :** quitter l'onglet puis y revenir **répare** l'affichage (~6 s de débounce), alors qu'un F5 ne répare **jamais**. Et c'est structurel : `use-conversation-messages-rq.ts:735-741` documente qu'il n'y a **volontairement aucun catch-up au montage**, `refetchOnMount:'always'` étant censé couvrir plus large.

**Aggravants mesurés :**
- **Aucun TTL, aucun plafond.** `sw.js:56-66` ne purge que les caches dont le nom diffère de `CACHE_NAME = meeshy-cache-${APP_BUILD_VERSION}` (`sw.js:17`) — c'est-à-dire **uniquement lors d'un déploiement**. En prod ce nom est figé au démarrage du conteneur (`apps/web/docker-entrypoint.sh`, `BUILD_$(date …)`) : la fenêtre de péremption est **non bornée**. En dev, le repli `DEV_${Date.now()}` (`sw.js:15`) renomme le cache à chaque redémarrage du worker — **c'est pourquoi le défaut est invisible en local et présent en production.**
- **La restriction est ANNONCÉE par le serveur et respectée par personne.** La route rend `Cache-Control: private, no-cache` (`services/gateway/src/utils/etag.ts`, via `sendWithETag`). La **Cache Storage API n'est pas un cache HTTP** : elle ignore intégralement `Cache-Control`. C'est la leçon du cycle 124 de `CLAUDE.md` rejouée entre le gateway et le SW — *un champ de service qui DÉCLARE une restriction ne la fait pas respecter*.
- **`private` non plus n'est pas honoré** : la clé est l'URL, pas l'en-tête `Authorization`. Deux comptes sur le même navigateur partagent la même entrée. **Non observé en navigateur réel** (voir § non tranché) — mécaniquement impliqué par la clé.
- **Aucun chemin applicatif ne peut vider ce cache** : `sw.js:149-154` ne connaît que `SKIP_WAITING`, et rien dans `apps/web/utils/service-worker.ts` ne poste autre chose. Le seul purgeur est `performFullAppInvalidationAndReload`, derrière un clic utilisateur sur la bannière « mise à jour disponible ».

### Chaîne A — un message arrivant ne s'affiche pas (sur l'accueil et /chat, PAS sur /conversations)

> L'utilisateur est sur **l'accueil `/`** (`apps/web/app/page.tsx:33` monte `<BubbleStreamPage conversationId="meeshy" />` pour **tout** utilisateur authentifié — l'écran le plus fréquenté de l'app, pas un cas marginal)
> → un correspondant envoie un message ; le gateway l'émet, le client le reçoit et le convertit
> → `BubbleStreamPage` appelle **`addMessage(message)`** (`apps/web/components/common/bubble-stream-page.tsx:300`) — car **`useSocketCacheSync` n'est monté QUE par `ConversationLayout.tsx:251`** (vérifié : c'est le seul site de montage de tout `apps/web`)
> → **`use-conversation-messages-rq.ts:328` : `if (!old) return old;`** — si aucune page n'est encore en cache (lecture initiale encore en vol, ou conversation jamais ouverte cette session), l'écriture est un **no-op silencieux**, et `wasAdded` reste `false` sans qu'aucun appelant n'en fasse rien
> → **et le filet qui existe pour ce cas précis vit chez le voisin non monté** : `use-socket-cache-sync.ts:626-630` (`if (!landedInCache) invalidateQueries(...)`) n'est jamais exécuté ici
> → pendant ce temps `apps/web/services/socketio/messaging.service.ts:94` a **brûlé l'id du message pour 5 minutes** (`recentMessageIds`) : le serveur peut le rediffuser, il sera jeté
> → et `staleTime: Infinity` (`query-client.ts:19`) garantit qu'aucune relecture spontanée ne le rattrape
> → **donc le message est perdu pour la session.** L'utilisateur recharge → **et tombe sur la chaîne B**, qui lui ressert l'état d'avant.

**Second défaut de contenu, sur toutes les routes cette fois** — la bulle se peint mais son contenu est appauvri :
> `apps/web/services/meeshy-socketio.service.ts:662-663` écrit **en dur** `isEdited: false` et `translations: []`.
> Le gateway envoie pourtant les traductions réelles sur le chemin REST/ZMQ (`MeeshySocketIOManager.ts` ~l. 2727-2780), le contrat de fil les déclare (`packages/shared/types/socketio-events.ts`), et le transformateur REST du même dépôt **les conserve** (`apps/web/services/conversations/transformers.service.ts:407`).
> → **donc en temps réel la bulle sort en langue d'origine, sans puce de traduction ; après rechargement elle sort traduite.** C'est littéralement « le temps réel est bogué, il faut recharger ».
> Pire, `message:edited` emprunte le **même** convertisseur et `use-socket-cache-sync.ts:715` fusionne par `{ ...m, ...message }` : **éditer un message ÉCRASE les traductions déjà en cache** — sous les yeux du lecteur, une bulle traduite redevient l'original.

### Ce qui a été VÉRIFIÉ et INNOCENTÉ (ne pas y retoucher)

- **La persistance React Query n'est pas la cause de B.** `apps/web/lib/react-query/persist-options.ts:16` : `VOLATILE_ROOTS = new Set(['messages','notifications'])`. La racine `messages` est **exclue** de la déshydratation IndexedDB. Après un F5, **aucun** message n'est restauré du disque. Le suspect n°1 désigné est déjà innocent, et le durcissement posé contre lui est déjà en place et testé (`apps/web/__tests__/lib/react-query/persist-options.test.ts`).
- **La clé d'écriture socket est bien celle que la vue lit.** `messageCacheKeysFor` (`use-socket-cache-sync.ts:496-514`) balaie `['messages','list']`, matche `key[2] === conversationId` **et** retombe sur un balayage page par page pour les entrées clenchées par identifiant (`meeshy`). La vue lit `queryKeys.messages.infinite(conversationId)` (`query-keys.ts:22-24`). **Identiques.** Il n'y a pas de désaccord de clé sur `/conversations/[id]`.
- **Le rattrapage incrémental existe et fonctionne.** `syncNewerMessages` (`?after=<watermark>`) est câblé sur le front de reconnexion socket et le retour de focus. L'hypothèse « le web ne rattrape jamais » est **fausse** et ne doit pas être recopiée.

### Classement des constats — les trois se corrigent différemment

**(a) DÉFAUTS — le code ne fait pas ce qu'il annonce :**
1. `sw.js:112` — la stratégie est commentée « SWR … tout en les mettant à jour » ; elle ne met à jour que le cache, jamais l'appelant. **Cause de B.**
2. `use-conversation-messages-rq.ts:328` — `addMessage` rend `false` sur cache vide et **aucun appelant ne traite ce `false`**. **Cause de A.**
3. `meeshy-socketio.service.ts:662-663` — `translations: []` / `isEdited: false` en dur détruisent une donnée que le serveur envoie. **Cause de A-contenu.**
4. `messages.service.ts:113-120` — toute erreur non-abort est avalée et rendue comme `EMPTY_MESSAGES_RESPONSE`. React Query l'enregistre en **SUCCÈS à zéro message**, sans retry (l'erreur n'est pas levée), et `staleTime: Infinity` le fige. Un 401/500/timeout au rechargement produit un fil **vide, silencieusement**. **Second candidat pour B, non exercé.**

**(b) CONFIGURATIONS mal choisies — le code fait ce qu'on lui a dit, mal :**
5. La branche `sw.js:100` intercepte `/api/` **en bloc** : aucune raison de mettre en cache une lecture de messages, temps-réel par nature.
6. `useSocketCacheSync` est monté par **un seul** hôte alors que trois routes servent des messages.
7. `authManager` ne purge **ni** `queryClient.clear()`, **ni** `caches.delete()`, **ni** `indexedDB.deleteDatabase()` au logout. Problème de **confidentialité** distinct de A et B ; son propre lot.

**(c) DUPLICATIONS — deux caches pour la même donnée, qui divergent** (ce que l'utilisateur dénonce) :
8. **Quatre couches empilées sur la même lecture** : React Query mémoire → persister IndexedDB (24 h) → **Cache Storage du SW (sans TTL)** → cache HTTP navigateur. Deux stale-while-revalidate superposés, dont le plus bas est **muet, non testé, et gagne toujours**.
9. **Deux écrivains socket rivaux** du même cache de messages, avec des règles différentes : `useSocketCacheSync` (alias-aware + filet d'invalidation) et `addMessage` (clé exacte, dédup par id seul, aucun filet).
10. **Cinq mécanismes MORTS** (zéro consommateur hors de leur propre test) : `hooks/use-conversation-messages.ts` (531 lignes, réimplémentation `useState` complète du même cache), `lib/server-cache.ts` (dont `getConversationMessages`, un **troisième** chemin de lecture des messages avec sa propre politique `revalidate: 10`), `utils/translation-persistence.ts`, `TranslationService.getCachedTranslation`, et une **classe `LRUCache` copiée** dans `utils/translation.ts:11` alors que `lib/lru-cache.ts` existe.
11. **Deux clients Socket.IO** : `meeshySocketIOService` (vivant) et `webSocketService` (`services/websocket.service.ts:441`, singleton qui s'auto-connecte 100 ms après l'évaluation du module), tiré par le baril `@/hooks/v2` qu'importe `app/(connected)/contacts/page.tsx`. **Non vérifié** en Network → WS.

---

## B. L'ordre des tâches — et pourquoi la consolidation est en DERNIER

**La tâche 1 est la reproduction. Rien d'autre ne démarre avant elle.**

> **Fusionner les caches AVANT d'avoir un témoin qui reproduit, c'est réécrire à l'aveugle et espérer que le symptôme parte.** C'est exactement la méthode qui a produit l'état actuel : la couche React Query a été durcie à fond, testée sur 2 000+ lignes, et le symptôme a survécu — parce qu'il vivait une couche plus bas, dans le seul fichier que personne ne testait. Une consolidation menée sans témoin déplacerait le défaut au lieu de le fermer, et le prochain audit repartirait de zéro avec un dépôt plus difficile à lire.

**7 tâches.** 1 = reproduction. 2-5 = correctifs, du plus proche du symptôme au plus structurel. 6-7 = consolidation.

---

## Tâche 1 — LE TÉMOIN : reproduire B (rate aujourd'hui, passe après la tâche 2)

- [ ] Créer `apps/web/__tests__/public/sw-api-cache.test.ts`

**Pourquoi ce harnais et pas un test de hook.** Le défaut est dans un script de worker, pas dans un module React. Aucun test de hook ne peut le voir — c'est précisément pour ça qu'il a survécu à tous les durcissements précédents. Le témoin **ne peut pas** être un test de hook.

**Le harnais.** `sw.js` est un script plat qui n'appelle que `self.addEventListener`, `caches`, `fetch`. En jsdom :

1. Fabriquer un faux `self` qui capture les handlers : `const handlers = {}; global.self = { addEventListener: (t, h) => { handlers[t] = h; } }`.
2. Fabriquer un faux `caches` : une `Map` par nom de cache, avec `open()`, `match(request)` (clé = `request.url`), `put(request, response)`, `keys()`, `delete()`.
3. Fabriquer `global.fetch` en `jest.fn()` retournant des `Response`-like `{ ok: true, clone(), json() }`.
4. Charger le fichier **tel qu'il est livré** : `eval(fs.readFileSync(path.join(__dirname, '../../public/sw.js'), 'utf8'))` — surtout **pas** une copie du code dans le test, sinon le témoin ne garde plus le fichier réellement servi.
5. Invoquer `handlers.fetch(fakeEvent)` où `fakeEvent.respondWith = (p) => { captured = p; }`, puis `await captured`.

**Ce qu'on simule** — la séquence exacte du symptôme, pas une abstraction :

```
lecture 1 : GET …/messages?limit=20&offset=0  → réseau rend [m1, m2]        (peuple le cache)
(un m3 arrive côté serveur)
lecture 2 : MÊME URL                          → réseau rend [m1, m2, m3]
```

**L'oracle** — une seule assertion, et c'est elle qui doit rougir aujourd'hui :

```
expect(await bodyOf(reponseDeLaLecture2)).toEqual([m1, m2, m3]);
```

Aujourd'hui elle rend `[m1, m2]` : **RED**, et le message d'échec dit littéralement le symptôme utilisateur.

- [ ] Ajouter, dans le même fichier, trois témoins de **non-régression** qui doivent rester VERTS après la tâche 2 (sans eux, le correctif de la tâche 2 peut casser la PWA sans que rien ne rougisse) :
  - une navigation (`request.mode === 'navigate'`) est toujours servie depuis le cache si présent — la coquille d'app reste instantanée ;
  - une requête `/attachments/file/…` n'est **pas** interceptée (la garde `sw.js:92` tient) ;
  - **hors ligne** (`fetch` rejette) sur `/api/`, la réponse en cache est encore rendue — le mode dégradé ne doit pas mourir avec le correctif. **C'est le témoin qui interdit la solution naïve « ne plus rien mettre en cache ».**

- [ ] Vérifier que la suite est bien **exécutée** : `bunx jest __tests__/public/sw-api-cache` doit lister le fichier. Un fichier de test neuf qui n'est jamais ramassé se lit comme du vert.

**Critère de sortie :** 1 rouge (l'oracle), 3 verts (les non-régressions). Sans ce rouge, ne pas continuer : on ne saurait pas ce qu'on corrige.

---

## Tâche 2 — Correctif B : le réseau gagne sur les lectures temps réel

- [ ] `apps/web/public/sw.js` — dans la branche l. 100, **séparer deux politiques au lieu d'une** :
  - **network-first, cache en secours** pour les lectures volatiles (messages, conversations, notifications) : `await fetchPromise` d'abord, et ne retomber sur `cachedResponse` **que** si le réseau échoue. C'est ce qui rend le témoin de la tâche 1 vert **sans** perdre le mode hors ligne.
  - le SWR actuel peut rester pour les lectures réellement stables si on le souhaite — mais **par liste explicite d'inclusion**, jamais par `startsWith('/api/')` en bloc. Une liste d'exclusion oublie toujours la route ajoutée demain.
- [ ] **Faire monter `SW_VERSION`** (`sw.js:16`). Un correctif de SW ne prend effet qu'à l'activation d'un worker différent : sans ce bump, l'ancien worker continue de servir l'ancien cache aux utilisateurs existants — et le correctif n'atteindrait personne.
- [ ] Ajouter dans `activate` une **purge des entrées `/api/` du cache courant**, pas seulement des caches d'autre nom : les utilisateurs déjà empoisonnés portent des entrées sous le nom **actuel**, que la purge existante (`sw.js:56-66`, filtre `name !== CACHE_NAME`) ne touche pas.
- [ ] Faire passer l'oracle de la tâche 1 ; les trois non-régressions restent vertes.

---

## Tâche 3 — Correctif A-1 : un message arrivant ne peut plus tomber dans le vide

- [ ] `apps/web/hooks/queries/use-conversation-messages-rq.ts` — quand `addMessage` sort par `if (!old) return old`, **invalider la requête** comme le fait déjà `use-socket-cache-sync.ts:626-630`. C'est le même remède au même problème ; il vit aujourd'hui chez un seul des deux écrivains.
- [ ] Écrire le témoin AVANT : `renderHook` avec un `QueryClient` **sans** donnée pour la clé, appeler `addMessage`, attendre une invalidation de `queryKeys.messages.infinite(id)`. Rouge aujourd'hui.
- [ ] Témoin de la clé **alias** : sur `conversationId="meeshy"` (l'accueil), l'invalidation doit viser la clé **réellement utilisée par le hook** (`queryKey`, qui inclut le `linkId` en mode lien), pas `messages.infinite(<ObjectId du payload>)`. Une invalidation qui vise une clé que la page n'utilise pas est un no-op qui a l'air d'un correctif.

---

## Tâche 4 — Correctif A-2 : le convertisseur socket cesse de détruire les traductions

- [ ] Témoin d'abord : convertir une charge socket **portant** `translations: [...]` et `isEdited: true` et vérifier qu'elles survivent. Rouge aujourd'hui (`meeshy-socketio.service.ts:662-663`).
- [ ] Second témoin, celui qui compte le plus parce qu'il décrit une **régression visible en direct** : un `message:edited` sur un message **déjà traduit en cache** ne doit pas vider ses traductions (`use-socket-cache-sync.ts:715`, fusion `{ ...m, ...message }`).
- [ ] Corriger en **s'alignant sur le transformateur REST** (`transformers.service.ts:407`), qui fait déjà la bonne chose. Ne pas inventer une troisième règle : les deux convertisseurs doivent rendre la même forme pour la même charge.

---

## Tâche 5 — Correctif B-bis : une lecture qui échoue cesse de se déclarer « réussie à zéro message »

- [ ] `apps/web/services/conversations/messages.service.ts:113-120` — **lever** l'erreur au lieu de rendre `EMPTY_MESSAGES_RESPONSE`. Aujourd'hui React Query enregistre un **succès** à zéro message, ne réessaie pas (`retry` ne voit aucune erreur) et `staleTime: Infinity` le fige : un 401/500/timeout au montage produit un fil vide, silencieusement, jusqu'au prochain focus.
- [ ] Conserver le chemin `AbortError → REQUEST_CANCELLED` tel quel (il est correct et déjà utilisé).
- [ ] Témoin : `apiService.get` qui rejette ⇒ la requête React Query passe en `error`, pas en `success` à zéro message.
- [ ] **Vérifier ce que l'UI fait d'un état d'erreur** avant de livrer. Passer de « vide silencieux » à « erreur non rendue » n'améliore rien pour l'utilisateur : suivre la donnée jusqu'au **pixel**.

---

## Tâche 6 — CONSOLIDATION (1/2) : la source unique, et ce que devient chaque autre

**Ne commencer qu'une fois les tâches 1-5 vertes.** Le témoin de la tâche 1 devient ici le garde-fou de la réécriture : il doit rester vert à chaque étape.

**LE cache qui reste la source unique pour un message : le cache React Query `['messages','list',<id>,'infinite']`**, écrit par **un seul** module.

Justification par ce que fait iOS, qui n'a pas ce problème : côté iOS, tout ce qui touche un message passe par **un unique acteur sérialisé** (`MessagePersistenceActor` — `bufferIncoming`, `applyEvent`, `insertOptimistic`, mutations d'édition), qui commit puis notifie ; `MessageStore` n'est qu'un **observateur**, jamais une vérité concurrente. Le web n'a pas trop de *caches* pour les messages — il n'en a qu'un — il a **trop d'écrivains indépendants** de ce cache unique, chacun avec sa propre règle. C'est cette asymétrie-là qu'on ferme, pas le nombre de stores.

| mécanisme | devient |
|---|---|
| React Query `messages.infinite` | **la source unique.** Inchangé. |
| `useSocketCacheSync` | **l'écrivain unique** côté socket. Monté par les **trois** hôtes : `ConversationLayout`, `BubbleStreamPage` (`/` et `/chat`), `SharedConversationExperience`. |
| `addMessage` / `updateMessage` / `removeMessage` du hook | **réduits à une projection** : ils délèguent à la même descente de clés (`messageCacheKeysFor`) et au même filet d'invalidation. Deux règles d'écriture sur un même cache, c'est la divergence garantie. |
| Cache Storage du SW pour `/api/` volatile | **supprimé** comme cache de lecture (tâche 2). Reste un **secours hors ligne**, jamais un service par défaut. |
| Persister IndexedDB, racine `conversations` | **conservé** (ouverture instantanée), mais c'est lui qui rend l'**aperçu de la sidebar** périmé au rechargement — à traiter dans son propre lot, il n'est **pas** le symptôme décrit. |
| `hooks/use-conversation-messages.ts` (531 l.) | **supprimé.** Zéro consommateur hors de son test. Le baril `hooks/index.ts:11` réexporte le hook RQ **sous le même nom**, ce qui masque le doublon à la lecture — c'est la copie qui rend l'inventaire illisible. |
| `lib/server-cache.ts` → `getConversationMessages` | **supprimé.** Zéro import ; troisième politique de fraîcheur (`revalidate: 10`) pour les messages. |
| `utils/translation-persistence.ts` | **supprimé.** Zéro écrivain, zéro lecteur, mais forme exacte d'un futur suspect (localStorage, 7 jours, clé par messageId). |
| `LRUCache` copiée dans `utils/translation.ts:11` | **supprimée** au profit de `lib/lru-cache.ts`. |
| `TranslationService.getCachedTranslation` (socketio) | **supprimé.** Écrivain sans lecteur. |
| stores Zustand (`conversation-ui`, `failed-messages`) | **conservés tels quels.** Ils ne détiennent **aucun** contenu de message (accusés, brouillons, échecs d'envoi). Ce ne sont pas des doublons — ne pas les toucher sous prétexte de consolidation. |

- [ ] Monter `useSocketCacheSync` dans `BubbleStreamPage`, **et retirer dans le même temps** son `handleNewMessage` local (`bubble-stream-page.tsx:276-323`), sous peine d'avoir **deux** écrivains au lieu d'un — l'inverse de l'objectif.
- [ ] Témoin de recouvrement : sur `/`, un `message:new` doit atterrir **une seule fois** dans le cache (pas de bulle en double).

---

## Tâche 7 — CONSOLIDATION (2/2) : supprimer le code mort et poser les gardes

- [ ] Supprimer les cinq mécanismes morts listés ci-dessus, **avec leurs tests** (un test qui est le seul consommateur de son sujet ne prouve rien d'autre que sa propre existence).
- [ ] **Garde de source** contre la récidive, ciblant le **bloc** et non le fichier : aucune nouvelle branche de `sw.js` ne doit servir une lecture `/api/` depuis le cache avant le réseau. Vérifier que la garde **rougirait** si on réintroduisait l'interdit — une garde négative meurt en silence.
- [ ] Documenter dans `apps/web/decisions.md` : **quatre** couches de cache existent, laquelle est autoritative pour un message, et pourquoi le SW ne doit **jamais** servir une lecture temps réel. Sans cette ligne, le prochain « on va mettre l'API en cache pour aller plus vite » réintroduit B à l'identique.
- [ ] Ouvrir un lot **séparé** (hors de celui-ci) pour la purge au logout — `authManager.clearAllSessions` ne vide ni le QueryClient, ni Cache Storage, ni IndexedDB, et le cache SW n'est segmenté ni par jeton ni par utilisateur. **C'est un problème de confidentialité, pas de fraîcheur** ; le mélanger à ce lot brouillerait les deux.

---

## Comment on saura que c'est réellement résolu

Des **gestes utilisateur**, refaits sur un vrai navigateur, en **production ou en environnement `local`** — jamais en `next dev`. En dev, `CACHE_NAME` retombe sur `DEV_${Date.now()}` (`sw.js:15`) et se renomme à chaque redémarrage du worker : **le symptôme B est structurellement invisible en local.** Un « ça marche chez moi » mesuré en dev ne prouve rien.

1. **Deux comptes, deux navigateurs, la conversation ouverte des deux côtés.** B envoie « test 1 ». **La bulle apparaît chez A en moins d'une seconde, sans aucun geste.** Refaire depuis **l'accueil `/`** — c'est l'écran où A était cassé, et le seul qui prouve la tâche 3.
2. **La même bulle, dans la bonne langue, tout de suite.** Si A lit en français et B écrit en anglais, la bulle arrive **traduite**, avec sa puce de langue, **sans recharger**. Puis B **modifie** son message : la bulle reste traduite chez A — elle ne redevient pas anglaise (tâche 4).
3. **Le geste qui décide de tout : recharger (F5).** Après « test 1 », A appuie sur F5. **Les derniers messages sont là au premier rechargement**, pas au second. Refaire **trois fois d'affilée** — le symptôme B se manifestait par un décalage d'un cran, qu'un seul essai ne distingue pas d'un aléa réseau.
4. **La preuve directe, trente secondes :** DevTools → Application → Cache Storage → `meeshy-cache-*`. **Aucune entrée `…/messages?limit=20&offset=0`** ne doit s'y trouver. C'est la vérification décisive, celle qui n'a pas été faite jusqu'ici.
5. **Couper le réseau, le rendre.** A passe en mode avion trente secondes ; B envoie « test 2 » et « test 3 ». A rétablit le réseau. **Les deux messages manqués apparaissent seuls**, sans rechargement (c'est `syncNewerMessages` sur le front de reconnexion, déjà en place — ce geste vérifie qu'aucun correctif ne l'a cassé).
6. **Hors ligne, lecture.** A coupe le réseau et ouvre une conversation **déjà consultée** : elle s'affiche encore, en dégradé. **Ce geste est aussi important que le n°3** : il prouve que la tâche 2 a rendu le réseau prioritaire **sans** supprimer le secours hors ligne.
7. **Rester une heure sur l'accueil sans rien toucher**, puis regarder la sidebar : l'aperçu et la pastille de non-lus doivent avoir suivi. S'ils ont gelé, ce n'est **pas** un retour de A ou de B — c'est le lot « aperçu de liste » (persister IndexedDB, 24 h), à ouvrir séparément.

---

## Ce qui n'a PAS pu être tranché sans exécuter l'application

Cet audit est une lecture de code. **Aucun test, build ou serveur n'a été lancé** (un gate iOS compilait l'arbre). Les points suivants restent ouverts et doivent être mesurés :

- **L'entrée `/api/…/messages` est-elle réellement présente en Cache Storage ?** La chaîne est établie par le code, mais l'observation directe (geste n°4 ci-dessus) n'a pas été faite. **C'est la vérification décisive et elle coûte trente secondes.**
- **`Vary` en amont du gateway.** Grep fait sur `services/gateway/src` uniquement. Traefik ou un CDN pourraient en ajouter un — à lire sur une réponse réelle de `gate.meeshy.me`.
- **Le partage inter-comptes de l'entrée SW** est mécaniquement impliqué par la clé (URL, sans `Authorization`), **non observé** en navigateur. À confirmer avant d'en faire un constat de sécurité.
- **Le second client Socket.IO** (`services/websocket.service.ts:441`, auto-connexion 100 ms après évaluation du module, tiré par `@/hooks/v2` depuis `contacts/page.tsx`) ouvre-t-il vraiment une seconde connexion ? Dépend du tree-shaking : à lire dans l'onglet Network → WS.
- **La rupture de room.** `conversation:leave` retire le socket de la room et **rien ne l'y remet** hors ré-authentification complète. Fréquence réelle inconnue — dépend de la navigation ; à instrumenter.
- **`SOCKET_LANG_FILTER`** est documenté « OFF par défaut » ; la valeur de production n'a pas pu être lue. S'il est ON, il rogne les traductions **par socket** et empile une seconde cause sur la famille du symptôme A-contenu.
- **`useConversationsPaginationRQ.setConversations`** écrase toutes les pages en une seule dont `limit = newConversations.length`, ce qui casse l'arithmétique d'offset de `getNextPageParam`. Écriture destructrice constatée, **effet non mesuré**, hors périmètre de ce lot.
