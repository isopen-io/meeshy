# Decisions - apps/web (Next.js Frontend)

## 2025-01: State Management - Zustand 5
**Statut**: Accept
**Contexte**: Besoin d'un state manager performant pour une app de messagerie temps r
**Decision**: Zustand 5 avec `devtools` + `persist` middleware, stores par domaine (auth, conversation, language, app)
**Alternatives rejet**: Redux Toolkit (boilerplate excessif), Context API (re-renders globaux), Jotai/Recoil (persistence moins mature)
**Cons**: `useShallow` obligatoire pour selectors multi-champs, pas de time-travel debugging natif

## 2025-01: Data Fetching - React Query 5 + Socket.IO
**Statut**: Accept
**Contexte**: Source de vrit temps r via WebSocket, cache HTTP comme filet de secuirte
**Decision**: React Query (`staleTime: Infinity`, `gcTime: 30min`) + Socket.IO qui met jour le cache directement
**Alternatives rejet**: SWR (manipulation cache moins puissante), Apollo/GraphQL (overkill pour REST+WS), polling (inefficace pour chat)
**Cons**: Logique de synchronisation cache complexe, risque de race conditions WS vs HTTP

## 2025-01: Routing - Next.js 15 App Router avec Route Groups
**Statut**: Accept
**Contexte**: Besoin de layouts partags et de boundaries d'authentification propres
**Decision**: App Router avec route groups `(protected)/` pour auth, Server Components par dfaut
**Alternatives rejet**: Pages Router (dprc, pas de RSC), Parallel Routes (trop complexe pour le chat)
**Cons**: `'use client'` ncessaire partout pour l'interactivit, erreurs build implicites

## 2025-01: Auth - JWT + Session Tokens en localStorage
**Statut**: Accept
**Contexte**: API cross-domain (`gate.meeshy.me` vs `meeshy.me`), support anonymous
**Decision**: JWT en localStorage (Zustand persist), refresh token non-bloquant 5min avant expiry, retry automatique sur 401
**Alternatives rejet**: httpOnly cookies (pas cross-domain), NextAuth.js (complexit serveur), OAuth seul (besoin user/pass MVP)
**Cons**: Vulnrabilit XSS (localStorage accessible), pas de protection CSRF native

## 2025-01: WebSocket - Socket.IO avec Orchestrator Pattern
**Statut**: Accept
**Contexte**: Messagerie temps rel avec reconnexion automatique et multi-device
**Decision**: Socket.IO Client 4.8 avec services spcialiss (MessagingService, TypingService, PresenceService, TranslationService)
**Alternatives rejet**: WebSocket natif (pas de reconnexion/fallback), Firebase Realtime Database (vendor lock-in)
**Cons**: Bundle plus lourd que WS natif, fallback polling augmente la charge serveur

## 2025-01: Styling - Tailwind CSS 3.4 + Radix UI + CSS Variables HSL
**Statut**: Accept
**Contexte**: Design system personnalis avec thming dynamique (dark/light)
**Decision**: Tailwind utilitaire + Radix primitives (accessible) + CSS variables HSL + pattern shadcn/ui (copier, pas installer)
**Alternatives rejet**: Material UI (trop opinionn), Chakra UI (runtime CSS-in-JS), Styled Components (incompatible RSC)
**Cons**: Classes HTML longues, drift des composants shadcn/ui (merge manuel)

## 2025-01: i18n - Client-Side JSON (pas next-intl)
**Statut**: Accept
**Contexte**: next-intl redirige `/` vers `/en` ce qui casse l'UX du chat anonyme
**Decision**: Imports JSON dynamiques (`@/locales/{lang}/{ns}.json`), cache mmoire, Zustand language store
**Alternatives rejet**: next-intl (redirections URL forces), i18next (bundle lourd), SSR i18n (reload page au changement)
**Cons**: Pas de dtection locale par URL, pas de SEO pour le contenu traduit

## 2025-01: Build - Standalone Output + Runtime Env Injection
**Statut**: Accept
**Contexte**: Une seule image Docker pour dev/staging/prod
**Decision**: `output: 'standalone'`, placeholders `__RUNTIME_*__` remplacs par `sed` au dmarrage du container
**Alternatives rejet**: Build-time env vars (rebuild par env), SSR env vars (pas de standalone)
**Cons**: `sed` fragile sur code minifi, collision de placeholders possible
**Attention**: NE JAMAIS quoter les valeurs YAML dans docker-compose (`VAR=value` pas `VAR="value"`)

## 2025-01: Encryption - Signal Protocol + Web Crypto + IndexedDB
**Statut**: Accept
**Contexte**: E2EE pour messages privs, chiffrement serveur pour messages traduits
**Decision**: SharedEncryptionService (DI), Web Crypto API, IndexedDB pour cls (pas localStorage)
**Alternatives rejet**: localStorage (quota 5-10MB, pas async), custom crypto (ne jamais rouler le sien)
**Cons**: Pas de backup des cls, pas de sync multi-device, +300KB bundle

## 2025-01: Audio/Media - FFmpeg.wasm + Tone.js
**Statut**: Accept
**Contexte**: Compression audio ct client pour privacy et conomie bande passante
**Decision**: FFmpeg.wasm (compression), Tone.js (effets temps rel), Browser Image Compression
**Alternatives rejet**: Compression serveur (privacy), Web Audio API direct (trop bas niveau)
**Cons**: FFmpeg.wasm 30MB+, plus lent que FFmpeg natif, bugs Safari

## 2025-02: URL Config - Drivation dynamique depuis window.location
**Statut**: Accept
**Contexte**: L'app doit fonctionner sur localhost, IP LAN, meeshy.local, meeshy.me sans config
**Decision**: `lib/config.ts` drive les URLs depuis `window.location.hostname` (gate.{domain}, ml.{domain})
**Alternatives rejet**: URLs hardcodes (.env), variables d'environnement (ncessitent config par dev)
**Cons**: Ne fonctionne pas en SSR (besoin `INTERNAL_*_URL`), pattern sous-domaine hardcod

## 2026-08: SyncEngine — détection de trou `_seq` côté web (miroir du SDK iOS)
**Statut**: Accept
**Contexte**: Le gateway estampille les émissions Socket.IO user-scoped d'un numéro de séquence
monotone per-user (`_seq`, `emitWithSeq`). iOS le suit depuis 2026-05 (`SyncSeqState` /
`SyncSeqTracker` → `NotificationGapResyncCoordinator`). Le web n'en décodait RIEN : aucune
détection de trou, et aucune resync au reconnect. Or le QueryClient global tourne en
`staleTime: Infinity` — une notification manquée ne réapparaissait jamais de la session.
**Decision**: `lib/sync/sync-seq-state.ts` (valeur pure : `detectSyncSeqGap` / `recordSyncSeq` /
`observeSyncSeq`) est le miroir EXACT de `SyncSeqState.swift`. Le transport
(`notification-socketio.singleton`) observe le `_seq` et expose `onSyncDesync(reason)` —
`'gap'` (trou de séquence) ou `'reconnect'` (fenêtre aveugle après coupure). La décision « quoi
refetch » vit côté consommateur (`use-notifications-manager-rq`), débouncée 300 ms comme iOS.
**Alternatives rejetées**: réécrire la règle côté web (deux interprétations divergeraient) ;
brancher l'invalidation dans le singleton (mélange transport et décision produit, contraire au
découpage SDK/app d'iOS) ; réinitialiser le curseur à chaque `disconnect` socket (détruirait
précisément la preuve du trou que la reconnexion doit révéler).
**Cons**: le `_seq` n'est estampillé que sur `notification:new` (unique call-site `emitWithSeq`) —
la couverture reste celle du pilote. Émission et observation doivent rester en LOCKSTEP : étendre
`emitWithSeq` à d'autres events sans étendre l'observation des DEUX clients fabrique de faux trous.
Le curseur n'est pas persisté (mémoire d'onglet), donc une fenêtre onglet-fermé reste couverte par
le seul `refetchOnMount: 'always'`.

## 2026-08-11: Un SEUL cache de liste de conversations — la forme plate est retirée
**Statut**: Accepté
**Contexte**: `queryKeys.conversations` exposait deux formes : `lists()` / `list(filters)` valant
`['conversations','list', …]`, et `infinite()` valant `['conversations','infinite']`. Les deux
préfixes sont DISJOINTS — un `setQueriesData` sur l'un ne touche jamais l'autre. Or **aucun écran
ne lisait la forme plate** : la sidebar passe par `useConversationsPaginationRQ` →
`useInfiniteConversationsQuery`. Une dizaine d'écrivains l'alimentaient quand même
(`use-socket-cache-sync` ×6, `unread-cache`, `use-send-message-mutation` ×6, les mutations
create/delete de `use-conversations-query`), et deux `invalidateQueries` de `use-reactions-query`
la ciblaient. Le coût n'était pas la performance — un `setQueriesData` sans correspondance est un
no-op — mais la LECTURE : le code se lisait comme si deux caches étaient tenus en phase alors qu'un
seul existait, et les témoins qui l'assertaient passaient au vert sans rien prouver du chemin réel.
**Decision**: la forme plate est supprimée de `queryKeys`, avec ses écrivains, ses hooks sans
consommateur (`useConversationsQuery`, `useConversationsWithPagination`,
`useCreateConversationMutation`, `useDeleteConversationMutation`, et tout
`use-send-message-mutation.ts` dont les quatre mutations n'avaient elles non plus aucun appelant —
l'envoi réel passe par l'orchestrateur Socket.IO) et ses exports de baril. Les six écritures de
`use-socket-cache-sync` étaient chacune DOUBLÉE d'une écriture `infinite()` identique : leur retrait
est strictement neutre, et les témoins correspondants ont été rebranchés sur `infinite()` PUIS
vérifiés rouges contre une écriture `infinite()` cassée avant que le retrait n'ait lieu.
**Alternatives rejetées**: rediriger les écrivains vers `infinite()` (ils y écrivent déjà) ;
rediriger les deux `invalidateQueries` de réaction vers `infinite()` — cela déclencherait une
relecture de TOUTES les pages chargées à chaque réaction, exactement ce que l'ADR ci-dessus vient
de retirer du chemin de focus, et la ligne de liste ne porte rien qui dépende des réactions de
message (`reaction={prefs?.reaction}` dans `ConversationList` est une PRÉFÉRENCE de conversation,
pas un agrégat de réactions) ; garder les hooks « au cas où » (les câbler plus tard aurait écrit
dans un cache sans lecteur, donc silencieusement rien fait).
**Cons**: `useInfiniteConversationsQuery` acceptait un `filters` que sa clé de requête n'a jamais
inclus — retiré aussi, pour la même raison : une option silencieusement ignorée est un piège. Une
liste filtrée, le jour où elle existera, devra naître avec sa propre clé ET son lecteur.

## 2026-08-11: Liste de conversations — le focus de fenêtre tire un DELTA, plus un refetch de toutes les pages
**Statut**: Accepté
**Contexte**: `useInfiniteConversationsQuery` héritait du `refetchOnWindowFocus: 'always'` global.
Sur une `useInfiniteQuery`, ce réglage rejoue TOUTES les pages chargées et REMPLACE le cache. Trois
coûts : dix pages de scroll = dix requêtes sur une route lourde (participants, dernier message avec
ses traductions et sa pièce jointe, compteurs par curseur) à CHAQUE retour d'onglet ; les écritures
socket qui atterrissent pendant la séquence sont écrasées ; et comme la route pagine par OFFSET sur
un tri `lastMessageAt` décroissant (`orderBy: { lastMessageAt: 'desc' }`,
`routes/conversations/core.ts`), un message arrivé entre la page k et la page k+1 promeut sa
conversation en tête et décale toutes les pages suivantes d'un cran — une ligne dupliquée à la
frontière, une autre disparue. C'est exactement le réglage que `use-conversation-messages-rq.ts`
avait déjà désactivé pour le fil de messages.
**Decision**: `refetchOnWindowFocus: false` sur la liste, et le focus devient le « Trigger 2 » de
`useConversationsDeltaSync` — même delta borné que le reconnect socket, débouncé 1 s (même valeur
que `FOCUS_CATCH_UP_DEBOUNCE_MS` du fil de messages), partageant le même garde anti-rafale de 5 s.
La seule chose que le refetch de focus faisait et que le delta upsert-only ne peut pas faire — purger
une ligne FANTÔME hard-supprimée côté serveur — est reprise par une réconciliation complète
(`invalidateQueries` sur la clé infinie) chaînée APRÈS un delta RÉUSSI et bornée à 1× par 24 h.
C'est le pendant exact de `fullReconcileInterval` / `syncSinceLastCheckpoint` sur iOS ; l'horodatage
vit dans `localStorage` (`meeshy_conversations_last_full_reconcile_at`, pendant de la clé
`UserDefaults` `me.meeshy.lastFullReconcileAt`), avec repli mémoire par QueryClient si le stockage
jette (navigation privée, quota) — la borne dégrade alors en « 1× par session », jamais en « à
chaque focus ».
**Alternatives rejetées**: basculer simplement à `false` (supprimerait le seul chemin web qui purge
une ligne fantôme) ; réconcilier depuis la seule page 0 (l'absence d'une ligne en page 0 ne prouve
rien pour les lignes plus profondes) ; ne réconcilier que sur delta NON VIDE (une conversation
hard-supprimée ne produit AUCUNE ligne de delta — la purge serait inatteignable sur un compte calme,
précisément celui qui garde son fantôme) ; un `resetQueries` (perdrait la profondeur de scroll).
**Cons**: la réconciliation complète relit elle aussi les pages une par une et porte donc la même
instabilité d'offset — mais 1× par 24 h au lieu d'à chaque focus, et c'est le comportement que
`fullSync()` a déjà sur iOS. Un delta ÉCHOUÉ ne réconcilie pas et ne consomme pas la fenêtre
(local-first) : offline, le cache reste intact. La fenêtre de 24 h démarre au PREMIER delta d'un
navigateur neuf plutôt qu'à l'époque zéro, pour ne pas doubler la lecture que
`refetchOnMount: 'always'` vient de faire au montage.

## 2026-08: Liste de conversations — rattrapage DELTA au reconnect socket (miroir `deltaSyncCore`)
**Statut**: Accepté
**Contexte**: Trois surfaces web tiennent un état temps réel ; deux rattrapaient une coupure
SOCKET (messages d'une conversation via `syncNewerMessages`, notifications via `onSyncDesync`
depuis le cycle 75), la liste de conversations non — `use-conversations-query.ts` n'avait que
`refetchOnMount: 'always'`. Le `refetchOnReconnect: 'always'` du QueryClient global ne la couvre
pas : il écoute le `onlineManager` de React Query, c'est-à-dire la connectivité RÉSEAU du
navigateur, que ne bougent ni un redémarrage gateway, ni un drop du load balancer, ni un échec
d'upgrade de transport. Pendant cette fenêtre, la liste garde compteurs de non-lus, aperçus et
effectif d'avant la coupure jusqu'au prochain focus de fenêtre ou remontage.
**Decision**: un DELTA `GET /conversations?updatedSince=`, jamais un `refetch()`.
`lib/conversations/delta-sync.ts` (valeurs pures : `conversationDeltaWatermark` /
`mergeConversationDelta`) est le miroir de `deltaSyncCore` + `mergeDeltaConversations` du SDK iOS ;
`hooks/queries/use-conversations-delta-sync.ts` porte le déclenchement sur le front
`false → true` de `isSocketConnected`, le MÊME motif que le « Trigger 1 » du fil de messages. La
borne est DÉDUITE du cache à chaque passe — le cache React Query EST le curseur, aucun état
persisté. L'escalade vers une relecture complète est déclenchée par le `pagination.hasMore` du serveur
(2026-08-12), et non par « la page est pleine » : une page delta part toujours d'`offset=0`, ce qui
fait compter au serveur toutes les lignes de la MÊME clause `updatedAt > since` — `hasMore` y vaut
donc exactement « la fenêtre contenait plus que cette page ». L'heuristique précédente
(`length >= DELTA_PAGE_LIMIT`) relisait toutes les pages chargées sur une fenêtre de très exactement
100 conversations, pourtant complète. `getConversations` porte déjà le repli conservateur
`length >= limit` quand la réponse omet son bloc pagination. Jumeau iOS :
`ConversationSyncEngine.deltaSyncCore`, qui lit le même signal et escalade vers `fullSync()`.
**Alternatives rejetées**: `refetch()` de la liste (rejoue TOUTES les pages chargées d'une route
lourde, et REMPLACE le cache — donc perd ce que le socket y a écrit) ; un second signal de reconnect
propre à la liste (il en existe déjà un, écrit et testé) ; un curseur persisté à la iOS (le cache
est déjà la source ; un second curseur pourrait diverger de lui).
**Cons**: le delta est upsert-only — une conversation HARD-supprimée côté serveur n'y apparaît
jamais. Couvert depuis 2026-08-11 par la réconciliation complète bornée ci-dessous, qui reprend la
borne 24 h d'iOS. Une inconnue plus ancienne que la fenêtre chargée est écartée tant qu'il
reste des pages (`hasMore`), sinon elle se dupliquerait au prochain `fetchNextPage`. Le non-lu est
forcé à zéro pour la seule conversation OUVERTE ; celui d'une conversation FERMÉE dont l'accusé de
lecture traîne encore n'est PAS réconcilié, faute de frontière de lecture (`lastReadAt`) dans la
charge utile de la liste — le substitut basé sur `unreadCount` rendrait un `mark-unread` fait sur un
autre appareil définitivement invisible (cf. `tasks/todo.md`, cycle 76b : deux sessions y sont
arrivées indépendamment).

## 2026-08-13: Le delta de la liste apprend à annoncer les DÉPARTS (`meta.deletedConversationIds`)

**Décision**: `getConversations` remonte désormais `deletedConversationIds` /
`deletedConversationIdsTruncated` (bloc `meta` de la réponse gateway), et
`useConversationsDeltaSync` les applique : `mergeConversationDelta({ tombstoneIds })` retire les
lignes du cache infini et rend leurs ids, le hook purge les caches dérivés (détail, fil de
messages) par le MÊME chemin que les retraits `isActive: false`, et une liste TRONQUÉE escalade vers
la réconciliation complète.

**Pourquoi**: le lot `conversations` d'une réponse delta ne porte que des lignes SERVIES, et la
clause serveur exclut par construction ce qui vient de partir (conversation `isActive`, participant
actif sans `deletedForMe`). Un leave ou un ban n'écrit même pas `Conversation.updatedAt` : aucune
trace ne pouvait remonter. Ces sorties attendaient donc la réconciliation de 24 h — jusqu'à un jour
entier de conversation fantôme, cliquable, sur laquelle le serveur répondra 403.

**Trois points de conception**:
- La purge n'est PAS gardée par `conversations.length > 0`. Un compte calme dont la seule nouvelle
  est un départ rend exactement zéro conversation et une tombstone — c'est lui qui garde son
  fantôme le plus longtemps. Même raisonnement que la réconciliation « MÊME sur un delta vide ».
- Les tombstones s'appliquent APRÈS les upserts du même lot. Les deux flux se contredisent rarement
  (une fermeture ne ressort pas de la page) ; quand ils le font, la sortie est le fait le plus
  spécifique, et la garder affichée rendrait la purge inatteignable jusqu'aux 24 h suivantes.
- Une tombstone pour une conversation absente du cache n'est pas rapportée dans `removedIds` :
  rapporter une purge qui n'a rien retiré ferait supprimer des caches dérivés inexistants.

**Alternatives rejetées**: laisser la réconciliation de 24 h faire le travail (elle le fait — un jour
trop tard, et elle relit la liste entière quand une seule ligne devait partir) ; un troisième
canal socket dédié aux sorties (les events `conversation:closed` existent déjà et couvrent l'app
OUVERTE ; le trou est précisément l'app fermée, que seul le rattrapage voit).

**Cons**: reste la borne d'origine — une conversation HARD-supprimée en base ne laisse de trace dans
aucun des deux canaux, et attend toujours la réconciliation complète.

## 2026-08-16: `conversation:updated` — la ligne de liste adopte le message que le payload NOMME

**Décision**: le patch socket de la liste passe par `mergeConversationUpdate(conversation, raw)`,
qui décide de `conversation.lastMessage` à partir de l'IDENTITÉ portée par `lastMessageId` :
absente ⇒ ne rien toucher ; nulle ⇒ vider la ligne ; égale à celle du cache ⇒ réécrire le TEXTE et
rien d'autre ; différente ⇒ composer un message NEUTRE depuis le seul payload. Les cinq champs du
groupe d'aperçu (`lastMessageId`, `lastMessagePreview`, `senderId`, `location`,
`previewRecalculated`) sont CONSOMMÉS par cette fusion et n'entrent plus dans le cache.

**Pourquoi**: la ligne rend l'objet `conversation.lastMessage`, mais la carte du Prisme
(`lastMessageTranslations`) vit au niveau CONVERSATION — le gateway l'y pose, sa forme compacte
`{ langue: aperçu }` n'étant pas celle de `Message.translations`. Les deux moitiés de la ligne
étaient donc écrites par des chemins différents, et sur les deux chemins où le payload nomme un
AUTRE message — masquage personnel, suppression pour tous d'une conversation non ouverte — seule la
carte était mise à jour. Le résolveur PRÉFÉRANT la traduction à l'aperçu brut, la ligne rendait le
texte du remplaçant sous l'auteur, l'heure et la vignette du message parti.

**Trois points de conception**:
- **Neutre, pas hérité.** Le payload ne porte ni l'objet `sender` ni les pièces jointes ; les
  conserver EST le mélange qu'on ferme. Une ligne incomplète (pas de préfixe d'auteur —
  `getSenderName` rend `null` sans `sender`) se corrige au prochain `GET /conversations` ; une ligne
  fausse ne se corrige jamais, rien ne signalant l'incohérence.
- **La borne fait le correctif.** Identité INCHANGÉE ⇒ on ne touche qu'au texte. C'est le chemin le
  plus fréquenté du service : `message:new` pose l'objet complet dans la room de conversation et le
  `conversation:updated` jumeau arrive juste derrière avec le même id. Sans cette borne, chaque
  message reçu dépouillerait sa propre ligne.
- **Pas d'horodatage lisible ⇒ on ne compose rien.** La ligne rend `lastMessage.createdAt` ; une
  date fabriquée y afficherait « Invalid Date ». Le cas ne se produit pas en nominal (les deux
  émetteurs portent toujours `lastMessageAt` avec un id plein) — la garde borne le dégradé.

**Alternatives rejetées**: faire lire `lastMessagePreview` à la ligne en repli de l'objet (déplace la
décision dans le rendu et laisse deux sources de vérité pour un même texte) ; porter sur le fil les
six champs manquants (pastille, drapeaux éphémères, nom d'auteur) — chiffré au cycle 52 : la
jointure `attachments` tomberait sur le chemin du fan-out des traductions, le plus chaud du service.

**Cons**: entre l'événement et la prochaine synchro, une ligne dont l'identité vient de changer perd
son préfixe d'auteur et sa pastille de pièce jointe. C'est le compromis assumé — jumeau de
`LastMessageFacet` côté iOS.
