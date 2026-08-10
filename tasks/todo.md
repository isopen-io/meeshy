# Cycle 61 — Un message de lien de partage n'arrivait sur aucun mobile

## Contrainte d'environnement (à lire avant de juger le choix de lane)

Ce run a démarré sur un conteneur Linux distant, pas sur la machine habituelle de la routine.
`tasks/lane-cursor.md` disait `lane=ANDROID`, mais la lane Android y est **matériellement
impossible** : `dl.google.com` est refusé par la politique réseau du conteneur (403 au CONNECT,
confirmé sur la recette d'amorçage de `ROUTINE.md` §Environment recipe **et** sur un `curl` nu),
donc pas de `sdkmanager`, pas de `platforms;android-35`, pas de `./apps/android/meeshy.sh check`
— le seul gate de cette lane. `maven.google.com` et `repo1.maven.org` répondent, mais les
plateformes/build-tools ne s'y trouvent pas. La lane IOS_DETTE est hors d'atteinte pour la raison
symétrique (ni macOS ni Xcode).

**`tasks/lane-cursor.md` n'a donc PAS été touché** : la lane Android reprend telle quelle au
prochain run sur une machine capable de la construire. Ce cycle a travaillé la seule lane
gatable ici — le temps réel côté gateway, qui est le cœur de la mission du prompt planifié — avec
son propre gate complet (jest gateway + tsc + vitest shared).

## Le défaut

`link:message:new` n'a jamais eu qu'un seul auditeur : le web. iOS
(`MeeshySDK/Sockets/MessageSocketManager.swift:2658`) et Android
(`sdk-core/socket/MessageSocketManager.kt:101`) n'enregistrent qu'un listener de création,
`message:new` — `grep -rn "link:message:new" packages/MeeshySDK apps/ios apps/android` rend zéro.

Or l'envoi par lien est le **seul** transport d'envoi dont dispose un participant anonyme. Un
invité qui écrivait dans une conversation partagée n'apparaissait donc chez aucun membre mobile de
cette conversation, **y compris les membres inscrits** : ni en direct (`broadcastLinkMessage` →
room `conversation:<id>`), ni au reconnect (`_drainPendingMessages`, qui rejouait le même event
unique). Le message ne surgissait qu'au prochain refetch complet, que rien ne déclenchait.

Deux diffuseurs, deux décisions d'event prises séparément : c'est là que la divergence est née.
Et le contrat de la file (`packages/shared/types/delivery-queue.ts`) portait un argument juste mais
trop large — « `message:new` envoie l'objet, `link:message:new` l'enveloppe `{ message }` », donc
ne rien rejouer sous `message:new`. L'argument ne vaut que pour l'**enveloppe**, pas pour le
message déballé.

## Le correctif

Un seul point d'appel public, `socketio/linkMessageEmissions.ts`, partagé par les deux diffuseurs,
qui met les **deux** events sur le fil, chacun dans sa forme : `link:message:new` avec son
enveloppe, `message:new` avec le message déballé. Garde de forme incluse (pas de `message:new` si
l'enveloppe ne porte pas d'objet — absent, `null`, chaîne, **tableau**).

Additif, jamais substitutif. Les deux copies portent le même `id` et les deux gestionnaires web
dédupent dessus, donc le second arrivé est un no-op quel que soit l'ordre ; la pastille de non-lus
vient de la valeur absolue de `conversation:unread-updated`, rien à double-compter.

**Un test existant a changé de verdict, délibérément et documenté** : `routes link-message entries
to LINK_MESSAGE_NEW, not MESSAGE_NEW` affirmait sa clause pour un motif correct (l'enveloppe n'est
pas routable sous `message:new`) que le correctif **préserve** en déballant. La clause « jamais
`message:new` » est remplacée par une assertion plus forte (les deux events, chacun avec sa forme)
plus un nouveau témoin qui garde l'ancien comportement pour une entrée sans enveloppe. Aucune
assertion relâchée.

## Trois pistes du backlog rouvertes et CLASSÉES SANS SUITE — preuve à l'appui

Le prompt de routine exige de re-prouver avant de corriger. Trois notes portées depuis des cycles
antérieurs se sont révélées périmées ; aucune n'a donné lieu à du code, et c'est le résultat :

1. **« `emitConversationPreviewUpdate` et les autres émetteurs par room personnelle n'ont pas été
   audités contre la clé `userId ?? id` »** (laissée ouverte par le cycle précédent, à instruire
   par une recherche sur `ROOMS.user(`). Recherche faite, tous les sites lus :
   `emitConversationPreviewUpdate` passe par `participantUserRooms` (ligne 96),
   `emitUnreadCountsToRecipients`, `MessageHandler:1345`, `MeeshySocketIOManager:2179` et
   `callEndedFanout` aussi. Les émetteurs restants (mentions, demandes d'ami, notifications,
   `emitWithSeq`) sont user-scoped par nature — un participant sans compte n'a ni notification ni
   demande d'ami. **Audit clos, rien à corriger.**
2. **« Les mentions du chemin de lien attendent l'extraction qui écrit `Message.validatedMentions` »**
   — les deux routes de lien appellent `resolveMessageMentions` depuis un cycle antérieur
   (`routes/links/messages.ts:318` et `:609`). Seule la **note** de `messageNotificationFanOut`
   en était restée à l'ancien état ; elle aurait envoyé un futur lecteur réparer un trou bouché.
   Corrigée dans ce cycle.
3. **Les participants anonymes exclus de l'éventail d'appel** (`CallEventsHandler`, requête filtrée
   `userId: { not: null }`) ressemblaient au même défaut de clé de room. **C'est intentionnel** :
   `denyAnonymous` (Audit P1-20 / CVE-004) refuse aux anonymes d'initier comme de rejoindre un
   appel, en parité avec les routes REST `allowAnonymous: false`. Ne pas « réparer ».

## Gates

`services/gateway` : `bun run test:coverage` → **647 suites / 16 309 tests verts**, exit 0.
`npx tsc --noEmit` → 0 erreur. `packages/shared` : vitest → 49 fichiers / 1 462 tests verts.
Couverture des fichiers touchés : `linkMessageEmissions.ts` **100/100/100/100** (neuf),
`broadcastLinkMessage.ts` **100/100/100/100** (déjà à 100 % de branches avant — la nouvelle branche
« aucun serveur Socket.IO monté » a reçu son propre témoin plutôt que de laisser le chiffre
glisser), `MeeshySocketIOManager.ts` inchangé à 88.01/90.65/81.64/92.68.

**Piège d'environnement à retenir** : `bun install` échoue sur le postinstall de `grpc-tools`
(binaire précompilé refusé par le proxy) et laisse `node_modules` à moitié peuplé sans le dire —
`bun install --frozen-lockfile --ignore-scripts` passe. Et `npx prisma generate --generator client`
DOIT être re-vérifié (`ls packages/shared/prisma/client`) : un premier appel silencieusement sans
effet a fait échouer 21 suites sur un `TS2347` dans `PostReactionService` qui n'avait rien à voir
avec le diff.

## Suivi laissé ouvert

- **Consolider vers un seul event de création.** `link:message:new` n'existe que par accident
  d'histoire ; `handleNewMessage` côté web est d'ailleurs meilleur que le handler dédié (il
  réconcilie la bulle optimiste de l'auteur, ce que `handleLinkMessageNew` ne fait pas). Retirer
  l'event dédié est un incrément à part, avec sa propre vérification web.
- **Effet de bord bénin observé, non traité** : `handleNewMessage` déclenche un
  `GET /conversations/:id` quand la conversation n'est pas dans le cache de liste — un invité
  anonyme sur la page de lien peut donc l'émettre. Gardé et attrapé, et la route autorise les
  contextes anonymes (`canAccessConversation`), donc il a de bonnes chances d'aboutir et
  d'enrichir le cache. À mesurer avant d'y toucher.
- **`emitWithSeq` n'a qu'UN call site** (`NOTIFICATION_NEW`). La détection de gap exacte du
  SyncEngine ne couvre donc qu'un event sur tous ceux qui partent en room personnelle ; l'étendre
  demande le fan-out per-user A2.2, chantier à part.
- Lane ANDROID intacte, à reprendre sur une machine avec SDK Android (cf. §Contrainte
  d'environnement).

# Cycle 60 — L'aperçu de la liste ne parlait la langue de personne

Le backlog du cycle 59 laissait un candidat nommé en tête : `updateTrackingLinksMessageId`
(chemin de PARTAGE) « écrase sans aucune garde », et maintenant que le cycle 59 a rendu le binder
du chemin d'ENVOI réellement écrivant, « les deux se disputent la colonne pour de bon ».

**Ce cycle ne l'a pas pris, et l'écarte du backlog.** La dispute est réelle et sans conséquence :
un balayage de `TrackingLink.messageId` sur tout le dépôt — gateway, web, `packages/shared`, SDK
iOS — ne rend **aucun lecteur**. Trois chemins écrivent la colonne, zéro ne la lit. Le
`messageRemovalEffects.ts` qui documente le défaut explique lui-même pourquoi il ne s'y fie pas
(un `TrackingLink` est PARTAGÉ par URL, la colonne ne désigne pas de propriétaire) et dérive la
propriété du contenu des messages vivants. Ajouter une garde à un écrivain que personne ne lit,
c'est 20 lignes pour zéro défaut observable. Le vrai reste : la colonne est morte, et c'est ça
qu'un cycle futur devrait trancher — la remplir correctement OU la retirer.

La question posée à la place : **quel contenu le client sait afficher mais ne reçoit jamais ?**

## Le défaut

Le principe fondateur du produit dit : « le prisme s'applique à TOUT le contenu — messages texte,
transcriptions audio, métadonnées, **previews** ». La ligne de la liste de conversations était la
seule surface où il ne s'appliquait pas.

Pas faute de client. Le SDK iOS porte depuis longtemps :

- `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` — la résolution du Prisme
  ligne par ligne, avec la règle #3 (« ne jamais retomber sur `translations.first` ») ;
- ses **douze** témoins (`ConversationPrismeResolutionTests.swift`) ;
- `LastMessageFacet.translations` / `.originalLanguage`, membres d'une facette conçue pour que les
  onze champs `lastMessage*` s'écrivent en bloc.

Rien de tout cela ne recevait de données par le chemin REST. Le `select` du dernier message dans
`GET /conversations` ne chargeait **ni `Message.translations` ni `Message.originalLanguage`**, et
`APIConversationLastMessage` n'avait aucun champ où les décoder. La documentation du champ SDK
l'écrivait elle-même :

> *« When the gateway starts shipping these in `/conversations` it will be wired through the
> API → domain converter; until then the field stays `nil` and the list falls back to the raw
> `lastMessagePreview`. »*

Elle renvoyait à un contournement applicatif, `ConversationListViewModel.attachLastMessageTranslations`,
qui **n'existe nulle part dans le dépôt** — la seule occurrence de ce nom est la phrase qui le cite.

Le chemin socket, lui, est bien câblé : `ConversationSyncEngine.previewTranslations(from:)` dérive
la carte du `message:new` reçu. Il ne comble rien pour autant — les traductions arrivent **après**
le message, par `message:translation`, si bien que l'`APIMessage` du `message:new` les porte
rarement.

**Conséquence** : à chaque démarrage à froid et à chaque rafraîchissement de liste, toutes les
lignes affichent le dernier message dans la langue de son expéditeur. Un francophone voyait
« Hey, are you free tonight? » sur une conversation que le serveur avait pourtant traduite, et dont
il lirait la version française une fois la conversation ouverte.

## Le correctif

`GET /conversations` porte désormais, au niveau conversation, `lastMessageOriginalLanguage` et
`lastMessageTranslations` — une carte `{ langue: aperçu }`.

Elle n'est pas le contenu brut de la colonne. Quatre exclusions
(`routes/conversations/utils/last-message-preview.ts`), chacune fermant un cas distinct :

| Exclusion | Ce qu'elle évite |
|---|---|
| hors prisme du LECTEUR | envoyer les N langues de la conversation pour un champ dont le client lit UNE valeur |
| langue d'origine | elle EST déjà `lastMessage.content` |
| traduction **chiffrée** (`isEncrypted`) | son `text` est un cryptogramme — du base64 dans la liste |
| `text` non exploitable | la colonne est un JSON libre côté Mongo |

Le prisme du lecteur est résolu **une fois par page** par `resolveUserLanguagesOrdered` (seule
autorité du dépôt sur l'ordre `systemLanguage → regionalLanguage → customDestinationLanguage →
deviceLocale`), depuis l'utilisateur déjà chargé et mis en cache par le middleware d'auth :
**aucune requête supplémentaire** sur ce hot path. Et `Message.translations` est une colonne JSON
du **même document** — pas une relation — donc le `select` élargi ne coûte ni jointure ni requête.

Rendu `null` et jamais `{}` quand il ne reste rien : le client doit pouvoir retomber sur
l'original, ce qui EST la règle #3.

Deux détails qui ne sont pas des détails :

- **`truncateMessagePreview` et son plafond déménagent** dans le module du nouveau constructeur.
  La troncature de l'aperçu a maintenant un propriétaire unique, et une traduction de 5 000
  caractères ne peut plus contourner un plafond posé pour le seul `content`.
- **Le spread `...msg` est déstructuré.** Sans ça, `translations` (blob complet, une entrée par
  langue, avec modèle, score et champs de chiffrement) partait dans chaque ligne de liste.

Côté SDK, le câblage que la doc annonçait : `APIConversation` décode les deux clés,
`toConversation` les pose sur le domaine en minuscules — même convention que le chemin socket,
sans quoi la résolution dépendrait du chemin par lequel la ligne est arrivée.

## Plan
- [x] T1 — bootstrap (leçon 102b) : `bun install --ignore-scripts`, `prisma generate`, build shared
- [x] T2 — instruire le candidat hérité, puis l'écarter sur preuve (zéro lecteur de la colonne)
- [x] T3 — chercher ce que le client sait afficher et ne reçoit jamais
- [x] T4 — RED : 12 témoins de source + 6 de route
- [x] T5 — GREEN : `buildLastMessagePreviewTranslations`, `select` élargi, sérialisation
- [x] T6 — schéma de réponse + son témoin (le strip de `fast-json-stringify` est invisible en unit)
- [x] T7 — SDK : décodage + câblage vers le résolveur, 6 témoins Swift
- [x] T8 — sondes de fidélité en sept temps
- [x] T9 — gates : suite gateway complète, `tsc --noEmit`, suite `@meeshy/shared`
- [x] T10 — changeset + ADR + ce relevé + leçon

## Vérification

**Rouge observé avant correctif** : les 6 témoins de route échouent sur un `main` sans le
correctif (sonde 7 : les deux champs retirés de la ligne → 5 rouges ; `select` amputé → 1 rouge).

**Sondes de fidélité** — chaque défaut réintroduit, restauration par copie (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| `select` sans `translations`/`originalLanguage` | **1** |
| exclusion de la langue d'origine retirée | 1 |
| garde `isEncrypted` retirée | 1 |
| `{}` rendu au lieu de `null` | 3 |
| troncature retirée | 2 |
| prisme du LECTEUR ignoré (toutes langues servies) | **5** |
| les deux champs retirés de la ligne (le défaut d'origine) | **5** |

La première ligne est celle qui apprend quelque chose : **un seul témoin** voit le `select`
amputé, parce que tous les autres injectent la donnée dans le double Prisma et ne peuvent donc pas
savoir si la route l'a demandée. C'est la même famille de trou que la leçon 105 (« une convention
tenue par les APPELANTS n'est pas testée par ce qui la consomme ») : un témoin de forme est ici le
SEUL garde-fou possible, et le retirer au motif qu'il « teste l'implémentation » rouvrirait le
défaut en silence.

**Gate** : suite gateway complète **647 suites / 16 317 tests, 0 échec** (baseline du cycle 59 :
646 / 16 300). `@meeshy/shared` : suite complète **49 fichiers / 1 464 tests**, 0 échec. `tsc --noEmit` gateway : 0 erreur.
Swift : **non exécuté localement** — aucune chaîne Swift sur ce conteneur Linux ; les 6 témoins
`ConversationListPrismeWiringTests.swift` sont validés par `sdk-tests.yml` en CI.

## Reste ouvert après ce cycle

- **`emitConversationPreviewUpdate` n'emporte pas le prisme.** Le fanout `conversation:updated`
  (édition/suppression) pose `lastMessagePreview` sans traductions ; une ligne rafraîchie par ce
  chemin retombe donc sur l'original jusqu'à la synchro suivante. Le faire correctement demande un
  payload PAR DESTINATAIRE — les participants d'une conversation n'ont pas le même prisme — ce qui
  change la forme de l'émetteur (aujourd'hui une seule charge, N rooms). Question de conception, pas
  correctif : c'est pourquoi ce cycle ne l'a pas bâclée.
- **`routes/conversations/search.ts` construit son propre `lastMessage` à la main** et reste hors
  prisme. Deux chemins, une règle, un seul l'applique — exactement la forme de dérive que le dépôt
  combat ailleurs. À aligner, avec la même carte et le même constructeur.
- **Le web rend toujours `lastMessage.content` brut** (`formatLastMessage`,
  `components/conversations/conversation-item/message-formatting.tsx`). Les deux champs sont
  désormais sur le fil ; il manque le résolveur côté web, jumeau de
  `resolvedLastMessagePreview`. Candidat direct pour le prochain cycle.
- **`TrackingLink.messageId` est une colonne morte** : trois écrivains, zéro lecteur (mesuré sur
  tout le dépôt). Le candidat « garde manquante sur le binder du chemin de partage » est retiré du
  backlog au profit de celui-ci — la remplir correctement OU la retirer.
- **Un participant ANONYME n'a pas de prisme sur ce chemin.** `viewerLanguages` est dérivé de
  `authContext.registeredUser`, absent d'un contexte anonyme : la carte est donc toujours `null`
  pour lui et sa ligne retombe sur l'original. C'est le comportement d'AVANT, pas une régression —
  mais `Participant.language` existe et pourrait le servir. Non fait : le prisme d'un participant
  sans compte est un choix produit (une seule langue ? la locale de l'appareil via
  `X-Device-Locale` ?) que ce cycle n'avait pas à trancher seul.
- **Aucune traduction rétroactive de l'aperçu.** Un message dont la traduction arrive après coup
  ne rafraîchit pas la ligne de liste tant que le client ne refait pas de `GET /conversations` (ou
  ne reçoit pas un nouveau message) — c'est le point précédent (`emitConversationPreviewUpdate`)
  vu depuis l'utilisateur.
- Hérités et non traités : `MaintenanceService.cleanupOrphanedAttachments` reste inerte,
  délibérément (leçon 90.4 — un essai à blanc contre la base de production est le préalable) ; les
  ~12 copies inline de l'idiome `unsetOrNull` ne sont pas migrées ; les messages d'appel écrits
  avant le cycle 58 restent invisibles ; l'arbitrage `delete-for-me` du cycle 12 attend une
  validation humaine ; `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js`
  depuis ESLint v9).

---

# Cycle 59 — Les anonymes n'entraient plus dans leur propre conversation

Le backlog du cycle 58 laissait un candidat nommé : le prédicat défensif
`OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]` sur les 119 lectures de
`Message.deletedAt`. Ce cycle ne l'a pas pris, et c'est le premier résultat.

La tête du backlog dit « appliquez cet idiome aux 119 sites ». Or ces 119 sites ne sont PAS cassés :
le cycle 58 vient de rendre la discipline d'écriture complète, les sept créateurs écrivent la
colonne, les lectures apparient. Le prédicat y serait de la ceinture par-dessus des bretelles — 119
fichiers touchés pour zéro défaut observable. La question utile n'était pas « où cet idiome
manque-t-il ? » mais **« sur quelle colonne le filtre naïf n'apparie-t-il RIEN aujourd'hui ? »**, ce
qui se réduit à : *une colonne `DateTime?`/`String?` dont AUCUN créateur n'écrit la valeur.*

Un balayage des `where` du gateway sous cette question rend quatre sites. Le premier est une porte
d'accès.

## Le défaut

`canAccessConversation` — la garde de toutes les routes de conversation — filtrait
`bannedAt: null` sur `Participant`. **Aucun des neuf créateurs de `Participant` n'écrit `bannedAt`.**
La colonne est donc ABSENTE du document de tout participant jamais banni, et sur le connecteur
MongoDB de Prisma l'égalité à `null` ne l'apparie pas.

Le seul producteur d'un `null` EXPLICITE sur cette colonne est `resolveUnbanWrite`. Autrement dit :
**les seuls participants que cette porte laissait entrer étaient ceux qui avaient été bannis puis
débannis.** Tous les autres étaient dehors.

Et cette branche n'est empruntée que par un contexte d'auth portant un `participantId`, ce qui
d'après `middleware/auth.ts` désigne exactement une population : **les anonymes venus par un lien de
partage.**

| Route | Ce qu'un anonyme obtenait |
|---|---|
| `GET /conversations/:id/messages` | 403 « Unauthorized access to this conversation » |
| `POST /conversations/:id/messages` | 403 |
| `GET /conversations/:id` | 403 |
| fils, statistiques, liste des participants, épinglage | 403 |

La fonctionnalité d'entrée par lien anonyme — celle que `routes/anonymous.ts` provisionne, dont
`routes/conversations/messages.ts` gère explicitement le cas trois lignes plus bas (`joinedAt`,
`allowViewHistory`, `shareLinkId`) — était fermée au niveau de sa garde.

## Les trois autres sites, même piège

- **`PasswordResetService.revokeExistingTokens` et le jumeau magic-link n'ont jamais révoqué un seul
  jeton.** `create` ne renseigne pas `usedAt`, donc la colonne est absente de tout jeton encore
  vierge — soit exactement la cible. Demander un nouveau lien laissait le précédent valide jusqu'à
  son expiration ; `revokedReason: 'NEW_REQUEST'` n'a jamais été écrit. La validation, elle, lit la
  ligne et teste `token.usedAt` en JS : elle est juste, et c'est pour ça que le défaut est resté
  invisible — un jeton consommé était bien refusé, il n'y avait simplement aucune exclusivité.
- **`MessageProcessor.updateTrackingLinksWithMessageId` n'écrivait aucune attribution.** La
  réécriture crée le lien avec un `messageId` encore indisponible, donc omis — son propre
  commentaire dit « sera null », il est ABSENT. Le rattachement post-envoi ne retrouvait pas le lien
  qu'elle venait de créer.
- **`activeTokens` du balayage des jetons périmés rendait toujours 0.**

## Le correctif

`unsetOrNull(champ)` (`utils/prisma-unset.ts`) — le prédicat de LECTURE, nommé, typé sur le nom du
champ, pendant du `LIVE_MESSAGE_MARK` côté écriture du cycle 58. Un nom par colonne (à la
`NOT_DELETED`) ne convenait pas : quatre colonnes différentes dans quatre modules, l'invariant est
commun, pas la colonne.

**Pourquoi la lecture et non l'écriture, cette fois** : ajouter `bannedAt: null` aux neuf créateurs —
le geste exact du cycle 58 — n'aurait rien réparé pour les participants anonymes DÉJÀ en base, c'est-
à-dire pour tous ceux dont l'accès est cassé. Une discipline d'écriture répare l'avenir ; un prédicat
défensif répare le passé. Le cycle 58 pouvait choisir l'écriture parce que ses lignes fautives
étaient rares et rejouables ; ici, elles sont la population.

## Plan
- [x] T1 — bootstrap (leçon 102b) : `bun install --ignore-scripts`, `prisma generate`, build shared
- [x] T2 — reformuler la question du backlog, puis balayer les `where` sous la bonne question
- [x] T3 — vérifier créateur par créateur que la colonne n'est écrite par personne (9 pour `Participant`, 2 pour chaque modèle de jeton)
- [x] T4 — double Prisma qui HONORE « absent ≠ null » (`__tests__/helpers/mongo-where.ts`)
- [x] T5 — RED : 4 témoins de comportement, un par site
- [x] T6 — GREEN : `unsetOrNull`, étalé par les quatre sites
- [x] T7 — 3 témoins pré-existants qui ÉPINGLAIENT la clause fautive, réécrits en comportement
- [x] T8 — sondes de fidélité en sept temps
- [x] T9 — gates : suite gateway complète, `tsc --noEmit`
- [x] T10 — changeset + ADR + ce relevé + leçon

## Vérification

**Rouge observé avant correctif** : 4 témoins, un par site, tous sur un document dont la colonne est
absente. Chacun a échoué pour la bonne raison — la lecture ne rend rien / la clause n'apparie pas la
ligne fraîche.

**Sondes de fidélité** — chaque défaut réintroduit, restauration par copie (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| `canAccessConversation` remis à `bannedAt: null` | 1 (le sien) |
| `revokeExistingTokens` remis à `usedAt: null` | 1 (le sien) |
| magic-link remis à `usedAt: null` | 2 — il y avait DEUX copies du témoin de forme |
| balayage des jetons remis à `usedAt: null` | 1 (le sien) |
| rattachement des liens remis à `messageId: null` | 1 (le sien) |
| `unsetOrNull` vidé en `{}` | **8**, dont « refuse un banni resté actif » |
| branche `null` retirée du prédicat | **3**, dont « admet un débanni » |

Les deux dernières sondes sont celles qui apprennent quelque chose. Vider le prédicat ne produit pas
seulement des échecs de forme : il fait tomber le refus d'un participant BANNI, donc un prédicat trop
permissif est attrapé comme une régression de sécurité et pas comme une faute de frappe. Et retirer
la branche `null` ne fait tomber que le débanni — le seul cas au monde que cette branche protège,
puisque `resolveUnbanWrite` est le seul à écrire un `null` explicite.

**Gate** : suite gateway complète **646 suites / 16 300 tests, 0 échec** (baseline du cycle 58 :
643 / 16 273 sur un `main` antérieur ; +1 suite de ce cycle, +2 amont). `tsc --noEmit` : 0 erreur —
et il a servi : la première forme du prédicat rendait un tuple `readonly` que
`ParticipantWhereInput` refuse, ce qu'aucun test n'aurait vu.

## Reste ouvert après ce cycle

- **`MaintenanceService.cleanupOrphanedAttachments` porte le MÊME défaut et n'a PAS été corrigé.**
  Son `messageId: null` sur `MessageAttachment` n'apparie rien (le chemin TUS crée la ligne sans la
  colonne), donc la passe n'a jamais rien supprimé. La réparer est une ligne — et arme un effacement
  irréversible de fichiers et de lignes sur des données que ce conteneur ne connaît pas. C'est
  exactement la leçon 90.4 (« réparer une chose morte peut en éteindre une vivante ») : le préalable
  est un essai à blanc contre la base de production, hors de portée de cette routine. Le liage
  légitime (`associateAttachmentsToMessage`) filtre par `id`, lui, donc il fonctionne — les lignes
  visées sont bien des orphelines. **Candidat pour un cycle avec accès base, jamais pour un cycle
  aveugle.**
- **Aucune attribution rétroactive.** Les `TrackingLink` et les jetons déjà écrits gardent leur
  colonne absente ; les nouvelles lectures les apparient, mais rien ne remplit le passé.
- **Les ~12 copies inline correctes de l'idiome** (`leftAt`, `expiresAt`, `parentId`, `mutedAt`,
  `invalidatedAt`) n'ont pas été migrées vers `unsetOrNull`. Volontaire : elles fonctionnent, et
  certaines vivent dans un `where` portant DÉJÀ un `OR`, où un spread écraserait l'existant. Le
  spread silencieux est le seul piège de cet utilitaire, et son en-tête le dit.
- **`updateTrackingLinksMessageId` (le binder du chemin de PARTAGE) écrase sans aucune garde** —
  ni `conversationId`, ni `messageId` déjà pris. Le défaut est documenté dans
  `messageRemovalEffects.ts` comme un fait admis ; ce cycle n'y touche pas, mais maintenant que le
  binder du chemin d'ENVOI écrit vraiment, les deux se disputent la colonne pour de bon.
- **La sémantique `absent` vs `null` n'a pas été vérifiée contre une vraie base** (aucun MongoDB
  joignable, pas de démon Docker). Elle repose sur trois post-mortems de production internes
  (`postIncludes.ts`, `CallService.initiateCall`, cycle 54) et sur les cycles 57-58. **Le correctif
  est juste sous les DEUX sémantiques** : la forme `OR` apparie l'absent ET le nul. Ce qui reste
  incertain est l'ampleur du défaut, pas la validité de sa réparation.
- Hérités et non traités : le prédicat défensif sur les 119 lectures de `Message.deletedAt` (écarté
  ci-dessus, avec sa raison) ; les messages d'appel écrits avant le cycle 58 restent invisibles ;
  `post_comment`/`comment_like` gardent leur asymétrie de forme sans conséquence ;
  `softDeleteRetentionMs` reste du code mort documenté ; iOS et Android ne lisent pas
  `deletedCommentIds` ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ;
  `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).

# Cycle 58 — Les messages d'appel n'étaient pas des messages

Une session sœur a livré le cycle 57 en parallèle (« le budget d'une vue unique se dépense par
spectateur »). Aucun recouvrement : son lot touche `recordViewOnceConsumption` et la route des
messages, le mien les sept `message.create` et `CallService`. Les deux ne se croisent que dans les
trois fichiers de suivi, fusionnés à la main en gardant les deux relevés. Ce cycle est donc
renuméroté 58 — son numéro d'origine était 57.

Le backlog du cycle 56 portait quatre têtes. Trois ont été instruites et écartées avant d'écrire une
ligne, ce qui est le vrai résultat de la première moitié de ce cycle :

- **« `post_comment` et `comment_like` n'exposent pas `context.commentId` »** — vrai au mot près, et
  sans conséquence. Les TROIS consommateurs replient déjà sur `metadata.commentId` : le web
  (`notification-helpers.ts:194`), le SDK iOS (`MessageSocketManager.swift:969` et
  `SocketNotificationEvent+Persistence.swift:34`) et le payload push lui-même
  (`NotificationService.ts`, clé `commentId` du bloc `data`). Corriger l'asymétrie ne changerait
  rien pour personne. Retiré du backlog comme défaut — c'est une inélégance de forme.
- **« `softDeleteRetentionMs` est du code mort »** — vrai, et déjà entièrement documenté dans
  l'en-tête de sa propre classe, qui explique que les deux bornes valant sept jours, le champ ne
  décrit plus le comportement. Le retirer est un nettoyage, pas un cycle.
- **« le nom `ExpiredStoriesCleanupService` ment sur son périmètre »** — vrai, et l'en-tête dit
  explicitement pourquoi il reste : il est cité par des plans et des analyses archivés que réécrire
  fausserait. Décision déjà prise, pas une dette.

L'item retenu ne venait pas du backlog. Il est sorti d'une question posée à `/sync` — « qu'est-ce
qui garantit que le flux `changed` apparie quelque chose ? » — dont la réponse a mené un étage plus
haut, chez les écrivains.

## Le défaut

Les deux modèles à soft-delete de ce dépôt ont résolu le MÊME piège MongoDB par deux moitiés
opposées, et c'est cette asymétrie qui a fabriqué le défaut.

`Post` l'a résolu côté LECTURE : un post vivant n'a pas de colonne `deletedAt`, et toutes ses
requêtes apparient l'absence (`NOT_DELETED` = `{ isSet: false }`). `Message` l'a résolu côté
ÉCRITURE : ses ~119 lectures filtrent `deletedAt: null`, et c'est chaque créateur qui rend ce filtre
vrai en écrivant la colonne à `null`.

La convention côté message marche, et n'était portée par aucun nom. Sept `message.create` répartis
dans six fichiers répétaient le littéral. **Deux l'avaient perdu** — `createCallSummaryMessage` et
`createLiveCallMessage`.

## Ce que ça faisait à l'écran

Un message d'appel n'était pas un message pour les lectures gardées par ce filtre :

| Lecture | Ce qui manquait |
|---|---|
| `emitConversationPreviewUpdate` | « Appel audio en cours » ne devenait jamais l'aperçu ; la liste affichait le message d'avant |
| `MessageReadStatusService` (3 sites) | un « Appel manqué » ne faisait monter aucun badge de non-lus |
| delta `/sync` | les messages d'appel n'étaient jamais livrés à la synchro incrémentale |
| `MessageHandler` (édition, suppression, réaction) | `{ id, deletedAt: null }` ne les trouvait pas — non réactionnables |
| `ConversationMessageStatsService`, `ConversationStatsService` | non comptés |

Le produit avait investi un cycle entier dans les messages d'appel riches
(`tasks/2026-06-07-rich-call-system-messages.md`) ; ils entraient en base par une porte que le reste
du gateway ne regarde pas.

## Plan
- [x] T1 — bootstrap d'environnement (leçon 102) : conteneur neuf, `bun install`, `prisma generate`, `bun run build`
- [x] T2 — enquête : trois pistes du backlog instruites et écartées sur lecture des consommateurs
- [x] T3 — RED : 2 témoins, un par créateur fautif, rouges pour la bonne raison
- [x] T4 — GREEN : `LIVE_MESSAGE_MARK`, source unique étalée par les SEPT créateurs
- [x] T5 — sondes de fidélité : trois défauts réintroduits un par un
- [x] T6 — témoin de source, ajouté en RÉPONSE à ce que la 3e sonde a révélé
- [x] T7 — gates : suite gateway complète, `tsc --noEmit`
- [x] T8 — changeset + ADR + ce relevé + leçons

## Vérification

**Rouge observé avant correctif** : 2 témoins, un par créateur, sur `hasOwnProperty('deletedAt')`
— l'assertion doit distinguer ABSENT de `null`, ce que `toMatchObject` ne fait pas de façon lisible.

**Sondes de fidélité** — chaque défaut réintroduit, restauration par copie (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| marqueur retiré du résumé d'appel | 1 (le sien ; le jumeau reste vert) |
| marqueur retiré du message vivant | 1 (le sien ; symétrique) |
| constante vidée en `{}` | 2, et RIEN d'autre sur 45 suites voisines |

La troisième sonde est celle qui a appris quelque chose, et elle a changé le correctif : vider
l'invariant ne fait tomber aucun témoin PRÉ-EXISTANT, sur aucun des sept chemins. Les cinq créateurs
qui portaient le littéral depuis toujours n'avaient aucune couverture dessus — c'est exactement
ainsi que les deux autres ont pu le perdre en silence. Le témoin de source (`liveMessage.test.ts`)
a été écrit en réponse à ce constat, pas prévu au plan.

**Gate** : suite gateway complète **643 suites / 16 273 tests, 0 échec, 0 suite rouge**
(baseline leçon 102 : 640 / 16 261 sur un `main` antérieur). `tsc --noEmit` : 0 erreur.

## Reste ouvert après ce cycle

- **Les messages d'appel déjà écrits sans la colonne restent invisibles de ces lectures.** Réparables
  par un `updateMany` sur `messageSource: 'system'` + `clientMessageId` préfixé `call-summary:`
  dont la colonne est absente, sur le patron de `repair-mention-user-ids.ts`. Action humaine — cette
  routine n'a aucun accès MongoDB.
- **Rien n'empêche MÉCANIQUEMENT un huitième créateur d'omettre le marqueur.** Le prédicat défensif
  `OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }]` — l'idiome que ce dépôt emploie déjà
  pour `leftAt`, `expiresAt`, `parentId`, `mutedAt`, `invalidatedAt` — rendrait les lectures
  indifférentes à la discipline des écrivains. C'est la solution de fond, sur 119 sites : un cycle
  à elle seule, et la constante nommée de ce cycle en est le préalable (l'invariant est désormais
  greppable). **Candidat sérieux pour le prochain cycle.**
- **La sémantique `null` vs absent n'a pas été vérifiée contre une vraie base dans ce cycle.** Aucun
  MongoDB n'est joignable depuis ce conteneur (pas de démon Docker). Elle repose sur le post-mortem
  de `postIncludes.ts`, sur sa reconfirmation par le cycle 54, et sur le fait que six créateurs sur
  sept écrivent la colonne — un geste sans objet si le filtre appariait l'absence. **Le correctif est
  juste sous les DEUX sémantiques** : écrire `deletedAt: null` apparie `deletedAt: null` dans tous
  les cas. Ce qui reste incertain est l'ampleur du défaut d'origine, pas la validité de sa réparation.
- Hérités et non traités : `post_comment`/`comment_like` gardent leur asymétrie de forme (sans
  conséquence, cf. ci-dessus) ; `softDeleteRetentionMs` reste du code mort documenté ; le push
  APNs/FCM déjà délivré n'est pas rappelé ; iOS et Android ne lisent pas encore `deletedCommentIds`
  (cycle 56) ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne
  peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).
# Cycle 57 — Le budget d'une vue unique se dépensait par ouverture, pas par spectateur

Le backlog du cycle 56 laissait six items ouverts. Aucun n'a été pris : trois relèvent d'une
plateforme que cet environnement ne compile pas, un attend une validation humaine, un est un
outillage cassé (`eslint` sur le gateway), et le dernier — « `post_comment` et `comment_like`
n'exposent pas `context.commentId` » — s'est **réfuté à la lecture**. Le retrait des notifications
de commentaire couvre déjà les deux chemins JSON par un `$or`, son en-tête explique pourquoi, et
aucun client ne lit `context.commentId` : uniformiser les huit producteurs changerait un contrat
sans corriger aucun défaut observable. C'est la leçon 89 appliquée AVANT d'écrire, pour une fois.

Le cycle est donc parti d'un audit du contrat temps-réel plutôt que d'une piste héritée : les 175
constantes de `socketio-events.ts` confrontées à leurs émetteurs (gateway) et à leurs auditeurs
(web, iOS). L'audit a rendu surtout de l'hygiène — trois `*_SYNC` déclarés que personne n'émet,
un `socket.on(REACTION_SYNC)` mort côté web, `MESSAGE_READ_STATUS_UPDATED` émis en doublon de
`READ_STATUS_UPDATED`. Mais il a mené à la route `consume`, et c'est là que le défaut était.

## Le défaut

`POST /conversations/:id/messages/:messageId/consume` incrémentait `Message.viewOnceCount` par un
`update` **inconditionnel**. Le compteur mesurait donc des OUVERTURES. Tous ses lecteurs le lisent
comme un nombre de SPECTATEURS : `isFullyConsumed`, l'annonce `message:consumed` diffusée à la
room, la disparition du média chez les clients.

Dans un groupe où l'émetteur a posé `maxViewOnceCount: 2`, le premier destinataire qui rouvre la
photo une seconde fois porte `isFullyConsumed` à vrai. La route l'ANNONCE à toute la conversation.
Le second destinataire perd un média qu'il n'a jamais ouvert. Et la route étant une mutation nue,
sans clé d'idempotence, un rejeu — file hors-ligne, double tap, retry réseau — suffit à produire
le même effet à lui seul.

**La donnée qui rend le compte exact était écrite par ce même gestionnaire, deux instructions plus
bas** : `MessageStatusEntry.viewedOnceAt`, par participant. Écrite, jamais relue.

Un corollaire, trouvé en suivant la même ligne : cette écriture cherchait le participant par
`userId`. Un anonyme porte un jeton de session dans `authContext.userId` — la ligne n'était jamais
trouvée. Il dépensait donc le budget **sans qu'aucune trace n'enregistre qu'il l'avait fait**, et
pouvait le dépenser indéfiniment.

## Plan
- [x] T1 — audit : contrat d'événements gateway/web/iOS, piste héritée réfutée, défaut localisé
- [x] T2 — RED : 8 témoins de module + 5 de route, rouges pour la bonne raison
- [x] T3 — GREEN : la revendication gardée, l'incrément n'en est que la conséquence
- [x] T4 — câblage : résolution du spectateur, annonce conditionnée, `ROOMS`/`SERVER_EVENTS`
- [x] T5 — sondes de fidélité : cinq défauts réintroduits un par un, restauration par copie
- [x] T6 — gates : baseline mesurée sur arbre propre, suite complète, `tsc`
- [x] T7 — changeset + ADR + ce relevé + leçon

## Vérification

**Baseline mesurée, pas mémorisée** (leçon 90 #6) : arbre propre via `git stash`, suite gateway
complète → **642 suites / 16 269 tests, 0 échec**. Après le lot : **644 / 16 282, 0 échec** —
+2 suites, +13 témoins, aucune régression. `tsc --noEmit` : **0 erreur**.

**Rouge observé avant correctif** : les 5 témoins de route tombent sur le corps d'origine, et le
témoin central reproduit le défaut utilisateur littéralement —

```
- "isFullyConsumed": false,   - "viewOnceCount": 1,
+ "isFullyConsumed": true,    + "viewOnceCount": 2,
```

deux ouvertures du même destinataire, sur un budget de deux, et le pair est dépossédé.

**Sondes de fidélité** — chaque défaut réintroduit volontairement, restauration par **copie**
(leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| incrément inconditionnel (le défaut d'origine) | 2 (seconde ouverture + création concurrente perdante) |
| prédicat réduit à `{ viewedOnceAt: null }` | 1 (la colonne absente) |
| toute panne d'écriture lue comme « déjà vu » | 1 (la panne remonte) |
| création retirée quand l'entrée manque | 2 (spectateur sans entrée + la panne) |
| corps de route d'origine restauré | 4 sur 5 |

Aucune sonde n'a fait tomber un témoin qu'elle ne visait pas, et aucune n'a laissé tout vert. Le
survivant de la dernière sonde est le **verrou du chemin nominal** — vert avant ET après, c'est
exactement son rôle : interdire au correctif de rétrécir le cas courant.

**Le double Prisma HONORE le filtre** (leçon 90 #5) : une entrée déjà estampillée n'est plus
appariée par l'`updateMany`, et une création en double lève P2002. Un double qui aurait rendu la
même ligne quelle que soit la question aurait laissé le témoin central vert sur un correctif
absent — c'est précisément la configuration qui avait fait passer le balayage éphémère pour vivant
pendant trois cycles.

**Deux témoins pré-existants mis à jour, pas affaiblis.** `messages-routes.test.ts` portait deux
cas de couverture de branche nommés d'après des numéros de ligne, qui épinglaient
`viewParticipant = null` comme un chemin de **succès** — c'est-à-dire le corollaire anonyme
lui-même, figé en contrat. Leur intention est conservée (« l'arithmétique de repli des colonnes
nullables », « aucune entrée de statut n'est écrite ») et le second est ÉTENDU : le budget ne se
dépense pas davantage. Un témoin nommé d'après une ligne de code mesure l'implémentation ; celui-ci
mesure maintenant un comportement.

## Reste ouvert après ce cycle

- **Le serveur ne redacte pas le contenu d'un message à vue unique épuisé.** L'application de la
  règle est entièrement côté client et le compteur reste consultatif : un client modifié lit le
  contenu après `isFullyConsumed`. C'est une décision de conception (chiffrement, cache, pièces
  jointes déjà téléchargées), pas un oubli — relevé pour mémoire.
- **Rien ne rattrape les `viewOnceCount` déjà gonflés en base** par l'ancien chemin. Un script de
  réparation les recalculerait depuis `MessageStatusEntry.viewedOnceAt`, qui porte la vérité par
  participant. Action humaine : cette routine n'a aucun accès MongoDB.
- **Hygiène du contrat d'événements, trouvée par l'audit et non traitée** : `REACTION_SYNC`,
  `COMMENT_REACTION_SYNC` et `POST_REACTION_SYNC` sont déclarés dans `socketio-events.ts` et émis
  par personne — les trois synchronisations répondent par ACK, ce que le SDK iOS documente
  explicitement à ses deux sites. Le web porte en face un `socket.on(SERVER_EVENTS.REACTION_SYNC)`
  qui ne se déclenchera jamais, et qui pousserait de surcroît un payload de synchronisation dans
  ses auditeurs de `reaction:added`. Trois constantes et un auditeur à retirer.
- **`MESSAGE_READ_STATUS_UPDATED` est émis en doublon de `READ_STATUS_UPDATED`** sur les cinq sites
  de diffusion des accusés de lecture, et aucun client n'écoute le premier. Un alias qui double le
  trafic de la famille d'événements la plus fréquente après `message:new`.
- **`onMessageConsumed` n'a aucun consommateur applicatif côté web** : la couche socket l'expose,
  aucun cache React Query ne s'y abonne. Un média épuisé par un pair ne change donc rien à l'écran
  d'un utilisateur web avant rechargement.
- Hérités et non traités : `softDeleteRetentionMs` reste du code mort et le nom
  `ExpiredStoriesCleanupService` ment sur son périmètre ; le push APNs/FCM déjà délivré n'est pas
  rappelé ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne
  peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9) ; iOS et Android ne
  lisent pas encore `deletedCommentIds`.

---

# Cycle 56 — La suppression emportait le fil sans jamais le dire

Le backlog du cycle 54 portait sa tête ailleurs : « les `TrackingLink` d'une story détruite ne sont
toujours pas désactivés ». Elle est juste — et elle était **déjà prise** : la PR #2761, ouverte par
une session sœur vingt minutes avant ce cycle, la traitait ; elle a fusionné pendant celui-ci et
porte le numéro 55. Prendre l'item suivant de la même liste plutôt que le doubler. Celui-ci y
figurait sous le nom hérité du cycle 52 : « `broadcastCommentDeleted` n'annonce que la cible et pas
le sous-arbre ».

## Ce que la piste héritée disait, et ce qu'elle ne disait pas

Elle est confirmée telle quelle — chose rare. Mais son énoncé la fait passer pour un défaut de
broadcast, et elle ne l'est pas : **le broadcast n'a jamais eu la liste**. Elle mourait un étage plus
bas.

`PostCommentService.deleteComment` soft-delete le sous-arbre ENTIER depuis le cycle qui a corrigé
l'invariant de `commentCount` — cible + descendants, profondeur arbitraire, une seule liste d'ids
qui sert aussi au décompte et au retrait des notifications. Sa valeur de retour : `{ success: true }`.
La liste ne sortait pas de la méthode. Son seul appelant n'avait donc rien d'autre à annoncer que le
`commentId` qu'il tenait déjà de son propre chemin d'URL.

## Ce que ça faisait à l'écran

Chez tout client qui avait déplié les réponses, elles restaient affichées. Le serveur venait de les
retirer.

**Et rien ne les enlevait jamais.** `getComments` filtre `parentId: null` : le parent supprimé n'est
plus rendu, donc `getReplies` n'est plus jamais appelé pour ses réponses. Ni le refetch, ni
l'invalidation, ni un aller-retour sur le post ne les faisaient disparaître — seulement un
rechargement complet de la page.

Le compteur, lui, était juste depuis le début : `commentCount` voyage en ABSOLU. L'écran affichait
donc « 1 commentaire » au-dessus de trois lignes visibles, et c'est cette contradiction-là que
l'utilisateur voyait, pas l'absence d'un id dans un payload.

## Plan
- [x] T1 — enquête : piste héritée confirmée, mais l'étage fautif n'est pas celui qu'elle nomme
- [x] T2 — RED : 5 témoins (3 service, 2 route) + 2 web, tous rouges pour la bonne raison
- [x] T3 — GREEN : la liste remonte, la route l'annonce, le web en purge ses caches
- [x] T4 — source unique : liste calculée UNE fois, partagée par soft-delete/décompte/retrait/annonce
- [x] T5 — sondes de fidélité : trois défauts réintroduits un par un
- [x] T6 — gates : suites gateway + web, `tsc` sur les trois paquets touchés
- [x] T7 — changeset + ADR + ce relevé + leçon

## Vérification

**Rouge observé avant correctif** : 5 témoins gateway (les 3 du service sur `deletedCommentIds`
absent, les 2 de la route sur le payload sans la liste) + 1 web (les réponses orphelines survivent
en cache — le défaut utilisateur reproduit tel quel). Le 2e témoin web (repli sans liste) passait
déjà : il verrouille le comportement d'AVANT, qui doit survivre au correctif.

**Sondes de fidélité** — chaque défaut réintroduit volontairement, restauration par **copie**
(leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| le service ne rend que `[commentId]` | 2 (sous-arbre profond + égalité avec la liste soft-deletée) |
| repli de la route `?? [commentId]` → `?? []` | 1 (le rejeu) |
| le web ignore `deletedCommentIds` | 1 (les réponses orphelines) |

Aucune sonde n'a fait tomber un témoin qu'elle ne visait pas, et aucune n'a laissé tout vert.
Le témoin « cible seule sur une feuille » reste vert sous la 1ère sonde — c'est correct : sur une
feuille, `[commentId]` EST la bonne réponse. Un témoin qui serait tombé là aurait mesuré
l'implémentation, pas le comportement.

**Suites** : gateway `(omment|SocialEvents|posts)` → 92 suites / 1862 tests verts ; web
`__tests__/hooks/{queries,social}` → 24 suites / 529 verts ; web `__tests__/components` → 201 suites
/ 4155 verts. `tsc --noEmit` : **0 erreur** sur gateway, 0 sur shared, aucune sur le fichier web
touché.

**Deux témoins pré-existants mis à jour, pas affaiblis** : `PostCommentService.test.ts` et
`PostService.test.ts` asseyaient `toEqual({ success: true })` — une égalité EXACTE que le champ
ajouté casse mécaniquement. Passés à `expect.objectContaining({ success: true })` : leur intention
(« la suppression reste réussie même si le retrait des notifications échoue », « le décompte est
juste ») est intacte, et ils ne prétendent plus verrouiller la forme complète du retour, ce qu'ils
ne cherchaient pas à faire.

## Reste ouvert après ce cycle

- **iOS et Android ne lisent pas encore `deletedCommentIds`, et n'en souffraient pas** — vérifié en
  lisant leur code plutôt qu'en le supposant (la première rédaction de ce relevé affirmait
  l'inverse). iOS `PostDetailViewModel` fait `repliesMap[id] = nil` + `expandedThreads.remove(id)`
  sur chaque `comment:deleted` ; Android `PostCommentsViewModel.onCommentDeleted` appelle
  `CommentRepliesState.removedThread(commentId)`. **Le web était le seul client sans cette
  compensation** — le défaut n'était donc pas « le serveur se tait » tout court, mais « le serveur
  se tait, et deux clients sur trois ont chacun payé une traversée locale pour compenser ». C'est
  cette duplication-là que `deletedCommentIds` rend caduque : les deux traversées peuvent céder la
  place à un retrait autoritatif, un cycle par plateforme (cet environnement ne compile ni Swift ni
  Kotlin — leçon 88c), avec leur propre gate.
- **Le rejeu idempotent annonce toujours la seule cible.** `onDuplicate` ne rend qu'un `{ id }` et
  le sous-arbre n'est plus reconstructible par une lecture vivante. Le repli reproduit exactement
  l'existant ; le faire mieux demanderait de stocker la liste dans la `MutationLog`, ce qui est une
  décision de conception sur le journal, pas sur la suppression.
- Hérités et non traités ce cycle : `softDeleteRetentionMs` reste du code mort (le champ est assigné
  et journalisé, `cleanup()` ne le lit pas) ; le nom `ExpiredStoriesCleanupService` ment sur son
  périmètre ; `post_comment` et `comment_like` n'exposent pas `context.commentId` ; le push APNs/FCM
  déjà délivré n'est pas rappelé ; l'arbitrage `delete-for-me` du cycle 12 attend une validation
  humaine ; `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 55 — Le lien de partage survivait à la story qu'il partageait

Les deux ADR du gateway se terminent, l'une et l'autre, par la même réserve : « les `TrackingLink`
visant une story détruite ne sont pas désactivés par cette passe ». Portée en backlog depuis le
cycle 53, elle a cessé d'être théorique au cycle 54 : celui-ci a rendu le balayage effectif pour la
première fois, donc toute story finit désormais par être détruite, donc tout lien de partage de
story finissait par pointer sur une ligne qui n'existe plus.

## Le défaut

Le retrait interactif d'un post — l'app comme la console — coupe ses `/l/<token>` depuis trois
cycles. C'est le troisième effet de `applyPostRemovalEffects`, et son commentaire dit exactement
pourquoi : « le soft-delete ne bascule que `deletedAt`, le `onDelete: Cascade` ne se déclenche
jamais, les `/l/<token>` qui visent ce post resteraient donc opérationnels ». Le balayage du contenu
éphémère est l'AUTRE chemin qui rend un post inatteignable, et le SEUL qui le DÉTRUISE. Il ne
coupait rien.

Et rien ne pouvait le rattraper après coup : `TrackingLink.targetId` n'a ni relation ni cascade vers
`Post` — le champ est polymorphe, il porte indifféremment un `postId`, un `conversationId` ou un
`userId`, et le schéma l'écrit. La ligne `Post` détruite, plus aucun chemin du gateway ne sait
relier le lien à sa cible disparue. Le lien survivait `isActive: true`, pour toujours :
`/l/:token` comptait son clic, incrémentait `totalClicks`, écrivait un `TrackingLinkClick`, puis
redirigeait vers une page morte. `resolveTarget` rendait `isActive: true` avec un `targetId` que
plus rien ne résout, et la page web comme le `DeepLinkRouter` iOS ouvraient un post inexistant.

Le même contenu retiré à la main répondait, lui, 410 `LINK_INACTIVE`. **Un objet, deux fins de vie
selon le chemin de retrait — et la plus fréquente des deux, l'expiration que TOUTE story atteint,
était la mauvaise.**

## Réfutation du remède avant de l'écrire (leçon 94)

Trois cas cherchés nommément, chacun capable de rendre le correctif faux :

1. **Un lecteur légitime d'un lien actif vers un post détruit.** Aucun : `getPostById` est gardé par
   `NOT_DELETED`, et le tableau de bord du partageur lit les statistiques, pas la cible.
2. **Un `targetId` qui désignerait autre chose qu'un post.** Le champ est polymorphe, mais les
   ObjectId ne se confondent pas d'une collection à l'autre — et le retrait interactif filtre déjà
   sur `targetId` seul, sans `targetType`, depuis trois cycles. S'aligner sur lui, et non inventer
   un filtre plus étroit que celui de la règle qu'on extrait.
3. **Une désactivation qui emporterait des données.** Elle en emporterait si elle SUPPRIMAIT : les
   `TrackingLinkClick` référencent le lien sans cascade déclarée. D'où le geste retenu — désactiver,
   comme le fait déjà le retrait interactif.

## L'instant retenu, et celui qui ne l'a pas été

Le post devient inatteignable au SOFT-delete (`getPostById` est gardé par `NOT_DELETED`), pas au
hard-delete. C'est donc l'instant théoriquement juste, et c'est celui du retrait interactif — qui
n'a d'ailleurs pas le choix : un post non éphémère n'est JAMAIS hard-deleté, il reste soft-deleté
pour toujours. Les deux chemins agissent en fait au même endroit logique : **le moment où leur
contenu devient définitivement inatteignable par leur propre chemin.**

Ancrer dans la passe de hard-delete a été retenu pour une raison de coût, notée honnêtement : la
passe de soft-delete est un `updateMany` qui ne matérialise aucun id. Lui en faire produire
demanderait de la convertir en `findMany` + `updateMany`, donc de la BORNER — un `$in` de tout le
passif n'est pas une requête à émettre (leçon 89.5 : un plafond change de sens quand l'entrée change
de nature) — donc de réécrire les témoins que le cycle 54 vient de construire autour de la forme
actuelle. Le gain réel se mesure : les deux bornes valant sept jours depuis `expiresAt`, un post
devient éligible aux deux au même instant et la fenêtre résiduelle est d'une passe en régime
permanent. Elle s'allonge pendant un rattrapage de passif — c'est la réserve de ce cycle.

## Plan
- [x] T1 — enquête : réserve héritée confirmée par diff avec le jumeau (leçon 95), impact tracé
      jusqu'aux deux clients (route `/l/:token` ET `resolveTarget`)
- [x] T2 — réfutation du remède avant écriture : trois cas cherchés, aucun ne tient
- [x] T3 — RED : 8 témoins, 3 rouges + 1 suite qui ne résout pas son module
- [x] T4 — GREEN : module de règle unique, câblé aux deux chemins
- [x] T5 — sondes de fidélité : cinq défauts réintroduits un par un, restauration par COPIE
- [x] T6 — gates : suite gateway complète, comparée à une BASELINE mesurée sur arbre propre
- [x] T7 — changeset + ADR + ce relevé + leçon

## Vérification

Rouge observé avant correctif : 3 témoins sur 8 tombent, plus la suite du module neuf qui ne résout
pas son import.

**Sondes de fidélité** — chaque témoin re-vérifié en réintroduisant son défaut, restauration par
**copie** et non par `git checkout` (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| appel retiré du balayage | 3 |
| `ids` au lieu de `allPostIds` (reposts oubliés) | 1 |
| erreur avalée par un `try/catch` | 1 |
| désactivation placée APRÈS les suppressions | 2 |
| garde de liste vide retirée du module | 1 |

Le témoin « rien à détruire ⇒ aucune requête sur les liens » est **double-gardé** (garde externe
`toDelete.length > 0` ET garde du module) et ne discrimine donc aucune des deux prise isolément —
la sonde 5 fait tomber le témoin du module, pas celui-ci. Il pinne le contrat de bout en bout et son
en-tête le dit, sur le patron de la note équivalente de la suite des sons. Ne pas le prendre pour
un témoin fort.

**Baseline mesurée, pas mémorisée** (leçon 90.6). Une première baseline a été lancée en tâche de
fond pendant que le correctif s'écrivait : elle est ressortie à 21 suites rouges dont
`postRemovalEffects` — c'est-à-dire qu'elle avait lu un arbre déjà modifié. **Jetée.** Le travail a
été commité d'abord (rien à perdre), puis la baseline relancée sur `HEAD~1` en tête détachée, arbre
réellement propre :

- **Avant** : 20 suites en échec, 620 vertes, 640 au total, **15 799 tests, 0 échec de test**.
- **Après** : **mêmes 20 suites**, 622 vertes, 642 au total, 15 807 tests — les deux suites neuves
  et leurs 8 témoins.
- **`diff` des LISTES de suites en échec : identiques.** Aucune régression, et la preuve ne repose
  pas sur une parole.

Les 20 suites rouges sont la condition pré-existante notée au cycle 54 (`PostReactionService.ts:354`,
`groupBy` non typé par le client Prisma généré dans cet environnement) : 0 test en échec, 20 suites
qui ne compilent pas.

`tsc --noEmit` : 362 lignes, identiques avant et après ; les deux seules erreurs sur des fichiers
touchés sont le bruit de résolution `@meeshy/shared/prisma/client` en ligne 1, présent à
l'identique sur des fichiers jamais touchés. Le module neuf n'en produit aucune — il ne dépend pas
du client Prisma généré, seulement de la surface qu'il déclare.

**Ce que la CI a trouvé et que la baseline locale ne pouvait pas voir.** Un TROISIÈME témoin pinnait
la forme scalaire du filtre : `posts-share-tracking.test.ts:222`. Il fait partie des 20 suites qui ne
COMPILENT pas dans cet environnement — une suite qui ne démarre pas ne peut faire tomber aucune
assertion. La comparaison « mêmes 20 suites avant/après » prouvait l'absence de régression parmi les
suites qui TOURNENT, et rien du tout sur les 20 autres, soit ~3 % du dépôt. Corrigé au même titre
que les deux premiers ; leçon 100. **Le geste juste, pour tout changement de FORME d'un appel, est
un `grep` sur la forme — pas la liste des tests qui rougissent, qui en est un sous-ensemble dont le
complément est exactement invisible.**

**Une observation fabriquée, écrite puis retirée.** Une étape de CI vue « en cours » à trois
sondages d'intervalle a été déclarée bloquée depuis 50 min ; un correctif de CI (borner le job
`quality`, sans `timeout-minutes` alors que tout le pipeline l'attend) a été écrit sur cette base,
puis retiré avant merge. L'étape avait duré **93 secondes** : les sondages se suivaient sans qu'une
seule seconde réelle s'écoule entre eux. Le manque de borne sur `quality` est réel et reste au
backlog ci-dessous — mais il se justifiera par le défaut lui-même, pas par un incident inventé.

## Reste ouvert après ce cycle

- **Les 20 suites rouges de cet environnement sont un angle mort mesurable, pas un décor.** Elles ne
  compilent pas (`PostReactionService.ts:354`, `groupBy` non typé par le client Prisma généré ici) et
  ne peuvent donc contredire aucun cycle — c'est ce qui a laissé passer le troisième témoin de ce
  cycle. **Réparer cette compilation locale vaudrait plus qu'un cycle de correctif** ; en attendant,
  tout cycle touchant `PostService`/`PostReactionService` liste ses sites par `grep`.
- **Le job CI `quality` n'a aucun `timeout-minutes`** alors que `test`, `prisma` et `build`
  l'attendent tous par `needs: quality` : il hérite du défaut GitHub de 6 h, et une étape bloquée y
  gèlerait tout le pipeline. Ses deux étapes étant `continue-on-error`, une borne ne peut pas faire
  échouer une PR pour du bruit. Onze des douze jobs du fichier sont dans ce cas ; seul `test` est
  borné. Changement d'un mot par job, à faire dans sa propre PR.
- **La fenêtre soft-delete → hard-delete laisse les liens actifs sur un post déjà masqué.** Une
  passe en régime permanent, davantage pendant un rattrapage de passif. Se ferme en bornant la passe
  de soft-delete (`findMany` + `updateMany`), ce qui est aussi ce que réclamerait tout autre effet
  ancré sur le masquage — **candidat sérieux pour un prochain cycle, à faire d'un bloc plutôt que
  deux fois à moitié.**
- **Les liens des posts détruits AVANT ce correctif restent `isActive: true` en base**, sans cible
  et sans chemin pour les retrouver — leur `targetId` désigne des ObjectId qui n'existent plus. Un
  script les détecterait par absence de cible, sur le patron de `repair-mention-user-ids.ts`. Action
  humaine : cette routine n'a aucun accès MongoDB.
- **`softDeleteRetentionMs` reste du code mort** (hérité du cycle 54) : assigné et journalisé, jamais
  lu par `cleanup()`. Le corriger, c'est choisir entre supprimer le champ et ré-ancrer la seconde
  passe — décision de conception à part entière, et elle se pose en même temps que la borne
  ci-dessus.
- **Le nom `ExpiredStoriesCleanupService` ment sur son périmètre** (hérité du cycle 54).
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  footgun mécanique, sans risque à fermer, en file depuis le cycle 26.
- **`post_comment` et `comment_like` n'exposent pas `context.commentId`** (hérité du cycle 52) —
  leur lien ne vit que dans `metadata.commentId`, et le payload APNs porte l'aveu écrit de
  l'asymétrie (`params.context.commentId || params.metadata.commentId`).
- Inchangés : `broadcastCommentDeleted` n'annonce que la cible et pas le sous-arbre (traverse le
  Swift que cet environnement ne compile pas) ; le push APNs/FCM déjà délivré n'est pas rappelé ;
  l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne peut pas
  tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 54 — Le balayage tournait toutes les heures et ne balayait rien

Le backlog du cycle 53 portait une tête bien formée : « les posts `STATUS` expirent et ne sont
balayés par rien ». Elle était juste. Mais en allant vérifier ce que le balayage faisait des
stories — le type qu'il connaît — il est apparu qu'il n'en faisait rien non plus. La tête du
backlog décrivait la moitié visible d'un défaut dont l'autre moitié était que **le balayage n'a
jamais rien balayé**.

## D1 — la passe de soft-delete n'appariait aucun post

Son filtre était `deletedAt: null`. Sur le connecteur MongoDB de Prisma, un filtre nul ne matche
QUE les documents où le champ est **présent-et-null** ; `post.create` n'écrit jamais cette colonne,
donc sur un post vivant elle est **ABSENTE**.

Ce n'est pas une déduction : le dépôt a déjà payé ce piège en production. `posts/softDelete.ts`
existe pour lui, et le commentaire de `postIncludes.ts` en donne le compte-rendu — « the naive
`null` filter then silently drops EVERY live post, which emptied the feed / reels / stories
endpoints in production (all posts returned `data: []` while the collection was full) ». Le cycle 53
lui-même a corrigé la même erreur sur `firstMessageSentAt`, en revue pré-merge, la veille.

Cette passe portait **le dernier `deletedAt: null` du modèle `Post`** — tous les autres sites lisent
`NOT_DELETED`. Du côté ÉCRITURE cette fois : au lieu de masquer tous les posts vivants d'une
lecture, il les excluait tous d'un balayage. `softDeleted` valait 0 à chaque heure. Et comme la
passe de hard-delete exige un `deletedAt` non nul, elle ne voyait que les stories supprimées **à la
main** — ni la purge des médias (G7), ni la libération des usages de sons, ni le retrait des
notifications (cycle 53) ne se sont jamais appliqués à une story périmée. Trois cycles de travail
branchés sur un chemin mort.

## D2 — un type éphémère sur deux

`type: 'STORY'`. Un `STATUS` expire en 1 h, disparaît bien des lectures à l'échéance
(`getStatuses`/`getDiscoverStatuses` filtrent `expiresAt > now`) et sa ligne vivait pour toujours.

La cause n'est pas l'oubli mais la **duplication** : celui qui POSE l'échéance (`PostService`) et
celui qui l'HONORE portaient chacun sa copie de la liste. Les deux dérivent désormais de
`posts/ephemeralPosts.ts`, et la liste des types est elle-même dérivée des clés de la table des
durées — un type éphémère ajouté là reçoit son échéance ET son balayage.

## D3 — la fournée n'était bornée par rien

Sans conséquence tant que D1 la gardait vide. Corrigée, la première passe affronte tout
l'historique. Or le retrait des notifications **rejette** à son plafond (40 000 lignes) et s'exécute
AVANT toute destruction : sans borne il aurait renoncé, rien n'aurait été détruit, et la passe
suivante aurait retrouvé le même ensemble. **Non pas lente — bloquée.** C'est exactement la leçon
89.5 du cycle précédent (« un plafond change de sens quand l'entrée change de nature »), rencontrée
cette fois par anticipation plutôt qu'en revue.

Fournée bornée à 500 posts, la plus anciennement périmée d'abord, réglable ; une fournée pleine est
journalisée — le signal que le cycle 53 notait comme manquant.

## D4 — réparer D1 éteignait une fonctionnalité livrée

Trouvé en écrivant les conséquences de D1, pas en le codant. `getStories` renvoie à un AUTEUR ses
propres stories périmées pendant **sept jours**, pour que « Mes stories » puisse les archiver — et
sa requête est gardée par `deletedAt: NOT_DELETED`. Un soft-delete posé à l'échéance aurait donc
vidé « Mes stories » au bout d'une heure. La fonctionnalité ne marchait que parce que D1 rendait la
passe inerte : **la réparer la cassait.**

Le balayage attend désormais la fin de la fenêtre d'archive avant de masquer — il est le lecteur
SUIVANT, pas le concurrent. La fenêtre est passée dans `ephemeralPosts.ts` et `PostFeedService`
l'en réexporte : deux copies dériveraient, et le jour où celle du feed s'allongerait, le balayage la
devancerait en silence.

## Plan
- [x] T1 — enquête : la tête du backlog confirmée (D2), puis le chemin lui-même trouvé mort (D1)
- [x] T2 — RED : 8 témoins sur D1/D2/D3, puis 2 de plus sur D4
- [x] T3 — GREEN : `NOT_DELETED`, table des types éphémères, fournée bornée, attente de l'archive
- [x] T4 — source unique : `PostService` et `PostFeedService` branchés sur `ephemeralPosts.ts`
- [x] T5 — sondes de fidélité : cinq défauts réintroduits un par un, plus une re-sonde
- [x] T6 — gates : suite gateway complète sous bun, comparée à une BASELINE sur arbre propre
- [x] T7 — changeset + ADR + ce relevé + leçon

## Vérification

Rouge observé avant correctif : 8 témoins sur 13 tombent (les 5 verts portent sur le module neuf).

**Sondes de fidélité** — chaque témoin re-vérifié en réintroduisant volontairement son défaut,
restauration par **copie** et non par `git checkout` (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| `deletedAt: NOT_DELETED` → `null` (D1) | 2 |
| type scalaire `'STORY'` au soft-delete (D2a) | 2 |
| type scalaire `'STORY'` au hard-delete (D2b) | 3 |
| borne de fournée retirée (D3) | 3 |
| `STATUS` retiré de la table des durées | 3 |

**Une sonde a trouvé un faux vert et l'a fait corriger.** À la première passe, la sonde D2b ne
faisait tomber que 2 témoins : le témoin de bout en bout restait VERT sur un balayage borné aux
stories, parce que son double Prisma rendait la même ligne quelle que soit la question posée. Il
mesurait la chaîne de destruction, jamais ce qui y entre. Double corrigé pour HONORER le filtre de
type ; la re-sonde fait bien tomber 3 témoins. C'est la leçon 2 (« le test passe » ≠ « le test
verrait la régression ») rencontrée sur un double qui simplifiait l'API qu'il simule.

**Baseline explicite plutôt que lecture d'un total.** L'environnement de cette routine porte une
erreur de typage pré-existante (`PostReactionService.ts:354`, `groupBy` non typé par le client
Prisma généré ici) qui empêche 20 suites de COMPILER — 0 test en échec, 20 suites qui ne démarrent
pas. Comparer un total à celui d'un cycle précédent aurait été trompeur. Suite complète relancée sur
l'arbre PROPRE (`git stash`) : **20 suites en échec, 619 vertes, 15 784 tests, 0 échec de test.**
Avec le correctif : **mêmes 20 suites**, 620 vertes, la suite neuve en plus. Aucune régression, et
la preuve ne repose pas sur ma parole quant à ce qui était déjà rouge.

`tsc --noEmit` : aucune erreur imputable aux fichiers touchés (seul subsiste le bruit de résolution
`@meeshy/shared/prisma/client`, présent à l'identique sur des fichiers jamais touchés — le
type-check de la CI est d'ailleurs `continue-on-error`).

## Reste ouvert après ce cycle

- **Le passif ne se rattrape que passe par passe.** À la mise en production le balayage devient
  effectif pour la première fois : 500 posts/heure, 12 000/jour. Aucune réparation rétroactive des
  lignes DÉJÀ orphelines (médias au `postId` nul, usages de sons, notifications de posts détruits à
  la main avant ce correctif) — action humaine, sur le patron de `repair-mention-user-ids.ts`.
- **`softDeleteRetentionMs` reste du code mort** : le champ est assigné et journalisé, mais
  `cleanup()` ne le lit pas. Il documente une intention (6 h de grâce entre masquage et destruction)
  que la passe n'implémente pas — le hard-delete est ancré sur `expiresAt`, pas sur `deletedAt`.
  Non touché ce cycle : le corriger, c'est choisir entre supprimer le champ et ré-ancrer la seconde
  passe, ce qui est une décision de conception à part entière.
- **Le nom `ExpiredStoriesCleanupService` ment maintenant sur son périmètre** (il balaie aussi les
  `STATUS`). Renommer invaliderait six documents d'archive qui le citent nommément ; la doc de
  classe porte la correction à la place. À trancher si le service prend un troisième type.
- **Les `TrackingLink` d'une story détruite ne sont toujours pas désactivés par la passe** (hérité
  du cycle 53) ; `broadcastCommentDeleted` n'annonce que la cible et pas le sous-arbre (hérité du
  cycle 52, traverse le Swift que cet environnement ne compile pas — leçon 88c) ; `post_comment` et
  `comment_like` n'exposent pas `context.commentId` ; le push APNs/FCM déjà délivré n'est pas
  rappelé ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne peut
  pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 53 — Une story périmée n'est pas une story détruite

Le cycle 52 laissait cette tête en backlog sous le nom « les stories expirées ne retirent pas leurs
notifications ». La leçon 18 dit quoi en faire : une piste héritée est une **hypothèse à réfuter
d'abord**. Elle a été réfutée sur le mot qui décide tout — *expirées* — puis confirmée sur l'autre
moitié, celle que son propre énoncé nommait déjà sans qu'on l'entende : *hard-delete*.

## D1 (la piste, et pourquoi elle était fausse)

L'audit est parti d'une piste plus élégante que celle du backlog. `Notification.expiresAt` existe,
les sept lectures d'inbox l'honorent depuis `visibleNotificationsWhere`, et le cycle précédent
(PR #2751) venait de brancher les **quatre** producteurs ancrés sur un message pour qu'ils en
héritent. Une story est le contenu éphémère canonique : `Post.expiresAt`, écrit à l'insertion et
jamais modifié — vérifié, les deux seuls autres sites d'écriture sont des `create` de repost.
Mieux encore, **six** producteurs reçoivent déjà `postExpiresAt` de leurs appelants et le déposent
dans `context.postExpiresAt`, une ligne au-dessus de la colonne qui les masquerait. Toute la forme
du défaut jumeau était là : *l'échéance arrive au producteur et s'arrête juste avant la colonne.*

**C'est faux, et le vérifier a demandé de lire les clients.** `context.postExpiresAt` n'est pas une
échéance oubliée en route : c'est une fonctionnalité livrée des deux côtés. Le web en tire
« · expirée » (`notification-helpers.ts:553`), iOS en tire `expiryLabel` et
`isLinkedContentExpired` (`NotificationModels.swift:823/829`). Le produit **montre** délibérément
la notification d'une story périmée, marquée comme telle. Estampiller la colonne l'aurait masquée
côté serveur et rendu mort le code des deux clients — la régression exacte que le cycle 51 avait
appris à chercher sous le nom de « faux positif ».

La différence avec le message éphémère est réelle et se lit dans la donnée, pas dans l'intention :

| | message éphémère | story périmée |
|---|---|---|
| Ce que la ligne montre | un libellé générique (`protectedPreview`) | un vrai extrait, un acteur, une vignette |
| Ce que la cible répond | rien, le message est détruit à l'échéance | **encore le post** — `getPostById` ne filtre pas l'expiration |
| Geste juste | masquer | montrer, marqué « expirée » |

## D2 (le défaut, là où il est vraiment)

`ExpiredStoriesCleanupService` est le **seul chemin de hard-delete de post du gateway** (vérifié :
les deux seuls `post.deleteMany` du dépôt sont les siens). Sept jours après l'expiration, il détruit
les lignes `Post` des stories, de leurs reposts et de tous leurs commentaires. À cet instant les
deux appuis de la notification tombent **ensemble** : sa copie dénormalisée décrit un contenu qui
n'existe plus, et son `view_post` n'ouvre plus qu'un 404. Le badge non lu, lui, ne peut plus être
décrémenté par personne — on ne lit pas ce qui n'est plus là.

Toutes les stories expirent. Toutes finissaient donc par laisser leurs lignes.

C'est bien ce que le backlog du cycle 52 décrivait — « hard-delete les posts après 7 jours sans
passer par `applyPostRemovalEffects` ». La piste « plus élégante » l'avait déplacé de sept jours et
d'un cran de sévérité. **La note d'origine avait raison ; c'est la relecture qui s'était trompée.**

Sa question ouverte — « le hard-delete déclenche-t-il une cascade que le soft-delete ne déclenchait
pas ? » — se répond en lisant le modèle : `Notification` n'a de relation que vers `User` et
`Message`. Aucune vers `Post`. Rien ne se déclenche, dans un sens comme dans l'autre.

## D3 (placement) — la passe nommait déjà la règle, pour un autre effet

Le retrait ne passe PAS par `applyPostRemovalEffects` : cette liste écrirait une ligne
`AdminAuditLog` pour un balayage sans acteur, et re-libérerait des usages de sons que la passe
libère déjà. Elle nomme les effets d'un retrait **décidé par quelqu'un** ; ceci est une fin de vie.

En revanche la passe porte déjà, au-dessus de `releasePosts`, la règle qui gouverne exactement ce
cas : « placé AVANT les suppressions de posts, et il REJETTE volontairement : `SoundUsage.postId`
n'a ni relation ni cascade, donc supprimer les posts après un échec de libération laisserait des
usages que plus aucun chemin n'atteindrait. » `context.postId` a la même forme — ni relation, ni
cascade. Le retrait prend donc la même place et le même contrat, et la règle n'a pas eu à être
inventée : **elle était écrite trois lignes plus bas, pour son voisin.**

## D4 (la cible est une fournée) — et le plafond change de sens avec elle

`retractPostNotifications` prend désormais une **liste**, comme son jumeau
`retractCommentNotifications` : un `$in` sur stories ∪ reposts, au lieu d'une lecture par post. Les
notifications des commentaires détruits partent avec — toute la famille du fil porte aussi
`context.postId`.

Son plafond de drainage **rejette** au lieu d'avertir, et c'est l'entrée qui l'exige, pas un goût
pour la sévérité : tant qu'elle était UN post, le plafond ne bornait aucune audience réaliste. Elle
est maintenant une heure d'expirations de toute la plateforme — un ensemble que rien ne borne. Un
plafond atteint en silence laisserait l'appelant détruire les posts, et les lignes restantes
n'auraient alors plus **aucun** chemin de retrait, la passe suivante ne voyant plus les posts. Le
rejet rend la reprise possible, et elle converge : les lots déjà lus ont bien été supprimés.

## Plan
- [x] T1 — enquête : la piste héritée réfutée sur les clients, puis confirmée sur le hard-delete
- [x] T2 — RED (unité) : liste, `$in`, liste vide, plafond qui rejette
- [x] T3 — RED (câblage) : stories ∪ reposts, retrait avant destruction, renoncement sur échec,
      annonce par destinataire, aucune question quand rien n'a expiré, sans annonceur
- [x] T4 — GREEN : `retractPostNotifications` élargi + appel gardé dans la passe de hard-delete
- [x] T5 — sondes de fidélité (leçon 45b/93) : cinq défauts réintroduits un par un
- [x] T6 — gates : suite gateway complète sous bun, `tsc --noEmit` propre
- [x] T7 — changeset + ADR + ce relevé

## Vérification

Rouge observé avant le correctif : les six témoins de câblage tombent, l'appel n'existant pas.

**Sondes de fidélité** — chaque témoin re-vérifié en réintroduisant volontairement le défaut qu'il
prétend attraper, restauration par **copie** et non par `git checkout` (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| appel du retrait supprimé de la passe | 5 |
| retrait borné aux stories (reposts oubliés) | 1 |
| retrait placé APRÈS les suppressions | 2 |
| plafond qui avertit au lieu de rejeter | 1 |
| liste vide qui interroge quand même Mongo | 1 |

**Deux suites voisines ont dû être réparées, et les deux réparations disent quelque chose.**
`postRemovalEffects.test.ts` verrouillait la forme scalaire du filtre — assertion mise à jour, le
comportement mesuré est inchangé. `ExpiredStoriesCleanupService.sounds.test.ts`, lui, est tombé
parce que son double Prisma ne connaît pas `$runCommandRaw` : le retrait rejetait, et la libération
des usages — ce que cette suite mesure — n'était plus atteinte. C'est **exactement** le contrat
voulu (le retrait gouverne la passe), observé depuis une suite qui ne le teste pas. Ajouter les deux
doubles n'affaiblit donc rien : c'est la même leçon que le commentaire déjà présent dans ce fichier
à propos de `soundUsage` — un double manquant transforme une garde en avale-tout silencieux.

Suite gateway complète sous bun (parité CI) : **639 suites, 16 241 tests, tout vert**.
Couverture globale lignes **95,76 %** — inchangée. `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Aucune ligne déjà orpheline n'est rattrapée**, comme aux cycles 51 et 52 : le correctif ne vaut
  que pour les destructions à venir. Réparable par le patron de `repair-mention-user-ids.ts` —
  action humaine, cette routine n'a aucun accès MongoDB.
- **Les posts `STATUS` expirent et ne sont balayés par rien.** Le balayage filtre `type: 'STORY'` ;
  une story dure 21 h et meurt à 7 jours, un statut dure 1 h et sa ligne vit pour toujours. Leurs
  notifications mènent donc toujours quelque part — ce n'est pas un défaut de notification, c'est
  un balayage qui manque, et le trou de disque associé (médias, usages de sons) est le même que
  celui que le cycle G7 a fermé pour les stories. À instruire pour lui-même.
- **Les `TrackingLink` d'une story détruite ne sont pas désactivés par la passe.** Sur le chemin de
  retrait DÉCIDÉ, `applyPostRemovalEffects` les désactive ; une story qui meurt de vieillesse n'y
  passe jamais. Un `/l/<token>` visant une story détruite reste donc actif et pointe une ligne
  absente. Défaut voisin, non instruit ce cycle — vérifier d'abord ce que résout un lien dont la
  cible n'existe plus.
- **Une passe peut désormais bloquer sur elle-même.** Plafond de drainage atteint ⇒ rien n'est
  détruit cette heure-là. Voulu (la reprise converge), mais retarde d'autant la récupération de
  disque, et rien ne mesure aujourd'hui la fréquence de ce cas.
- **`broadcastCommentDeleted` n'annonce que la cible, pas le sous-arbre** (hérité du cycle 52,
  inchangé) : la route émet un seul `commentId` là où `deleteComment` en a soft-deleté N, et les
  réponses restent affichées chez les clients connectés jusqu'au prochain chargement du fil. Le
  correctif traverse gateway + shared + web + SDK iOS — dont le Swift, que cet environnement ne
  sait pas compiler (leçon 88c : ne pas livrer ce qu'on ne peut pas prouver).
- **`post_comment` et `comment_like` n'exposent pas `context.commentId`** (hérité du cycle 52) ;
  le retrait des `Mention` d'un post n'est pas dans la liste d'effets ; le push APNs/FCM déjà
  délivré n'est pas rappelé ; l'arbitrage `delete-for-me` du cycle 12 attend une validation
  humaine ; `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 52 — Le commentaire partait ; ce qu'il avait écrit dans l'inbox des autres restait

Le cycle 51 nommait cette tête en la donnant explicitement pour une **hypothèse à réfuter d'abord**
(leçon 18), avec trois questions à instruire dans l'ordre. Les trois ont été instruites. Le défaut
est confirmé ; **la piste, elle, était fausse sur le point qui décide toute l'implémentation.**

## D1 (les trois questions du cycle 51, dans l'ordre)

**Q1 — qui écrit `PostComment.deletedAt`, et est-ce la configuration « quatre écrivains sans
unité » du cycle 14 ?** Non. Un seul écrivain interactif : `PostCommentService.deleteComment`,
atteint par la seule route `DELETE /posts/:postId/comments/:commentId`. Le second site,
`ExpiredStoriesCleanupService`, ne soft-delete pas : il **hard-delete** les commentaires d'une story
expirée depuis 7 jours, dans un cycle de vie où c'est le post entier qui part. Pas de liste d'effets
nommée à créer, donc — l'écrire pour un unique appelant aurait fabriqué l'indirection que les
cycles 45b/51 justifient par la PLURALITÉ des écrivains. L'appel va directement dans `deleteComment`.

**Q2 — `context.commentId` désigne-t-il toujours LE commentaire supprimé ?** Oui quand il est
présent — et c'est ce « quand » qui est le vrai résultat. En relisant les écrivains plutôt que le
nom de la colonne (leçon 18 du cycle 18), les huit types producteurs se répartissent en **trois**
familles, pas une :

| Chemin qui porte le lien | Types |
|---|---|
| `context.commentId` SEUL | `comment_reaction` |
| `metadata.commentId` SEUL | **`post_comment`**, `comment_like` |
| les deux | `comment_reply`, `user_mentioned` (mention en commentaire), `story_new_comment`, `story_thread_reply`, `friend_story_comment` |

La piste du cycle 51 énumérait les sept premiers comme écrivains de `context.commentId`. Deux d'entre
eux ne l'écrivent pas — dont `post_comment`, la notification la **plus fréquente** de toute la
famille : une par commentaire, vers l'auteur du contenu. Un retrait transposé littéralement du
jumeau post, qui ne connaît que `context.<clé>`, aurait donc laissé en base la majorité du volume,
en passant tous ses tests. La trace de cette asymétrie était déjà dans le code — le payload APNs
lit `params.context.commentId || params.metadata.commentId` — et personne ne l'avait lue comme
l'aveu qu'elle est.

**Q3 — retrait ou MARQUAGE, comme la réponse à une demande d'amitié ?** Retrait. Ce qui tranche est
ce qui reste au bout du lien : le commentaire est filtré partout à la lecture (`getComments` et
`getReplies` excluent `deletedAt`), donc la ligne n'a plus rien à afficher **et** rien où mener. Le
marquage était l'arbitrage de la demande d'amitié RÉPONDUE parce que la ligne `FriendRequest`, elle,
survit — la notification y est *consommée*, pas orpheline. Ici rien ne survit. Et `deleteComment`
rejette `FORBIDDEN` pour tout autre que l'auteur : il n'existe donc pas de retrait de modération
dont la notification serait la seule trace, le troisième faux positif cherché au cycle 51.

## D2 (la seconde différence) — la cible est une liste, pas un id

`deleteComment` soft-delete le **sous-arbre entier**, à profondeur arbitraire, parce que
`commentCount` compte le fil complet. Le retrait reçoit exactement la liste d'ids que le soft-delete
a écrite. Traiter la seule cible aurait laissé les notifications des réponses emportées avec elle —
un défaut invisible depuis la cible, puisque la cible, elle, aurait été correctement nettoyée.

`parentCommentId` reste VOLONTAIREMENT hors du filtre. C'est la seule autre clé de `context` qui
désigne un commentaire, et elle ne désigne jamais le sujet de la ligne : sur un `comment_reply`,
`commentId` est la réponse et `parentCommentId` le commentaire auquel on répond. Le cas « le parent
disparaît » est déjà couvert par le sous-arbre.

## D3 (câblage) — la route n'a rien à câbler

Même résolution que `applyPostRemovalEffects` et `applyMessageRemovalEffects` : l'annonceur est un
**défaut de paramètre** sur `getSharedNotificationService()`. Sur une méthode, le défaut est évalué
à chaque appel — ce qui est ici nécessaire et pas seulement commode : le service partagé n'est
enregistré qu'au démarrage du socket, après la construction des routes. Une injection par
constructeur aurait capturé `undefined`.

## Plan
- [x] T1 — enquête : les trois questions du cycle 51, écrivains relus un par un
- [x] T2 — RED (unité) : les deux chemins JSON lus ; chaque famille de types couverte
- [x] T3 — RED (unité) : sous-arbre, annonce par destinataire, voisins épargnés, ordre, drainage,
      liste vide, sans annonceur, échec Mongo remonté
- [x] T4 — RED (câblage) : même liste d'ids que le soft-delete, annonce après l'écriture durable,
      suppression réussie malgré un retrait en échec, rien de retiré si la suppression est refusée
- [x] T5 — GREEN : `retractCommentNotifications` + appel best-effort dans `deleteComment`
- [x] T6 — sondes de fidélité (leçon 45b) : quatre défauts réintroduits un par un
- [x] T7 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T8 — changeset + CHANGELOG + ce relevé

## Vérification

Rouge observé avant le correctif : `Cannot find module '../retractCommentNotifications'`.

**Sondes de fidélité** — chaque témoin central re-vérifié en réintroduisant volontairement le défaut
qu'il prétend attraper, restauration par **copie** et non par `git checkout` (leçon 93) :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| filtre sur le seul `context.commentId` | 3 (dont « retire aussi les lignes dont le lien ne vit que dans metadata ») |
| retrait borné à `[commentId]` au lieu du sous-arbre | 1 (« TOUT le sous-arbre soft-deleté ») |
| appel au retrait supprimé de `deleteComment` | 2 |
| annonce placée AVANT l'écriture durable | 1 (« annonce APRÈS l'écriture durable ») |

Suite gateway complète sous bun (parité CI) : **639 suites, 16 220 tests, tout vert** (333 s).
Couverture globale lignes **95,76 %** — inchangée. `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Aucune ligne déjà orpheline n'est rattrapée**, comme au cycle 51 : le correctif ne vaut que pour
  les suppressions à venir. Réparable par le patron de `repair-mention-user-ids.ts` — action
  humaine, cette routine n'a aucun accès MongoDB.
- **`post_comment` et `comment_like` n'exposent pas `context.commentId`**, alors que leurs six
  cousins le font. Ce n'est pas qu'une gêne pour le retrait : le commentaire de `createNotification`
  dit que « `postId`/`commentId` vivent dans `context` (cible de navigation) » et que le schéma de
  réponse REST les expose — donc la navigation **in-app** vers le commentaire exact ne peut pas
  fonctionner pour ces deux types, seul le payload APNs s'en sortant par son repli sur `metadata`.
  À instruire comme un défaut de navigation à part entière (lire d'abord ce que le web et le SDK iOS
  consomment réellement), et non à corriger en passant : c'est un contrat client.
- **Les stories expirées ne retirent pas leurs notifications.** `ExpiredStoriesCleanupService`
  hard-delete les posts après 7 jours sans passer par `applyPostRemovalEffects` : toutes les
  notifications d'une story expirée survivent, exactement comme celles d'un post supprimé avant le
  cycle 51. Volume potentiellement supérieur au cas post (toutes les stories expirent). À vérifier
  avant d'écrire : le hard-delete déclenche-t-il une cascade que le soft-delete ne déclenchait pas ?
  `Notification` n'a pas de relation vers `Post`, donc a priori non — mais c'est précisément le genre
  de déduction que ce cycle a appris à ne pas faire sans lire.
- **`broadcastCommentDeleted` n'annonce que la cible, pas le sous-arbre.** La route émet un seul
  `commentId` alors que `deleteComment` en a soft-deleté N. Les réponses restent affichées chez les
  clients connectés jusqu'au prochain chargement du fil. Défaut voisin, non instruit ce cycle.
- **Le retrait des `Mention` d'un post n'est pas dans la liste d'effets** (hérité du cycle 51,
  inchangé) ; le push APNs/FCM déjà délivré n'est pas rappelé ; `.gitignore:177` porte un `post-*`
  non ancré et non scopé ; `login_new_device` sans contexte de consommation ; l'arbitrage
  `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne peut pas tourner sur le
  gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 51 — Le jumeau côté post avait reçu la liste, jamais les notifications

Le cycle 50 nommait cette tête en toutes lettres, et la leçon 18 dit quoi en faire : une piste
héritée est une **hypothèse à réfuter d'abord**. Réfutation tentée, défaut confirmé, correctif
suggéré confirmé lui aussi — mais seulement après avoir cherché le cas qui l'aurait rendu faux.

## D1 (racine) — la liste nomme trois effets, le quatrième n'y a jamais figuré

`applyPostRemovalEffects` existe pour une raison écrite dans son propre en-tête : la console avait
rattrapé un par un, à trois cycles d'intervalle, ce que le service faisait et qu'elle ne faisait
pas — les usages de sons, puis la diffusion, puis l'audit et les liens de partage. « Chaque omission
a attendu son propre incident parce que rien ne NOMMAIT la liste. »

La liste a été écrite. Elle nomme l'audit, les `TrackingLink`, les usages de sons. Elle ne nomme pas
les `Notification`. Le jumeau côté message les retire depuis le cycle 47, et ce jumeau est nommé
dans le commentaire de tête du fichier — la comparaison était à une ligne de distance et personne ne
l'a faite, parce que **ce qui manque à une liste ne se voit pas en lisant la liste**.

Le mécanisme est celui des cycles 46/47/48/50, à sa cinquième occurrence et à sa plus grande
échelle : retrait doux (`deletedAt`), donc pas de cascade ; lien porté par `context.postId`, un
chemin dans un blob JSON, donc aucune relation déclarée à ne pas se déclencher ; copie
**dénormalisée** du contenu prise à la création, donc aucun filtre à la lecture ne peut rattraper —
`content`, `metadata.commentPreview`, et `metadata.firstAttachmentUrl`, qui est la vignette du média
retiré. ≈ 8 100 lignes non lues en production au diagnostic du 2026-08-04.

## D2 (réfutation de la piste) — trois faux positifs cherchés, aucun trouvé

La piste disait « filtrer sur `context.postId` ». Le cycle 18 a montré qu'un filtre qui porte le nom
d'une relation ne porte pas forcément la relation. Trois cas ont donc été cherchés avant d'écrire :

1. **Une notification dont `context.postId` désigne un AUTRE post que celui qu'elle concerne.**
   `post_repost` était le candidat : il porte `context.postId = originalPostId` et le repost lui-même
   dans `metadata.repostId`. Supprimer le repost ne retire donc rien du post d'origine, et supprimer
   l'original retire bien la notification « X a reposté votre post », qui n'a effectivement plus de
   destination. Le seul écrivain asymétrique va dans le bon sens.
2. **Une notification ancrée sur un post mais dont la cible vivante est ailleurs** (typiquement une
   réponse de story qui atterrit dans une conversation). Les onze producteurs de `context.postId` ont
   été relus : tous désignent le post lui-même, aucun ne double la clé avec un `messageId` vivant.
3. **Une notification de modération « votre post a été retiré »** qui serait créée par le retrait et
   emportée par lui. Aucune n'existe — ni le service ni la route console n'en créent.

Rien n'oblige donc à distinguer par `type`, et c'est ce qui rend le filtre sûr.

## D3 (les deux différences avec le jumeau message) — elles décident l'implémentation

| | message rappelé | post retiré |
|---|---|---|
| Lien vers la ligne | colonne `Notification.messageId` | `context.postId`, chemin JSON |
| Audience | quelques destinataires nommés | auteur + fil + amis prévenus |
| Requête | `findMany` Prisma | `$runCommandRaw` (Prisma ne filtre pas les chemins JSON sur MongoDB) |
| Scope `userId` | inutile | **projeté**, l'annonce se groupe par destinataire |
| Volume | une passe suffit | **drainage** par lots |

Le drainage est la seule addition que le jumeau n'a pas. Un lot plein ne prouve pas que la base est
vide, et une lecture unique laisserait la queue en place **sans le moindre signal** — le premier
lot, lui, a réussi. Lots de 200 en série : `announceNotificationsRetracted` déclenche un recalcul de
compteurs par destinataire distinct, donc le lot borne la rafale de lectures concurrentes, et la
sérialisation garde le pic à un lot quelle que soit la taille de l'audience. Plafond de 200 lots :
il ne borne aucune audience réaliste, il empêche une boucle infinie si la suppression cessait un
jour de faire progresser la lecture.

## D4 (câblage) — les deux routes n'ont rien à câbler

Le cycle 50 anticipait « l'annonceur doit descendre jusqu'à `applyPostRemovalEffects`, qui ne reçoit
ni `NotificationService` ni port étroit ». Vrai, mais la descente n'a coûté aucun paramètre aux
appelants : `applyMessageRemovalEffects` résout déjà son annonceur par **défaut de paramètre** sur
`getSharedNotificationService()` — le service partagé du processus, le seul câblé avec `io`. Le même
défaut ici couvre les deux routes (`DELETE /posts/:postId` via `PostService.deletePost`, et
`DELETE /admin/posts/:postId` qui écrit `deletedAt` en direct) sans toucher ni au constructeur à
sept paramètres de `PostService`, ni à la signature de `deletePost`, ni aux deux routes.

Le port `RetractedNotificationAnnouncer` déménage de `messaging/` vers `notifications/`, à côté de
son unique implémenteur. Le redéclarer sous `posts/` aurait fabriqué deux ports rivaux pour une
seule règle — la configuration même que ces modules d'effets existent pour empêcher (cycle 45b).
`messaging/` le ré-exporte : aucun importateur historique ne bouge.

## D5 (place dans la liste) — après l'audit, avant les deux autres

L'audit reste le premier effet écrit : c'est la trace de modération, et c'est la seule des quatre
dont la perte est une perte de conformité. Le retrait vient juste après, avant les liens de partage
et les usages de sons, parce que c'est le seul des quatre dont le **retard se voit** — tant qu'il
n'a pas eu lieu, l'extrait du contenu retiré et la vignette de son média restent affichés dans
l'inbox de toute l'audience. Best-effort comme les trois autres : `deletedAt` est déjà committé
quand la liste s'exécute, et un retrait qui échoue ne doit pas transformer une suppression réussie
en 500.

## Plan
- [x] T1 — RED (unité) : lecture par chemin JSON `context.postId`, projection `_id` + `userId`
- [x] T2 — RED (unité) : toute l'audience retirée, chaque ligne annoncée à SON destinataire
- [x] T3 — RED (unité) : un autre post et une notification hors post ne bougent pas
- [x] T4 — RED (unité) : l'annonce vient APRÈS l'écriture durable
- [x] T5 — RED (unité) : drainage au-delà d'un lot plein ; arrêt au premier lot incomplet
- [x] T6 — RED (unité) : rien à retirer → aucune suppression, aucune annonce ; sans annonceur → les
      lignes partent quand même ; échec Mongo → remonte (la liste d'effets décide de l'absorber)
- [x] T7 — RED (liste) : `applyPostRemovalEffects` retire ; un échec n'emporte ni la suppression ni
      les trois effets historiques
- [x] T8 — GREEN : `retractPostNotifications` + 4e effet + port déménagé
- [x] T9 — sondes de fidélité (leçon 45b) : trois défauts réintroduits un par un
- [x] T10 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T11 — changeset + CHANGELOG + ce relevé

## Vérification

Rouges observés avant le correctif : `Cannot find module '../retractPostNotifications'` sur la suite
d'unité, et TS2554 (« Expected 3-4 arguments, but got 5 ») sur la suite de liste d'effets.

**Sondes de fidélité** — chaque témoin central re-vérifié en réintroduisant volontairement le
défaut qu'il prétend attraper, restauration par **copie** et non par `git checkout` (leçon 93) :

| Défaut réintroduit | Témoin qui tombe |
|---|---|
| `userId: objectId(rows[0]?.userId)` (tout le monde rabattu sur le premier destinataire) | « annonce chacune à SON destinataire » |
| `return total` inconditionnel en fin de boucle (pas de drainage) | « draine au-delà d'un lot plein » |
| appel au retrait supprimé de la liste d'effets | « retire les notifications que le post a produites » |

Suite gateway complète sous bun (parité CI) : **638 suites, 16 204 tests, tout vert** (386 s).
Couverture globale lignes **95,76 %** — inchangée. `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Aucune ligne déjà orpheline n'est rattrapée.** Le correctif ne vaut que pour les suppressions à
  venir ; les ≈ 8 100 lignes des posts déjà supprimés restent en base. Réparable par le patron des
  scripts existants (`repair-mention-user-ids.ts`) — action humaine, cette routine n'a aucun accès
  MongoDB.
- **Piste pour le cycle suivant, à traiter en HYPOTHÈSE (leçon 18).** Le même mécanisme a un sixième
  candidat, un cran en dessous du post : la suppression d'un **commentaire**. `context.commentId`
  est écrit par `comment_reaction`, `post_comment`, `comment_reply`, `comment_like`,
  `story_new_comment`, `story_thread_reply` et `friend_story_comment` ; le retrait d'un commentaire
  est doux lui aussi (`PostComment.deletedAt`, cf. `loadCommentPostAcl`). À vérifier AVANT d'écrire,
  et dans cet ordre : (1) qui écrit `PostComment.deletedAt`, et ces écrivains partagent-ils une
  liste d'effets nommée, ou sont-ils la configuration « quatre écrivains sans unité » du cycle 14 ?
  (2) `context.commentId` désigne-t-il toujours LE commentaire supprimé, ou parfois son parent
  (`context.parentCommentId` existe séparément — donc a priori oui, mais c'est exactement le genre
  de colonne dont il faut lire les écrivains et non le nom) ? (3) le retrait d'un commentaire
  doit-il vraiment emporter la notification, ou est-ce un cas de MARQUAGE comme la réponse à une
  demande d'amitié ? Rien ne dit que l'arbitrage du post se transpose.
- **Le retrait des `Mention` d'un post n'est pas dans la liste non plus.** `reconcilePostMentions`
  retire les lignes des partants à l'ÉDITION ; aucun appel équivalent au retrait. Défaut probable de
  la même famille, non instruit ce cycle — le vérifier avant de l'écrire.
- **Le push APNs/FCM déjà délivré n'est pas rappelé.** Retirer la ligne éteint la liste in-app et la
  cloche, pas la bannière déjà posée sur l'écran verrouillé. Chantier de contrat, pas correctif.
- **`.gitignore:177` porte un `post-*` non ancré et non scopé** — il masque *tout* fichier dont le
  nom commence par `post-`, à n'importe quelle profondeur. Rencontré en écrivant ce cycle : le
  changeset nommé `post-removal-…` n'apparaissait pas dans `git status`, renommé pour contourner.
  Aucune perte active aujourd'hui (`apps/web/__tests__/components/v2/post-card-enhanced.test.tsx`
  est déjà suivi, donc le motif ne s'y applique plus), mais tout fichier `post-*` créé désormais
  disparaît en silence. Non corrigé ici : le motif est voisin d'un bloc « Version files » sans
  commentaire propre, et le restreindre demande de savoir ce qu'il visait — à instruire séparément.
- Hérités et inchangés : `login_new_device` sans contexte de consommation ; l'arbitrage
  `delete-for-me` du cycle 12 attend une validation humaine ; `eslint` ne peut pas tourner sur le
  gateway (aucun `eslint.config.js` depuis ESLint v9).

---

# Cycle 50b — La famille était de cinq. Elle est de quatre, et les quatre héritent.

> **Session parallèle.** Deux sessions ont livré un cycle 50 en même temps, et pour une fois dans la
> MÊME famille : le 50 ci-dessous retire la notification d'une demande d'amitié annulée, celui-ci
> fait hériter aux notifications l'échéance du message qu'elles désignent. Aucun recouvrement de
> code — l'un touche le retrait par référent, l'autre la péremption par échéance.

Le cycle 49b a branché les trois producteurs que l'éventail d'un message appelle et a nommé les deux
qui restaient, sans les traiter : la réaction et la traduction prête. Ce cycle les prend, et l'un des
deux se révèle ne pas être un producteur.

## L'énumération, parce qu'elle est vérifiable

Quatre — pas trois, pas six — méthodes `create*` de `NotificationService` posent un
`context.messageId`. Le compte se refait en une commande, et c'est ce qui fait la valeur de la
revendication « la famille est complète » : `createMessageNotification`, `createMentionNotification`,
`createReactionNotification`, `createReplyNotification`. Les quatre estampillent désormais
l'échéance.

## Ce que chacun coûte : rien

**La réaction** lisait déjà le message pour en tirer l'extrait (`select: { content: true }`) —
`expiresAt` voyage dans la même lecture. **La mention par édition** avait son paramètre depuis le
cycle précédent, sans personne pour le lui passer : les deux transports REST chargent le message par
`include` (l'échéance était déjà là, à portée de main), et le transport socket ajoute un champ à un
`select` qu'il émettait déjà. Zéro requête ajoutée sur les deux chemins — la même contrainte que le
cycle 49b s'était donnée, tenue pour les mêmes raisons.

## Le cinquième n'écrivait rien

`createTranslationReadyNotification` n'avait **aucun appelant de production** : un test était sa
seule invocation dans tout le dépôt. Il n'a jamais écrit une ligne `Notification`, et aucun client
n'a jamais reçu ce type. Ce n'était donc pas « le producteur qui n'hérite pas d'échéance » — c'était
un producteur qui ne produit pas.

Retiré. Mais retirer la méthode ne suffisait pas : `NotificationTypeEnum.TRANSLATION_READY` reste
déclaré (le SDK iOS le décode, et un client déployé ne doit pas buter dessus), et c'est exactement la
forme que la leçon 92 décrit — une valeur déclarée qu'un audit lit comme une fonctionnalité. Elle
porte désormais la mention explicite qu'aucun producteur ne l'émet, et le renvoi vers l'homonyme ZMQ
`translation_ready`, lui bien vivant, qui annonce une traduction au gateway sans notifier personne.

Le test qui l'atteignait est retiré avec elle, et remplacé par la phrase qui explique pourquoi : un
test qui est le SEUL appelant de son sujet ne mesure pas du code vivant, il en entretient
l'apparence.

## Plan

- [x] T1 — RED : une réaction à un message éphémère hérite de son échéance
- [x] T2 — témoin : une réaction à un message ordinaire n'invente aucune échéance
- [x] T3 — RED : une mention ajoutée en ÉDITANT un message éphémère hérite de son échéance
- [x] T4 — témoin : l'édition d'un message ordinaire transmet `null`, jamais une échéance inventée
- [x] T5 — les trois transports d'édition alimentent le champ (socket + PUT + PATCH)
- [x] T6 — retrait du producteur sans appelant + annotation de l'énumération partagée
- [x] T7 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T8 — changeset + ce relevé

## Revue

Sonde : les deux estampilles neutralisées ensemble → **3 rouges**. Les deux attendus, plus un
troisième qui mérite d'être nommé : le test « réconcilie et ne notifie QUE les entrants » compare la
totalité de `commonData`. Il tombe parce que le champ a disparu de l'objet — c'est-à-dire qu'il tient
aussi, gratuitement, le témoin `messageExpiresAt: null` du chemin ordinaire. C'est le cas où
l'égalité stricte, que le cycle 49b a assouplie ailleurs, se révèle utile : ici l'objet EST le
contrat de l'appel, et personne d'autre ne le compose.

`tsc --noEmit` a d'abord rendu deux erreurs sur `routes/conversations/core.ts` (`firstMessageSentAt`
absent du type Prisma) : client généré périmé après la fusion de `main`, aucun rapport avec ce lot.
Régénéré, la compilation est propre.

## Reste ouvert après ce cycle

- **Les clients ne s'auto-périment toujours pas**, et le parseur socket du web lit à la RACINE ce
  que le serveur envoie sous `state` — les deux points hérités du 49b, inchangés.
- **`getUserNotifications` reste sans appelant de production.** Même forme que le producteur retiré
  ici, mais la route `/notifications` refait sa requête à la main : supprimer la méthode demanderait
  d'abord de faire appeler le service par la route, ce qui est un autre geste.
- **Les points hérités restent ouverts tels quels** : le push déjà remis reste sur l'appareil au
  rappel ; les mentions du chemin de lien attendent l'extraction qui écrit `Message.validatedMentions` ;
  aucun client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de lien n'entrent pas
  dans le pipeline audio ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine.

---

# Cycle 50 — La demande d'amitié partait ; sa notification restait, sans destination

Tête prise dans la famille que les cycles 46/47/48 ont ouverte sans la fermer : **une ligne
dénormalisée survit au retrait de son référent parce que le retrait ne l'a jamais nommée.** Trois
occurrences déjà traitées (`TrackingLink` d'un message rappelé, `Mention`, `Notification` d'un
message rappelé), toutes du côté message. La quatrième est ailleurs, et c'est ce qui l'avait
gardée invisible : elle est sur la route qui supprime une demande d'amitié.

## D1 (racine) — le seul consommateur devient inatteignable au moment où la ligne part

`DELETE /friend-requests/:id` fait trois choses : il lit la demande, il **supprime la ligne**, il
émet `friend_request:cancelled` à l'autre partie. Il ne touche pas la seule chose DURABLE que la
demande avait produite — la notification « X vous a envoyé une demande d'amitié », écrite par
`createFriendRequestNotification` dans l'inbox du **destinataire**.

Rien d'autre ne l'en retirait :

- `Notification.context` est un blob JSON, pas une clé étrangère. Aucun `onDelete: Cascade` ne peut
  se déclencher sur `context.friendRequestId` — même mécanisme exactement que celui qui laissait les
  `Notification` d'un message rappelé en base (cycle 47), à ceci près qu'ici il n'y a même pas de
  relation déclarée à ne pas se déclencher.
- Sa seule voie de consommation est `markFriendRequestNotificationsAsRead`, appelée par la route
  soeur `PATCH …/:id` quand on **répond**. Or on ne répond plus à une demande qui n'existe plus : la
  route 404 sur `findFirst`. La voie de sortie se ferme à l'instant même où la ligne part.

Résultat : notification **non lue indéfiniment**, comptée dans la cloche et dans le badge, avec un
`metadata.action: accept_or_reject_contact` qui n'ouvre plus qu'un écran répondant 404. Les deux
sous-cas de la route la produisent, parce que la suppression est inconditionnelle : l'expéditeur qui
annule, et le destinataire qui écarte sans répondre.

## D2 (pourquoi ça a survécu) — la route voisine fait le geste correct, sous un autre nom

Le `PATCH` marque comme lues (cycle antérieur, `markFriendRequestNotificationsAsRead`). À la
relecture d'un seul fichier, la famille « demande d'amitié » a donc l'air pourvue : le mot
`notification` apparaît, scopé sur `context.friendRequestId`, avec sa garde anti-IDOR et son
`notification:counts`. Ce qui manque n'est pas un contrôle absent partout — c'est **le même contrôle
sous un verbe différent**, et le verbe différent est précisément ce qui le rend invisible.

C'est la configuration du cycle 14 (un écrivain sur quatre hors du rang), avec une variante : les
deux routes ne DOIVENT pas faire le même geste, donc leur asymétrie n'est pas en soi un signal.

## D3 (arbitrage) — retrait, pas marquage

Ce qui tranche est ce qui reste au bout du lien, pas qui a cliqué.

| Route | La ligne `FriendRequest` | La notification est… | Geste |
|---|---|---|---|
| `PATCH` accept/reject | reste, statut changé | **consommée** | marquer lue |
| `DELETE` (les deux sous-cas) | **partie** | **morte** — rien à afficher, rien où mener | retirer |

Même arbitrage, pour la même raison, que le rappel d'un message (`retractMessageNotifications`,
cycle 47), et même geste — le seul que les clients savent déjà recevoir (`notification:deleted`,
écouté par le web et par le SDK iOS), doublé d'un `notification:counts` sans lequel la cloche
resterait sur un compteur incluant des lignes que le serveur vient de supprimer.

## D4 (trois corollaires du caractère inconditionnel de la suppression)

1. **Aucun filtre `isRead`** — seule différence de prédicat avec le marquage. Une notification déjà
   lue est tout aussi morte qu'une non lue ; la laisser garderait dans la liste une ligne sans
   destination.
2. **Le destinataire est toujours `receiverId`**, quel que soit celui des deux qui a appelé :
   `createFriendRequestNotification` ne notifie que lui. Le scope `userId` reste la garde anti-IDOR
   que porte déjà le marquage — le retrait ne l'élargit pas.
3. **`context.friendRequestId` n'appartient qu'à `friend_request`.** Vérifié plutôt que supposé : le
   `friend_accepted` de l'expéditeur porte `context.conversationId`, jamais cette clé. Le retrait ne
   peut donc pas l'emporter au passage — y compris sur une demande ACCEPTÉE puis supprimée, la route
   ne filtrant pas sur `status`.

## D5 (forme de la requête) — supprimer les ids RELUS, pas le prédicat

La lecture passe par `$runCommandRaw` pour la raison déjà établie par le marquage (Prisma ne filtre
pas les chemins JSON sur MongoDB). Mais la suppression porte sur les ids **relus**, pas sur le
prédicat : l'ensemble supprimé et l'ensemble annoncé sont alors identiques par construction, et
aucune ligne ne peut disparaître sans son `notification:deleted`. C'est l'inverse du choix fait par
`retractMessageNotifications`, et délibérément : là-bas, filtrer sur le prédicat FERMAIT une course
avec l'éventail de notification du même message (cycle 48) ; ici il n'y a pas d'éventail — une
demande produit UNE notification, à sa création, longtemps avant. `singleBatch` ferme le curseur
côté serveur au lieu de le laisser ouvert.

## Plan
- [x] T1 — RED (service) : lecture par chemin JSON **sans** filtre `isRead`
- [x] T2 — RED (service) : suppression des ids relus + `notification:deleted` par ligne + un
      `notification:counts`
- [x] T3 — RED (service) : l'annonce vient APRÈS l'écriture durable
- [x] T4 — verrous (service) : aucune ligne → aucune suppression, aucune annonce ; userId
      non-ObjectId (session anonyme) → 0 sans requête ; Mongo en échec → 0 sans exception
- [x] T5 — RED (route) : les DEUX sous-cas retirent la notification du **receveur**
- [x] T6 — RED (route) : un retrait en échec ne fait pas échouer la route et n'emporte pas
      `friend_request:cancelled`
- [x] T7 — GREEN : `NotificationService.retractFriendRequestNotifications` + appel dans la route
- [x] T8 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T9 — changeset + CHANGELOG + ce relevé

## Vérification

Rouges observés sur les deux surfaces avant le correctif : la suite service ne COMPILAIT pas
(`retractFriendRequestNotifications` inexistante — TS2551 pointant sur
`createFriendRequestNotification`), les deux tests de route tombaient sur `Number of calls: 0`.
Après : 69/69 sur les deux fichiers, `tsc --noEmit` propre.

Suite gateway complète sous bun (parité CI) : **635 suites, 16 180 tests, tout vert** (479 s).
Couverture globale lignes **95,76 %** (95,65 % au cycle 26 relevé) — en hausse.

## Reste ouvert après ce cycle

- **`applyPostRemovalEffects` ne retire pas les notifications du post supprimé — même défaut, blast
  radius bien plus large. TÊTE DU PROCHAIN CYCLE.** Le cycle 47 nomme lui-même `applyPostRemovalEffects`
  comme « le jumeau côté post » de `applyMessageRemovalEffects` ; le jumeau a reçu l'audit, les liens
  de partage et les usages de sons, jamais les notifications. Or la suppression d'un post est un
  retrait DOUX (`deletedAt`), donc, comme pour le message, aucune cascade ne se déclenche : toutes
  les notifications portant `context.postId` (`post_like`, `post_comment`, `comment_reply`,
  `story_new_comment`, `friend_new_story`, `friend_new_post`, …) survivent avec l'extrait
  dénormalisé du contenu retiré. Le diagnostic du 2026-08-04 en compte **≈ 8 100 non lues** en
  production, contre une dizaine pour la famille demande d'amitié fermée ici. Deux différences de
  forme à traiter, aucune bloquante : le filtre n'est PAS scopé à un `userId` (un post notifie N
  destinataires, donc la relecture doit projeter `userId` et l'annonce se grouper par destinataire —
  `announceNotificationsRetracted` le fait déjà), et l'annonceur doit descendre jusqu'à
  `applyPostRemovalEffects`, qui ne reçoit aujourd'hui ni `NotificationService` ni port étroit (le
  patron existe : `PostSoundReleaser` dans le même fichier, `RetractedNotificationAnnouncer` côté
  message) — `PostService` n'a pas de `notificationService` dans son constructeur, mais les deux
  routes appelantes (`routes/posts/core.ts`, `routes/admin/posts.ts`) ont `fastify.notificationService`.
  L'écriture durable ne doit pas dépendre du câblage socket : port **optionnel**, comme
  `retractMessageNotifications(prisma, id, announcer?)`.
- **Aucune notification déjà écrite n'est rattrapée.** Le correctif ne vaut que pour les suppressions
  à venir ; les lignes orphelines des demandes déjà supprimées restent en base. Réparable par le
  patron des scripts existants (`repair-mention-user-ids.ts`) — action humaine, cette routine n'a
  aucun accès MongoDB.
- **Le push APNs/FCM déjà délivré n'est pas rappelé.** Retirer la ligne éteint la liste in-app et la
  cloche, pas la bannière déjà posée sur l'écran verrouillé. Fermer ça demanderait un push silencieux
  de collapse — chantier de contrat, pas correctif.
- **`login_new_device` reste sans contexte de consommation** (159 non lues en prod au 2026-08-04) :
  aucune des trois clés supportées par `markContextNotificationsAsRead` ne s'y applique, et sa seule
  sortie est le read-by-types. Relevé, pas un défaut de correction évidente.
- Hérités et inchangés : l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ;
  `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js` depuis ESLint v9) ;
  `getMentionsForMessage`/`getRecentMentionsForUser` n'ont aucun consommateur d'écran.

---

# Cycle 49b — Le champ existait, le prédicat existait, personne ne les avait présentés

> **Session parallèle.** Deux sessions ont livré un cycle 49 en même temps, sur des sujets sans
> recouvrement : le 49 ci-dessous ferme la quatrième porte d'entrée d'une conversation (`unban`),
> celui-ci la péremption des notifications. Aucun fichier commun hors ce relevé. Le 49 note en
> backlog que « la péremption (`expiresAt`) sans équivalent au rappel » reste ouverte — c'est exact
> à l'instant où il a été écrit, et c'est précisément ce que ce lot ferme.

Le cycle 48 a laissé la péremption en tête de son backlog, correctement décrite :

> `createMessageNotification` refuse un message déjà expiré, mais un message qui expire APRÈS la
> création de sa notification laisse la ligne — et son extrait — en base. Contrairement au rappel, la
> péremption n'est pas un événement : personne ne passe à l'instant T. Il faudrait un balayage, ou une
> lecture qui filtre.

Une seule chose y était fausse, et elle change le diagnostic : **l'extrait ne reste pas**, parce qu'il
n'a jamais été écrit. `protectedPreview` remplace le contenu d'un message éphémère par un libellé
générique AVANT la création. Ce qui survit n'est donc pas une fuite de contenu — c'est une ligne qui
ne montre rien, ne mène nulle part (`action: view_message` ouvre un message absent), et porte un badge
non lu que plus aucune lecture ne peut décrémenter : on ne lit pas ce qui n'est plus là.

## Ce que l'enquête a trouvé

`Notification.expiresAt` existe depuis l'origine du modèle. `formatNotification` le publie,
`notificationStateSchema` le laisse traverser Fastify, `packages/shared/types/notification.ts` en
dérive `isNotificationExpired`, et `isNotificationUnread` s'en sert pour définir « non lue ET valide ».
Toute la moitié LECTURE de la règle était déjà écrite, jusqu'aux clients.

Et aucun producteur n'écrivait la colonne. `createNotification` accepte un `expiresAt` que personne ne
lui passait ; les sept lectures serveur l'ignoraient. Deux moitiés d'une même règle, mortes chacune de
son côté, séparées par une ligne de plomberie. Il n'y avait pas de mécanisme à inventer — seulement à
brancher.

## Les trois choix

**L'échéance vient du message, jamais de l'appelant.** Le chemin `new_message` la prend de sa
relecture VIVANTE — celle que la garde d'admission fait déjà, donc zéro lecture ajoutée. La réponse et
les mentions la reçoivent de l'éventail, qui la tient déjà dans `FanOutMessage`, plutôt que de la
relire une fois par destinataire : le coût que les cycles 44 et 47 ont refusé deux fois. Les deux
sources ne peuvent pas diverger — `Message.expiresAt` est écrit à l'insertion et jamais modifié
ensuite (vérifié : aucun `message.update` ne le touche).

**Un filtre à la lecture, pas un balayage.** La péremption n'est pas un événement ; un balayage
périodique laisserait toujours une fenêtre entre l'expiration et son passage. Le filtre est exact à la
milliseconde et ne coûte aucune écriture. Contrepartie assumée, et c'est l'inverse du cycle 48 : là où
le rappel devait SUPPRIMER (la ligne détenait une copie du contenu), ici masquer suffit — la ligne ne
détient rien.

**Sept lectures, un seul prédicat.** `emitCountsUpdate` porte déjà en commentaire la trace d'une
divergence passée entre le prédicat du badge et celui de la liste (`readAt: null` contre
`isRead: false`). Sept copies de la nouvelle condition l'auraient rejouée : liste REST, son total,
compte non-lus REST, les deux compteurs socket, le badge embarqué dans le push, le digest e-mail. Une
unité, `visibleNotificationsWhere`.

## Plan

- [x] T1 — unité partagée `visibleNotificationsWhere`, appelée par les sept lectures
- [x] T2 — RED : le compte non-lus laisse tomber la ligne dont le message a expiré
- [x] T3 — témoins : une ligne sans échéance, et une échéance à VENIR, restent comptées
- [x] T4 — RED : la liste ET son total excluent la ligne expirée (pagination fantôme sinon)
- [x] T5 — RED : les compteurs poussés par socket disent la même chose que la liste
- [x] T6 — RED : la route `/notifications` masque la ligne expirée, liste et total
- [x] T7 — RED : le digest ne relance personne pour une ligne expirée
- [x] T8 — RED : `new_message`, réponse et mention héritent de l'échéance du message
- [x] T9 — index `[userId, isRead, expiresAt]` + migration 010 (idempotente, crée avant de supprimer)
- [x] T10 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T11 — changeset + ce relevé

## Revue

Sonde en trois temps, parce que le lot a deux moitiés indépendantes et qu'une seule sonde n'aurait
prouvé qu'une moitié :

1. filtre de lecture neutralisé → **5 rouges**, et ce sont les cinq lectures (compte non-lus, liste +
   total, compteurs socket, route REST, digest) ;
2. estampille producteur neutralisée → **2 rouges** (message éphémère, mention) ;
3. plomberie de l'éventail neutralisée → **2 rouges** (réponse + mention, et le témoin `null`).

Les trois témoins de lecture — ligne sans échéance, échéance à venir, message ordinaire — sont verts
avant comme après. Celui de l'échéance à venir n'est pas décoratif : il est le seul à distinguer un
`gt` d'un `lt`, une inversion qui masquerait exactement les notifications qu'il faut montrer.

Le double Prisma des tests n'enregistre pas les `where` : il les **évalue** contre des lignes
(`__tests__/helpers/notification-where.ts`, partagé par les trois fichiers). Un test qui compare la
clause reçue à celle qu'il attend ne vérifie que sa propre copie — il passe aussi bien sur une clause
juste que sur une clause fausse écrite deux fois. Le double jette sur toute clé qu'il ne sait pas
interpréter, pour qu'un filtre d'une autre forme échoue au lieu d'être ignoré en silence.

L'index n'est pas un ajout mais un REMPLACEMENT : `[userId, isRead]` est un préfixe de
`[userId, isRead, expiresAt]`, donc rien ne perd son plan et le coût d'écriture ne monte pas d'un
index. Sans lui, le `$or` serait un filtre résiduel — un fetch de document par candidat sur un
compteur qui tourne une fois par destinataire de CHAQUE message.

## Reste ouvert après ce cycle

- **Les clients ne s'auto-périment pas.** Une liste laissée ouverte à l'instant de l'expiration garde
  la ligne jusqu'au prochain rafraîchissement : le serveur ne la sert plus, mais rien ne l'annonce.
  `isNotificationExpired` existe côté partagé et n'est appelé nulle part ; le web l'importe sans
  l'utiliser. Fermable côté client sans rien changer au serveur.
- **Le parseur socket du web lit à la RACINE ce que le serveur envoie sous `state`.**
  `notification-socketio.singleton.ts` lit `data.expiresAt` / `data.isRead` / `data.createdAt` (avec
  un commentaire affirmant que le backend les met à la racine) alors que `formatNotification` les met
  dans `state`. Conséquence aujourd'hui bénigne — `isRead` retombe sur `false` et `createdAt` sur
  `new Date()`, ce qu'une notification neuve est de toute façon — mais `expiresAt` n'atteint jamais le
  client par ce chemin. Défaut réel, non instruit ici.
- **Une réaction sur un message éphémère n'hérite d'aucune échéance.**
  `createReactionNotification` lit déjà le message (`select: { content: true }`) : y ajouter
  `expiresAt` serait gratuit. Écarté de ce cycle pour ne pas mélanger deux familles de producteurs ;
  le geste est identique.
- **L'édition d'un message éphémère produit une mention sans échéance.**
  `messageMentions.notifyNewlyMentioned` est le second appelant de
  `createMentionNotificationsBatch` et son `MentionTargetMessage` ne porte pas `expiresAt` — il
  faudrait le remonter jusqu'à ses propres appelants. Le nouveau paramètre est optionnel : ce chemin
  garde exactement son comportement d'avant.
- **`getUserNotifications` n'a aucun appelant en production.** La route `/notifications` refait la
  requête à la main plutôt que d'appeler le service ; seuls des tests atteignent la méthode. Les deux
  ont été traitées ici (elles répondent à la même question), mais la duplication elle-même reste, et
  c'est elle qui rendait la divergence possible.
- **Les points hérités restent ouverts tels quels** : le push DÉJÀ remis reste sur l'appareil au
  rappel (aucun `apns-collapse-id` ni retrait à distance) ; les mentions du chemin de lien attendent
  l'extraction qui écrit `Message.validatedMentions` ; aucun client iOS n'écoute `link:message:new` ;
  les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio ; l'arbitrage
  `delete-for-me` du cycle 12 attend une validation humaine.

---

# Cycle 49 — Débannir n'est pas une porte d'entrée, mais ça en était devenu une

Tête prise là où le cycle 40 avait laissé sa propre règle. Ce cycle-là avait unifié « que faire de
la ligne `Participant` déjà là quand quelqu'un (re)entre » dans `resolveConversationEntry`, et il
avait énuméré les portes : le lien de partage, l'ajout de participant, l'invitation. Trois. Il en
existait une quatrième, que personne n'avait comptée parce qu'elle ne s'appelle pas « entrer » :
`PATCH …/participants/:userId/unban`.

## Ce que les deux moitiés du geste écrivaient

```ts
ban:   data: { bannedAt: now,  isActive: false, leftAt: now  }
unban: data: { bannedAt: null, isActive: true,  leftAt: null }
```

Sans condition, l'une comme l'autre. Sur le cas qu'on imagine en les lisant — bannir un membre
actif, puis le débannir — elles sont exactes et inverses l'une de l'autre.

Mais `ban` cherche sa cible **sans filtrer `isActive`**, et c'est délibéré : bannir un ancien membre
est précisément ce qui l'empêche de revenir par un lien de partage, `resolveConversationEntry`
refusant toute entrée sur `bannedAt`. Cette capacité est réelle, elle est même la raison d'être du
`bannedAt` dans la décision du cycle 40, et ce cycle ne la retire pas.

Le cas existe donc, et sur lui les deux écritures font autre chose que ce que leurs noms annoncent.

### Lot A — bannir effaçait le départ

`leftAt` était réécrit à l'instant du bannissement alors qu'il datait un départ volontaire vieux de
plusieurs mois. L'information n'était pas remplacée par une meilleure : elle était perdue. Et c'est
elle, précisément, qui aurait permis à l'autre moitié de savoir quoi rendre — le défaut du Lot B
n'était pas réparable après coup parce que le Lot A avait détruit sa preuve.

### Lot B — débannir faisait entrer

`{ isActive: true, leftAt: null }` sur une personne que le bannissement n'avait pas sortie — parce
qu'elle était déjà dehors — n'annule rien : **ça crée une appartenance.** Suivent, dans la même
requête, les trois choses qu'une porte d'entrée fait et qu'un débannissement ne devrait pas faire :

1. **Le rang périmé revient.** Aucune des trois portes reconnues ne rend son rang à un revenant —
   « un rang se donne, il ne se retrouve pas dans une ligne périmée » (leçon 89, inscrite dans
   l'en-tête de `conversationEntryAdmission.ts`). Celle-ci le rendait, `role` n'étant jamais réécrit.
2. **Les sockets sont rebranchées de force.** `joinUserToConversationRoom` sur quelqu'un qui était
   parti de lui-même : il reçoit à nouveau les messages d'une conversation qu'il avait quittée.
3. **La conversation réapparaît chez lui**, sans qu'il ait rien demandé et sans qu'aucun chemin
   d'invitation ait été emprunté.

Le correctif ne change pas ce que le geste veut dire, il le rend exact : **un débannissement rend ce
que le bannissement a pris, ni plus ni moins.** Le bannissement, lui, est levé dans TOUS les cas —
sinon « débannir » ne lèverait rien et toutes les portes continueraient de refuser. Une personne
partie d'elle-même puis bannie puis débannie redevient donc libre de revenir par une porte, ce qui
est exactement l'état que `resolveConversationEntry` sait lire (`rejoin`).

### La trace, sans champ nouveau

Savoir laquelle des deux histoires s'est produite ne demande aucune colonne de plus. Une fois que
bannir cesse d'écraser `leftAt`, le bannissement laisse lui-même sa réponse dans la ligne :

| ce qui s'est passé              | `leftAt`            | `bannedAt` |
|---------------------------------|---------------------|------------|
| banni alors qu'il était membre  | instant du ban      | le même    |
| banni alors qu'il était parti   | son départ, intact  | plus tard  |

L'égalité est **exacte par construction** — les deux champs reçoivent le même objet `Date`, jamais
deux lectures d'horloge — et non une comparaison à la milliseconde près qu'une coïncidence pourrait
tromper. Les lignes écrites avant ce cycle portent toutes cette égalité, puisque l'ancien
bannissement écrivait les deux ensemble : elles conservent donc à l'identique le comportement
qu'elles ont toujours eu. **Aucune réparation de base n'est nécessaire** — c'est la première fois
depuis le cycle 27 qu'un correctif de cette famille ne laisse pas un script derrière lui, et c'est
le choix de la trace qui l'achète.

La décision vit dans une unité pure, `services/conversations/conversationBanState.ts`, à côté de
celle du cycle 40 dont elle est le complément : `conversationEntryAdmission` dit qui peut entrer,
`conversationBanState` dit ce qu'un bannissement prend et ce qu'un débannissement rend.

## Lot C — le débannissement n'oubliait pas la ligne mise en cache

`participant-lookup-cache` mémorise `isActive` pendant 30 s pour éviter une lecture par message
envoyé. Son en-tête énumère les sites qui l'invalident : « leave/ban/kick/delete-for-me ». Le
débannissement n'y est pas, et ne l'appelait pas.

Conséquence, sur le cas nominal cette fois — bannir un membre actif puis le débannir : pendant une
demi-minute, la personne réintégrée restait `isActive: false` pour le chemin d'envoi, et chacun de
ses messages était refusé sans qu'aucune ligne en base ne le justifie. Le même motif que les Lots A
et B, à un étage différent : une moitié du geste tient une obligation que l'autre moitié ignore.

## Lot D — les compteurs de membres suivaient l'ÉVÉNEMENT, pas le fait

`conversation:participant-banned` et `conversation:participant-unbanned` ne disaient rien de leur
effet sur l'effectif ; les clients le déduisaient de la réception.

- **Web** (`use-socket-cache-sync`) : `memberCount - 1` / `+ 1` sans condition.
- **iOS** (`ConversationListViewModel`) : idem, **puis `schedulePersist()`** — la valeur fausse est
  écrite dans le cache local, donc la dérive survit au redémarrage.
- **Android** : expose bien les deux événements mais n'en dérive aucun effectif. Rien à corriger —
  vérifié, pas déduit (leçon 88).

Les deux événements portent maintenant `membershipEnded` / `membershipRestored`. Optionnels, et leur
absence se lit comme `true` : un serveur antérieur à ce contrat ne bannissait qu'en retirant, et lire
son silence comme « aucun effet » aurait fait ignorer tous ses bannissements. Côté iOS la lecture est
nommée (`didEndMembership`, `didRestoreMembership`) plutôt que laissée à un `== true` que le prochain
appelant écrirait de travers.

## Preuve

**24 tests neufs, RED observé avant chaque correctif.**

- `services/conversations/conversationBanState.test.ts` — 11 cas sur l'unité pure, dont les deux
  compositions ban∘unban qui énoncent l'involution recherchée.
- `routes/conversations/ban-departed-member.test.ts` — 8 régressions au niveau route. Le double
  Prisma **discrimine sur le `where` ET projette sur le `select`** : un champ reste indisponible à
  la route tant qu'elle ne l'a pas demandé, exactement comme Prisma. Sans cette projection,
  « la route lit `leftAt` » serait vrai dans le test et faux en production — c'est la précaution que
  le cycle 39 avait dû inventer pour le Lot B, réutilisée ici pour la même raison.
- `use-socket-cache-sync.test.tsx` — 2 cas sur la dérive du compteur web.
- `MessageSocketMiscEventTests.swift` — 4 cas de décodage SDK, dont les deux qui fixent la lecture
  de l'absence (`nil ⇒ true`).

Suites vertes : gateway complet, `tsc --noEmit` propre ; web `use-socket-cache-sync` (57/57), et
aucune erreur `tsc` nouvelle sur `apps/web` (1184 avant, 1184 après — condition préexistante).

## L'audit qui a mené ici, et ce qu'il a ÉCARTÉ

La question du cycle 37 — « quelles appartenances sont jointes sans `isActive` ? » — a été balayée
mécaniquement cette fois plutôt que site par site : **784** lectures `prisma.participant.find*` dans
le gateway, dont **12** de forme appartenance (`where` portant à la fois `userId` et
`conversationId`, sans `isActive`). Les douze ont été classées, et **onze sont légitimes** :

- **Faux positifs de la recherche** (2) — `MeeshySocketIOManager` cherche par `id` (clé primaire),
  `conversationId` n'apparaît que dans le `select`.
- **Résolutions, pas des admissions** (2) — `CallService` résout le `Participant.id` de l'initiateur
  d'un appel ; filtrer sur `isActive` ferait échouer la résolution au lieu de refuser un accès.
- **Historique, où le filtre serait le défaut** (1) — `CallService.listHistory` charge le pair d'une
  conversation directe pour nommer un appel passé. Un pair qui a quitté depuis doit rester nommé :
  ajouter `isActive` effacerait le nom sur les entrées d'historique les plus anciennes.
- **Réamorçage de la conversation globale** (4, `InitService`/`AuthService`) — la recherche sert à ne
  PAS re-ajouter quelqu'un ; trouver la ligne inactive d'un partant volontaire et s'abstenir est
  exactement le comportement voulu.
- **Classements d'administration** (1) — `admin/system-rankings` énumère les admins de conversation ;
  écart de qualité de donnée, sans conséquence d'accès, laissé tel quel.
- **`ban` lui-même** (1) — délibérément sans filtre, cf. plus haut ; c'est le fil qui a mené à ce
  cycle.

Ce que le balayage a rendu n'est donc pas un douzième défaut de la même forme : c'est le constat que
**la famille est propre**, et que le défaut restant était de l'autre côté du geste — non pas « qui
peut entrer » mais « ce que le geste inverse rend ». La question du cycle 37 peut être considérée
comme épuisée sur le gateway.

## Reste ouvert après ce cycle

- **Qui a le droit de débannir ? Pas le même que celui qui a le droit de bannir.** `ban` exige
  seulement un rang STRICTEMENT supérieur à celui de la cible — un `moderator` peut donc bannir un
  `member` — mais `unban` exige le rang `admin`. Un modérateur peut bannir sans pouvoir défaire son
  propre geste. C'est cohérent à l'intérieur de chaque moitié, donc ce n'est pas un défaut au sens
  de ce cycle, mais c'est une asymétrie de la même famille que celles des cycles 34 et 38b
  (édition/suppression, appartenance active de l'auteur) — **les trois attendent le même arbitrage
  produit et devraient être tranchées ensemble**, pas une par une.
- **Rien ne borne la durée d'un bannissement.** `bannedAt` est un instant, jamais une échéance : un
  bannissement est définitif jusqu'à ce qu'un admin passe. WhatsApp et Telegram offrent tous deux un
  bannissement temporaire. Capacité absente, pas défaut — à instruire comme produit.
- **`resolveBanWrite` ne dit pas ce qu'un ancien membre banni voit de la conversation.** Il ne
  change rien à l'état visible : la ligne était déjà inactive, `GET …/messages` la refusait déjà.
  Vérifié, mais non couvert par un test de bout en bout faute d'accès base.
- **Les points hérités du cycle 48 restent ouverts tels quels** : la péremption (`expiresAt`) sans
  équivalent au rappel ; le push déjà remis qui reste sur l'appareil ; les mentions du chemin de lien
  sans extraction ; aucun client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de
  lien hors pipeline audio ; l'arbitrage `delete-for-me` du cycle 12.
- **`eslint` ne peut toujours pas tourner sur le gateway** : aucun `eslint.config.js` depuis la
  migration ESLint v9. Condition préexistante, non couverte par la CI.

---

# Cycle 48 — La course que le cycle 47 a nommée sans la fermer

Le cycle 47 a fait retirer, au rappel d'un message, les notifications qu'il avait produites, et il a
laissé la course ouverte — écrite dans le code même, en commentaire du `deleteMany` :

> une notification créée entre la lecture et l'écriture (l'éventail court après le retrait) part
> avec les autres. Elle n'est alors pas annoncée — un écran en retard, **à corriger par une garde
> d'admission côté éventail**.

La première moitié est juste. La seconde nomme le mauvais remède, et c'est le point de ce cycle.

## Pourquoi une garde d'ADMISSION ne pouvait pas fermer cette fenêtre

Le `deleteMany` du rappel filtre sur `messageId` : il emporte donc tout ce qui existe À SON INSTANT,
et rien de ce qui naît après lui. La ligne qui fuit n'est pas celle créée « entre la lecture et
l'écriture » — celle-là part bien avec les autres — c'est celle créée APRÈS le balayage.

Une relecture en TÊTE d'éventail rétrécit la fenêtre sans jamais la fermer : `deletedAt` peut être
committé entre la relecture et la création. C'est exactement le trou que porte DÉJÀ la garde de
`createMessageNotification`, présente depuis longtemps et documentée comme telle. L'étendre aux deux
autres créateurs aurait donc payé une lecture par ENVOI de message — le coût que le cycle 47 avait
lui-même chiffré pour reculer — sans clore quoi que ce soit.

## Le geste qui ferme

Une relecture de `deletedAt` à l'AUTRE bout, après l'éventail.

Soit D l'instant du commit de `deletedAt`, X celui du `deleteMany` du rappel (X > D par
construction : les effets de retrait tournent après le commit), [c1..cn] les créations de l'éventail
et R sa relecture finale (R > cn) :

- **X > cn** — le `deleteMany` du rappel voit toutes nos lignes. Rien ne survit.
- **X < cn** — alors D < X < cn < R, donc R lit `deletedAt` non nul et l'éventail retire lui-même.

Aucun troisième cas. La fenêtre est fermée, pas rétrécie.

Le placement est aussi ce qui la rend gratuite. Après `onFanOut`, les notifications sont déjà
parties : la lecture n'entre pas dans le chemin de latence du push, là où la garde d'admission
l'aurait allongé pour TOUS les envois. C'est l'inverse exact du compromis que le cycle 47 avait
refusé.

## Trois choix, aucun cosmétique

**La garde porte sur l'audience VISÉE, pas sur le compte rendu.** `onFanOut` dit ce qui est
réellement parti ; un créateur qui écrit sa ligne puis jette la laisserait derrière lui avec un
compteur à zéro, donc sans relecture. `owesReplyNotification || mentions.length || candidats.length`
ne peut pas rater ce cas, et laisse toujours l'éventail sans destinataire ne rien payer.

**`deletedAt` non nul est la SEULE preuve d'un rappel.** Un message introuvable à la relecture ne
fait rien retirer : aucun chemin du gateway ne supprime un message physiquement (vérifié — pas un
seul `message.delete`/`deleteMany`), et retirer sur une non-preuve viderait des inboxes. Le sens sûr
de l'erreur est ici de GARDER, à l'inverse du rappel lui-même.

**Le retrait devient une unité partagée.** `retractMessageNotifications` sort de `private` :
fermer une course demande le même geste aux deux bouts — au rappel pour les lignes déjà écrites, en
fin d'éventail pour celles que le rappel n'a pas pu voir. Deux copies auraient divergé comme les
listes d'effets de suppression avaient divergé avant `applyMessageRemovalEffects`.

## Plan

- [x] T1 — unité partagée `retractMessageNotifications`, appelée par les deux bouts
- [x] T2 — RED : un rappel qui court après l'éventail voit ses lignes retirées
- [x] T3 — témoin : un message vivant garde ses notifications
- [x] T4 — RED : les lignes emportées sont annoncées à leurs destinataires
- [x] T5 — témoin : un éventail sans destinataire ne relit pas le message
- [x] T6 — témoin : un message introuvable ne fait rien retirer
- [x] T7 — RED : une relecture qui jette n'emporte ni l'éventail ni son compte rendu
- [x] T8 — gates : 633/633 suites, 16143 tests, `tsc --noEmit` propre
- [x] T9 — changeset + CHANGELOG + ce relevé

## Revue

Sonde : `if (attemptedFanOut)` neutralisé en `if (false && attemptedFanOut)` — **3 rouges** sur 6
tests neufs, et ce sont les bons trois (T2, T4, T7). Les trois autres sont des témoins verts avant
comme après, par construction : ils disent ce que le correctif ne doit PAS faire.

Le mock `message.findUnique` du fichier de test a dû apprendre à aiguiller sur `where.id`. Deux
questions distinctes passent désormais par ce délégué et elles ne portent pas sur le même message —
l'auteur du message CITÉ avant l'éventail, l'état vivant du message ENVOYÉ après. Un double qui
rendrait la même ligne aux deux ne pourrait pas distinguer un défaut de l'un du défaut de l'autre.

Première version de la garde : `reply || mentions > 0 || regular > 0`. Elle a fait tomber T2 et T4,
et c'est le test qui a corrigé le code, pas l'inverse — les doubles rendent `null`/`0`, donc « rien
créé », donc pas de relecture. En cherchant pourquoi, le vrai défaut apparaît : ce compteur ne dit
pas ce qui a été ÉCRIT, il dit ce qui a été écrit ET rendu. Un créateur qui commit puis jette
échappe aux deux. D'où le passage à l'audience visée.

Couverture des trois fichiers touchés : 100 % des lignes, `retractMessageNotifications.ts` à 100 %
sur les quatre métriques.

## Reste ouvert après ce cycle

- **La péremption (`expiresAt`) n'a pas d'équivalent.** `createMessageNotification` refuse un
  message déjà expiré, mais un message qui expire APRÈS la création de sa notification laisse la
  ligne — et son extrait — en base. Contrairement au rappel, la péremption n'est pas un événement :
  personne ne passe à l'instant T. Il faudrait un balayage, ou une lecture qui filtre sur
  `Message.expiresAt` à l'affichage de l'inbox. Chantier distinct, à instruire séparément.
- **Le push DÉJÀ remis reste sur l'appareil** (hérité du cycle 47). Aucun `apns-collapse-id` ni
  retrait à distance n'est envoyé au rappel. Ce cycle rend d'autant plus probable qu'un push parte
  puis soit retiré en base : la relecture d'après-éventail retire la LIGNE, pas la bannière déjà
  affichée. Fermable côté APNs par un push `mutable-content` de retrait.
- **Les points hérités restent ouverts tels quels** : les mentions du chemin de lien attendent
  l'extraction qui écrit `Message.validatedMentions` ; aucun client iOS n'écoute `link:message:new` ;
  les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio ; l'arbitrage
  `delete-for-me` du cycle 12 attend une validation humaine.
- **Fermé ce cycle — l'audit des émetteurs par room personnelle contre la clé `userId ?? id`.**
  Le backlog le portait depuis le cycle 25b, en soupçon (« rien ne garantit que les autres la
  respectent »). Instruit par recherche et non par déduction, comme il le demandait : 53 sites
  `ROOMS.user(` sur 19 fichiers. Le résultat est propre. `emitConversationPreviewUpdate`, celui que
  le backlog nommait, charge `id` ET `userId` et émet par `participantUserRooms()` — le helper
  canonique — avec la règle inscrite en commentaire au-dessus du `select`. Les sites qui passent un
  identifiant nu le tiennent d'un `User.id` (destinataire de notification, créateur de conversation,
  liste de participants inscrits), jamais d'un `Participant`. Une seule exception délibérée, et déjà
  documentée en tant que telle : `callEndedFanout` filtre `userId: { not: null }` parce que
  l'audience de terminaison doit refléter l'audience d'INVITATION — `call:initiated` porte le même
  filtre, un participant sans compte n'est jamais sonné, et s'il rejoint l'appel il est de toute
  façon dans `ROOMS.call(callId)`. Le point sort du backlog.
- **Fermé depuis le cycle 47, vérifié ce cycle** : « iOS n'écoute pas `notification:deleted` » n'est
  plus vrai. `MessageSocketManager` l'écoute et le publie sur `notificationDeleted`, que
  `NotificationToastManager` consomme. Le point sort du backlog.

---

# Cycle 47 — L'inbox de notifications gardait une COPIE du message rappelé

Le cycle 46 a sorti le message rappelé de l'inbox de mentions et a laissé, écrite noir sur blanc,
la piste suivante : « la notification de mention survit au rappel — la ligne `Notification` et le
push déjà remis portent le contenu du message ». Elle était juste, et elle sous-estimait la portée :
ce ne sont pas les mentions, ce sont les **cinq** types de notification ancrés sur un message.

## Pourquoi le correctif du cycle 46 ne pouvait pas couvrir celui-ci

Les deux défauts se ressemblent — un message rappelé reste lisible ailleurs — et ils demandent des
correctifs de nature OPPOSÉE. C'est le point à retenir de ce cycle.

Une ligne `Mention` ne porte qu'une clé étrangère. Le contenu qu'elle affiche, la route va le
chercher dans `Message.content` à chaque appel : ajouter `deletedAt: null` à l'admission suffit, et
c'est réversible — restaurer le message rendrait sa mention.

Une ligne `Notification` porte une **copie**. `createNotification` écrit `content` et
`metadata.messagePreview` au moment de la création, à partir de l'extrait qu'on lui passe, et ne
relit jamais le message ensuite. Il n'existe aucun filtre à la lecture qui puisse rattraper ça :
la donnée est là, dénormalisée, servie telle quelle par `GET /notifications` et par
`NotificationFormatter`. Le seul geste qui la retire est de retirer la ligne.

## Ce que le rappel laissait derrière lui

Rien ne supprime la ligne. Le `onDelete: Cascade` déclaré sur `Notification.message` demande une
suppression **physique** ; le retrait doux ne bascule que `deletedAt`, donc la ligne `Message` reste
et la `Notification` avec elle. **Troisième occurrence du même mécanisme** après les `TrackingLink`
(cycle 43) et les `Mention` (cycle 46) — à ce stade, la question « qu'est-ce qu'une cascade ne fera
PAS ? » mérite d'être posée systématiquement devant tout modèle qui référence `Message`.

Concrètement : Bob écrit « désolé @alice, [quelque chose qu'il regrette] », puis supprime. La
conversation le perd chez tout le monde, en direct. Alice le garde dans sa liste de notifications —
extrait intégral, identité de l'auteur, titre de la conversation — à chaque ouverture, sans date de
fin. Et pas seulement Alice : la réponse (`message_reply`), la réaction (`message_reaction`), le
message régulier (`new_message`) et la traduction prête (`translation_ready`) écrivent tous
`context.messageId`, donc tous laissaient une ligne derrière eux.

Un détail qui n'en est pas un : `createMessageNotification` porte DÉJÀ, depuis longtemps, une garde
de course explicite — elle relit le message juste avant l'éventail et abandonne sur `deletedAt`,
avec ce commentaire : « we MUST NOT leak the original content via the banner ». La règle était donc
déjà énoncée dans ce fichier, pour la fenêtre de quelques centaines de millisecondes de l'éventail.
Personne ne l'avait étendue à la fenêtre qui compte vraiment — celle qui s'ouvre APRÈS et ne se
referme jamais.

## Le correctif

Un quatrième effet dans `applyMessageRemovalEffects`, l'unité que les trois écrivains interactifs de
`deletedAt` traversent. C'est la raison d'être du fichier : un effet ajouté là s'applique aux trois,
et il n'y a plus de « second écrivain » à tenir à jour de mémoire.

Trois choix, aucun cosmétique.

**Le filtre porte sur `messageId`, pas sur la conversation.** `createNotification` renseigne la
colonne depuis `context.messageId` pour les cinq types ancrés : une seule clé les couvre tous. Le
témoin dédié — les notifications d'un AUTRE message de la même conversation restent — est celui qui
tomberait si quelqu'un élargissait.

**Retrait, pas neutralisation du contenu.** Une notification dont le message n'existe plus n'a rien
à afficher ET rien où mener : son `action: view_message` ouvrirait une conversation sur un message
absent. C'est aussi le seul geste que les clients savent déjà recevoir — `notification:deleted` est
écouté par le web depuis le cycle qui l'a introduit.

**L'écriture durable ici, l'annonce déléguée.** Supprimer des lignes non lues change le badge : sans
annonce, la cloche resterait sur un compteur incluant des lignes que le serveur vient de supprimer,
jusqu'au prochain démarrage à froid — une incohérence que le correctif aurait CRÉÉE. Mais l'écriture
ne doit pas dépendre du câblage socket. D'où le port étroit `RetractedNotificationAnnouncer`, sur le
modèle du `PostSoundReleaser` du jumeau côté post, dont le défaut est le `NotificationService`
PARTAGÉ (le seul câblé avec `io`) : `notification:deleted` par ligne vers la room de SON
destinataire, puis **un seul** `notification:counts` par destinataire quel qu'ait été son nombre de
lignes. Sans annonceur — worker, script, test — les lignes partent quand même.

## Plan

- [x] T1 — RED : les notifications du message rappelé sortent de la base
- [x] T2 — témoin : celles d'un AUTRE message restent (vert avant ET après)
- [x] T3 — RED : chaque ligne retirée est annoncée à son destinataire
- [x] T4 — RED : le retrait a lieu même sans annonceur câblé
- [x] T5 — RED : une annonce qui jette n'emporte pas le retrait déjà committé
- [x] T6 — les quatre effets restent indépendants (l'échec de l'un n'emporte pas les autres)
- [x] T7 — GREEN : `retractMessageNotifications` + `announceNotificationsRetracted`
- [x] T8 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T9 — changeset + CHANGELOG + ce relevé

## Revue

Le double mérite d'être noté, pour la raison inverse de celui du cycle 46. Là-bas, il fallait qu'un
`where` absent laisse la ligne rappelée REVENIR. Ici, il faut qu'un `where` absent fasse disparaître
TROP : c'est la sémantique de Prisma (`deleteMany({})` supprime tout), et c'est la seule façon dont
le témoin T2 puisse échouer sur une garde manquante. Le double traite donc `undefined` comme
« aucune contrainte » aux deux bouts, `findMany` comme `deleteMany`. Les deux directions de l'erreur
sont couvertes par la même mécanique.

Quatre rouges observés sur le retrait (sonde : l'appel désactivé, 4 tests tombent, 3 restent verts
— exactement les trois qui doivent l'être des deux côtés). Un cinquième sur la déduplication des
compteurs (sonde : `Set` remplacé par la liste brute, le test « une seule fois par destinataire »
tombe).

Placement dans la liste des effets : le retrait passe en deuxième, juste après le décompte des
compteurs et avant les deux effets qui interrogent la conversation. C'est le seul des quatre dont le
retard se lit comme une fuite — le contenu rappelé reste affiché tant qu'il n'a pas eu lieu — et il
ne dépend d'aucun des trois autres.

## Reste ouvert après ce cycle

- **La fenêtre de course de l'éventail n'est pas fermée pour la réponse et les mentions.** Une
  notification créée APRÈS le passage du retrait survit — et n'est même pas annoncée, puisque le
  `deleteMany` la balaie sans que personne l'ait relue. `createMessageNotification` porte sa propre
  garde (relecture + abandon sur `deletedAt`) ; `createMentionNotification` et
  `createReplyNotification` n'en ont pas. Le bon endroit est `notifyMessageRecipients` — un seul
  point d'entrée, une seule relecture pour les trois créateurs et tous les destinataires, au lieu
  d'une par destinataire. Coût mesuré à l'avance : +1 lecture par ENVOI de message sur le chemin
  chaud, ce qui est la raison pour laquelle ce cycle ne l'a pas prise — à instruire contre les
  objectifs de débit avant de l'ajouter.
- **iOS n'écoute pas `notification:deleted`.** Le web le traite (`use-notifications-manager-rq`,
  `notification-socketio`) ; aucune occurrence dans `apps/ios` ni `packages/MeeshySDK`. La liste iOS
  ne retirera donc la ligne qu'au prochain `GET /notifications`. Correct au fond, en retard à
  l'écran — et c'est un diff `apps/ios` + SDK, donc une autre lane.
- **Le push DÉJÀ remis reste sur l'appareil.** Aucun `apns-collapse-id` ni retrait à distance n'est
  envoyé au rappel. Le contenu affiché en bannière avant la suppression y demeure jusqu'à ce que la
  personne l'écarte. Fermable côté APNs (push `mutable-content` de retrait), chantier propre.
- **Le balayage des messages vides (`MaintenanceService`, 4e écrivain) ne retire rien.** Il
  n'appelle délibérément pas `applyMessageRemovalEffects` — un message au contenu blanc ne porte
  aucun lien à désactiver. Il laisse en revanche ses `Notification` pendantes. Fuite nulle (le
  contenu était vide) mais lignes orphelines pointant vers un message retiré : à traiter avec le
  décompte des compteurs, que ce balayage ne peut pas faire non plus.
- **Les mentions ne sont pas propagées en temps réel** (reconduit du cycle 46) : `message:deleted`
  part vers les salons de conversation, aucun signal ne dit à un client affichant l'inbox de
  mentions de retirer la ligne.
- **`UserMessageDeletion` est écrite et lue par personne** (reconduit du cycle 46) — arbitrage
  `delete-for-me` en attente de validation humaine depuis le cycle 12.
- Reconduits des cycles 44/45 : les compteurs déjà dérivés restent en base ; le plancher reste
  absent des décréments ; `emitConversationPreviewUpdate` et les autres émetteurs par room
  personnelle n'ont pas été audités contre la clé `userId ?? id`.

---

# Cycle 46 — Le rappel d'un message s'arrêtait à la porte de l'inbox de mentions

Supprimer un message, dans ce produit, est un **rappel** : les quatre écrivains de `deletedAt`
vident `translations`, diffusent `message:deleted`, désactivent les `/l/<token>` que le message
emportait, recalculent `lastMessageAt`. Le message disparaît de partout.

Sauf d'un endroit. `GET /mentions/me` rendait `Message.content` sans jamais regarder `deletedAt` —
le seul chemin du gateway dans ce cas.

## Le défaut, et pourquoi il ne se referme jamais tout seul

`MentionService.getRecentMentionsForUser` interrogeait `mention.findMany` sur le seul
`mentionedUserId`. Sa route soeur, **dans le même fichier**, écrit pourtant la règle complète :

```ts
// routes/mentions.ts — GET /mentions/messages/:messageId
prisma.message.findFirst({
  where: { id: messageId, deletedAt: null,
           conversation: { participants: { some: { userId, isActive: true } } } },
})
```

Deux lecteurs, une seule règle, et un seul des deux la porte.

Ce que cela donne : Bob écrit « désolé @alice, [quelque chose qu'il regrette] », puis supprime.
La conversation le perd chez tout le monde, en direct. Alice le garde — contenu intégral, identité
de l'auteur, titre de la conversation — dans son inbox de mentions, à chaque ouverture, sans date
de fin.

**Rien ne l'en retire jamais**, et c'est le point qui rend le défaut permanent plutôt que
transitoire :

- l'unique `mention.deleteMany` du dépôt est la réconciliation d'édition
  (`replaceMessageMentions`), qui ne supprime que les mentionnés **partants** d'un texte réécrit —
  elle ne connaît pas la suppression ;
- `Mention.message` déclare bien `onDelete: Cascade`, mais une cascade ne se déclenche que sur une
  suppression **physique**. Le retrait doux ne bascule que `deletedAt` : la ligne `Message` reste,
  donc la ligne `Mention` aussi. Même mécanisme que les `TrackingLink` survivants du cycle 43.

Second trou de la même garde absente : une ligne `Mention` survit à `Participant.isActive = false`.
Une personne retirée d'un groupe y lit encore son entrée — et le **titre de conversation est relu
live** à chaque appel, donc il peut avoir changé après son départ.

## Le correctif

L'admission de la route soeur, portée dans `getRecentMentionsForUser` :

```ts
where: {
  mentionedUserId: userId,
  message: {
    deletedAt: null,
    conversation: { participants: { some: { userId, isActive: true } } },
  },
}
```

Deux choix, et aucun n'est cosmétique.

**Dans le service, pas dans la route.** La ligne `Mention` n'est atteignable que par cette
fonction : c'est le seul endroit qu'un futur lecteur ne peut pas oublier. La placer dans la route
aurait reproduit la configuration qui a produit le défaut — une règle correcte répétée en N
endroits, dont l'un finit par manquer. Même argument qu'au cycle qui a mis les contrôles de
périmètre dans `writeConversationPreferences`.

**Filtrage à la lecture, pas purge des lignes au retrait du message.** Purger dans
`applyMessageRemovalEffects` aurait laissé derrière lui toutes les lignes DÉJÀ en base (un script de
réparation de plus, après ceux des cycles 25 et 27), et n'aurait rien pu faire du cas appartenance —
qu'aucun nettoyage à l'écriture ne peut voir, puisque le départ arrive après. Le filtre couvre les
deux, et il est réversible : restaurer un message rendrait sa mention, ce qu'une purge interdirait.

## Plan

- [x] T1 — RED : une mention dont le message est rappelé sort de l'inbox
- [x] T2 — RED : une mention d'une conversation quittée sort de l'inbox
- [x] T3 — témoin : une mention vivante dans une conversation rejointe reste (vert avant ET après)
- [x] T4 — GREEN : la garde d'admission dans `getRecentMentionsForUser`
- [x] T5 — le verrou « on filtre sur l'utilisateur, pas sur un participant » relâché en
      `objectContaining` sans perdre son intention
- [x] T6 — gates : suite gateway complète, `tsc --noEmit` propre
- [x] T7 — changeset + CHANGELOG + ce relevé

## Revue

Le double de test mérite d'être noté, parce que c'est lui qui fait la différence entre un test qui
prouve quelque chose et un test qui accompagne. Les assertions voisines de ce `describe` portent sur
la **forme** de l'appel (`toHaveBeenCalledWith(objectContaining({ take: 50 }))`). Une assertion de
plus sur la forme du `where` aurait été verte dès l'instant où le champ existe, sans jamais dire que
la ligne rappelée disparaît.

`honourWhere(rows)` rend un `mention.findMany` qui **applique le `where` qu'il reçoit** aux lignes
qu'on lui donne. Il ne connaît pas le `where` attendu : si la production n'en déclare aucun, la
ligne rappelée revient et le test tombe. C'est exactement ce qui a été observé — deux rouges, la
ligne `recalled` puis la ligne `left` présentes dans le résultat — avant que la garde n'existe. Un
double qui rend ses lignes quel que soit le filtre laisserait passer ce défaut ; c'est la leçon du
cycle 45b, appliquée ici avant plutôt qu'après.

Le témoin T3 est vert des deux côtés du correctif. Son rôle est d'interdire de trop resserrer : une
garde qui viderait l'inbox passerait T1 et T2 sans broncher.

Vérifié aussi, et sans changement nécessaire : `getMentionsForMessage` (l'autre lecteur de
`Mention`) est appelé exclusivement derrière la garde de la route soeur, qui la porte déjà.

## Reste ouvert après ce cycle

- **Le rappel n'est pas propagé à l'inbox en temps réel.** `message:deleted` part vers les salons
  de conversation ; un client qui affiche l'inbox de mentions n'a aucun signal lui disant de retirer
  la ligne, et la relira au prochain `GET`. Correct à la lecture, en retard à l'écran — le même
  écart qu'entre un compteur juste et un compteur poussé.
- **La notification de mention survit au rappel.** La ligne `Notification` et le push déjà remis
  portent le contenu du message. Le filtre de ce cycle ne les atteint pas : c'est un autre lecteur,
  avec sa propre question (faut-il retirer une notification déjà affichée, ou seulement la vider de
  son contenu ?).
- **`UserMessageDeletion` est écrite et lue par personne.** Quatre écritures dans
  `routes/user-deletions.ts`, zéro lecture dans tout le dépôt : « supprimer pour moi » un message
  n'a aucun effet observable. Volontairement hors de ce cycle — c'est l'arbitrage `delete-for-me`
  que le cycle 12 a laissé en attente de validation humaine, et l'inbox ne doit pas trancher seule
  une question qui appartient à la liste de messages.
- Reconduits du cycle 44 : les compteurs déjà dérivés restent en base (script de réparation en lot,
  candidat autonome) ; le plancher reste absent des décréments ; `ConversationMessageStats` reste un
  dénormalisé sans propriétaire (JSON en lecture-modification-écriture non atomique) ; les messages
  SYSTÈME ne sont comptés par personne alors que `recompute()` les compte — trancher AVANT de câbler.
- Reconduits du cycle 43 : `TrackingLink.messageId` reste une colonne trompeuse ; le décompte de
  références relit le texte pour retrouver une relation.
- Reconduits des cycles 40-42 : E2EE web de bout en bout ; `signedPreKeySignature` invérifiable ; le
  reste de `PreferencesService` (479 lignes) mort ; colonnes `User.signal*` mortes ; pré-clé à usage
  unique non unique ; `POST /signal/session/establish` n'établit aucune session ; `registrationId`
  iOS déborde le `maximum` documenté ; doublons `Participant` ; « qui a le droit d'épingler ? » ;
  asymétrie édition/suppression ; `eslint` inopérant sur le gateway (pas d'`eslint.config.js` depuis
  ESLint v9).

---

# Cycle 45b — Addendum d'une session parallèle : les tests du cycle 45 ne voyaient pas le défaut du cycle 45

Deux sessions ont livré le cycle 45 en parallèle, sur **le même défaut**. Celle-ci arrive seconde.

Arbitrage défaut par défaut (leçon du cycle 23), pas « qui est arrivé en premier » : **le correctif
de production ci-dessous est strictement plus large** et il est conservé intégralement. Il couvre
deux sites que cette session n'avait pas vus — la quatrième copie verbatim dans
`POST /messages/:id/status`, et la garde contre un `select` amputé des deux identités, qui aurait
déversé tout le trafic dans l'unique room `user:undefined`. Le module concurrent de cette session
(`emitToParticipantRooms`) a été **supprimé** à la fusion : deux helpers rivaux pour la même règle
valent moins que l'un ou l'autre.

Ce qui est ajouté par-dessus ne touche donc à aucune ligne de production. **C'est la partie que la
session arrivée première n'a pas faite, et elle n'est pas cosmétique : ses propres tests ne
capturent pas le défaut qu'elle corrige.**

## Le faux vert, mesuré et non supposé

Dans `MeeshySocketIOManager.test.ts`, toutes les chaînes se déversent dans un `io.to` unique.
`expect(ioState.to).toHaveBeenCalledWith(ROOMS.user('part-anon'))` prouve alors qu'**un** émetteur a
adressé cette room — **jamais lequel**. Or sur le chemin `broadcastMessage`, `conversation:updated`
n'est pas seul à viser cette room : `emitUnreadCountsToRecipients` l'adresse déjà correctement
depuis le cycle 42.

Vérifié par expérience, pas par raisonnement : le fanout `conversation:updated` a été **re-cassé**
localement (retour au `filter((p) => p.userId)`), puis les deux tests lancés sur ce code fautif.

| test | sur le code re-cassé |
|---|---|
| `emits CONVERSATION_UPDATED to every participant user room…` (session 1) | **PASSE** |
| `addresses an accountless participant by its participant id in CONVERSATION_UPDATED` (celui-ci) | **ÉCHOUE** |

Le premier test resterait donc vert si quelqu'un régressait demain exactement le défaut que le
cycle 45 vient de corriger. C'est la seule raison d'être de cet addendum.

*(Le test de drain de la session 1 n'a pas ce défaut : il fait `ioState.to.mockClear()` et
`_emitDeliveryForDrainedMessages` n'a qu'un émetteur — l'assertion lâche y suffit.)*

## Trois doubles de test corrigés

- **`MeeshySocketIOManager.test.ts`** — `recordEmitChains(ioState)` remplace le temps d'un test le
  `io.to` partagé par une chaîne qui garde room et événement ensemble, et restaure le double
  d'origine en `finally` pour qu'aucun test suivant n'hérite de l'override.
- **`MessageHandler.test.ts`** — même problème sur `makeIO()` (un `mockToResult` unique). Le test du
  chemin d'envoi WS monte un double enregistreur local et n'affirme que sur les rooms de
  `conversation:updated`.
- **`MessageHandlerEditDelete.test.ts`** — `target.to.mockReturnValue(target)` rabattait toute
  chaîne sur son **premier** salon : un émetteur chaîné y était indiscernable d'un émetteur qui
  aurait oublié tous les salons sauf le premier. `emitToConversationParticipants` chaînant les
  accusés, le trou restait ouvert quelle que soit la forme retenue pour `conversation:updated`.

## Écarté volontairement

Cette session chaînait aussi `conversation:updated` (une émission au lieu de N). La session 1 a
**délibérément** gardé la boucle, en argumentant que les deux familles d'émetteurs ne partagent pas
une forme d'émission et que seule la liste de rooms leur est commune. L'argument tient ; le gain
était marginal. Non réimposé — la structure de la session 1 est conservée telle quelle.

---

# Cycle 45 — La piste du cycle 43 nommait un émetteur ; il y en avait cinq, et le plus lourd n'était pas un accusé

Tête prise dans la dernière ligne du cycle 43, littérale : « `emitConversationPreviewUpdate` et les
autres émetteurs par room personnelle n'ont pas été audités contre la même clé. La règle « adresser
par `userId ?? id` » vaut pour tout émetteur personnel [...] À instruire par une recherche sur
`ROOMS.user(` plutôt que par déduction. »

La recherche a été faite telle que prescrite (`ROOMS.user(` sur tout `services/gateway/src`, 60
sites, puis tri manuel). Elle valide la piste et la déborde : **cinq** émetteurs défectueux, pas un.

## Le tri qui compte : quelle identité l'appelant tient-il ?

Un `ROOMS.user(x)` n'est fautif que si `x` vient d'une ligne `Participant` — seule table où
l'identité peut être nulle. Les 60 sites se répartissent ainsi :

| famille | exemples | verdict |
|---|---|---|
| `x` est un `User.id` de bout en bout | demandes d'ami, notifications, préférences | **sain** — aucun anonyme concerné par construction |
| `x` vient d'un `Participant` | les 5 ci-dessous | **fautif** |
| `x` vient d'un `Participant`, déjà corrigé | `emitUnreadCountsToRecipients`, `emitToConversationParticipants` | sain (cycles 42–43) |

## R1 — Le défaut le plus lourd n'est pas un accusé de lecture, c'est `conversation:updated`

Le backlog attendait des accusés. Trois des cinq sites émettent `conversation:updated`, et ce signal
pèse plus : c'est le SEUL qui fait remonter une conversation en tête de liste, et le seul par lequel
une conversation créée après la connexion entre dans la liste d'un client déjà en ligne.
`message:new` ne s'y substitue pas — il n'atteint que les sockets encore dans `conversation:<id>`,
que le client posé sur sa liste a précisément quittée.

Les trois chemins d'envoi le sautaient identiquement pour un participant sans compte :

| chemin | émetteur | ligne fautive |
|---|---|---|
| envoi WS | `MessageHandler.broadcastNewMessage` | `if (!p.userId) continue` |
| envoi REST/ZMQ | `MeeshySocketIOManager._broadcastNewMessage` | `if (!p.userId) continue` |
| édition / suppression | `emitConversationPreviewUpdate` | `if (!p.userId ...) continue`, et `select: { userId: true }` |

Conséquence, pour l'invité de lien partagé — le mode d'entrée principal du produit : liste de
conversations **figée**. Aucun re-tri à la réception, aucun rafraîchissement de l'aperçu après
édition ou suppression, et un fil neuf absent jusqu'au refetch manuel.

`emitConversationPreviewUpdate` documentait le manque comme une intention : « Anonymous participants
(no `userId`) are skipped, exactly as the send path does. » La phrase était **exacte sur ses deux
moitiés et fausse sur les deux** — le chemin d'envoi les sautait bien, et c'était son défaut. Son
test unitaire l'affirmait aussi (`it('skips anonymous participants...')`) : un défaut fixé par un
test est un défaut qui ne se corrige plus tout seul. Le test est retourné, en disant pourquoi.

## R2 — Deux copies de l'éventail d'accusés avaient survécu au regroupement du cycle 43

Le cycle 43 en a réuni trois. Il en restait deux, invisibles à sa recherche parce qu'elles ne
ressemblaient pas aux autres :

- `POST /messages/:id/status` (`routes/messages.ts:718`) — **quatrième copie verbatim**, jamais
  recensée. Même `select: { userId: true }`, même filtre.
- `_emitDeliveryForDrainedMessages` — variante : la clé y transite par un `Map<convId, string[]>`
  construit sous `if (row.userId)`, donc le filtre est à la construction, pas à l'émission.

Effet : un expéditeur sans compte reste sur un unique tic « envoyé », y compris au moment où son
destinataire revient en ligne et vide sa file — l'instant précis où l'accusé existe.

## Correctif — extraire la liste de rooms, pas la boucle d'émission

Les deux familles n'ont PAS la même forme d'émission, et vouloir partager la boucle aurait imposé
l'une à l'autre :

- les accusés **chaînent** room de conversation + rooms personnelles (`io.to(a).to(b).emit()`), ce
  qui garantit une livraison au plus une fois par socket présente dans les deux ;
- `conversation:updated` n'adresse **que** les rooms personnelles — une copie vers la room de
  conversation serait inutile pour qui regarde déjà le fil, sa ligne de liste n'étant pas à l'écran.

Ce qu'elles partagent est la liste de rooms, et c'est exactement la ligne que chaque copie ratait.
D'où `participantUserRooms(participants, seed?)`, extraite seule ;
`emitToConversationParticipants` s'appuie dessus, et les cinq sites l'appellent.

Une garde s'y ajoute que les copies n'avaient pas : un participant sans `userId` **ni** `id` ne
nomme aucune room. Deux des sites corrigés sélectionnaient `{ userId: true }` seul — la même erreur
de `select` commise demain n'aurait plus rien sauté, elle aurait déversé le trafic de toutes les
conversations dans l'unique room `user:undefined`, où toute socket y ayant jamais atterri reçoit
tout. Le type dit que le cas est impossible ; les `select` partiels que cette fonction existe pour
corriger disent le contraire.

## Vérification

- 631 suites / 16095 tests verts (bun + jest), `tsc --noEmit` propre.
- Le test qui affirmait le défaut de `emitConversationPreviewUpdate` est retourné et commenté.
- Quatre régressions ajoutées, une par site non couvert : room `user:<participantId>` sur les deux
  chemins d'envoi, sur le rejeu de remise, et sur `POST /messages/:id/status` (dont le double
  Socket.IO du fichier de test ne voyait pas les `.to()` chaînés — il les enregistre maintenant).

## Écarté, avec la raison

- `routes/conversations/core.ts:1129` et `participants.ts:403` adressent des `User.id` venus de la
  charge utile de création / de la route : aucun anonyme n'y transite. Sains.
- `utils/callEndedFanout.ts` filtre `userId: { not: null }` **dans le `where` Prisma**. Ressemblance
  trompeuse : instruit et **écarté comme correct**, voir ci-dessous.

## `callEndedFanout` ressemblait au sixième site — c'est le seul filtre légitime

Le même `userId: { not: null }`, la même forme, et pourtant l'inverse. Ce que l'en-tête du fichier
énonce déjà tranche : « l'audience de terminaison doit toujours refléter l'audience d'invitation ».
Et `call:initiated` (`CallEventsHandler`, requête `conversationParticipants`) porte **exactement le
même filtre**. Un participant sans compte n'est jamais sonné, donc n'a aucune sonnerie à faire taire :
aligner ce fan-out sur la règle générale n'aurait pas corrigé un manque, il aurait diffusé
`call:ended` à quelqu'un qui n'a jamais reçu `call:initiated`.

Le cas qui semblait rester est déjà couvert. Un anonyme **peut** rejoindre l'appel — `CallService.joinCall`
admet sur le seul `Participant.id`, et la bulle « appel en cours » lui parvient comme un message
ordinaire — mais dès qu'il a rejoint, il est dans `ROOMS.call(callId)`, la première room de la liste.

Ce qui manquait était donc la raison écrite, pas le correctif : elle est maintenant dans le fichier,
pour que le prochain passage sur la règle `userId ?? id` ne re-litige pas ce site.

**La question de produit qu'il soulève reste ouverte et n'est pas un bug** : faut-il sonner un invité
de lien partagé ? Aujourd'hui non — et c'est cohérent, il n'a pas de jeton de push. À trancher côté
produit, pas côté correctif.

## Piste pour le cycle suivant

Aucune piste ouverte sur les rooms personnelles : les 60 sites `ROOMS.user(` sont triés, les cinq
fautifs corrigés, le sixième instruit et justifié. La prochaine tête est à prendre ailleurs — les
points hérités des cycles 19/24 restent en tête de file (extraction des mentions du chemin de lien
qui écrit `Message.validatedMentions` ; aucun client iOS n'écoute `link:message:new` ; les pièces
jointes du chemin de lien n'entrent pas dans le pipeline audio).
## Note d'intégration — deux sessions ont numéroté leur cycle « 44 »

Les deux ont pris leur tête dans le cycle 43, mais dans **deux phrases différentes** de sa liste de
restes, et les deux défauts sont disjoints :

| session | tête prise dans | défaut |
|---|---|---|
| celle arrivée sur `main` la première (ci-dessous, reste « 44 ») | « `onMessageDeleted` n'est appelé que par un chemin sur trois » | dérive des compteurs de conversation |
| celle-ci (renumérotée **45**) | « les autres émetteurs par room personnelle n'ont pas été audités contre la même clé » | `conversation:updated` et les accusés ne parvenaient à aucun anonyme |

Rien à arbitrer défaut par défaut (leçon du cycle 23) : aucun des deux ne touche à la logique de
l'autre. Les deux ont modifié `MessageHandler.ts` et `routes/messages.ts`, mais dans des blocs
distincts — le leur sur les effets de compteurs, celui-ci sur le nommage des rooms. La fusion est
textuellement propre ET vérifiée par la suite complète après merge, pas seulement par git.

---

# Cycle 44 — Les compteurs de conversation étaient comptés par un tuyau et débités par un autre

Tête prise dans le « reste ouvert » du cycle 43, qui la désignait nommément :
`conversationMessageStatsService.onMessageDeleted` n'est appelé que par un chemin sur trois, « la
dérive de statistiques est réelle et mesurable ; le correctif est un cycle à lui seul ».

Elle l'était. **Et la moitié qui manquait au tableau était la plus grave** : le cycle 43 avait
compté les appelants du DÉCRÉMENT sans regarder ceux de l'INCRÉMENT. Mis face à face, les deux
listes ne se recouvrent nulle part.

## R1 — Le comptage et le décompte n'habitaient pas les mêmes routes

| geste | écrivains | qui touche `ConversationMessageStats` |
|---|---|---|
| envoi | handler socket `message:send` / `send-with-attachments`, `POST /conversations/:id/messages`, les deux routes de lien de partage, `translation-non-blocking` | **le handler socket, seul** |
| retrait | handler socket `message:delete`, `DELETE /messages/:id`, `DELETE /conversations/:id/messages/:id`, balayage des messages vides | **`DELETE /conversations/:id/messages/:id`, seule** |
| édition | handler socket `message:edit`, `PUT /conversations/:id/messages/:mid`, `PUT /messages/:id`, `PATCH /messages/:id` | **`PUT /conversations/:id/messages/:mid`, seule** |

La route qui décrémente est **celle qu'emploient iOS et la vue web**. Le chemin d'envoi que ces
mêmes clients empruntent en priorité est **REST** (`POST /conversations/:id/messages`), qui ne
compte pas. Un message envoyé depuis un iPhone puis supprimé depuis ce même iPhone **débite un
compteur qu'il n'a jamais crédité**.

Deux propriétés du service transforment cette asymétrie en dommage permanent :

1. **Les décréments sont atomiques et SANS plancher.** Le `Math.max(0, …)` a été délibérément
   abandonné au profit de l'atomicité, sur l'argument — écrit en commentaire — que « des opérations
   équilibrées ne passent jamais sous zéro ». Elles ne l'étaient pas. `totalMessages` descend en
   négatif et y reste.
2. **Il n'existe aucun recalcul périodique.** `recompute()` n'est appelé que paresseusement, quand
   la ligne n'existe pas encore. Le commentaire qui promettait qu'« une dérive résiduelle est
   corrigée par recompute() » désignait un mécanisme qui n'a jamais été planifié — et un autre
   commentaire du même fichier le dit d'ailleurs noir sur blanc à propos de `locationCount`
   (« aucun recalcul périodique »).

## R2 — Trois copies inline d'une règle dont l'autorité est ailleurs

`recompute()` est l'autorité : c'est elle qui reconstruit la ligne depuis les messages, donc elle
qui contredit toute divergence. Elle applique deux règles que les chemins incrémentaux portaient
recopiées :

- la table **MIME → compteur** (`resolveAttachmentType`), recopiée dans le handler socket et dans la
  route de suppression ;
- la **clé de crédit** `sender.userId || senderId`, recopiée aux mêmes endroits.

Les deux copies étaient justes ce jour-là. Rien ne les tenait.

## Correctif — un effet ajouté à l'unité s'applique à tous les tuyaux

Le remède est celui des cycles 42/43, appliqué à la troisième famille : chaque geste du cycle de vie
d'un message a **une** unité, et les compteurs y entrent.

| geste | unité | appelants |
|---|---|---|
| envoi | `runMessagePostSaveEffects` (4ᵉ effet, `messageStats`) | `MessagingService` (socket + REST + translation-non-blocking) et les deux routes de lien |
| retrait | `applyMessageRemovalEffects` (3ᵉ effet) | les trois routes de suppression |
| édition | **`applyMessageEditEffects`** (neuve, jumelle des deux autres) | les quatre transports d'édition |

`resolveAttachmentType` et `statsAuthorKey` sont **exportés** depuis le service : la table MIME et la
clé de crédit ne s'écrivent plus qu'à un endroit, celui où vit `recompute()`.

**Les champs que le comptage réclame sont REQUIS dans les types des trois unités.** Ce n'est pas de
la rigueur décorative : c'est exactement l'omission silencieuse que le cycle referme. Un cinquième
tuyau d'envoi ne compilera pas sans dire qui créditer. La preuve en a été faite en passant — en
retirant temporairement le correctif, la suite `MessagingService` ne compile plus.

Le décompte lit des champs **capturés à l'admission** et jamais relus : deux des trois routes de
suppression détruisent les `MessageAttachment` avant que l'unité ne tourne, une relecture rendrait
toujours une liste vide et les compteurs image/audio/vidéo ne redescendraient jamais.

**Correctif incident, non cosmétique** : le contenu compté est désormais celui qui est **PERSISTÉ**,
et non celui de la requête. Le handler socket comptait le second ; un message chiffré stocke `''`,
si bien que l'incrément divergeait de son propre recalcul dès le premier message E2EE.

**Auto-réparation** : le balayage des messages vides (`MaintenanceService`) est le seul écrivain en
LOT — il ne tient de ses messages que leur id et leur conversation, jamais l'auteur ni le contenu
qu'un décrément demande. Il appelle donc `recomputeIfTracked` une fois par conversation touchée :
le seul geste possible, et celui qui répare en passant la dérive déjà accumulée. La garde
d'existence l'empêche de FABRIQUER des lignes de compteurs (`recompute()` fait un `upsert`) pour des
conversations dont personne n'a jamais demandé les statistiques.

## Preuve

**633 suites, 16 114 tests, tout vert** (avant : 632 / 16 098). `tsc --noEmit` propre. Couverture
lignes **95,75 %**, en hausse (95,65 % au cycle 43).

Les témoins neufs échouent tous sur le code d'avant, vérifié en retirant le correctif :

- unités partagées : 10 rouges sur `messagePostSaveEffects` / `messageRemovalEffects`, 4 sur
  `messageEditEffects` (fichier neuf) ;
- sites d'appel : `MessagingService` crédite les compteurs (LE témoin — l'entrée commune du socket
  et du REST), les deux routes de suppression restantes débitent, les trois transports d'édition
  restants ajustent, le balayage répare ;
- `cleanupEmptyMessages` **n'avait aucun test** — il en a cinq.

**Six tests existants ont dû partir, et c'est le fait le plus instructif du cycle.** Ils
verrouillaient dans le handler socket la classification des MIME et la clé `userId || participantId`
— nommés d'après les numéros de ligne qu'ils couvraient (`line 275`, `line 460`, `line 463`). Tous
passaient. C'est précisément ce qui masquait la panne : ils prouvaient qu'une règle était juste
**là où elle se trouvait**, jamais qu'elle s'appliquait partout où elle devait. Ce qui reste à leur
place est le témoin inverse — le handler ne compte PAS lui-même, sinon l'envoi socket compterait
double.

## Reste ouvert après ce cycle

- **Les compteurs déjà dérivés restent en base.** Le correctif ne vaut que pour l'avenir ; les
  lignes déjà négatives ne se relèveront qu'au passage du balayage des messages vides sur leur
  conversation, ou par un `recompute()` manuel. **Un script de réparation en lot serait un cycle
  utile** — et, contrairement aux deux réparations en attente des cycles 25/27, celui-ci n'a besoin
  d'aucune donnée que la base ne porte déjà.
- **Le plancher reste absent des décréments.** Le correctif rend les opérations équilibrées, ce qui
  était l'hypothèse du choix d'origine — mais une seule panne de `runMessagePostSaveEffects`
  (best-effort, avec `.catch`) suffit à la rompre à nouveau, et rien ne le signale. Un compteur qui
  descend sous zéro devrait au minimum **journaliser**, à défaut d'être plancé.
- **`ConversationMessageStats` reste un dénormalisé sans propriétaire.** Les champs JSON
  (`participantStats`, `dailyActivity`, …) sont toujours écrits en lecture-modification-écriture non
  atomique : deux envois concurrents dans la même conversation peuvent encore s'écraser l'un
  l'autre. Seuls les scalaires sont atomiques. C'est la limite structurelle que ce cycle **ne**
  franchit pas.
- **Les messages SYSTÈME ne sont comptés par personne.** Trois `message.create` contournent
  `MessagingService` : deux dans `CallService` (récapitulatifs d'appel) et un dans
  `routes/conversation-encryption.ts` (« chiffrement activé »). Aucun n'incrémente — mais
  `recompute()`, lui, les compte : la même divergence incrément/recalcul que ce cycle vient de
  fermer, à ceci près qu'elle repose sur une question produit non tranchée. Un message système
  DOIT-il entrer dans `totalMessages` ? Les deux réponses sont défendables ; ce qui ne l'est pas,
  c'est que l'incrément et le recalcul en donnent chacun une. **Candidat sérieux pour le prochain
  cycle** — et il faut trancher AVANT de câbler, sans quoi on aligne le comptage sur un
  `recompute()` dont personne n'a validé le choix.
- Reconduits du cycle 43 : `TrackingLink.messageId` reste une colonne trompeuse (renommage ou table
  de jonction) ; le décompte de références relit le texte pour retrouver une relation.
- Reconduits des cycles 40-42 : E2EE web de bout en bout ; `signedPreKeySignature` invérifiable ; le
  reste de `PreferencesService` (479 lignes) mort ; colonnes `User.signal*` mortes ; pré-clé à usage
  unique non unique ; `POST /signal/session/establish` n'établit aucune session ; `registrationId`
  iOS déborde le `maximum` documenté ; doublons `Participant` ; « qui a le droit d'épingler ? » ;
  asymétrie édition/suppression ; audit du retrait d'un post par l'auteur lui-même.
- **`eslint` ne peut toujours pas tourner sur le gateway** : aucun `eslint.config.js` depuis la
  migration ESLint v9. Condition préexistante, non couverte par la CI — qui ne gate que sur
  `test:coverage`.

---

# Cycle 43 — La piste laissée par le cycle 42 désignait un correctif qui aurait cassé la production

Tête prise dans la « piste pour le cycle suivant » du cycle 42, qui l'énonçait précisément :
`TrackingLink` porte un `messageId`, la suppression d'un message a quatre écrivains, aucun ne
bascule `isActive: false`, « commencer par nommer la liste, pas par corriger les quatre sites ».

Les deux moitiés de cette piste se sont vérifiées inégalement. La liste manquante était réelle, et
plus creuse encore que décrite. **Mais le correctif tel qu'énoncé — désactiver
`where: { messageId }` — aurait été une RÉGRESSION, sur le chemin le plus courant du produit.**

## R1 — La colonne `messageId` ne désigne pas un propriétaire

`findExistingTrackingLink(url, conversationId)` (`TrackingLinkService.ts:226`) rend à **tout**
message de la conversation le lien déjà minté pour la même URL. Une ligne `TrackingLink` est donc
**partagée** entre messages, et `messageId` n'en retient qu'un seul — lequel dépend du chemin :

| chemin | écrivain | politique |
|---|---|---|
| envoi | `MessageProcessor.updateTrackingLinksWithMessageId` | filtre `messageId: null` → **premier** arrivé |
| partage | `TrackingLinkService.updateTrackingLinksMessageId` | `updateMany` sans garde → **dernier** arrivé |

Ce n'est donc pas un lien d'appartenance, c'est une trace de passage. Désactiver sur cette colonne
aurait coupé, dans le cas « envoi », le lien qu'un **autre message toujours affiché** porte encore :
il suffit qu'une URL soit citée deux fois dans une conversation et que le premier message parte.
Dans le cas symétrique (un message qui réutilise un token minté avant lui), la même requête n'aurait
rien fait du tout. Faux positif et faux négatif par la même colonne.

La question qui décide n'est pas *à qui appartient ce lien* — personne ne le sait — mais **un
message vivant le porte-t-il encore**. C'est un décompte de références, et il doit se faire sur les
**deux** représentations d'un token, parce que les deux chemins de minting n'écrivent pas au même
endroit : une syntaxe explicite `[[url]]` / `<url>` **réécrit** le contenu en `m+<token>` et ne
touche pas les métadonnées ; une URL brute laisse le contenu intact et ne nomme le token que dans
`metadata.trackingLinks`. Ne lire qu'une des deux laisserait la moitié des liens actifs pour
toujours.

## R2 — La liste manquante ne contenait pas que les liens

En la reconstituant sur les quatre écrivains, une seconde divergence apparaît, plus visible pour
l'utilisateur que la première :

| effet | handler socket | `DELETE /messages/:id` | `DELETE /conversations/:id/messages/:id` | balayage vides |
|---|---|---|---|---|
| `deletedAt` | ✅ | ✅ | ✅ | ✅ |
| pièces jointes | ✅ | ✅ | ✅ | s.o. |
| recalcul `lastMessageAt` | ✅ | ✅ | ❌ | ❌ |
| désactivation des `/l/<token>` | ❌ | ❌ | ❌ | ❌ |

La colonne en défaut est **la route qu'emploient iOS et la vue web**. Supprimer le dernier message
d'une conversation depuis un iPhone laissait donc la liste des conversations triée sur un message
que plus personne ne peut voir — pendant que le même geste depuis le composer web (qui passe par le
handler socket) la corrigeait. Le balayage des messages vides ne le recalculait pas davantage, et
c'est lui qui retire précisément les messages fantômes susceptibles d'épingler l'ordre.

## Correctif — `applyMessageRemovalEffects`

`services/messaging/messageRemovalEffects.ts`, jumeau d'`applyPostRemovalEffects` et pour la même
raison. Best-effort après un `deletedAt` déjà committé : une suppression réussie ne doit jamais
devenir un 500.

Trois gardes ferment chacune un faux positif distinct :

1. **`targetType: 'EXTERNAL'`** — un lien `POST`/`REEL`/`STORY` appartient au contenu partagé, pas
   au message qui le relaie ; son retrait est déjà tenu par `applyPostRemovalEffects`. Supprimer le
   message qui partage un post ne doit pas casser le partage de ce post ailleurs.
2. **`conversationId`** — un `m+<token>` recopié à la main depuis une autre conversation ne donne
   aucun droit sur le lien d'en face.
3. **Plus aucun message vivant ne le porte** — R1.

Le décompte s'appuie sur un `findRaw` volontairement **large** (`m\+(t1|t2)` sans frontière de mot
attrape aussi `m+t1x`), l'exactitude étant refaite en JS sur les documents rendus : un préfiltre
trop large ne coûte que des lignes lues, un préfiltre trop étroit désactiverait un lien encore
affiché. Même asymétrie sur les pannes — **si le décompte échoue, le lien reste ACTIF** : couper à
tort casse un message vivant et rien ne le rouvre, laisser actif ne coûte qu'un clic compté en trop.

Le recalcul de `lastMessageAt` est repris tel quel des deux chemins qui le tenaient, à une
différence près : la garde CAS relit `lastMessageAt` **au plus près de son écriture** au lieu de le
recevoir joint au message. C'est strictement plus juste (la fenêtre de course rétrécit au lieu de
couvrir tout le handler) et les trois routes économisent la jointure. Il est exporté séparément
sous `recomputeConversationLastMessageAt` : le balayage en lot n'a que cet effet-là à appliquer —
un message au contenu blanc et sans attachement ne porte aucun lien — et une fois par conversation
touchée, pas une fois par message.

## Preuve

`messageRemovalEffects.test.ts` — 16 tests. Le témoin central est **« un survivant protège le
token »** : c'est lui, et lui seul, qui échouerait si quelqu'un revenait au filtre sur `messageId`.
Il a son symétrique en métadonnées (un survivant qui n'a cité que l'URL brute), sans quoi le
décompte ne verrait qu'une des deux représentations. Trois tests de plus sur la route iOS/web,
dont le recalcul de `lastMessageAt` qu'elle ne faisait pas.

Quatre tests existants ont dû être mis à jour — ils lisaient la valeur de garde sur la jointure
`message.conversation`, que le correctif supprime. Deux d'entre eux échouaient d'ailleurs par
**fuite de mock** et non par assertion : leur file `mockResolvedValueOnce` n'était plus consommée au
même rythme, et la valeur restante contaminait le test suivant. Un rappel utile : une file `Once`
dimensionnée sur le nombre d'appels d'un handler couple le test à sa structure interne.

Suites : gateway 630/630 vertes, `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **`conversationMessageStatsService.onMessageDeleted` n'est appelé que par un chemin sur trois.**
  Troisième colonne de la table de R2, délibérément laissée hors de ce cycle : contrairement aux
  deux effets traités, elle exige du message des informations que les deux autres routes ne lisent
  pas (types MIME des pièces jointes, `messageType`, contenu), et c'est un service de compteurs
  dont les semantiques d'incrément/décrément méritent d'être vérifiées avant d'être diffusées à
  trois appelants. La dérive de statistiques est réelle et mesurable ; le correctif est un cycle à
  lui seul, pas un ajout en passant.
- **`TrackingLink.messageId` reste une colonne trompeuse.** Ce cycle cesse de s'en servir pour
  décider, mais ne la retire pas : `routes/admin/users.ts` et `system-rankings.ts` la lisent encore
  pour de l'affichage. Elle mériterait soit un renommage disant ce qu'elle est (dernier/premier
  message à avoir référencé le lien), soit le passage à une vraie table de jonction
  message ↔ lien — laquelle rendrait le décompte de références exact au lieu de le reconstituer
  depuis le texte.
- **Le décompte relit le texte pour retrouver une relation.** Conséquence directe du point
  précédent : `metadata.trackingLinks` et les `m+<token>` du contenu sont deux index dérivés qu'il
  faut tenir d'accord. Une table de jonction supprimerait le `findRaw` et le préfiltre.
- Reconduits du cycle 42 : E2EE web de bout en bout ; `signedPreKeySignature` invérifiable ; le
  reste de `PreferencesService` (479 lignes) mort ; colonnes `User.signal*` mortes (dont
  `signalIdentityKeyPrivate`, emplacement pour une clé privée côté serveur) ; audit du retrait d'un
  post par l'auteur lui-même (décision produit).
- Reconduits des cycles 40/41 : pré-clé à usage unique non unique ; `POST /signal/session/establish`
  n'établit aucune session ; `registrationId` iOS déborde le `maximum` documenté ; doublons
  `Participant` ; « qui a le droit d'épingler ? » ; asymétrie édition/suppression ; `eslint`
  inopérant sur le gateway (pas d'`eslint.config.js` depuis ESLint v9).

# Cycle 42 — Une chaîne de trois ruptures : personne ne sait qu'un utilisateur a des clés

Tête prise dans le « reste ouvert » du cycle 41, qui laissait `POST /signal/keys` inappelable
depuis le web. L'enquête a confirmé ce défaut — et trouvé, en amont, que le corriger n'aurait rien
changé à ce que l'utilisateur voit : **rien, nulle part, ne rapporte qu'un utilisateur a des
clés.** Trois ruptures indépendantes sur la même chaîne, chacune suffisant seule à la couper.

Le cycle 41 a rendu les clés distribuables (`GET /signal/keys/:userId` rendait du base64 décodable
au lieu d'une liste d'octets décimaux). Ce cycle rend leur EXISTENCE observable.

## R1 — La lecture visait quatre colonnes qu'aucune écriture n'alimente

`PreferencesService.getEncryptionPreferences` dérivait `hasSignalKeys` de
`User.signalIdentityKeyPublic`, et rendait `signalRegistrationId`, `signalPreKeyBundleVersion`,
`lastKeyRotation` depuis les colonnes homonymes de `User`.

**Aucun chemin n'écrit ces quatre colonnes.** Le seul écrivain de matériel de clé est
`POST /signal/keys`, et il fait un `upsert` sur la table `SignalPreKeyBundle` — jamais sur `User`.
Vérifié par balayage : hors de cette méthode et de ses tests, les quatre colonnes n'apparaissent
que dans le schéma Prisma qui les déclare et dans un test d'intégration qui les écrit lui-même.
Elles sont `null` pour tout le monde, depuis toujours. La méthode rendait donc `hasSignalKeys:
false` à l'utilisateur iOS dont le bundle est à une ligne de là — celui-ci téléverse le sien au
front montant de l'authentification, à **chaque** ouverture de session.

La même méthode portait un second défaut, indépendant : elle lisait `encryptionPreference` dans le
blob `application` de `UserPreferences`. Le champ est déclaré par `PrivacyPreferenceSchema` et
écrit dans le blob **`privacy`** (`packages/shared/types/preferences/privacy.ts:30`) — l'unique
chemin d'écriture est `PATCH /me/preferences/privacy`. Elle aurait rendu « optional » à
l'utilisateur qui a choisi « always ».

## R2 — Cette lecture n'était atteignable par personne

`services/preferences/PreferencesService.ts` (479 lignes) n'est importé **que par son propre
fichier de tests**. Aucune route ne l'instancie. Le DTO `EncryptionPreferencesDTO` décrivait donc
une réponse qu'aucune requête ne pouvait obtenir, et ses ~300 lignes de tests restaient vertes en
verrouillant les deux erreurs de R1 : les doubles Prisma rendaient précisément les colonnes
mortes qu'on leur demandait, si bien que la suite prouvait la cohérence du mock, jamais celle du
système.

## R3 — Le champ que le web lisait ne traverse pas le fil

`apps/web/components/settings/encryption-settings.tsx:42` dérivait tout le panneau — pastille,
badge « Actif », ID d'enregistrement, date de rotation, présence du bouton « Générer les clés » —
de `user?.signalRegistrationId`, pris sur l'objet `user` de `GET /auth/me`.

`userSchema`, le schéma de réponse à travers lequel Fastify sérialise cette route, ne déclare
**aucun** champ signal. fast-json-stringify n'ignore pas une propriété non déclarée : il la
**retire**. Le champ ne peut pas arriver, quoi que fasse le handler. C'est le mécanisme du cycle 41
dans son autre direction : là il coerçait (`String(Uint8Array)`), ici il ampute — et dans les deux
cas sans lever, sans journaliser, sans que TypeScript relie le handler à son schéma.

Les trois ruptures sont indépendantes : réparer R1 seule ne servirait rien (R2 rend le résultat
inatteignable), réparer R1+R2 ne servirait rien au web (R3 le fait lire ailleurs).

## Correctif — la ligne du bundle EST la source de vérité

`GET /me/preferences/encryption` (nouvelle), adossée à `SignalPreKeyBundle` :

```
hasSignalKeys        ← la ligne existe et isActive
signalRegistrationId ← bundle.registrationId, null sans bundle actif
lastKeyRotation      ← bundle.lastRotatedAt, null sans bundle actif
encryptionPreference ← blob privacy, validé par PrivacyPreferenceSchema.shape (pas de liste locale)
```

Le miroir sur `User` n'est pas réparé, il est **contourné** — le réparer demanderait une double
écriture (donc une dérive possible) et une migration de rattrapage pour tous les bundles déjà
téléversés. La table porte déjà la vérité : la route est juste pour tout utilisateur existant, le
jour du déploiement, sans backfill.

Côté web, `encryptionKeys` est un état serveur distinct des préférences (persisté par le store —
un panneau rouvert affiche immédiatement le dernier statut connu, conformément au principe
cache-first), synchronisé par `syncEncryptionKeys()` au montage du panneau, dans `syncAll()`, et
après un `POST /signal/keys` réussi. Ce dernier appel remplaçait un `GET /auth/me` suivi d'un
`setUser` : un aller-retour qui, par R3, ne pouvait rien rapporter de ce qu'il allait chercher.

**Code mort retiré** : `getEncryptionPreferences` et `updateEncryptionPreference` (les deux seules
méthodes de la classe morte que ce cycle remplace), leurs DTO, le type `EncryptionPreference`
devenu orphelin, et les 117 lignes de tests qui les gardaient. Le reste de `PreferencesService`
demeure mort — retrait à instruire séparément, il excède la famille traitée ici.

## Preuve

`me-preferences-encryption.test.ts` — 9 tests, **9 rouges avant correctif** (404 : la route
n'existait pas). Le fichier **ne mocke délibérément pas** `@meeshy/shared/types/api-schemas`, à la
différence de son voisin `me-preferences.test.ts` : le vrai sérialiseur tourne et toutes les
assertions portent sur le corps parsé. Un test énumère les clés exactes de `data` — c'est ce qui
vérifie que le schéma ne laisse pas fuiter de matériel de clé et qu'il ne retire rien d'attendu ;
un autre assert que le handler ne touche **jamais** `prisma.user` (le double n'expose pas le
modèle : un handler qui le lirait planterait au lieu de passer).

Web : 4 tests neufs sur `syncEncryptionKeys` (dont « une panne réseau ne fait pas disparaître les
clés »), et les tests de statut du panneau réécrits — ils injectaient `signalRegistrationId` dans
l'objet `user`, c'est-à-dire dans le champ que R3 rend inatteignable, et restaient verts pendant
que la production ne pouvait jamais l'afficher. L'un d'eux verrouille désormais l'inverse : un
`signalRegistrationId` posé sur `user` ne doit **pas** faire passer le statut au vert.

Suites complètes : gateway 630/630 (16 068 tests), web 512/512 (11 703 tests), `tsc --noEmit`
propre sur les deux paquets (les erreurs `TS7031` préexistantes du web sont hors des fichiers
touchés).

## Reste ouvert après ce cycle

- **Le web ne sait toujours pas générer de clés.** `encryption-settings.tsx` envoie `{}` à
  `POST /signal/keys` ; le schéma de corps en exige six propriétés — 400 avant le handler. Le
  correctif juste n'est pas d'ajouter un keygen : iOS ne dérive ses sessions que **localement**
  (CryptoKit, à partir du seul `signedPreKeyPublic`), et le web n'a **aucun chemin de
  déchiffrement**. Téléverser un bundle depuis le web ferait chiffrer les pairs iOS vers un
  destinataire incapable de lire — une régression fonctionnelle, pas un progrès. Ce chantier est
  « E2EE web de bout en bout » (WebCrypto X25519/Ed25519 + clés privées en IndexedDB + chemin de
  déchiffrement), pas un correctif. Demi-correctif refusé, consigné entier. Le bouton reste donc
  visible et sans effet pour un utilisateur web — état inchangé par ce cycle, désormais affiché
  sur un statut qui, lui, dit la vérité.
- **`signedPreKeySignature` n'est vérifiable par aucun pair.** iOS signe la pré-clé signée avec une
  clé `Curve25519.Signing` (Ed25519) conservée sous `me.meeshy.e2ee.signingKey`, alors que
  `identityKey` publié est une clé `Curve25519.KeyAgreement` (X25519) — deux clés distinctes. La
  clé de vérification n'est publiée nulle part : le bundle n'a pas de champ pour elle. La signature
  circule donc sans que quiconque puisse s'en servir. Défaut de protocole (champ de schéma +
  déploiement client), hors de la famille traitée ici.
- **Le reste de `PreferencesService` (479 lignes) est mort.** Une classe entière importée
  seulement par ses tests. Ce cycle en a retiré les deux méthodes qu'il remplaçait ; le retrait du
  reste demande de vérifier une à une les méthodes restantes contre leurs équivalents vivants.
- **Les colonnes `User.signalIdentityKeyPublic` / `signalIdentityKeyPrivate` /
  `signalRegistrationId` / `signalPreKeyBundleVersion` / `lastKeyRotation` sont mortes.** Plus
  aucun lecteur après ce cycle, toujours aucun écrivain. `signalIdentityKeyPrivate` mérite une
  attention à part : c'est un emplacement prévu pour une clé privée côté serveur, ce qu'un E2EE ne
  devrait jamais stocker. À retirer du schéma (aucune migration MongoDB nécessaire), avec le
  balayage des données résiduelles éventuelles.
- Reconduits du cycle 41 : la pré-clé à usage unique n'est pas à usage unique (demande un pool +
  un réapprovisionnement client) ; `POST /signal/session/establish` n'établit aucune session ;
  `registrationId` iOS (1…65535) déborde le `maximum: 16383` documenté ;
  `signal-protocol-routes.test.ts` mocke encore les schémas pour ses autres routes.
- Reconduits du cycle 40 : doublons `Participant` en base non dénombrés ; « qui a le droit
  d'épingler ? » ; asymétrie édition/suppression (cycle 38b) et appartenance active de l'auteur
  (cycle 34) à arbitrer ensemble ; `attachments/metadata.ts:185` ; balayage `routes/calls.ts` ;
  file d'attente de fan-out (cycle 32) ; fan-out `member_joined` sans borne (cycle 33b) ;
  `getVisibilityFilteredRecipients` / `filterPostConsumers` (cycle 32) ;
  `DELETE /admin/posts/:postId` (cycle 38) ; `@Display Name` ;
  `createStoryCommentNotificationsBatch` ; les deux scripts de réparation de base ; `eslint`
  inopérant sur le gateway (pas d'`eslint.config.js` depuis ESLint v9).

# Cycle 41 — Le schéma de réponse ne VALIDE pas la sortie du handler : il la RÉÉCRIT

Tête prise dans le « reste ouvert » du cycle 40, qui désignait `POST /signal/session/establish`
comme tête sérieuse : *soit on l'implémente, soit on cesse de consommer une pré-clé qu'on n'utilise
pas.* L'enquête a tranché cette question — et en a trouvé une autre, en amont, qui rendait la
première sans objet : **le seul point de distribution de matériel de clé du serveur rendait des
clés qu'aucun client ne peut décoder.** L'E2EE n'a jamais pu s'établir.

## D1 — `GET /signal/keys/:userId` rendait des clés indécodables (sévérité CRITIQUE)

La colonne stocke du base64. `signalPreKeyBundleSchema` documente du base64 (« base64-encoded, 32
bytes »). iOS `E2EAPI.BackendPreKeyBundle` déclare `identityKey: String // Base64`. **Les trois
côtés du contrat sont d'accord.** Le handler, lui, décodait chaque champ en `Uint8Array` avant de
répondre.

Fastify sérialise un 200 **à travers** le schéma de réponse déclaré (fast-json-stringify). Un champ
typé `string` ne rejette pas une valeur non-string : il la **coerce** par `String(value)`. Et
`String(Uint8Array)` est la liste décimale des octets. Vérifié en exécutant le sérialiseur réel
(fast-json-stringify 7.0.1) :

```
DB stocke (base64) : YW4taWRlbnRpdHkta2V5LTMyLWJ5dGVzLWxvbmchISE=
sur le fil          : "97,110,45,105,100,101,110,116,105,116,121,…"
```

Chaîne complète, confirmée par lecture directe du client : iOS décode le champ **sans erreur** (une
`String` reste une `String`), puis `Data(base64Encoded:)` rencontre des virgules — hors alphabet
base64 — et rend `nil`. `E2ESessionManager.getOrCreateSession` lève `SessionError.invalidBase64Payload`
(ligne 175), le `catch` inscrit le pair dans `failedSessionAttempts` pour **600 s**, et le
`ConversationViewModel` envoie en clair (DEBUG) ou marque `encryption_failed` (release). Pour
**chaque pair, à chaque tentative.** Aucune session E2EE n'a jamais pu être dérivée.

**Pourquoi personne ne l'avait vu.** Le défaut n'est visible qu'à travers le sérialiseur, et le
fichier de tests voisin (`signal-protocol-routes.test.ts`) **mocke `@meeshy/shared/types/api-schemas`**
en remplaçant `getPreKeyBundleResponseSchema` par `{ type: 'object', additionalProperties: true }`.
Ce mock retire précisément l'étape qui abîme les données. Ses six tests sur cette route assertent
`statusCode` et `success` — jamais la forme d'un champ — et restaient verts pendant que le fil
portait des clés inutilisables. C'est le deuxième aveuglement structurel trouvé dans ce même fichier
en deux cycles (cycle 40 : ses doubles Prisma ne discriminaient pas sur le `where`).

**Correctif** : rendre la ligne telle qu'elle est stockée. Le `select` la restreignait déjà aux
onze champs du schéma — les parties privées (`identityKeyPrivate`, `signedPreKeyPrivate`) n'y sont
pas et n'y entrent pas. L'étape de décodage n'avait **aucun consommateur** à servir.

## D2 — `POST /signal/session/establish` détruisait une pré-clé qu'il ne distribuait à personne

La question du cycle 40, tranchée. La route mettait `preKeyId`/`preKeyPublic` à `null` chez le
destinataire. Or sa réponse ne porte **aucun matériel de clé** — seulement un message — et le
bundle qu'elle composait sur vingt lignes à partir de la ligne lue n'était **lu par personne**.

Ce n'est donc pas une consommation : c'est une destruction. Elle ne devient une consommation que
chez la route qui **distribue** — `GET /signal/keys/:userId`. Laissée en place, tout participant
actif pouvait retirer la pré-clé à usage unique de n'importe quel autre membre, au rythme du rate
limit, **sans rien recevoir en échange** ; et rien ne la reconstitue, les clients ne téléversant un
bundle qu'au front montant de l'authentification (`MeeshyApp.swift`, edge `isAuthenticated`
false→true). C'est l'épuisement de pré-clés que l'en-tête du fichier dit prévenir.

**Correctif** : retrait de l'écriture destructrice. Les deux gardes d'appartenance active du cycle
40 restent — la route garde un rôle réel, elle **autorise** une session, elle n'en établit pas.

## D3 — code mort

L'interface `PreKeyBundle` et ses deux constructions (une par route) disparaissent avec D1 et D2 :
plus aucun lecteur. Diff net **-85 / +62**, dont l'essentiel des ajouts est du commentaire.

## Ce que ce cycle retient de sa forme

Les cycles 37-40 cherchaient des **prédicats** absents dans des `where`. Ici le défaut n'est dans
aucune requête : il est dans la **frontière de sortie**, là où un schéma qu'on lit comme une
validation est en réalité une transformation. Un handler n'est pas typé contre son schéma de
réponse — TypeScript ne relie pas les deux — et le sérialiseur ne lève pas : il coerce. Entre les
deux, aucune alarme. Seul un test qui traverse le sérialiseur **réel** peut voir la sortie.

## Preuve

Nouveau `signal-prekey-bundle-wire-format.test.ts` — 6 tests, **5 rouges avant correctif**, qui
n'mocke délibérément PAS les schémas : le vrai `signalPreKeyBundleSchema` pilote le vrai
sérialiseur, et les assertions portent sur le corps parsé. La sortie d'échec imprimait littéralement
`"115,105,103,110,101,100,…"` là où le test attendait le base64 stocké, et l'appel
`{data: {preKeyId: null, preKeyPublic: null}}` de la destruction de pré-clé. Valeurs **distinctes
par champ** (une constante partagée laisserait passer un handler qui intervertit deux champs) et
prédicat `isDecodableBase64` qui reproduit ce que fait `Data(base64Encoded:)`.

Deux tests existants verrouillaient le défaut D2 (`signal-protocol-routes.test.ts`,
`signal-session-departed-member.test.ts`) : réécrits pour asserter l'absence d'écriture, en gardant
une preuve observable que le handler va au bout de ses gardes (`findUnique` appelé).

Clients vérifiés dans les quatre langages (leçon 88) : iOS est le seul client complet (GET puis
POST, dérivation **locale** à partir du seul `signedPreKeyPublic`) ; web n'appelle que `POST
/signal/keys`, et avec un corps vide (`{}`) que le schéma rejette en 400 — défaut distinct,
consigné ; Android et le SDK Swift n'ont aucun appelant. **Aucun client ne lit `preKeyId`/
`preKeyPublic`**, donc aucune capacité vivante n'est retirée par D2.

## Reste ouvert après ce cycle

- **La pré-clé à usage unique n'est toujours pas à usage unique.** `GET /signal/keys/:userId` la
  distribue autant de fois qu'on la demande. Le correctif juste — la réclamer atomiquement à la
  distribution — demande d'abord un **pool** de pré-clés (le schéma n'a qu'un seul emplacement,
  `preKeyId`/`preKeyPublic` scalaires) et un chemin de **réapprovisionnement** côté client. Réclamer
  l'unique emplacement au premier `GET` laisserait tous les pairs suivants sans pré-clé et rien pour
  la refaire : demi-correctif refusé, consigné entier.
- **`POST /signal/session/establish` n'établit toujours aucune session.** Elle autorise, et le dit
  maintenant dans ses logs et ses commentaires. La vraie établissement demande
  `@signalapp/libsignal-client` et un magasin de sessions côté serveur — et se heurte à une question
  d'architecture : dans un E2EE, l'état de session appartient au client, pas au serveur. Sa réponse
  annonce encore `E2EE session established successfully` : chaîne inchangée à dessein (aucun lecteur,
  contrat d'API stable), à revoir avec la question ci-dessus.
- **`POST /signal/keys` est inappelable depuis le web.** `encryption-settings.tsx:104` envoie `{}` ;
  le schéma de corps exige six propriétés — 400 avant le handler. Le bouton « Générer les clés » ne
  peut pas aboutir. Défaut réel, hors de la famille traitée ici (sortie de clés), non corrigé.
- **`registrationId` iOS déborde la borne documentée** : `getOrCreateStableId` tire dans 1…65535,
  `signalPreKeyBundleSchema` annonce `maximum: 16383` (14 bits, borne du Signal Protocol). Rien ne
  rejette : `generatePreKeyBundleRequestSchema` ne borne pas ce champ à l'entrée, et `maximum` dans
  un schéma de RÉPONSE n'est pas appliqué par le sérialiseur (vérifié — même raison que D1 : ce
  schéma transforme, il ne valide pas). Dérive de spécification, pas de panne. Non corrigé —
  demande une décision (élargir la borne documentée ou borner le client).
- **Le fichier de tests `signal-protocol-routes.test.ts` mocke encore les schémas** pour les autres
  routes. Deux aveuglements structurels y ont été trouvés en deux cycles ; le troisième viendra du
  même endroit.
- Reconduits du cycle 40 : doublons `Participant` en base non dénombrés ; « qui a le droit
  d'épingler ? » ; asymétrie édition/suppression (cycle 38b) et appartenance active de l'auteur
  (cycle 34) à arbitrer ensemble ; `attachments/metadata.ts:185` ; balayage `routes/calls.ts` (cinq
  jointures d'appartenance) sur la question du cycle 37 ; file d'attente de fan-out (cycle 32) ;
  fan-out `member_joined` sans borne (cycle 33b) ; `getVisibilityFilteredRecipients` /
  `filterPostConsumers` (cycle 32) ; `DELETE /admin/posts/:postId` (cycle 38) ; `@Display Name` ;
  `createStoryCommentNotificationsBatch` ; les deux scripts de réparation de base ; `eslint`
  inopérant sur le gateway (pas d'`eslint.config.js` depuis ESLint v9).

# Cycle 40 — Le prédicat manquant n'a pas de valeur juste : il en a deux, opposées

Tête prise dans le « reste ouvert » du cycle 39, qui reposait la question du cycle 37 pour la
quatrième fois : **quelles appartenances sont jointes sans `isActive` ?** Les cycles 37, 38b et 39
l'ont traitée comme une question à une seule réponse — ajouter le filtre. Ce cycle trouve la famille
où **ajouter le filtre est exactement le mauvais correctif sur deux sites sur trois.**

Un départ n'efface pas la ligne `Participant` : `POST …/leave` écrit `{ isActive: false, leftAt }`,
et `POST …/ban` écrit en plus `bannedAt`. Toute porte d'entrée d'une conversation hérite donc d'une
question que le schéma rend inévitable — *une ligne existe peut-être déjà, et son état dit ce qu'il
faut en faire.* **Les trois portes y répondaient différemment, et aucune ne la traitait.**

## Lot A — les trois portes d'entrée

| porte | recherche de l'existant | ce qu'obtenait un ancien membre | ce qu'obtenait un BANNI |
|---|---|---|---|
| `POST /conversations/join/:linkId` (lien de partage) | `{ conversationId, userId }` — **sans `isActive`** | « vous êtes déjà membre », 200, **jamais réintégré** | 200 « déjà membre » |
| `POST /conversations/:id/participants` (ajout par un admin) | `{ …, isActive: true }` puis **`create`** | une **SECONDE ligne** | une **ligne neuve et ACTIVE** |
| `POST /conversations/:id/invite` | `participants` inclus `where: { isActive: true }` puis **`create`** | une **SECONDE ligne** | une **ligne neuve et ACTIVE** |

Trois défauts distincts, produits par le même prédicat absent, **dans les deux directions
opposées** :

1. **Trop permissif — le bannissement s'évade par la porte d'à côté (sécurité).** Bannir écrit
   `isActive: false`. Les deux portes d'ajout ne cherchent que les lignes actives, ne trouvent donc
   pas le banni, et lui **créent une ligne neuve et active**. Le bannissement est défait sans passer
   par `POST …/unban` — qui exige le rang `admin` là où `POST …/participants` s'ouvre aussi aux
   `moderator`. **Un modérateur, qui n'a pas le droit de débannir, débannissait par un chemin qui ne
   s'appelle pas ainsi et n'écrit aucune trace.**
2. **Trop restrictif — on ne revient jamais (produit).** La porte du lien trouve la ligne inactive,
   en conclut « déjà membre » et répond 200 **sans rien écrire**. Le client navigue alors vers une
   conversation que `GET /conversations/:id/messages` refuse, puisqu'elle exige une appartenance
   ACTIVE (cycle 39, lot B). Aucun autre chemin ne réactive la ligne — `unban` seul le fait, et
   encore faut-il avoir été banni. **Quitter une conversation rejointe par lien était définitif**, et
   l'écran ne disait rien d'autre que « vous êtes déjà membre ».
3. **Lignes en double.** `Participant` ne porte **aucune contrainte d'unicité** sur
   `(conversationId, userId)` : le schéma ne rattrape rien. Deux lignes actives pour la même
   personne, c'est une identité d'expéditeur ambiguë (`findFirst` en choisit une au hasard), un
   fan-out doublé, des non-lus comptés deux fois et des réactions attribuées à un fantôme.

**Ce que ce cycle retient de sa forme.** Les cycles 37 à 39 ont appris à chercher le filtre absent.
Ici, « ajouter `isActive: true` » réparait la porte 1 **en aggravant** les portes 2 et 3 : le filtre
fait tomber l'ancien membre dans le `create`, donc dans la seconde ligne. Le prédicat manquant n'a
pas de valeur juste dans l'absolu — **elle dépend de ce qu'on fait ensuite de la ligne trouvée.**
C'est cette décision-là, et pas le filtre, qui devait exister à un seul endroit.

`resolveConversationEntry` (`services/conversations/conversationEntryAdmission.ts`) est cet endroit :
une lecture, quatre issues (`banned` / `already-member` / `rejoin` / `create`). Elle lit **toutes**
les lignes de la paire, pas la première — les deux portes d'ajout en ont produit des doubles avant
ce correctif, et un `findFirst` sur un jeu contenant une ligne bannie et une ligne active répondrait
selon l'ordre de Mongo. L'agrégat est conservateur (le bannissement l'emporte, puis l'appartenance
active) et réintègre la ligne la plus récente, ce qui **fait converger l'état sans script de
réparation**.

**Ce que la règle unifiée retient.** Union des intentions, jamais intersection — sauf sur le
bannissement, seule capacité retirée par ce cycle, et retirée dans le sens que `POST …/ban` énonce
explicitement. `joinedAt` est **conservé** à la réintégration : il ne date pas la ligne, il borne
l'historique visible quand le lien porte `allowViewHistory: false`, et le remettre à maintenant
retirerait à quelqu'un qui revient des messages qu'il avait déjà légitimement lus. `role` et
`permissions`, eux, repartent de ce que la porte donne à un nouvel arrivant : un ancien `admin` qui
revient par un lien PUBLIC ne récupère pas son rang dans une ligne périmée (leçon 89).

Clients vérifiés dans les quatre langages (leçon 88) : web `use-conversation-join.ts` /
`invite-user-modal.tsx`, SDK Swift `ShareLinkService.joinAuthenticated`, iOS, Android. La forme de
réponse d'une réintégration est **identique** à celle d'une jointure neuve — `JoinAuthenticatedResponse`
documente d'ailleurs cette idempotence — donc aucun décodeur ne bouge ; le 403 du banni emprunte le
même canal que le 410 du lien expiré, déjà traité partout.

## Lot B — établir une session E2EE depuis une conversation qu'on a quittée

`routes/signal-protocol.ts` annonce en en-tête qu'il protège contre le « key scraping » et
l'« épuisement des pré-clés ». `GET /signal/keys/:userId` tient la promesse : conversation partagée
où **les deux côtés** sont `isActive: true`, ou amitié acceptée.

Cent lignes plus bas, dans le **même fichier**, les deux gardes de `POST /signal/session/establish`
ne filtraient **ni l'une ni l'autre**. Et cette route n'est pas en lecture seule : elle **consomme la
pré-clé à usage unique du destinataire** (`preKeyId: null, preKeyPublic: null`).

Conséquence : un ancien membre — dont la ligne survit à `isActive: false`, et qui garde en cache
local l'identifiant de la conversation — **détruisait à volonté la pré-clé de n'importe quel membre
resté**. C'est l'épuisement de pré-clés que l'en-tête dit prévenir, atteint par la porte qui ne
vérifie pas ce que la porte voisine vérifie. Symétriquement, une session s'ouvrait vers un
destinataire parti, qui n'y lira jamais rien.

Le correctif est le `where` du jumeau, sur les deux côtés. iOS (`E2ESessionManager.getOrCreateSession`
→ `E2EAPI.establishSession`) est le seul appelant et appelle `fetchBundle` juste avant, sur la route
déjà filtrée : **aucune capacité vivante n'est retirée.**

## Preuve

**20 tests neufs, RED→GREEN, 14 rouges observés** avant correctif :
`conversation-rejoin-and-ban-evasion.test.ts` (14 tests, 9 rouges — dont le `create` appelé avec une
cible bannie, imprimé dans la sortie d'échec) et `signal-session-departed-member.test.ts` (6 tests,
5 rouges). Plus 13 tests d'unité sur `conversationEntryAdmission`.

Les doubles Prisma de ces deux fichiers **discriminent réellement** — sur `isActive` et `bannedAt` —
et c'est ce qui les rend capables de voir les défauts. Celui de `signal-protocol-routes.test.ts`
rend ses deux lignes **dans l'ordre d'appel, quel que soit le `where`** : il ne pouvait structurellement
pas mesurer le lot B, et son commentaire d'en-tête annonçait pourtant couvrir « user not a
participant → 403 ».

Un faux positif a été corrigé en cours de route : le premier harnais donnait à l'appelant des portes
d'ajout le rang `member`, si bien que le 403 de **rang** satisfaisait l'assertion qui mesurait le 403
de **bannissement**. Le test passait pour la mauvaise raison.

Suite gateway : **627/627 suites, 16 049 tests verts**, `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Les doublons `Participant` déjà en base ne sont pas comptés.** `resolveConversationEntry` les
  fait converger à la prochaine entrée, mais une paire dont les deux lignes sont ACTIVES reste
  ambiguë et personne ne sait combien il y en a. Un script de dénombrement (pas de réparation)
  demanderait un accès MongoDB — action humaine, comme les deux scripts déjà en attente.
- **`POST /signal/session/establish` n'établit aucune session.** Le `preKeyBundle` que la route
  compose sur vingt lignes n'est **lu par personne** : `signalService` est récupéré, testé non-nul,
  puis abandonné. Le seul effet observable de la route est de **détruire** la pré-clé du
  destinataire. Ce n'est pas un oubli à corriger d'un appel — la vraie établissement de session
  demande `@signalapp/libsignal-client` côté serveur et un magasin de sessions ; la route porte un
  `Note:` qui le dit. **Tête sérieuse du prochain cycle**, à instruire avant de toucher : soit on
  l'implémente, soit on cesse de consommer une pré-clé qu'on n'utilise pas.
- **Qui a le droit d'épingler ?** (cycle 39) — inchangé, toujours en attente d'une décision produit.
- **L'asymétrie édition/suppression sur l'appartenance du non-auteur** (cycle 38b) et
  **l'appartenance active de l'auteur** (cycle 34) attendent le même arbitrage, à trancher ensemble.
- **`attachments/metadata.ts:185`** lit toujours `registeredUser?.role` dans le jeton — vérifié ce
  cycle, non corrigé : c'est la suppression d'une pièce jointe par son déposant ou un admin GLOBAL,
  sans dimension de conversation, donc hors de la famille traitée ici.
- **Reste à balayer sur la question du cycle 37** : les **appels** (`routes/calls.ts`, cinq jointures
  d'appartenance). Les **réactions** ont été vérifiées ce cycle — `ReactionHandler` filtre déjà
  `isActive` sur ses deux chemins, et les lectures de `ReactionService` sont des enrichissements,
  pas des gardes. Le **partage de lien** est traité par le lot A.
- **La file d'attente de fan-out** (D1 du cycle 32) — neuvième report, même raison : aucun accès aux
  logs de production.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b).
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`DELETE /admin/posts/:postId` devrait déléguer à `PostService.deletePost`** (cycle 38).
- **`@Display Name` inextractible dans le domaine social** — quatorzième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`.
- **Les deux scripts de réparation de base** attendent un accès MongoDB — action humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis ESLint v9.
  Condition préexistante, non couverte par la CI — qui ne gate que sur `test:coverage`.

# Cycle 39 — Le cycle 38b a unifié qui peut supprimer. Personne n'avait vérifié QUOI on mute.

Tête prise dans le « reste ouvert » du cycle 38b, qui désignait l'épinglage comme candidat immédiat
à la question du cycle 37. Le candidat désigné (`routes/messages.ts:779-788`) n'était pas
l'épinglage mais la route `/history` — et l'enquête sur le geste d'épingler a rendu **autre chose,
et de plus grave** : les deux moitiés du geste ne mutent pas le même objet.

`PUT …/messages/:messageId/pin` **localise** le message dans la conversation avant d'écrire.
`DELETE …/messages/:messageId/pin` ne l'a jamais fait.

## Lot A — dépingler écrivait par identifiant seul

```ts
await prisma.message.update({ where: { id: messageId }, data: { pinnedAt: null, pinnedBy: null } });
```

Aucun `conversationId`. La seule chose vérifiée en amont est que l'appelant est membre actif de la
conversation **de la route** — jamais que le message en fait partie. Il suffit donc d'être membre
actif de N'IMPORTE QUELLE conversation pour dépingler le message de N'IMPORTE QUELLE autre, à
condition d'en connaître l'id. Ce n'est pas une hypothèse de laboratoire : **tout ancien membre
garde en cache local les identifiants de tous les messages qu'il a vus** avant de partir.

Trois défauts sortent de la même ligne :

1. **L'écriture croisée.** Une permission de conversation A produit une mutation dans la
   conversation B.
2. **La diffusion part au mauvais monde.** `message:unpinned` est émis vers
   `conversation:${conversationId}` — celui de la ROUTE. Les clients réellement concernés ne
   reçoivent rien : leur épingle reste affichée jusqu'au prochain chargement complet, sans qu'aucun
   événement ne les détrompe. Le rejeu hors ligne (`enqueueOfflineMessageMutation`) est enfilé sur
   la même mauvaise conversation.
3. **Un identifiant inconnu rendait 500.** Prisma lève P2025, le `catch` le traduit en
   `sendInternalError` — là où le jumeau qui épingle rend un 404 franc. Même geste, deux formes.

Le correctif est la garde du jumeau, mot pour mot, avant toute écriture. Ce que ce cycle retient de
sa forme : **tous les siblings du fichier la portaient déjà** — pin, `consume`, l'édition, la
suppression, toutes localisent le message par `{ id, conversationId }`. Le dépinglage était la seule
entrée du fichier à écrire par id seul. Un défaut n'a pas besoin d'être subtil pour survivre huit
cycles : il lui suffit d'être le seul membre d'une famille à ne pas faire ce que toute la famille
fait, dans une fonction assez courte pour qu'on la lise sans la comparer.

Clients vérifiés dans les quatre langages (leçon 88) : iOS `MessageService.unpin`
(`ConversationViewModel:3448`) et Android `MessageApi.unpin`. Aucun ne perd de capacité — le
`conversationId` qu'ils envoient est toujours celui du message.

## Lot B — quitter une conversation n'en fermait pas les accusés de lecture

Question du cycle 37, reposée telle quelle sur une autre famille : **quelles appartenances sont
jointes sans `isActive` ?** Un départ ne supprime pas la ligne `Participant`, il la passe à
`isActive: false`. Quatre gardes ne filtraient pas dessus :

| garde | ce qu'un ancien membre pouvait encore faire |
|---|---|
| `GET /messages/:messageId/status-details` | lire qui a lu / reçu un message |
| `GET /attachments/:attachmentId/status-details` | lire qui a écouté / vu une pièce jointe |
| `POST /attachments/:attachmentId/status` | **écrire** ses propres reçus d'écoute et de consultation |
| `GET /messages/:messageId/read-status` | lire le statut de lecture d'un message |

La troisième est celle qui se voit côté produit : un ancien membre **réapparaissait dans la liste
« qui a écouté »** que consultent les membres restants. Une conversation qu'on a quittée continuait
d'enregistrer notre passage.

Ce qui rend ces quatre-là instructives, c'est leur voisinage. Dans `routes/message-read-status.ts`,
**quatre gardes sur cinq** filtrent déjà `isActive: true` — la cinquième est la seule à ne pas le
faire, dans le même fichier, à quelques dizaines de lignes. Dans `routes/messages.ts`, deux sur cinq
filtraient. Ce n'est pas une règle absente du système : c'est une règle appliquée partout **sauf
ici**, ce qu'aucune revue de diff ne voit et qu'aucun test ne mesurait.

Aucune capacité vivante n'est retirée : `GET /conversations/:id/messages` exige déjà l'appartenance
active, donc un ancien membre ne peut plus charger ce dont il consultait les statuts.

## Lot C — la route `/history` retirée, pas réparée

Le cycle 38b la désignait comme « une copie de la forme *rôle de conversation OU rôle du jeton* ».
Elle en est bien une — la **quatrième**, divergente : rôles globaux lus dans le **jeton** et non en
base, appartenance jointe **sans `isActive`**. Mais la réparer aurait été soigner une façade.

`GET /messages/:messageId/history` promet l'historique des modifications d'un message. **Aucun
historique n'est stocké** : le schéma Prisma n'a ni modèle d'édition, ni `previousContent`, ni
`editHistory`. La route rendait `originalContent: message.content` — le contenu **courant**,
présenté sous le nom de l'original — avec un `TODO: implémenter un système d'historique` juste
au-dessus. Et aucun des quatre clients ne l'appelle (vérifié en TypeScript web, Swift SDK et app,
Kotlin).

Une route morte qui rend une donnée fausse sous un nom trompeur et porte une règle d'admission déjà
périmée : les trois raisons pointent dans la même direction. Retirée, avec ses tests. Le jour où
l'historique d'édition sera construit, il lui faudra un stockage et l'unité d'admission partagée —
pas une cinquième copie.

Retiré au passage : la jointure `participants` de `PUT /messages/:messageId`, devenue morte quand
`admitMessageEdit` a repris la décision au cycle 33. Plus rien ne lisait son résultat ; elle
continuait de coûter une jointure par édition, et de donner à lire une garde qui n'en était plus une.

## Preuve

15 tests neufs, RED→GREEN, **7 rouges observés** avant correctif :
`conversation-message-pin.test.ts` (7) et `departed-member-status-gates.test.ts` (8). Les doubles
Prisma de ces deux fichiers **discriminent réellement** — sur `conversationId` pour le premier, sur
`isActive` pour le second. Un mock qui rend la même ligne quel que soit le `where` aurait laissé
passer exactement les défauts mesurés ici ; c'est la précaution qui manquait aux harnais existants,
dont les mocks rendent une liste de participants constante (raison pour laquelle aucun d'eux n'a
jamais pu voir le Lot B).

Suite gateway : **622/622 suites, 15 970 tests verts**, `tsc --noEmit` propre, couverture lignes
**95,65 %**.

## Reste ouvert après ce cycle

- **Qui a le droit d'épingler ? Personne ne l'a jamais décidé.** Les deux routes n'exigent que
  l'appartenance active : **tout membre peut épingler et dépingler n'importe quel message**, y
  compris défaire l'épingle posée par un admin de conversation. C'est cohérent entre les deux
  moitiés du geste, donc ce n'est pas un défaut au sens de ce cycle — mais c'est le seul geste de
  conversation partagé qui n'a AUCUNE règle de rôle, là où WhatsApp et Telegram le réservent aux
  admins en groupe. `PostService.pinPost` exige l'auteur, ce qui donne au dépôt deux réponses pour
  un même verbe. **Tête sérieuse du prochain cycle si une décision produit est disponible** ; sinon
  la laisser ouverte plutôt que trancher à l'aveugle — même arbitrage que l'asymétrie
  édition/suppression du cycle 38b.
- **La question du cycle 37 n'est toujours pas épuisée** — troisième cycle consécutif où elle rend
  une famille entière. Restent à balayer, mêmes deux formes (rôle lu dans le jeton, appartenance
  jointe sans `isActive`) : les **réactions**, les **membres de conversation**, le **partage de
  lien** (`routes/conversations/sharing.ts`) et les **appels** (`routes/calls.ts` porte cinq
  jointures d'appartenance dont l'audit reste à faire).
- **`attachments/metadata.ts:185`** lit encore `registeredUser?.role` dans le jeton — dernier
  survivant connu de cette forme dans la famille message, non touché ici faute de l'avoir instruit.
- **L'asymétrie édition/suppression sur l'appartenance du non-auteur** (cycle 38b) et
  **l'appartenance active de l'auteur** (cycle 34) attendent toujours le même arbitrage produit, et
  devraient être tranchées ensemble.
- **`DELETE /admin/posts/:postId` devrait déléguer à `PostService.deletePost`** (cycle 38) : les
  `TrackingLink` d'un post retiré par la modération résolvent toujours, et aucune ligne
  `AdminAuditLog` n'est écrite.
- **La file d'attente de fan-out** (D1 du cycle 32) — huitième report, même raison : elle demande de
  savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b).
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — treizième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9. Condition préexistante, non couverte par la CI — qui ne gate que sur `test:coverage`.

# Cycle 38b — Deux sessions ont livré le cycle 38 en parallèle, sur la MÊME question

Le cycle 37 laissait une question précise : « quoi d'autre identifie l'acteur d'une mutation par une
propriété de l'objet muté plutôt que par le contexte d'authentification ? ». Deux sessions l'ont
reprise en parallèle et ont trouvé **deux défauts différents, tous les deux réels** :

- **Cycle 38 (ci-dessous)** — le miroir : un contexte d'authentification passé là où une propriété de
  l'objet est attendue, sur la diffusion du retrait d'un post.
- **Cycle 38b (ce bloc)** — le geste jumeau entier : `admitMessageEdit` avait un frère manquant, et
  les trois transports de SUPPRESSION portaient trois règles divergentes.

Les deux sont conservés intégralement : ils ne touchent aucun fichier source commun, et **aucune des
deux réponses ne contient l'autre**. La leçon d'intégration du cycle 23 s'applique — comparer défaut
par défaut, jamais « qui est arrivé en premier ». Ce qui est ajouté ici, au-delà des deux blocs :
la question du cycle 37 a rendu **deux** familles de défauts d'un coup, ce qui est en soi le signe
qu'elle n'est pas épuisée. Elle reste posée telle quelle pour le cycle 39.

## Cycle 38b — Les cycles 33/34 ont unifié QUI peut ÉDITER. Personne n'avait unifié qui peut SUPPRIMER.

Tête prise dans le « reste ouvert » du cycle 37, à la question qu'il posait mot pour mot : **quoi
d'autre identifie l'acteur d'une mutation par une propriété de l'objet muté plutôt que par le
contexte d'authentification ?** La réponse n'était pas un site isolé — c'est le geste jumeau tout
entier. `messageEditAdmission.ts` existe depuis le cycle 33 ; `messageDeleteAdmission.ts` n'existait
pas, et les **trois** transports de suppression portaient chacun leur copie de la règle. Les trois
avaient divergé.

## Ce que les trois copies répondaient

| entrée | client | auteur | rôle CONVERSATION | rôle GLOBAL | appartenance ACTIVE |
|---|---|---|---|---|---|
| socket `message:delete` | web (composer) | oui | **oui** | MODERATOR/ADMIN/BIGBOSS | non exigée |
| `DELETE /messages/:messageId` | **Android** (`MessageApi.kt:40`) | oui | **oui** | + **`CREATOR`** (mort) | **non filtrée — membre INACTIF admis** |
| `DELETE /conversations/:id/messages/:mid` | **iOS** (`MessageService.swift:138`) + web (`message.service.ts:75`) | oui | **NON** | MODERATOR/ADMIN/BIGBOSS | oui |

Les quatre clients ont été vérifiés dans les quatre langages (leçon 88). **Aucune entrée n'est
morte.**

## Lot A — un admin de conversation supprimait depuis Android et recevait 403 depuis son iPhone

La route conversation-scopée annonçait en commentaire « les modérateurs/admins/créateurs de **cette
conversation** » et lisait `membership.user.role` — le rôle **GLOBAL**. Un admin ou modérateur de
conversation (`Participant.role`, minuscules) qui n'est qu'un `USER` global n'y passait jamais.

Ce que ça donne pour un utilisateur : **la même personne, sur le même message, obtenait trois
réponses selon le client qu'elle tenait en main.** Le bouton « supprimer » fonctionnait dans le
composer web (socket) et sur Android, et échouait en 403 sur iPhone et dans la vue web — les deux
clients qui passent par cette route. Rien dans l'interface ne distingue les deux chemins : le geste
est le même, la personne est la même, le message est le même.

C'est exactement le patron de la **leçon 88b** — un commentaire qui affirme une règle que le code
n'applique pas. Celui-ci nommait même la bonne règle : il décrivait l'intention, pas le code, et
trois cycles ont relu la ligne en la croyant.

## Lot B — quitter une conversation n'y retirait pas le pouvoir de supprimer

`DELETE /messages/:messageId` — la route d'Android — joignait les participants avec
`where: { userId }` et **sans `isActive: true`**. Les deux autres transports filtrent. Une ligne
`Participant` laissée derrière par un départ conservait donc indéfiniment le rôle qu'elle portait :
un ancien admin, parti depuis des mois, supprimait toujours les messages de la conversation.

Défaut de sécurité au sens strict — une permission qui survit à la révocation du lien qui la
justifiait — et invisible : rien ne l'expose côté client, et aucun test ne l'avait mesuré.
# Cycle 24 — Le sixième écrivain : éditer par socket écrivait du texte brut là où REST créait un lien

Tête laissée par le cycle 23 :
« **`MessageHandler.handleMessageEdit` ne repasse toujours pas par le traitement des liens
`[[url]]` / `<url>`** que la route REST applique avant de sauver
(`trackingLinkService.processExplicitLinksInContent`). Éditer un message par socket pour y coller
un lien traçable écrit le texte brut ; par REST, le même geste crée le lien. Sixième asymétrie du
même handler, et la seule qui reste sur le contenu lui-même. »

Vérifié, et c'est bien le cas. Mais la prescription décrivait le symptôme, pas le bloc : en allant
lire ce que REST fait *vraiment* de ses liens, on trouve que l'obligation a **deux moitiés**, que
REST n'en tient qu'une, et que la seconde n'est tenue par **personne** à l'édition.

## Les deux moitiés

Un message porte deux choses différentes à propos de ses URLs, et le chemin de CRÉATION
(`MessageProcessor.saveMessage`) fait les deux :

| | Ce que ça fait | Où c'est rangé |
|---|---|---|
| **Liens explicites** | `[[url]]` / `<url>` → `m+<token>` : l'utilisateur a demandé le tracking par sa syntaxe | dans le **contenu**, réécrit |
| **URLs brutes** | mapping `url → token`, contenu INTACT : le client route le clic vers `/l/<token>` en gardant l'URL lisible et son aperçu vidéo | `metadata.trackingLinks` |

À l'édition, avant ce cycle :

| # | Défaut | Ce que l'utilisateur voyait |
|---|---|---|
| D1 | l'édition socket ne réécrivait AUCUN lien explicite | coller `[[https://…]]` par socket persistait les crochets en toutes lettres, définitivement ; le même geste par REST créait le lien |
| D2 | **ni REST ni socket** ne recomposait `metadata.trackingLinks` | une URL brute ajoutée par édition restait intraçable **pour toujours** — le même texte, envoyé tel quel, aurait été tracé |
| D3 | idem, à l'inverse | remplacer une URL laissait en base le token de celle que le texte ne contient plus, et le clic sur la nouvelle n'était jamais compté |
| D4 | l'édition socket retraduisait depuis le texte REÇU | (conséquence de D1) les traductions auraient décrit un texte que la base ne porte pas |
| D5 | l'algorithme de réécriture existait en **deux exemplaires** | `MessageProcessor.processLinksInContent` et `TrackingLinkService.processExplicitLinksInContent`, recopiés ligne pour ligne — protection markdown, réutilisation de token, repli sur l'URL nue, réparation des séquences `$` |

D5 explique D1 : il n'y avait pas d'endroit évident à appeler. Le chemin socket n'a pas « oublié »
un appel, il n'avait aucun appel à faire qui soit manifestement le bon.

## La forme du correctif — souder, puis dédupliquer

`reconcileEditedLinks` (`services/messaging/messageLinks.ts`) réunit les deux moitiés en un point
d'appel public unique, exactement comme `reconcileEditedMentions` du cycle 23 :

```ts
const { processedContent } = await linkService.processExplicitLinksInContent({ … });
const trackingLinks = await linkService.collectContentTrackingLinks({ content: processedContent, … });
return { processedContent, trackingLinks, reconciled: true };
```

**L'ordre n'est pas cosmétique** : le mapping des URLs brutes se calcule sur le contenu DÉJÀ
réécrit, sinon une URL qui vient de devenir `m+<token>` serait recollectée comme si elle était
encore brute et recevrait un second token.

Les deux appelants d'édition passent par là — la route REST (qui perd son bloc `try/catch` déplié)
et `MessageHandler.handleMessageEdit`. Et `MessageProcessor.processLinksInContent` délègue
désormais à `TrackingLinkService` : **il n'y a plus qu'une règle**, testée là où elle vit.

## `metadata` : établi vide ≠ rien établi (et c'est un blob PARTAGÉ)

Deux gardes distinctes, pour deux dangers distincts :

1. **`metadata` n'est réécrit que si `reconciled`.** Un `[]` venu d'une panne transitoire effacerait
   un mapping vivant — et un lien de tracking effacé ne revient jamais : personne ne relit le texte
   après coup, et le clic part alors vers l'URL d'origine sans jamais être compté. À l'inverse, un
   texte édité qui ne porte plus d'URL **doit** produire `metadata.trackingLinks` absent : c'est un
   vide ÉTABLI. Les deux cas sont testés séparément, des deux côtés.
2. **Fusion, jamais affectation.** `Message.metadata` porte aussi `postReplyTo` — un snapshot GELÉ
   du post cité, irrécupérable une fois la story expirée — et `location`. Écrire
   `{ trackingLinks }` par-dessus détruirait les deux. `mergeTrackingLinksIntoMetadata` lit, retire
   la clé, la repose si elle a un contenu, et rend `null` quand il ne reste plus rien à ranger.

Le **contenu**, lui, est persisté dans tous les cas : l'édition de l'utilisateur n'est pas
optionnelle, et une panne de tracking ne doit pas l'annuler. Sur échec, c'est le texte non réécrit.

## Lot C — le rôle `CREATOR`, qui n'existe pas

La même route testait `authRequest.authContext.registeredUser?.role === 'CREATOR'`. L'enum `UserRole`
contient `USER, ADMIN, MODERATOR, BIGBOSS, AUDIT, ANALYST, AGENT` — **pas `CREATOR`**. La branche ne
pouvait jamais être vraie. Elle ne causait aucun bug ; elle donnait à lire une permission
inexistante, ce qui suffit à égarer le prochain audit. (`CREATOR` existe bien dans le dépôt, comme
rôle de **communauté** — `MemberRole.CREATOR`. Deux espaces de nommage, un mot.)

Au passage, le rôle global se lit désormais en **base** et non dans le jeton : un rôle révoqué depuis
l'émission du jeton ne supprime plus. C'est ce que faisaient déjà le socket et
`admitMessageEdit`.

## Lot D — ce que l'unité rend, et pourquoi elle rend plus qu'un booléen

`admitMessageDelete` rend `{ admitted, actorParticipantId? }`. Le second champ n'est pas une
commodité : le cycle 37 a établi que la file de rejeu hors ligne doit exclure **l'acteur** dans les
deux monnaies d'identité, et le handler socket tirait ce `Participant.id` du `include` du message
qu'on vient de retirer. Sans le rendre, son appelant referait la lecture — ou, bien pire, retomberait
sur `message.senderId`, qui désigne l'**AUTEUR** dès qu'un modérateur supprime. C'est précisément le
défaut que le cycle 37 a fermé ; le rouvrir en refactorant aurait été le résultat le plus bête
possible de ce cycle.

Il est `undefined` pour l'auteur (son `Participant.id` **est** `message.senderId`, que l'appelant
tient déjà) et pour l'admin global non participant (aucune ligne à lire). Il n'est **jamais** rendu
avec un refus — un test le verrouille, pour que rien ne puisse l'employer sans avoir lu `admitted`.

## Ce que l'unification a coûté en lectures : moins que rien

Les trois transports joignaient les participants **sur tous les chemins**, y compris celui de
l'auteur — le cas de très loin le plus fréquent. L'unité ne lit rien pour l'auteur, une fois pour un
non-auteur membre (rôle de conversation ET rôle global dans la même ligne), deux fois pour un
non-auteur non membre. Les deux `include` correspondants ont été retirés des requêtes de message.

## Le choix de règle, et ce qu'il ne tranche pas

La règle unifiée est **l'UNION des trois intentions, jamais leur intersection** : les trois copies
voulaient admettre le rôle de conversation (deux le faisaient, la troisième l'annonçait), et deux
admettaient le rôle global sans appartenance. Unifier vers l'union ne retire donc **aucune capacité
vivante** — seuls le membre INACTIF et le `CREATOR` mort disparaissent, et ni l'un ni l'autre n'était
voulu. Aucun transport n'est narrowed sur un chemin que quelqu'un emprunte.

Ce que ce cycle **ne** tranche **pas**, et laisse explicitement à un arbitrage humain :
`admitMessageEdit` EXIGE une appartenance active du non-auteur, `admitMessageDelete` non. Un
`BIGBOSS` peut donc supprimer un message dans une conversation où il n'est pas, mais pas l'éditer.
Les deux positions se défendent — corriger le texte d'autrui à distance est plus intrusif que retirer
un contenu signalé — mais l'écart est réel et mérite une décision produit, pas un alignement
silencieux décidé par une routine. Aligner dans un sens ou dans l'autre est mécanique une fois la
décision prise : un `PRIVILEGED_GLOBAL_ROLES` partagé, deux unités jumelles, une garde à déplacer.

## Vérification

- **`PRIVILEGED_GLOBAL_ROLES` est désormais exporté et partagé** par les deux unités. Deux ensembles
  écrits séparément dériveraient — c'est la maladie même que ces deux fichiers soignent.
- **32 tests neufs, écrits AVANT l'implémentation, 6 rouges observés au niveau TRANSPORT** :
  - `messageDeleteAdmission.test.ts` (neuf, 26 cas) — RED complet (le module n'existait pas) : les
    trois branches d'admission, `isActive: true` vérifié sur la requête elle-même, le refus de
    `CREATOR`, le refus de `USER`/`AUDIT`/`ANALYST`/`AGENT`, l'auteur qui ne coûte aucune lecture,
    le message ANONYME dont personne n'est l'auteur, les cinq cas du `Participant.id` rendu, et
    quatre cas d'échec FERMÉ — dont « une lecture d'appartenance en échec n'ouvre pas la porte au
    rôle global », qui vérifie que la dégradation ne fabrique pas un second chemin.
  - `messages-extended.test.ts` — 5 cas sur la route d'**Android**, **3 rouges** : l'admin de
    conversation admis, la requête d'appartenance filtrée `isActive: true`, le `BIGBOSS` global.
  - `conversation-messages-advanced.test.ts` — 4 cas sur la route d'**iOS et du web**, **3 rouges** :
    l'admin de conversation, le modérateur de conversation, le `BIGBOSS` non participant.
  - Le test du cycle 37 (« l'AUTEUR hors ligne reçoit la suppression quand un admin modère ») est
    **conservé tel quel dans son assertion** et re-câblé sur la nouvelle lecture : c'est lui qui
    prouve que le refactor n'a pas rouvert le défaut qu'il gardait.
- **`tsc --noEmit` : 0 erreur** (après `prisma generate` + build de `packages/shared`, cf. CLAUDE.md).
- **Suite gateway complète : 618 suites, 15 950 tests, tout vert.** Couverture lignes **95,66 %**
  (inchangée), branches **89,03 %**. `messageDeleteAdmission.ts` : **100 % lignes, 100 % branches,
  100 % fonctions**. `messageEditAdmission.ts` reste à 100 %. `MessageHandler.ts` : 98,20 % lignes,
  96,10 % branches.
- **Deux fichiers de tests socket ont dû être re-câblés** (`MessageHandlerEditDelete.test.ts`,
  `MessageHandler.core.test.ts`) : ils injectaient l'appartenance dans le `include` du message. Leurs
  **assertions sont inchangées** — seule la source de la donnée bouge. C'est délibéré : un test dont
  on change l'assertion en même temps que le code ne prouve plus rien.

## Reste ouvert après ce cycle

- **L'asymétrie édition/suppression sur l'appartenance du non-auteur** (ci-dessus) — la seule
  question que ce cycle a ouverte et délibérément pas fermée. **Tête sérieuse du prochain cycle si
  une décision produit est disponible** ; sinon, la laisser ouverte plutôt que trancher à l'aveugle.
- **La question du cycle 37 reste partiellement ouverte** : elle a rendu un geste entier (la
  suppression), pas un site isolé. À reposer sur les autres familles de mutation — réactions,
  épinglage, membres de conversation — en cherchant les rôles lus dans le **jeton** plutôt qu'en base,
  et les appartenances jointes **sans `isActive`**. `routes/messages.ts:779-788` (l'épinglage) porte
  encore une copie de la forme « rôle de conversation OU rôle du jeton » qui n'a pas été touchée ici :
  candidat immédiat, même patron, même remède.
- **`admin/messages.ts` n'a AUCUNE route de suppression** — la modération globale passe forcément par
  les routes utilisateur. C'est ce qui rend le chemin « rôle global sans appartenance » nécessaire
  aujourd'hui, et c'est ce qu'il faudrait construire avant de pouvoir le retirer.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision (un auteur qui a quitté peut encore éditer ses messages par les quatre entrées). Elle est
  le miroir exact de l'asymétrie ci-dessus ; les deux devraient être tranchées ensemble.
- **La file d'attente de fan-out** (D1 du cycle 32) — septième report, même raison : elle demande de
  savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b).
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — douzième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9. Condition préexistante, non couverte par la CI — qui ne gate que sur `test:coverage`.

# Cycle 38 — Un retrait de contenu doit s'annoncer, et s'annoncer au bon monde.

Tête prise exactement où le cycle 37 la posait : « quoi d'autre identifie l'acteur d'une mutation par
une propriété de l'objet muté plutôt que par le contexte d'authentification ? ». La réponse est
arrivée en **miroir** — le défaut trouvé est l'exact inverse de celui cherché : ici c'est le
**contexte d'authentification qui était passé là où une propriété de l'objet est attendue**. Même
famille, même cause (acteur et cible ont longtemps coïncidé), sens opposé.

## Lot A — la suppression modérée s'annonçait au graphe social du MODÉRATEUR

`DELETE /posts/:postId` autorise « l'auteur, OU un modérateur et plus » (`PostService.deletePost`,
`canModerate`). Les trois diffusions de retrait reçoivent ensuite un `authorId` dont
`SocialEventsHandler` se sert pour **déplier un graphe social** (`getFriendIds` /
`getVisibilityFilteredRecipients`) et pour ajouter la feed room de cette personne aux destinataires.

La route y passait `authContext.registeredUser.id`.

| qui | ce qu'il devrait recevoir | ce qu'il recevait |
|---|---|---|
| l'auteur du post retiré | `post:deleted` | **rien** |
| ses amis, qui ont le post au fil | `post:deleted` | **rien** |
| les amis du modérateur | rien | `post:deleted` d'un post qu'ils n'ont pas |

Rien ne rejoue ces événements et aucun client ne refetch spontanément : le post restait **affiché
dans le fil de tous ses lecteurs, auteur compris**, jusqu'à un rafraîchissement manuel. Le retrait
était committé en base et invisible partout où il comptait. Seuls les spectateurs du détail étaient
épargnés, par `ROOMS.post(postId)` — qui, lui, ne dépend d'aucune identité.

**Le chemin voisin portait déjà la bonne lecture.** `DELETE /posts/:postId/comments/:commentId`
(`comments.ts`) relit `post.authorId` en base avant de diffuser, pour cette raison exacte. Troisième
cycle consécutif où le correctif existait à quelques fichiers de distance sans qu'aucun test ne le
relie à son jumeau (leçon 90).

## Lot B — la console d'administration ne s'annonçait à personne

`DELETE /admin/posts/:postId` écrit `deletedAt` **sans passer par `PostService.deletePost`**. La
route porte déjà un commentaire sur ce que ce raccourci a coûté une fois : les usages de sons,
jamais libérés, corrigés par un cycle précédent. Le même raccourci laissait tomber toute la
diffusion — `post:deleted` / `story:deleted` / `status:deleted` ne partaient **jamais** depuis
l'admin. Un post retiré par la modération restait vivant à l'écran de chacun.

La route ne sélectionnait d'ailleurs pas de quoi le faire : son `select` s'arrêtait à
`{ id, deletedAt, authorId }`, sans `type` (qui choisit l'événement) ni `visibility` /
`visibilityUserIds` (qui refiltrent l'audience d'un STATUS).

## Le seam — `broadcastPostRemoval`

Trois familles de contenu vivent dans la même table `Post` et voyagent sur trois événements
distincts, parce que les clients s'y abonnent séparément. **Choisir le bon est une règle, pas un
détail d'appel** — et elle n'a aucune raison d'exister en deux exemplaires quand les deux routes
retirent le même objet. `services/gateway/src/socketio/broadcastPostRemoval.ts` la porte une fois,
avec ses deux invariants écrits noir sur blanc (l'audience se déplie depuis l'AUTEUR ; la visibilité
accompagne le STATUS), et reste best-effort : le retrait est committé quand il s'exécute.

## Vérification

- **8 tests neufs, écrits AVANT l'implémentation, 6 rouges observés** :
  - Lot A — 3 rouges (`Received: …032` là où `…031` était attendu, sur POST / STORY / STATUS) et
    **1 vert délibéré** : l'auteur qui supprime lui-même. Sans ce témoin, les trois autres passeraient
    au vert avec n'importe quel identifiant : c'est lui qui prouve que le test mesure « l'auteur » et
    pas « une chaîne ».
  - Lot B — 3 rouges à `Number of calls: 0` (aucune diffusion n'existait) et 1 vert : une instance
    sans `socialEvents` décoré (serveur Socket.IO non monté) supprime sans broncher.
- **Un test existant asseyait l'ancien comportement** (`core-extended.test.ts`) — sa fixture rendait
  un document soft-deleté **sans `authorId`**, ce que Prisma ne fait jamais. Fixture rendue fidèle,
  assertion conservée.
- **Suite gateway complète : 619 suites, 15 921 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %** (inchangée), branches 89,03 %. `broadcastPostRemoval.ts` : 100 %
  lignes / 100 % branches. `routes/admin/posts.ts` : 99,11 %. `routes/posts/core.ts` : 95,18 %.
- Aucun changement de format sur le fil : le payload portait déjà `authorId`, il porte désormais le
  bon. Vérifié qu'aucun client ne le lit — iOS (`SocialSocketManager` → `payload.postId`), web
  (`data.postId` / `data.storyId`), Android (aucun modèle ne décode le champ).

## Reste ouvert après ce cycle

- **Tête sérieuse du prochain cycle — `DELETE /admin/posts/:postId` devrait déléguer à
  `PostService.deletePost`.** Ce cycle a fermé la 2ᵉ omission de ce raccourci ; il en reste **deux,
  vérifiées** : (1) les `TrackingLink` du post ne sont **pas désactivés** — les liens de partage d'un
  post retiré par la modération **continuent de résoudre** (`isLinkActive` ne regarde que
  `isActive`/`expiresAt`, jamais le `deletedAt` de la cible) ; (2) **aucune ligne `AdminAuditLog`**
  n'est écrite, là où `deletePost` en écrit une pour toute suppression non-auteur — la route se
  contente d'un `fastify.log.info`. Le blocage à lever d'abord : `deletePost` ne distingue pas
  « introuvable » de « déjà supprimé » (filtre `NOT_DELETED` → `null` dans les deux cas) alors que la
  route rend 404 vs 400, et construire `PostService` dans ce fichier fait construire `MediaService`
  au montage. Piste : garder le `findUnique` de pré-contrôle pour la sémantique HTTP, déléguer le
  retrait.
- **`PUT /posts/:postId` passe l'acteur là où l'auteur est attendu** (3 diffusions +
  `reconcilePostMentions`). **Ce n'est pas un défaut aujourd'hui** : `updatePost` lève `FORBIDDEN`
  pour tout non-auteur, décision produit explicite (« un modérateur ne peut PAS modifier un poste »).
  C'est une **coïncidence, pas une garantie** — exactement la configuration qui a produit le lot A et
  le lot A du cycle 37. À rendre inconditionnel le jour où cette règle bouge, pas avant : aucun test
  ne peut distinguer les deux tant que le service les fait coïncider.
- Le reste du backlog du cycle 37 est inchangé : appartenance active de l'auteur, file d'attente de
  fan-out (D1 du cycle 32, 7ᵉ report), borne de concurrence de `member_joined`,
  `getVisibilityFilteredRecipients` / `filterPostConsumers` qui ne se citent pas, `@Display Name`
  social, `createStoryCommentNotificationsBatch`, les deux scripts de réparation de base.
- **`eslint` ne peut toujours pas tourner sur le gateway** (pas d'`eslint.config.js` depuis ESLint
  v9). Condition préexistante ; la CI ne gate que sur `test:coverage`.

# Cycle 37 — Les cycles précédents ont unifié QUI peut éditer. Le reste du système croyait encore que l'éditeur est l'auteur.

Tête prise dans le « reste ouvert » du cycle 36, mais pas à l'endroit qu'il désignait : son candidat
— l'inventaire « quel client emploie quelle route » — **existe déjà**. Il a été écrit en tête de
`services/messaging/messageEditAdmission.ts` (section « QUI APPELLE QUOI », les quatre entrées avec
leur client et le fichier exact) par le cycle qui a écrit la leçon 88. Vérifier avant d'exécuter,
deuxième cycle consécutif où c'est le premier geste utile.

Reste alors la vraie question que les cycles 33 à 36 ont ouverte sans la refermer : **ils ont changé
qui peut éditer un message. Qu'est-ce qui, ailleurs, tenait encore l'ancienne réponse pour acquise ?**

## Lot A — la file de rejeu hors ligne excluait l'AUTEUR au lieu de l'ÉDITEUR

`enqueueForOfflineParticipants` exclut l'acteur : on ne rejoue pas à quelqu'un l'événement qu'il
vient de produire. Le handler socket `message:edit` — transport PRIMAIRE — désignait cet acteur par
`message.senderId`, le `Participant.id` de l'**auteur**.

Les deux coïncidaient tant qu'on ne pouvait éditer que ses propres messages. `admitMessageEdit`
(cycles 33/34) rend explicitement `asModerator: true` pour un éditeur non-auteur : depuis, la
personne exclue n'est plus l'acteur, c'est **la cible**.

| qui | ce qu'il devrait recevoir | ce qu'il recevait |
|---|---|---|
| l'auteur, hors ligne, dont on modère le message | l'édition, au rejeu | **rien, jamais** |
| le modérateur qui édite | rien | rien (exclu par sa présence, par accident) |

Le second n'était couvert que par le hasard : `connectedUsers.has(queueKey)` écarte tout participant
connecté, et un éditeur qui parle par socket l'est. L'exclusion par identité ne servait plus qu'à
écarter la seule personne qu'il fallait servir.

Ce que ça donne pour un lecteur : rien ne rejoue l'événement et aucun client ne refetch
spontanément. La copie locale de l'auteur garde donc le texte d'**avant** modération — c'est-à-dire
exactement le contenu que la modération retirait — pendant que toute la conversation lit le texte
corrigé. Divergence permanente entre deux clients d'une même conversation, invisible des deux côtés :
le modérateur voit son geste appliqué, l'auteur n'a aucune raison de douter de ce qu'il lit.

**Le jumeau portait déjà le correctif.** `handleMessageDelete`, quinze lignes plus bas dans le même
fichier, écrit noir sur blanc : « Skip the DELETER, not the author. A moderator/admin may delete
another user's message (`message.senderId` is the author's participant id, not the actor's) ». Le
raisonnement était disponible, formulé, à portée de regard — et il n'avait **aucun test**, donc rien
ne l'a jamais rapproché de son frère.

## Lot B — la cause : un paramètre nommé d'après une valeur, pas d'après un rôle

Le helper privé était positionnel, et son deuxième paramètre s'appelait `senderParticipantId`. Ce nom
ne décrit pas ce que la fonction en fait (exclure l'acteur) mais ce que l'appelant avait sous la
main (l'auteur du message). Un appelant qui cherche quoi passer trouve `message.senderId` et le
passe : le nom du paramètre **valide** le geste au lieu de le questionner.

Il devient un paramètre-objet nommé d'après le RÔLE — `actorParticipantId` / `actorUserId`, comme
l'unité partagée qu'il enveloppe et qui documente déjà les deux monnaies. Le chemin de suppression y
gagne `actorUserId` en plus de son `Participant.id` : l'admin GLOBAL qui n'est pas participant n'a
pas de ligne à charger (`participants[0]?.id` vaut `undefined`, donc n'exclut personne) mais a
toujours un `User.id`.

## Lot C — la docstring qui affirmait la règle d'avant

L'en-tête de `handleMessageEdit` annonçait encore « Permissions: only the message author can edit
their own message ». Depuis les cycles 33/34, c'est faux. C'est cette phrase qui rendait
`message.senderId` cohérent au relecteur : si seul l'auteur édite, alors l'auteur EST l'acteur, et le
code se lit juste. Corrigée pour renvoyer à `admitMessageEdit`.

## Vérification

- **3 tests neufs, écrits AVANT l'implémentation, 1 rouge observé** (les deux autres sont des
  verrous sur du comportement déjà correct) :
  - « queues the edit for the OFFLINE AUTHOR when a moderator edits their message » — **rouge :
    `Number of calls: 0`**, la file ne recevait rien du tout.
  - « never queues the edit back to the EDITOR, by identity rather than by presence » — l'acteur est
    retiré de `connectedUsers` exprès : sans cela le test ne distingue pas l'exclusion par identité
    de l'exclusion par présence, et passerait au vert quel que soit le correctif.
  - le jumeau côté suppression, qui verrouille enfin le correctif que ce chemin portait sans test.
- `makeHandler` accepte désormais un `deliveryQueue` — sans lui `enqueueForOfflineParticipants`
  retourne immédiatement, et **aucun** des trois tests ne pourrait rien mesurer.
- **Suite gateway complète : 616 suites, 15 896 tests, tout vert** (cycle 36 : 616 / 15 893 — les 3
  tests neufs, exactement). `tsc --noEmit` propre. Couverture lignes **95,66 %**, branches
  **89,05 %** — inchangée. `MessageHandler.ts` : 98,21 % lignes, 96,42 % branches.

## Reste ouvert après ce cycle

- **Le candidat du cycle 36 est clos** : l'inventaire des quatre transports vit en tête de
  `messageEditAdmission.ts`. Ne pas le réécrire ailleurs.
- **Piste ouverte par ce cycle** : les cycles 33/34 ont élargi QUI peut éditer. Le lot A est le
  premier endroit trouvé qui tenait encore l'ancienne réponse. La question à reposer telle quelle au
  prochain cycle : **quoi d'autre, dans le gateway, identifie l'acteur d'une mutation par une
  propriété de l'objet muté plutôt que par le contexte d'authentification ?** Chercher les
  `message.senderId`, `post.authorId`, `conversation.createdBy` passés là où un `userId` de requête
  est attendu.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision : un auteur qui a quitté une conversation peut encore éditer ses messages par les quatre
  entrées.
- **La file d'attente de fan-out** (D1 du cycle 32) — sixième report, même raison : elle demande de
  savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`invalidateCacheForMessage` n'a plus d'appelant hors de la classe** (cycle 35) — gardé public
  délibérément. À ne pas re-câbler depuis une route.
- **`@Display Name` inextractible dans le domaine social** — onzième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.

# Cycle 36 — Les cycles précédents ont unifié ce qu'une édition EXIGE, PRODUIT et PÉRIME. Pas ce qu'elle PUBLIE.

Tête prise à l'endroit que le cycle 35 désignait. La consigne qu'il laissait s'est avérée
**fausse**, et la vérifier avant de l'exécuter est le résultat le plus important de ce cycle.

## Lot 0 — la consigne du cycle 35 aurait cassé la file offline d'Android

Le cycle 35 concluait : « `PATCH /messages/:messageId` n'a toujours aucun appelant de production…
**Tête sérieuse du prochain cycle** : la retirer, elle et son service client. »

Il n'avait cherché l'appelant que côté **web**. Côté Android :

```
apps/android/sdk-core/.../outbox/OutboxFlushWorker.kt:161
    when (apiCall { messageApi.edit(row.targetId, body) }) {
apps/android/core/network/.../api/MessageApi.kt:34
    @PATCH("messages/{id}")
```

**C'est le chemin par lequel Android rejoue les éditions faites hors ligne.** La retirer aurait
transformé chaque flush d'édition offline en 404 — silencieusement, puisqu'un rejeu de file n'a pas
d'écran pour se plaindre. Le transport n'est pas mort : il est le seul que ce client emploie.

Ce que le cycle 35 avait vu est vrai pour une moitié seulement : **le client WEB** de cette route
était mort. C'est lui, et lui seul, qui est retiré (lot C).

La leçon tient en une ligne, écrite dans `lessons.md` : **« aucun appelant » ne se conclut pas d'une
recherche sur un seul client.** Ce dépôt en porte quatre — web, iOS, Android, SDK Swift — et
`grep` sur `.ts` n'en voit qu'un.

## Lot A — deux transports sur quatre publiaient la traduction du texte d'AVANT

Le cycle 35 a fermé cette fuite côté **cache mémoire** (`invalidateCacheForMessage`, désormais en
tête de la retraduction). Elle restait grande ouverte sur le chemin le plus visible : la **réponse
HTTP** et la charge **`message:edited`** diffusée à toute la conversation.
# Cycle 20 — L'accusé atteint enfin celui qui l'a produit : l'éventail de rooms laissait tomber tout participant sans compte

## Constat

Ce cycle a démarré sur le premier point ouvert du cycle 18 (l'accusé « remis » inatteignable
depuis les routes de lien) et l'a trouvé **déjà mergé sur `main` à mi-parcours**, produit en
parallèle par une autre exécution de la routine (`73fadd58`). Le travail dupliqué a été
abandonné. Ce qui suit est le **défaut résiduel** que la relecture de ce correctif a fait
apparaître, et qu'il ne pouvait pas voir depuis son propre périmètre.

## Diagnostic

### D1 — l'anonyme acquitte la remise et n'apprend jamais qu'elle a eu lieu

`73fadd58` a fait entrer le participant anonyme dans le filtre de présence
(`_presenceKey = userId ?? id`) et dans la lecture de préférences. Trois lignes plus bas, la
diffusion est restée inchangée :

```ts
for (const p of participants) {
  if (!p.userId) continue;          // ← l'anonyme qui vient d'acquitter est ici
  const userRoom = ROOMS.user(p.userId);
  ...
}
```

Le participant anonyme entre donc dans le NUMÉRATEUR de `getLatestMessageSummary` sans entrer
dans la diffusion qui l'annonce. Son test d'accompagnement fige la croyance :
`expect(roomTargets).not.toContain('user:<anonParticipantId>')`, commenté « l'acquitteur
anonyme n'a pas de room personnelle ».

### D2 — cette room existe, et le dépôt le dit à trois fichiers de distance

`AuthHandler._authenticateAnonymousUser` fait rejoindre `ROOMS.user(participant.id)` à toute
socket anonyme, sous un commentaire écrit en réparant ce défaut sur un autre canal :

> « La room personnelle DOIT utiliser `ROOMS.user(...)` — […] la seule room que TOUT émetteur
> d'événement personnel adresse (`io.to(ROOMS.user(participant.userId ?? participant.id))`).
> Joindre la room `socketUser.id` nue laissait la socket anonyme dans une room qu'aucun
> émetteur n'adresse, si bien que `conversation:unread-updated` n'atteignait jamais les
> participants anonymes. »

La room de conversation n'est pas un substitut : c'est la raison d'être du chaînage. Un client
parti sur la liste des conversations a quitté `conversation:<id>` et n'est joignable que par sa
room personnelle — donc le destinataire que l'éventail laissait tomber est exactement celui qui
ne regardait pas.

### D3 — trois copies verbatim, le même angle mort, deux qui ne lisent même pas l'identité de repli

| Site | Sélection | Éventail |
|---|---|---|
| `MessageHandler.autoDeliverToOnlineRecipients` | `{ id, userId }` | `if (!p.userId) continue` |
| `broadcastReadStatusUpdate` (`routes/message-read-status.ts`) | `{ userId }` | `if (!p.userId) continue` |
| diffusion d'accusé (`routes/conversations/messages.ts`) | `{ userId }` | `if (!p.userId) continue` |

Deux des trois ne chargent pas `Participant.id` : l'identité de repli n'est pas ignorée, elle
n'est pas lue. La forme correcte existait pourtant depuis le cycle 17 dans
`emitUnreadCountsToRecipients` (`ROOMS.user(recipient.userId ?? recipient.id)`), à un fichier
des trois copies fausses.

Conséquence produit, sur les trois chemins : un participant anonyme n'apprend ni qu'un pair a
lu, ni que la remise qu'il vient lui-même d'acquitter a eu lieu.

## Plan
- [x] T1 — RED : `emitToConversationParticipants` adresse un participant sans compte par son id
- [x] T2 — GREEN : `socketio/emitToConversationParticipants.ts` (chaînage, dédup, rooms rendues)
- [x] T3 — les trois copies convergent sur l'unité, les deux `select` chargent `id`
- [x] T4 — l'assertion négative de `MessageHandler.autoDeliver.test.ts` corrigée en positive
- [x] T5 — RED→GREEN sur les deux routes via leur API HTTP publique
- [x] T6 — gates : suite gateway complète + `tsc --noEmit`
- [x] T7 — changeset + CHANGELOG + lessons
- [x] T8 — PR, CI vert, merge sur main

Sur les deux routes REST d'édition, l'écriture du contenu ne vidait pas `translations`. Un **second**
`update`, placé dans le bloc de retraduction, s'en chargeait — mais **après** la lecture qui compose
la charge utile :

| transport | `translations: null` dans l'écriture du contenu | charge utile composée avant l'invalidation |
|---|---|---|
| socket `message:edit` (PRIMAIRE) | oui | non — payload construit en mémoire |
| `PATCH /messages/:messageId` (Android) | oui | non |
| `PUT /messages/:messageId` (iOS) | **non** | **oui** |
| `PUT /conversations/:id/messages/:messageId` (web) | **non** | **oui** |

Les deux transports fautifs sont exactement ceux des deux clients à écran. La ligne relue portait le
texte d'APRÈS et les traductions d'AVANT, et c'est cette paire qui partait vers tous les clients.

Ce que ça donne pour un lecteur : le **Prisme Linguistique** fait que la plupart ne voient QUE la
traduction. Un francophone dans une conversation anglaise recevait `message:edited` avec le nouveau
texte anglais **et** l'ancienne traduction française — et son client affichait l'ancienne, présentée
comme la traduction de la nouvelle. Jusqu'à ce que la retraduction asynchrone pousse la suivante :
une fenêtre courte en secondes, permanente en pratique, et parfaitement invisible pour l'éditeur,
qui lui voit l'original.

L'invalidation **appartient à l'écriture du contenu** : un nouveau texte périme ses traductions à
l'instant où il est écrit, pas trois `await` plus tard. Elle rejoint donc le `data` de l'écriture —
déjà gardée par `deletedAt: null` — et le second `update` disparaît. C'est la même forme de
correctif que le lot A du cycle 35 : la règle va là où le geste se produit, pas chez ses appelants.

Les commentaires des deux routes **affirmaient l'inverse de ce que le code faisait** (« la
retraduction qui précède a déjà invalidé `translations`, donc le payload reflète cet état : `[]` »).
Un commentaire qui décrit un ordre que le code n'a pas est ce qui a permis au défaut de survivre à
trois cycles de revue de ces mêmes routes. Corrigés tous les deux.

## Lot B — la retraduction passe par l'entrée publique du service

`retranslateMessageAsync` est l'entrée publique, et le handler socket l'emploie correctement. Les
deux routes REST atteignaient `_processRetranslationAsync` — la méthode privée qu'elle expose —
derrière un `as any`. Deux vocabulaires pour un même geste, dont un qui perce l'encapsulation et
coûte une assertion de type que `fastify.translationService` (typé `MessageTranslationService`) rend
inutile. Reste ouvert du cycle 35, fermé ici : deux `as any` en moins.

## Lot C — le client web mort de la route PATCH

`apps/web/services/messages.service.ts` retiré, avec son test. Le dépôt portait **deux** objets
exportés sous le nom `messagesService` : celui de `services/conversations/messages.service.ts`
(vivant — `markAsRead`, `getReadStatuses`, `getMessageStatusDetails`, importé par trois hooks) et
celui-ci, réexporté par le barrel `@/services` mais importé par son seul fichier de test. Un
développeur écrivant `import { messagesService } from '@/services'` obtenait silencieusement le
mort. Les types `Message`, `CreateMessageDto`, `UpdateMessageDto` qu'il exportait n'avaient eux non
plus aucun consommateur.
### Le travail perdu n'était pas le diagnostic

La collision a coûté le code, pas la lecture. Relire ce qui venait d'atterrir — plutôt que de
constater le doublon et refermer — a produit un défaut que le correctif jumeau ne pouvait pas
voir : son périmètre s'arrêtait au filtre de présence, et le trou était dans la diffusion trois
lignes plus bas. **Après une collision, comparer et publier la différence.**

### Une assertion négative protège le défaut

`not.toContain('user:<anon>')` n'échoue jamais tant que la croyance qu'elle encode reste fausse
dans le code. Elle ne verrouille donc pas un contrat, elle verrouille un état. Ici elle
affirmait l'inverse exact d'un `socket.join` documenté, et le commentaire qui la justifiait
citait la room de conversation comme substitut — ce qu'elle n'est précisément pas.

C'est la moitié correcte de la consigne du cycle 35 — celle qui ne touche aucun client vivant.

## Vérification

- **9 tests neufs, écrits AVANT l'implémentation, 9 rouges observés** :
  - `message-edit-stale-translation.test.ts` (neuf) — 6 cas sur `PUT /messages/:messageId` : la
    réponse HTTP sans traduction périmée, la charge `message:edited` sans traduction périmée,
    l'invalidation dans l'écriture du contenu sous la garde `deletedAt`, l'absence de fenêtre à
    l'instant de la relecture, l'absence de seconde écriture, et l'appel à `retranslateMessageAsync`.
  - `conversation-messages-advanced.test.ts` — 3 cas sur `PUT /conversations/:id/messages/:messageId`.
  - Les deux harnais emploient un **fake Prisma STATEFUL** (les écritures mutent la ligne, les
    lectures la rendent) : le défaut est un problème d'**ordre** entre écritures et lecture, qu'un
    mock à valeur fixe ne peut pas exprimer — il rendrait la même valeur avant et après le
    correctif, donc passerait au vert sans rien prouver. `transformTranslationsToArray` est laissé
    **non mocké** dans le fichier neuf, pour la même raison : un mock rendant `[]` masque exactement
    ce qu'on mesure.
- **Suite gateway complète : 616 suites, 15 893 tests, tout vert** (cycle 35 : 615 / 15 884).
  `tsc --noEmit` propre. Couverture lignes **95,66 %**, branches **89,05 %** — inchangée.

## Reste ouvert après ce cycle

- **`invalidateCacheForMessage` n'a plus d'appelant hors de la classe** (cycle 35) — gardé public
  délibérément. À ne pas re-câbler depuis une route.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision : un auteur qui a quitté une conversation peut encore éditer ses messages par les quatre
  entrées.
- **La file d'attente de fan-out** (D1 du cycle 32) — cinquième report, même raison : elle demande
  de savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — dixième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.
- **Piste ouverte par le lot 0** : les quatre transports d'édition existent parce que quatre clients
  ont chacun choisi le leur. Aucun inventaire ne dit quel client emploie quelle route. Un tel
  inventaire — même un simple tableau en tête de `messages-advanced.ts` — aurait évité l'erreur du
  cycle 35, et évitera la prochaine. Candidat pour le cycle 37.

# Cycle 36b — Addendum d'une session parallèle : ce que l'édition ÉCRIT, et le module qu'on ne peut pas prouver

Deux sessions ont livré leur cycle 36 en parallèle. **Les deux ont trouvé indépendamment le même
fait Android** (lot 0 ci-dessous / leçon 88) : `PATCH /messages/:messageId` porte la lane
`EDIT_MESSAGE` de la file offline d'Android et ne doit pas être retirée. La convergence vaut
confirmation ; le récit du lot 0 de la session ci-dessus est gardé, celui de cette session est retiré
au profit du sien.

Les deux têtes n'ont **aucune intersection de défaut** : l'une porte sur ce que l'édition **PUBLIE**
(traductions périmées dans la réponse HTTP et la charge `message:edited`), l'autre sur ce qu'elle a
le droit d'**ÉCRIRE**. Le seul recouvrement est le nettoyage `_processRetranslationAsync` →
`retranslateMessageAsync`, que les deux sessions ont fait au même endroit et à l'identique — fusionné
en gardant les commentaires de la session ci-dessus. (Leçon d'intégration du cycle 23 : comparer
défaut par défaut, jamais « qui est arrivé en premier ».)

## Lot A — le quatrième transport laissait une édition VIDER un message

`admitEditedContent` (`services/messaging/messageEditContent.ts`), jumeau de `admitMessageEdit` :
celui-ci dit QUI peut éditer, le neuf dit ce que l'édition a le droit d'**écrire**. La règle est
courte — un message ne peut pas devenir vide, à moins qu'une pièce jointe ne le porte à elle seule
(retrait de légende) — et elle vivait recopiée à trois endroits sur quatre transports. Le quatrième,
celui d'Android, ne la portait pas du tout :

| entrée                                     | garde de vacuité | vide + pièce jointe |
|--------------------------------------------|------------------|---------------------|
| socket `message:edit` (PRIMAIRE)           | oui              | admis               |
| `PUT /conversations/:id/messages/:mid`     | oui              | admis               |
| `PUT /messages/:messageId` (iOS)           | oui              | admis               |
| **`PATCH /messages/:messageId` (ANDROID)** | **aucune**       | **refusé**          |

Sa seule protection était le `minLength: 1` de son schéma JSON, **et il se trompait dans les deux
sens à la fois** :

- **trois espaces le satisfont.** Le `.trim()` de la ligne suivante les réduisait à la chaîne vide,
  et la ligne partait en base avec `content: ""`. C'est un `update`, pas un patch partiel : le texte
  d'origine était déjà écrasé, et un `message:edited` **vide** s'en allait vers tous les clients de
  la conversation. La sortie RED du test le montre littéralement —
  `data: {"content": "", "isEdited": true, "translations": null}`.
- **il refusait en même temps la chaîne vide LÉGITIME**, celle qui retire la légende d'un message à
  pièce jointe, que les trois autres transports acceptent : un utilisateur Android ne pouvait pas
  effacer une légende.

Une garde qui compte les caractères **bruts** ne décide jamais de ce qu'elle croit décider : c'est le
contenu **après `trim`** qui part en base, et c'est donc lui, et lui seul, que la règle doit regarder.

L'unité rend le contenu à écrire **en même temps que** le verdict. C'est délibéré, et c'est ce qui
empêche la divergence de repousser : le `.trim()` recopié chez chaque appelant est exactement
l'endroit où le transport iOS avait déjà jeté un `TypeError` sur un `content` absent (traduit en 500
par le catch). Un appelant qui obtient son texte de l'unité ne peut plus diverger d'elle. Les trois
`.trim()` d'appelant et les deux formulations différentes du même refus disparaissent avec.

Le schéma JSON du PATCH ne garde que le plafond (`maxLength: 10000`, parité avec
`EditMessageBodySchema`) : un schéma de corps ne peut pas connaître les pièces jointes. La route les
lit désormais (`attachments: { select: { id: true } }`) — sans elles, la garde ne peut pas trancher.

## Vérification

- **21 tests neufs**, écrits AVANT l'implémentation, **RED observé sur les deux niveaux** : les tests
  d'unité échouent à la résolution du module quand l'implémentation est retirée ; les tests de route
  montrent l'écriture fautive (`prisma.message.update` appelé avec `content: ""`).
- `messageEditContent.test.ts` — 12 cas : refus du vide / des espaces seuls / des blancs non-espace
  (tabulation, saut de ligne) / d'un `content` absent ou `null` sans pièce jointe ; admission des
  mêmes AVEC pièces jointes ; bords retirés, blancs intérieurs préservés.
- `conversation-messages-advanced.test.ts` — 5 cas sur le PATCH, dont celui qui compte : les espaces
  seuls refusés **et le message épargné** (`update` jamais appelé).

## Reste ouvert propre à cette session

- **ANDROID — la file d'attente hors ligne retente ce que le serveur n'acceptera JAMAIS, et bloque
  la file pendant qu'elle le fait.** Défaut le plus grave trouvé ce cycle ; **non corrigé, faute de
  pouvoir le prouver** (leçon 88c). **Tête du prochain cycle qui disposera d'un toolchain Android.**
  - `SendResult` documente le contrat, `ARCHITECTURE.md §5` l'exige (« transient-vs-permanent
    classification, 404-as-success »), `ApiError` porte `httpStatus` — et **quatorze des quinze
    senders l'ignorent**, écrasant tout échec en `TransientFailure`. Seul `SEND_FRIEND_REQUEST`
    classe correctement, via `FriendRequestSend.classify` : le patron existe déjà, appliqué à une
    lane sur quinze.
  - `OutboxDrainer` est en **FIFO strict** et une `TransientFailure` **arrête la lane**. Un 403
    définitif (fenêtre de 24 h dépassée, auteur retiré de la conversation) bloque donc tous les
    messages suivants de cette conversation pendant `MAX_ATTEMPTS = 5` tentatives, backoff
    exponentiel WorkManager depuis 10 s — de l'ordre de **cinq minutes** de blocage de tête de file
    pour une erreur qui ne guérira pas.
  - À l'épuisement, `onExhausted` n'a **aucun cas** pour `EDIT_MESSAGE` / `DELETE_MESSAGE`
    (`else -> Unit`), alors que `editOptimistic` a déjà peint l'édition dans le cache local :
    l'appareil montre le texte édité **pour toujours**, le serveur n'a jamais rien appliqué, personne
    d'autre ne le voit. Divergence locale silencieuse et définitive.
  - Correctif esquissé : un classificateur pur partagé (`OutboxDelivery.classify`) sur le patron de
    `FriendRequestSend` — permanents `{400, 403, 404, 422}`, 404 → `Success` pour les suppressions
    idempotentes, tout le reste transitoire (garder 401/409/429 transitoires est délibéré : un blip
    d'authentification ou un rate-limit ne doit pas jeter la file) — appliqué aux quatorze sites,
    plus un `onExhausted` qui re-hydrate la conversation pour EDIT/DELETE.
- **Aucun toolchain Android n'est disponible depuis cette routine, et aucune CI ne couvre Android.**
  `dl.google.com` est refusé par la politique réseau de l'environnement (403 sur CONNECT) : ni le SDK
  Android ni le dépôt Maven Google ne sont atteignables, `:sdk-core:test` ne peut pas tourner. Et
  `.github/workflows/` ne contient **aucun** job Gradle. **Deux actions humaines distinctes :**
  (a) ajouter un job CI Android — sans quoi ce module restera hors de portée de cette routine
  indéfiniment, et c'est la condition qui débloque tout le reste ouvert Android ci-dessus ;
  (b) corriger le défaut depuis une machine outillée.
- **L'inventaire « quel client emploie quelle route »**, que la session ci-dessus propose pour le
  cycle 37, est appuyé par cette session : les deux ont dû le reconstruire à la main, chacune de son
  côté, pour la même route.
- **`Test Python (translator)` se fige au teardown et heurte le plafond de 30 min — flake
  préexistant, observé sur ce cycle.** La suite atteint **99 % des tests, tous PASSED, en 8 min 40**
  — soit exactement le temps du même job sur main (#9012 : 8 min 30) — puis reste bloquée 21 minutes
  de plus sans produire une ligne. Ce n'est donc pas un échec d'assertion ni une lenteur : c'est un
  **gel après la fin effective de la session**. La dernière ligne du journal avant le silence est
  `RuntimeWarning: coroutine 'AsyncMockMixin._execute_mock_call' was never awaited` — une coroutine
  d'`AsyncMock` jamais attendue, qui survit à la session et empêche pytest de rendre la main ; le
  runner finit par tuer `uv` et `pytest` en processus orphelins. Piste : chercher les `AsyncMock`
  dont le retour n'est pas `await`é (ou les `MagicMock` employés là où un `AsyncMock` est attendu) et
  ajouter une fermeture explicite de boucle au teardown. **Sans accès à un rerun de job** (l'API
  refuse `rerun_failed_jobs` et `cancel_workflow_run` à cette intégration), la seule relance possible
  depuis cette routine est un commit vide — coûteux et bruyant. Deux actions humaines : corriger le
  mock fautif, et ouvrir les droits de rerun à l'intégration.

---

# Cycle 35 — Les cycles précédents ont unifié ce qu'une édition EXIGE et ce qu'elle PRODUIT. Pas ce qu'elle PÉRIME.

Tête prise dans le « reste ouvert » du cycle 34, à l'endroit qu'il désignait — la divergence
restante « sur ce que l'édition ÉCRIT » entre les quatre transports. En allant la mesurer, elle
s'est avérée être la moins grave des trois choses qui se tenaient là.

Les quatre entrées d'édition sont, depuis les cycles 33/34 : le handler socket `message:edit`
(transport PRIMAIRE), `PUT /conversations/:id/messages/:messageId` (la vue d'édition web, qui porte
un sélecteur de langue), `PUT /messages/:messageId` (le client iOS) et `PATCH /messages/:messageId`
(sans appelant de production — voir le reste ouvert).

## Lot A — la traduction du texte d'AVANT survivait à l'édition, sur trois transports sur quatre

`translationCache` est un LRU de 1000 entrées **sans TTL**, servi **avant** la base par
`getTranslation` (ligne 3022) et par `_processTranslationsAsync` (ligne 510). Une édition invalide
`Message.translations` en base ; l'entrée mémoire, elle, survivait. Un lecteur recevait donc la
traduction du texte d'avant pour le texte d'après — jusqu'à l'éviction LRU, c'est-à-dire au bout de
mille autres messages traduits, donc potentiellement jamais sur une instance calme.

La purge existait — `invalidateCacheForMessage`, ajoutée par un cycle antérieur — et elle était
câblée à **un seul** des quatre transports :

| transport | `translations: null` en base | purge du cache mémoire |
|---|---|---|
| socket `message:edit` (PRIMAIRE) | oui | **non** |
| `PUT /messages/:messageId` (iOS) | oui | **non** |
| `PATCH /messages/:messageId` | oui | **non** |
| `PUT /conversations/:id/messages/:messageId` | oui | oui |

La cause tient dans la docstring de la méthode : « **must be called before** triggering a
re-translation ». Une obligation adressée aux appelants est une obligation que le quatrième
appelant oubliera — c'est le même patron que les cycles 33b et 34 ont fermé sur le mute et sur
l'admission, à ceci près qu'ici la consigne était écrite noir sur blanc et que trois appelants sur
quatre ne l'ont jamais lue.

La purge appartient à la **retraduction**, pas à ses appelants : « retraduire » signifie exactement
que l'ancien résultat ne vaut plus. Elle est donc en tête de `_processRetranslationAsync`, **avant
tout `await` et avant tout court-circuit** — un contenu vidé ou un message introuvable ne relance
aucune traduction mais périme l'ancienne exactement pareil, et rien ne repasserait l'effacer. La
purge explicite de la route est retirée dans le même mouvement : la garder ferait repartir la règle
à deux exemplaires.

Le test qui compte n'est pas « la purge a été appelée » mais celui écrit côté **LECTURE** :
après une retraduction, `getTranslation` ne rend plus le texte d'avant.

## Lot B — omettre la langue réétiquetait le message en français

`originalLanguage` est **optionnel** dans `EditMessageBodySchema`. La route le déstructurait avec un
défaut `= 'fr'` et le re-persistait **inconditionnellement**. Une édition qui ne revendiquait aucune
langue écrivait donc `originalLanguage: 'fr'` sur un message anglais — **et** relançait la
retraduction en annonçant « fr » comme langue source, ce qui produit du charabia dans toutes les
langues cibles de la conversation.

Le champ n'est pas décoratif sur cette route : c'est la seule des quatre servie par une vue qui
porte un sélecteur de langue (`EditMessageView`, `selectedLanguage`). Le défaut n'est donc pas
« écrire la colonne », c'est **écrire une valeur que personne n'a revendiquée**. Omettre veut dire
« je n'affirme rien sur la langue », pas « c'est du français ». La colonne n'est plus touchée quand
le corps est muet ; la retraduction repart de la valeur stockée. Le comportement quand le corps la
déclare — canonicalisation `fr-FR` → `fr`, codes irréductibles verbatim — est inchangé, et ses deux
tests préexistants le verrouillent toujours.

## Lot C — la dernière écriture d'édition sans garde de concurrence

`prisma.message.update({ where: { id } })` réussit quel que soit `deletedAt`. Une suppression
concurrente entre la lecture (qui, elle, filtre `deletedAt: null`) et l'écriture faisait
**ressusciter** la ligne avec un contenu neuf, et `message:edited` partait vers des clients qui
l'avaient déjà retirée. Les trois autres transports portaient déjà la garde ; celle-ci était la
dernière sans. Elle prend la même, et le `P2025` que Prisma lève alors devient un **404** — pas un
500, qui ferait retenter un client qui n'a rien à retenter — exactement comme sur le sibling
`PATCH /messages/:messageId`, dont la traduction d'erreur est reprise telle quelle.

## Nettoyage

`logger.info('===== ENTERED TRY BLOCK FOR MENTIONS =====')` tournait à chaque édition, au niveau
INFO, sur le bloc de **retraduction** — pas sur celui des mentions. Retiré.

## Vérification

- **9 tests neufs**, écrits AVANT l'implémentation, **9 rouges observés** :
  - `MessageTranslationService.branches.test.ts` — 5 cas : la purge déclenchée par
    `retranslateMessageAsync` lui-même, l'isolement aux autres messages, la purge malgré le
    court-circuit sur contenu vide, la purge malgré un message introuvable (le `catch` de l'unité
    avale — la purge doit donc précéder la lecture), et la conséquence exprimée côté LECTURE.
  - `conversation-messages-advanced.test.ts` — 4 cas : la colonne laissée intacte quand le corps
    l'omet, la retraduction repartant de la langue stockée, la garde `deletedAt: null` sur
    l'écriture, le 404 plutôt que le 500 quand elle mord.
- **Suite gateway complète : 615 suites, 15 884 tests, tout vert.** `tsc --noEmit` propre.
  Couverture globale lignes **95,66 %**, branches 89,05 %.

## Reste ouvert après ce cycle

- **`invalidateCacheForMessage` n'a plus d'appelant hors de la classe.** Gardé public
  délibérément : c'est une capacité légitime du service, et sa docstring dit désormais l'inverse de
  ce qu'elle disait — la retraduction l'appelle elle-même, ce n'est pas une consigne aux appelants.
  À ne pas re-câbler depuis une route.
- ~~**`PATCH /messages/:messageId` n'a toujours aucun appelant de production** … **Tête sérieuse du
  prochain cycle** : la retirer, elle et son service client.~~ **❌ CONSIGNE ERRONÉE — NE PAS
  EXÉCUTER. Corrigée au cycle 36 (voir plus bas).** Le cycle 35 n'avait cherché l'appelant que
  côté **web**. `apps/android/sdk-core/.../outbox/OutboxFlushWorker.kt:161` appelle
  `messageApi.edit(...)` → `@PATCH("messages/{id}")`
  (`apps/android/core/network/.../api/MessageApi.kt:34`) : **cette route est le chemin par lequel
  Android rejoue les éditions faites hors ligne.** La retirer aurait cassé silencieusement la file
  d'attente offline d'Android — l'édition serait partie en 404 au flush, sans écran pour le dire.
  Seul le **client web** de cette route était mort, et c'est lui qui a été retiré au cycle 36.
- ~~**`_processRetranslationAsync` est appelé via `(translationService as any)` par les deux routes
  REST**~~ — **fait au cycle 36.** Les deux routes emploient désormais `retranslateMessageAsync`.
- **`appartenance active de l'auteur`** — la question produit du cycle 34 attend toujours une
  décision : un auteur qui a quitté une conversation peut encore éditer ses messages par les quatre
  entrées.
- **La file d'attente de fan-out** (D1 du cycle 32) — quatrième report, même raison : elle demande
  de savoir ce que la troncature mesure en production, et cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — neuvième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26). Même classe de défaut que le lot B de ce cycle — un défaut de valeur là où l'absence
  aurait dû ne rien affirmer — et il reste ouvert.
- **Les deux scripts de réparation de base** (`repair-mention-user-ids.ts`,
  `repair-tracking-link-created-by.ts`) attendent une exécution avec accès MongoDB — action humaine.
  S'y ajoute désormais un troisième candidat : les `Message.originalLanguage` déjà réétiquetés en
  `'fr'` par le lot B avant ce correctif restent faux en base. Non réparable automatiquement — rien
  ne distingue un « fr » écrit par le défaut d'un « fr » légitime.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.

---

# Cycle 34b — La sourdine échouait FERMÉ, et un éventail tombé emportait ses deux frères

Numéroté **34b** : une session parallèle a livré son cycle 34 pendant celui-ci (« ce qu'une édition
EXIGE », ci-dessous). Les deux têtes n'ont AUCUNE intersection — l'une unifie les quatre tests
d'admission à l'édition d'un message, l'autre porte sur le repli des préférences de notification et
l'isolement des trois éventails — et aucun fichier n'est touché par les deux. Rien à arbitrer défaut
par défaut cette fois (leçon d'intégration du cycle 23, reprise aux 25b, 32b, 33b et 34) : les deux
tiennent ensemble, fusionnés à la main et revalidés sur la suite complète. Là où les deux « reste
ouvert » citent le même point (file de fan-out, `getVisibilityFilteredRecipients`, `@Display Name`,
eslint), c'est le même report, pas deux.

Tête annoncée par le « Reste ouvert » du cycle 33b, prise sans arbitrage : `filterMutedRecipients`
échouait fermé alors que tout son voisinage échoue ouvert et le dit. En remontant ses appelants pour
mesurer la portée, le défaut s'est avéré n'être que la moitié visible d'un second, plus grave, à
l'étage au-dessus — celui-là jamais nommé par aucun cycle.

## Lot A — une préférence de confort illisible faisait taire une obligation de livraison

`filterMutedRecipients` lit `UserConversationPreferences.isMuted` pour décider qui, dans une
audience, ne veut pas être dérangé. Il n'avait **aucun `try`**. Une lecture en échec — un incident
Mongo transitoire suffit — remontait telle quelle jusqu'au `.catch` de l'appelant, qui journalisait
et laissait tomber la notification.

Le voisinage immédiat a déjà tranché la même question, trois fois, dans l'autre sens, et l'écrit
noir sur blanc :

| unité | comportement en cas d'échec de lecture | commentaire dans le code |
|---|---|---|
| `loadNotificationPrefs` | notification créée | « fail open » |
| `_loadReadReceiptOptOuts` | tout le monde reste visible | « repli ouvert » |
| `PrivacyPreferencesService.fetchFromDatabase` | idem | cité par le précédent |
| **`filterMutedRecipients`** | **notification perdue** | **—** |

L'arbitrage n'est pas symétrique. Le mute est une préférence de **confort** ; la notification est une
obligation de **livraison**. Quand on ne sait plus laquelle des deux s'applique, un ping de trop se
pardonne — un message jamais annoncé, non. Et il ne se joue pas à l'unité : depuis le cycle 33b cette
porte garde **cinq familles** (`message_reaction`, `message_reply`, `member_joined`,
`member_removed`, `member_left`) plus l'éventail d'arrivée entier. Un hoquet de lecture les taisait
donc toutes, d'un coup, pour tout le monde — et le cycle 33b, en faisant passer trois familles de
plus par cette porte, avait élargi le rayon du défaut sans le voir.

Repli ouvert, log d'erreur, tous les candidats rendus.

## Lot B — trois éventails indépendants dans un seul `try`

En vérifiant la portée du lot A, une seconde chose est apparue chez l'appelant le plus chaud.

`notifyMessageRecipients` sert **trois** éventails, dans cet ordre : réponse, mentions, messages
réguliers. Ils sont indépendants **par construction** — leurs audiences se déduisent des ENTRÉES de
la fonction (`validatedMentionUserIds`, l'auteur du message cité), jamais du résultat de l'éventail
précédent. Ils partageaient pourtant un unique `try { … } catch`.

Conséquence : une panne dans le PREMIER annulait purement et simplement les deux suivants, qui
n'étaient jamais atteints. Un hoquet Mongo sur la notification de réponse d'**une** personne faisait
taire le message pour **toute** la conversation — mentions comprises, c'est-à-dire la seule famille
qui perce toutes les autres suppressions. L'ordre d'exécution décidait qui survivait, et il plaçait
la famille la plus importante derrière la moins importante.

Le lot A ferme la porte d'entrée que ce cycle avait identifiée ; il ne ferme pas celle-là. Tout ce
qui lit la base dans ces trois éventails — `createReplyNotification`, le lot de mentions,
`createMessageNotification` — peut encore lever pour une autre raison que le mute.

Trois changements, tous dans la même unité :

1. **`runLot(name, onError, whenLost, run)`** — chaque éventail est isolé, rend une valeur de repli
   quand il tombe, et l'erreur remontée **nomme** l'éventail en gardant l'originale en `cause`.
   Avant, trois pannes distinctes arrivaient au même `onError` sous le même libellé.
2. **`Promise.allSettled`** dans l'éventail régulier, au lieu de `Promise.all` : le destinataire dont
   la lecture de contexte hoquette n'emporte plus le compte rendu de ses voisins, dont les
   notifications sont déjà parties. Un seul signalement pour tout l'éventail, pas un par
   destinataire — sur un groupe large, une panne commune produirait autant de lignes de log que de
   membres.
3. **`listeningRegularRecipients`** — la lecture inline de `userConversationPreferences`
   (« mentions seulement » OU sourdine) qui filtre l'éventail régulier passe au **repli ouvert**,
   comme le lot A. Elle portait exactement le même défaut que `filterMutedRecipients`, sur la même
   colonne `isMuted`, à trente lignes de distance.

## Le compte rendu devait suivre, sinon l'isolement serait invisible

`onFanOut` annonçait `mentions: validatedMentionUserIds.length` et `regular: regularRecipients.length`
— l'**audience visée**, pas le résultat. Avec l'isolement, un éventail entièrement tombé aurait
continué d'annoncer son audience comme si elle avait été servie : le correctif se serait caché
lui-même dans les logs.

Les trois valeurs disent désormais ce qui est réellement **parti** — le total rendu par le lot de
mentions, les créations non nulles pour le reste. C'est le principe posé par
`createMemberJoinedNotificationsBatch` au cycle 33b (« le compte rendu est celui des notifications
réellement créées, pas la taille de l'audience visée »), appliqué là où il manquait. Le port
`MessageNotificationTarget` déclare du coup le retour du lot de mentions (`Promise<number>` au lieu
de `Promise<unknown>`) : il est lu, donc il se déclare.

## Vérification

- **17 tests neufs**, écrits AVANT l'implémentation, **14 rouges observés** :
  - `mutedRecipients.test.ts` — 9 rouges. Le repli ouvert du helper (tous les candidats rendus,
    l'échec journalisé, la promesse qui ne rejette jamais) **et** les cinq familles + l'éventail
    d'arrivée vérifiés au niveau du SERVICE, pas seulement du helper : c'est là que le rayon se
    mesure.
  - `messageNotificationFanOut.test.ts` — 5 rouges. L'éventail réponse tombé qui n'annule ni les
    mentions ni les réguliers, l'éventail mentions tombé qui n'annule pas les réguliers, le
    destinataire régulier en échec qui n'emporte pas les autres, le compte rendu ramené à zéro quand
    tout tombe, et l'erreur qui NOMME l'éventail. Plus deux tests qui verrouillent ce qui devait le
    rester : la réponse ne se déclare partie que si elle l'est, et les préférences illisibles
    laissent tout le monde notifié.
- Le test existant « rend compte de l'éventail à son appelant » assertait `{mentions: 1, regular: 1}`
  avec des doubles rendant `0` et `null` : il mesurait l'intention. Ses doubles ont été rendus
  réalistes plutôt que l'assertion affaiblie.
- **Suite gateway complète : 614 suites, 15 846 tests, tout vert** (avant : 613 / 15 820).
  `tsc --noEmit` propre. Couverture globale lignes **95,66 %**, `mutedRecipients.ts` et
  `messageNotificationFanOut.ts` à **100 %** tous les deux.

## Reste ouvert après ce cycle

- **`runLot('regular', …)` a un `catch` presque inatteignable** : `listeningRegularRecipients` se
  replie seule et `allSettled` ne rejette pas. Il tient l'invariant « aucun éventail ne lève »
  structurellement plutôt que par audit ligne à ligne, et garde les trois éventails symétriques —
  gardé délibérément, à ne pas retirer au motif qu'il ne se déclenche pas.
- **Le repli ouvert de `listeningRegularRecipients` couvre aussi `mentionsOnly`**, qui n'est pas la
  sourdine. Même arbitrage, assumé : sur un incident de lecture, un utilisateur « mentions
  seulement » reçoit une notification de message régulier plutôt que rien.
- **La file d'attente de fan-out** (D1 du cycle 32) reste ouverte, inchangée, et pour la même raison
  qu'aux cycles 32 et 33b : elle demande de savoir ce que la troncature mesure en production, et
  cette routine n'a aucun accès aux logs.
- **Le fan-out `member_joined` n'a toujours aucune borne** de concurrence (cycle 33b) — à arbitrer
  avec la file, pas séparément.
- **`member_removed` reste une boucle d'appels unitaires**, délibérément (cycle 33b) : audience
  bornée par le rôle.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — huitième report.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel** à défaut `PUBLIC`
  (cycle 26).
- **Les deux scripts de réparation de base** attendent une exécution avec accès MongoDB — action
  humaine.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.


---

# Cycle 34 — Les cycles précédents ont unifié ce qu'une édition PRODUIT. Pas ce qu'elle EXIGE.

Tête désignée par le cycle 33, prise telle quelle : « une seule unité d'admission à l'édition,
nommée, plutôt que quatre tests d'admission qui ont déjà prouvé qu'ils dérivent ».

## Le décompte, deuxième passage

Le cycle 33 avait dressé la table de ce qu'une édition PRODUIT (liens, mentions) et l'avait rendue
uniforme. Voici celle de ce qu'elle EXIGE, telle qu'elle était encore ce matin :

| entrée | fenêtre 24h | modérateur admis | appartenance | `deletedAt` gardé | qui l'appelle |
|---|---|---|---|---|---|
| socket `message:edit` | oui | **non** | implicite | oui | web (composer) |
| `PUT /conversations/:id/messages/:messageId` | oui | oui | oui | oui | **web** (`message.service.ts`) |
| `PUT /messages/:messageId` | **non** | **non** | **non** | oui | **iOS** |
| `PATCH /messages/:messageId` | **non** | **non** | oui | **NON** | personne |

Correction au décompte du cycle 33, qui attribuait le `PATCH` au web : `messagesService.updateMessage`
existe, mais **aucun écran ne l'appelle** — seuls ses propres tests. Le web édite par le socket
(composer) et par le `PUT` conversation-scopé. Trois entrées vivantes, quatre règles.

## Ce que l'utilisateur voyait

**La fenêtre de 24h se traversait en changeant de verbe HTTP.** Le socket et le `PUT` conversation
la refusent ; les deux entrées `/messages/:messageId` ne la connaissaient pas. Un iPhone éditait
donc un message de trois ans que le même geste depuis le web refusait de toucher — et ce n'est pas
une divergence de confort, c'est le contournement complet d'une règle que le produit énonce.

**Le modérateur que l'UI web autorise se voyait refuser par le composer.** `BubbleMessage.canEdit`
rend vrai pour `isOwnMessage || hasModeratorPrivileges(userRole)`. Le geste réussit par le `PUT`
conversation-scopé et échoue par le socket, qui filtrait `sender: { userId }` dans sa lecture.

**Un message SUPPRIMÉ se réécrivait par le `PATCH`.** Ni garde à la lecture, ni garde à l'écriture.
Un `update` par id réussit quel que soit `deletedAt` : la ligne ressuscitait avec un contenu neuf,
`message:edited` partait vers des clients qui l'avaient déjà retirée, l'API répondait succès.

## Lot A — `admitMessageEdit`, l'unique énoncé

`services/messaging/messageEditAdmission.ts`. L'auteur édite 24h ; un rôle **GLOBAL** privilégié lui
rouvre la porte au-delà ; un tiers n'édite que membre ACTIF + rôle privilégié, sans fenêtre — un
modérateur corrige précisément ce qui traîne.

Coût : **aucun aller-retour ajouté**. La branche modérateur lit appartenance ET rôle en une seule
requête — la forme (`include: { user: { select: { role } } }`) que la route conversation-scopée
employait déjà. La branche auteur-hors-fenêtre en lit une. Le chemin nominal n'en déclenche aucune.
Toute lecture échoue **fermée**.

## Lot B — les quatre entrées, chacune dans son vocabulaire

Une politique, quatre traductions. Les deux routes `/messages/:messageId` gardent leur **404** sur
les refus non temporels au lieu d'adopter le 403 de leur sœur : passer à 403 en ferait un oracle
d'existence pour qui sonde des ObjectIds. Une seule politique n'oblige pas à un seul code HTTP.

La lecture Prisma du socket et du `PUT` iOS n'**encode** plus la règle. Elles filtraient
`sender: { userId }` : la ligne d'un message qu'on n'a pas écrit n'atteignait jamais la décision.
Un test par transport verrouille désormais que le `where` ne porte plus la politique — c'est la
forme la plus durable du correctif, puisque c'est ce `where` qui rendait l'unification impossible.

## Lot C — le `PATCH` et son message ressuscité

`deletedAt: null` à la lecture, garde de concurrence optimiste à l'écriture (`where: { id,
deletedAt: null }`), `P2025` traduit en **404 et non en 500** : une suppression concurrente n'est
pas une panne, et la rendre en 500 ferait retenter un client qui n'a rien à retenter.

## Ce que ce cycle a délibérément REFUSÉ de faire

**Exiger l'appartenance active de l'AUTEUR.** Le `PATCH` le faisait ; les trois transports vivants
tiennent l'authorship pour suffisant. Rendre la règle commune plus stricte que les trois chemins
réels aurait été une restriction neuve déguisée en unification — et livrée sans qu'on la nomme.
« Un auteur qui a quitté la conversation peut-il encore éditer ? » est une bonne question produit ;
elle se tranche pour les quatre à la fois, pas en passant sur celle que personne n'appelle.

**Retirer l'édition modérateur.** Premier réflexe, et il était faux : l'intégrité voudrait que nul
ne réécrive sous le nom d'autrui. Mais `BubbleMessage.canEdit` propose le geste, donc la capacité
est vivante et voulue. Un agent qui aurait « unifié » en supprimant la branche modérateur aurait
retiré une fonctionnalité en croyant fermer un trou. Le code client est la source de vérité sur ce
que le produit promet — le lire AVANT de trancher est ce qui a changé la conclusion.

## Vérification

- **26 tests neufs, 10 rouges observés** avant implémentation.
  - `messageEditAdmission.test.ts` (18 cas, **100 % lignes**) — les deux branches, la borne
    **inclusive** à 24h pile, le `createdAt` illisible qui n'a jamais bloqué personne et ne bloque
    toujours pas, le modérateur non-membre refusé, le message d'auteur anonyme que seul un
    modérateur modère, les trois pannes qui refusent.
  - 4 cas sur le `PUT` iOS, 5 sur le `PATCH`, 2 sur le socket — dont, sur les deux transports dont
    la lecture encodait la règle, un verrou sur le `where`.
- **Suite gateway complète : 614 suites, 15 840 tests, tout vert** (avant : 613 / 15 799).
  `tsc --noEmit` propre. Couverture lignes **95,64 %**.

## Reste ouvert après ce cycle

- **`appartenance active de l'auteur` — la question posée ci-dessus attend une décision produit.**
  Aujourd'hui : un auteur qui a quitté une conversation peut encore éditer ses messages par les
  quatre entrées. Défendable (ce sont ses mots) comme l'inverse (il n'a plus de session là-bas).
  **Candidat sérieux pour le prochain cycle** — le correctif est mécanique une fois la règle
  choisie, puisqu'il n'y a plus qu'un endroit où l'écrire.
- **`PATCH /messages/:messageId` n'a aucun appelant de production.** `messagesService.updateMessage`
  n'est invoqué que par ses propres tests. Une entrée d'écriture sans écran est une surface
  d'attaque qui ne rend rien. **Tête sérieuse du prochain cycle** : la retirer, elle et son service
  client, plutôt que de continuer à la maintenir à parité — ce cycle vient de payer ce prix.
- **`PUT /conversations/:id/messages/:messageId` re-persiste `originalLanguage` depuis le corps de
  la requête** là où les trois autres réutilisent la valeur stockée. Divergence restante sur ce que
  l'édition ÉCRIT, du même genre que celles que ce cycle vient de fermer sur ce qu'elle EXIGE.
- **La file d'attente de fan-out** (héritée du cycle 32, D1) — troisième report.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas.
- **`@Display Name` reste inextractible dans le domaine social** — huitième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29.
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). Action humaine.

---

# Note d'intégration — cycle 34 par-dessus le cycle 33b

Une session parallèle a livré le cycle **33b** (ci-dessous) pendant celui-ci. Aucune intersection :
33b porte sur le mute des allées et venues et le fan-out d'appartenance, le cycle 34 sur l'admission
à l'édition d'un message. Rien à arbitrer défaut par défaut (leçon d'intégration du cycle 23, reprise
aux 25b, 32b et 33b) — les deux tiennent ensemble, fusionnés à la main et revalidés sur la suite
complète. Le « reste ouvert » du cycle 34 ci-dessus vaut par-dessus celui de 33b ; là où les deux
citent le même point (file de fan-out, `getVisibilityFilteredRecipients`, `@Display Name`, eslint),
c'est le même report, pas deux.

# Cycle 33b — Le mute ne faisait pas taire les allées et venues, et chaque membre repayait la même requête

Numéroté **33b** : une session parallèle a livré son cycle 33 pendant celui-ci (« le transport
primaire d'iOS », ci-dessous). Les deux têtes n'ont AUCUNE intersection — l'une porte sur les
obligations d'une édition de message selon son transport, l'autre sur le mute et le fan-out
d'appartenance — donc rien à arbitrer défaut par défaut cette fois (leçon d'intégration du cycle 23,
reprise aux 25b et 32b) : les deux tiennent ensemble, et le code des deux a été fusionné à la main
puis revalidé sur la suite complète.

Tête prise après relecture du reste ouvert du cycle 32 : la file d'attente de fan-out (D1) attend
de savoir **ce que** la troncature mesure en production, or cette routine n'a aucun accès aux logs.
Construire la file maintenant serait choisir entre file, pagination et borne relevée à l'aveugle —
exactement ce que le cycle 32 a refusé de faire. Le fan-out d'appartenance, lui, ne demandait aucune
donnée de production pour être jugé : il porte deux défauts lisibles dans le code.

## Lot A — « en sourdine » ne couvrait pas les allées et venues

`UserConversationPreferences.isMuted` était respecté par trois familles de notifications —
`new_message`, `message_reply`, `message_reaction` — et par elles seules. Trois autres, toutes
attachées à une conversation, passaient outre : **`member_joined`, `member_removed`,
`member_left`**. Une conversation mise en sourdine continuait donc de sonner à chaque va-et-vient,
et **d'autant plus fort qu'elle est active** — donc précisément dans le cas qui a motivé le mute.
Le toggle global `memberJoinedEnabled` existait, mais il coupe le type PARTOUT : il ne permet pas de
faire taire un groupe bavard tout en gardant les arrivées ailleurs.

La ligne de partage retenue n'est pas « message ou pas » mais **ambiant ou adressé** :

| respecte le mute (AMBIANT) | perce le mute (ADRESSÉ) |
|---|---|
| `new_message`, `message_reply`, `message_reaction` | `user_mentioned` |
| `member_joined`, `member_removed`, `member_left` | `added_to_conversation`, `removed_from_conversation` |
| | `member_promoted` / `member_demoted` / `member_role_changed` |

Mettre une conversation en sourdine dit « ne me raconte pas ce qui s'y passe », pas « ne me dis pas
que j'en suis sorti ». Un événement dont le destinataire est le SUJET reste adressé et passe outre,
comme la mention par convention WhatsApp. Le tableau vit dans `mutedRecipients.ts`, à côté du filtre
qu'il gouverne — et **la frontière est verrouillée par trois tests** sur les types qui percent, pas
seulement par ceux sur les types qui se taisent : sans eux, la règle dériverait au premier
« appliquons-la partout ».

La règle avait déjà deux exemplaires (réaction, réponse) et devait en gagner trois. Elle passe par
une porte unique, `isConversationMutedFor(userId, conversationId, type)` : un même verdict, un même
log, une même **place dans l'ordre d'exécution** — avant toute lecture de contexte et avant tout
compteur mutant. Ce dernier point n'est pas cosmétique : le test « muted-conversation reactions do
not consume the pair throttle budget » (cycle GW3) l'exigeait déjà pour les réactions, et il valait
d'être rendu structurel plutôt que redécouvert par site.

## Lot B — une arrivée est UN événement, pas N

`createMemberJoinedNotification` fait trois lectures : profil du nouveau membre, conversation,
effectif. **Aucune ne dépend du destinataire.** Les deux appelants l'appelaient en boucle, une fois
par membre déjà présent : un ajout dans un groupe de 200 personnes payait donc ~600 requêtes pour
trois résultats distincts, et le surcoût croissait avec la taille du groupe — là où il fait mal.
Avec le lot A, la question du mute s'y ajoutait, une requête par destinataire de plus.

`createMemberJoinedNotificationsBatch(recipientUserIds, common)` lit le contexte **une fois**
(`MemberJoinedSnapshot`), demande le mute **une fois** pour toute l'audience, puis diffuse. Le compte
rendu est celui des notifications **réellement créées**, pas la taille de l'audience visée : une
préférence de type ou un DND côté destinataire en écarte sans que ce soit une erreur.

Le second appelant (`routes/conversations/sharing.ts`, jointure par lien) aggravait le tableau d'une
autre manière : sa boucle `await`ait **chaque administrateur à la suite**, dans la requête HTTP. La
réponse « vous avez rejoint » attendait que le dernier d'entre eux soit notifié. Un seul appel
maintenant, et la confirmation au nouvel arrivant reste unitaire — un destinataire, une notification.

## Vérification

- **20 tests neufs**, dont **6 rouges observés** avant implémentation (3 suppressions par le mute,
  la non-lecture du contexte pour un destinataire en sourdine, et les 2 sites de fan-out passés au
  batch). Les 14 autres verrouillent ce qui était déjà juste et devait le rester : les trois types
  qui **percent** le mute, l'équivalence payload batch/unitaire, l'audience vide qui ne touche pas la
  base, le doublon de destinataire, le nouveau membre introuvable, le décompte réel.
- **Suite gateway complète : 613 suites, 15 820 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,67 %** (inchangée), `mutedRecipients.ts` à 100 %.
- Une suite préexistante (`NotificationService-new-methods.test.ts`) est tombée sur le lot A : son
  double Prisma n'avait ni `userConversationPreferences` ni `participant`. Elle avait **raison de
  tomber** — le service lit désormais ces modèles — et le double a été complété, pas contourné.

## Reste ouvert après ce cycle

- **`member_removed` reste une boucle d'appels unitaires, délibérément.** Son audience est bornée par
  le rôle — `creator` / `admin` / `moderator` — donc quelques personnes, là où `member_joined` fanne
  vers TOUS les membres déjà présents. Le lot A y ajoute une requête de mute par destinataire ; c'est
  le prix assumé sur une audience de cet ordre, et la raison pour laquelle un seul des deux frères a
  été batché. À revoir si un jour une conversation peut compter des dizaines de modérateurs.

- **`filterMutedRecipients` échoue FERMÉ.** Si la lecture des préférences lève, la notification est
  perdue (le rejet remonte au `.catch` de l'appelant). Le voisinage fait l'inverse et le dit :
  `shouldCreateNotification` « fail open : en cas d'erreur de lecture des prefs, on crée la
  notification », `_loadReadReceiptOptOuts` « repli ouvert ». Un incident Mongo transitoire avale
  donc aujourd'hui toutes les notifications de réaction/réponse/appartenance au lieu d'en laisser
  passer quelques-unes de trop. **Tête du prochain cycle** — comportement préexistant, hors de la
  tête de celui-ci, mais désormais partagé par cinq familles au lieu de deux.
- **Le fan-out `member_joined` n'a aucune borne** — ni de lignes, ni de concurrence. Le `Promise.all`
  du batch reprend le parallélisme non borné que la boucle avait déjà (et que
  `createMentionNotificationsBatch` a aussi) : sur un groupe de plusieurs milliers de membres, une
  seule arrivée déclenche autant d'écritures simultanées. À arbitrer avec la file d'attente de
  fan-out (D1 du cycle 32), pas séparément.
- **La file d'attente de fan-out** (D1 du cycle 32) reste ouverte, inchangée, et pour la même
  raison : elle demande de regarder ce que la troncature mesure en production.
- **`createMemberLeftNotification` et `createTranslationReadyNotification` n'ont aucun appelant de
  production.** Le premier a reçu le mute (il est le frère exact de l'arrivée et de l'exclusion) ;
  le second a été laissé tel quel — « ta traduction est prête » se lit comme la fin d'une action
  demandée, donc adressée. À trancher le jour où l'un des deux trouve un appelant.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas (cycle 32).
- **`@Display Name` inextractible dans le domaine social** — septième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.

---

# Cycle 33 — Les cycles précédents ont câblé « le transport primaire d'iOS ». Aucun n'avait câblé celui d'iOS.

Le « Reste ouvert » du cycle 32 proposait la file d'attente de fan-out, sous réserve que « rien de
plus grave n'apparaisse ». Quelque chose de plus grave est apparu, à l'étage d'en dessous : les
obligations d'une édition de message dépendent encore du transport employé — et les deux transports
que les clients emploient RÉELLEMENT sont ceux qui n'en portent aucune.

## Le décompte

L'édition d'un message a **quatre** points d'entrée. Ce qu'ils faisaient avant ce cycle :

| entrée | fichier | liens traçables | mentions | qui l'appelle |
|---|---|---|---|---|
| socket `message:edit` | `MessageHandler` | oui | oui | web (composer) |
| `PUT /conversations/:id/messages/:messageId` | `messages-advanced.ts` | oui | oui | **personne** |
| `PUT /messages/:messageId` | `routes/messages.ts` | **non** | **non** | **iOS** (`MessageService.editMessage`) |
| `PATCH /messages/:messageId` | `messages-advanced.ts` | **non** | **non** | **web** (`messages.service.ts`) |

Les deux unités partagées existaient déjà, écrites par les cycles précédents, et elles étaient
justes. Elles avaient simplement été branchées sur la mauvaise route. Deux commentaires — dans
`emitMentionCreated.ts` et dans `messages-advanced.ts` — désignaient « le transport PRIMAIRE du
client iOS, qui édite via `PUT /messages/:id` » **au-dessus du câblage de
`PUT /conversations/:id/messages/:messageId`**. Le chemin nommé et le chemin câblé n'étaient pas
le même. Le commentaire, lui, se lisait comme une preuve que le trou était fermé.

## Ce que l'utilisateur voyait

Éditer « salut @alice » en « salut @bob » **depuis un iPhone** : Alice reste mentionnée (ligne
`Mention`, `validatedMentions`, inbox `/mentions`, surlignage), Bob n'est nommé nulle part, ne reçoit
ni notification ni `mention:created`. Le même geste depuis le composer web (socket) fait tout
correctement. Idem pour `[[url]]` : envoyé, le texte produit un lien traçable ; **édité** depuis iOS
ou depuis `messages.service.ts`, les crochets restent en dur dans le message, définitivement.

## Lot A — `PUT /messages/:messageId`, le transport d'iOS

`processExplicitLinks` AVANT l'écriture, `reconcileEditedMentions` + `emitMentionCreated` après, et
le contenu traité devient le SEUL en circulation : base, mentions, retraduction, payload diffusé.

Une différence assumée avec le sibling PUT : la réconciliation précède le `findUniqueOrThrow` de
relecture. Elle écrit `validatedMentions` en base, donc la relecture rend l'état réconcilié sans
recopiage conditionnel — et quand elle n'a RIEN pu établir, la ligne porte toujours la valeur
précédente, qui est la bonne. Le garde-fou `if (reconciled)` du sibling existe parce qu'il tient un
objet rendu par l'écriture ; ici il n'y a rien à garder.

La réconciliation est bien APRÈS le `updateMany` gardé : un `DELETE` concurrent rend `count === 0`,
la route répond 404 et ne réconcilie rien sur un message que le client a déjà retiré.

## Lot B — `PATCH /messages/:messageId`, le transport du web

Même traitement, avec le garde-fou `if (reconciled)` du sibling puisqu'il tient lui aussi l'objet
rendu par `update`.

## Lot C — le `content.trim()` qui plantait sur le seul cas que la garde autorise

`content` est OPTIONNEL dans `UpdateMessageBodySchema`, et l'omettre est précisément la façon de
retirer la légende d'un message à pièce jointe — un cas que la garde d'entrée autorise
explicitement (`(!content || …) && !messageHasAttachments`). L'écriture faisait ensuite
`content.trim()` : TypeError, traduit en 500 par le catch. Le seul cas explicitement permis était le
seul que l'écriture ne savait pas traiter. `content?.trim() ?? ''`.

## Lot D — les commentaires qui nommaient la mauvaise route

Corrigés aux deux endroits, et `broadcastMessageMutation.ts` — dont l'affirmation était JUSTE, elle,
puisque cette unité-là est bien câblée sur `routes/messages.ts` — reçoit le chemin complet, l'ambiguïté
entre les deux `PUT` étant exactement ce qui a permis la confusion. La leçon du 2026-08-07 (3) — « une garantie énoncée dans un commentaire
n'est pas une garantie du système » — se double ici d'un corollaire : un commentaire qui nomme le
chemin qu'il ne câble PAS ne se contente pas de ne rien garantir, il **détourne activement** le
prochain audit. Les cycles suivants ont relu ces lignes et conclu que le cas iOS était traité.

## Vérification

- **10 tests neufs**, **8 rouges observés** avant correctif :
  - `message-edit-mention-parity.test.ts` (6, dont 5 rouges) — réconciliation, `mention:created` aux
    seuls entrants, traitement des liens avant écriture, contenu traité en circulation unique,
    légende retirée sans 500 ; plus le cas qui doit RESTER muet (course de suppression : `count === 0`
    → 404 et aucune réconciliation).
  - `conversation-messages-advanced.test.ts` (4, dont 3 rouges) — mêmes obligations sur le PATCH, plus
    le `validatedMentions` qui ne doit PAS être écrasé quand la réconciliation n'établit rien.
- **Suite gateway complète : 613 suites, 15 799 tests, tout vert.** `tsc --noEmit` propre.

## Reste ouvert après ce cycle

- **Quatre points d'entrée pour une édition, dont un que personne n'appelle**
  (`PUT /conversations/:id/messages/:messageId`). Les quatre partagent désormais les mêmes unités,
  mais chacun réimplémente ses propres gardes de permission — et elles DIVERGENT : le PATCH n'a pas
  la fenêtre de 24h ni le bypass modérateur, le `PUT /messages/:messageId` filtre par
  `sender: { userId }` (donc aucun bypass du tout). **Tête du prochain cycle** : une seule unité
  d'admission à l'édition, nommée, plutôt que quatre tests d'admission qui ont déjà prouvé qu'ils
  dérivent. C'est le motif exact des cycles 30-31, un étage plus bas.
- **La file d'attente de fan-out** (héritée du cycle 32, D1). La troncature est mesurable depuis le
  cycle 32 ; il faut regarder ce qu'elle mesure avant de choisir.
- **`getVisibilityFilteredRecipients` et `filterPostConsumers`** ne se citent toujours pas.
- **`@Display Name` reste inextractible dans le domaine social** — septième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29.

---

# Cycle 32b — Addendum d'une session parallèle

Deux sessions ont livré le cycle 32 en parallèle, sur la même tête (« la troncature est muette »).
Le cycle 32 ci-dessous est **le plus large** — il porte en plus les lots B et C sur les défauts
permissifs — et sa forme sur la troncature est la meilleure sur deux points, gardés tels quels :
le type nommé (`FanoutBucket` / `StoryNotificationRecipients`), et le log placé **dans**
`getStoryNotificationRecipients` plutôt que chez un appelant, ce qui le rend vrai pour tous.
Cette session s'aligne dessus et n'apporte que ce qui manquait. (Leçon d'intégration du cycle 23,
reprise au 25b : comparer défaut par défaut, jamais « qui est arrivé en premier ».)

## Ce que l'addendum ajoute — 1. la borne payait ses exclus sur son propre budget

Défaut que le cycle 32 n'a pas touché, et qui est **antérieur** à la question de la troncature :
deux des trois requêtes écartaient des gens **après** le `take`, pas dedans.

| requête | écarté par la requête | écarté après coup |
|---|---|---|
| `postComment` | `commenterId` | **`authorId`** |
| `postReaction` | `commenterId` | **`authorId`** |
| `friendRequest` | — | `authorId` (structurel, voir plus bas) |

Une ligne écartée après coup a quand même consommé sa place sous la borne. Et l'auteur n'est pas un
engagé quelconque de son propre fil : **c'est le plus prolifique**, parce que répondre à chacun de
ses commentateurs est le comportement normal d'un auteur. Sur un post où l'auteur a répondu à tout
le monde, ses propres réponses évinçaient donc, une pour une, des destinataires réels — en silence,
et d'autant plus fort que le post marchait bien. La borne annonçait 500 destinataires et en servait
moins, sans que rien ne le dise.

**Correctif.** `authorId: { notIn: [commenterId, authorId] }` dans le `where`. La borne compte
désormais des destinataires, plus des lignes dont une partie était jetée d'avance.

**Les `filter` en aval RESTENT, et ce n'est pas une garde en double.** Le `notIn` protège le
**budget** ; les `filter` tiennent la **postcondition** de la méthode publique — « ni l'auteur ni le
commentateur ne sortent d'ici », vrai quelle que soit la clause `where` du jour. C'est ce qui
distingue ce cas du `COMMUNITY` décoratif retiré au cycle 31 : là c'était une branche de décision
inatteignable, ici c'est ce dont une méthode répond. Les deux tests qui l'encodaient sont tombés
quand je les avais retirés — ils avaient raison, ils sont restés.

Sur `friendRequest` l'auteur ne peut PAS sortir par la requête : il ancre **chaque** ligne
d'amitié. Sa présence y est structurelle, pas budgétaire — rien à corriger.

## Ce que l'addendum ajoute — 2. la ligne témoin, parce que `>=` crie au loup à la borne

Le cycle 32 déduit la troncature de « la requête a rendu **autant** de lignes que la borne »
(`length >= FANOUT_ROW_CAP`). C'est un signal juste dans l'esprit, faux au point exact où son propre
commentaire promet de trancher : un seau de **très exactement** 500 engagés est COMPLET, et il est
déclaré tronqué. Sur le seau des amis, la conséquence n'est pas théorique — un auteur à exactement
500 amis émet un `warn` de troncature à **chacune** de ses publications, pour toujours.

**Correctif : `take: FANOUT_ROW_CAP + 1`.** La ligne excédentaire est un **témoin**, jamais un
destinataire — lue, comptée, puis jetée par un `slice`. La borne de diffusion ne bouge pas d'un
destinataire ; seul le verdict devient exact, et le test passe de `>=` à `>`.

**Portée du témoin, dite honnêtement.** Sur `friendRequest` (pas de `distinct`) il est **exact** :
une 501e ligne existe si et seulement si la base en avait plus de 500. Sur les deux requêtes
`distinct`, il reste un signal **suffisant** — jamais déclenché à tort, mais capable de se taire sur
une troncature que la déduplication a repliée en deçà de la borne. Ce n'est pas gênant là où ça
compte : le seau où la troncature est de loin la plus probable est celui des amitiés — un auteur à
plus de 500 amis est banal, un post à plus de 500 commentateurs distincts ne l'est pas — et c'est
précisément celui où le compte est exact.

## Vérification de l'addendum

- **15 tests neufs**, dont **13 rouges observés** avant implémentation (le 15e — « sous la borne, on
  se tait » — était vert d'emblée : il n'y avait alors aucun `warn` du tout, ce qui est exactement le
  cas à verrouiller contre un futur `warn` trop bavard).
- **Les 4 tests du cycle 32 qui nourrissaient exactement `FANOUT_ROW_CAP` lignes** passent à
  `FANOUT_ROW_CAP + 1` : sous la sémantique du témoin, 500 lignes veut dire « complet ». Le cas
  « exactement 500 → aucune troncature » devient un test à part entière — c'est le point que `>=`
  manquait.
- Le témoin est éprouvé sur ses **trois** régimes : 500 pile → pas de troncature ; 501 → troncature
  signalée ; et dans les deux cas la 501e n'est jamais notifiée.

## Reste ouvert après l'addendum

- **La file d'attente de fan-out** reste la tête du prochain cycle, telle que le cycle 32 la pose
  (D1) — inchangé, et mieux instrumenté : le verdict de troncature ne remonte plus de faux positifs,
  donc ce que les logs mesureront sera lisible tel quel.
- Tout le reste ouvert du cycle 32 ci-dessous est inchangé.

---

# Cycle 32 — Une troncature muette, et les défauts permissifs que le cycle précédent n'avait pas atteints

Deux têtes prises ensemble, parce qu'elles se sont révélées être la même question posée à deux
étages. Celle laissée par le cycle 31 (livré en parallèle par une autre session, mergé en premier,
et repris tel quel ici — sa forme était la bonne) : « **`getStoryNotificationRecipients` plafonne à
500 lignes par seau** sans le dire au destinataire ni au log. Sur un post viral, un fan-out
silencieusement tronqué ressemble à un fan-out complet. **Tête du prochain cycle.** »

Et ce que ce cycle 31 n'avait pas atteint : il a rendu `visibility` requis sur un lot, mais le
défaut permissif vivait aussi chez l'appelant, dans trois autres lots, et sur huit méthodes de
diffusion temps réel.

## Lot A — la borne était légitime, son silence ne l'était pas

Quatre lectures bornées à 500 alimentent les fan-out de notification. Une liste rendue à la borne
exacte est **indiscernable** d'une liste complète : le seau paraît entier, et le 501e destinataire
n'apprend jamais rien. Le cas le plus net n'est même pas le post viral mais
`createFriendContentNotificationsBatch` : tri `updatedAt desc`, borne fixe, donc chez un auteur qui
dépasse durablement la borne ce sont **toujours les mêmes** — les contacts les plus anciens — qui
n'apprennent aucune de ses publications. Un silence structurel, pas un incident.

Correctif dans la ligne du corollaire du cycle 27 (« une valeur vide *établie* et une valeur vide
*qu'on n'a pas pu établir* doivent être DISTINGUABLES dans le type de retour ») : la borne devient
`FANOUT_ROW_CAP`, partagée par les quatre `take` — une constante ne peut pas dériver du test qui la
surveille — la saturation entre dans le type de retour (`truncatedBuckets: FanoutBucket[]`) et dans
le log (`postId`, `authorId`, seaux, borne).

## Lot B — le défaut permissif ne vit pas que dans la signature

`SocialEventsHandler` portait `visibility: string = 'PUBLIC'` et `visibilityUserIds: string[] = []`
sur **huit** méthodes de diffusion et sur l'énumérateur `getVisibilityFilteredRecipients` lui-même.
Un appelant qui les omettait diffusait un post `PRIVATE` à tous les amis de l'auteur, ou un `EXCEPT`
sans sa liste noire.

Aucun appelant de production ne les omettait — et c'est exactement l'argument : le retrait ne coûte
rien, la conservation coûte le premier oubli. Les deux paramètres deviennent requis ; le build a
lui-même désigné les deux harnais qui s'appuyaient sur le défaut.
`createFriendContentNotificationsBatch` reçoit le même traitement que ses trois lots voisins.

## Lot C — et il se réinstalle chez l'appelant

Le cycle 31 a rendu `visibility` requis sur `createStoryCommentNotificationsBatch` ; son unique
appelant passait `post.visibility ?? 'PUBLIC'`. Le défaut avait simplement changé d'étage, hors de
vue du build. Même motif dans `routes/posts/interactions.ts`, deux fois, avec un cast en prime :
`(post as { visibility?: string }).visibility ?? 'PUBLIC'` — alors que `postAcl`, la tranche ACL
autoritative, est chargée **trois lignes plus haut** pour la garde d'interaction. Le cast disait que
la forme rendue par `likePost` n'était pas sûre de porter le champ ; la réponse n'était pas de
deviner une valeur, mais de lire celle qu'on avait déjà.

## D1 — pourquoi le lot A ne va pas jusqu'à la file d'attente

Le commentaire du code propose depuis longtemps « a background queue for fan-out ». Ce cycle ne la
construit pas : une file change le modèle de livraison (ordre, reprise, idempotence) et mérite son
propre cycle. Rendre la troncature **observable** est ce qui manquait pour pouvoir décider — on ne
sait aujourd'hui ni à quelle fréquence la borne est atteinte, ni sur quels seaux.

## D2 — ce qui n'a PAS été refait après la session parallèle

Le cycle 31 a été livré deux fois, en parallèle. La branche arrivée première portait la meilleure
forme sur trois points (le contrat `Set | null` de la lecture DM, qui distingue la panne de
l'absence ; le refus du seul résidu plutôt que de tout le lot ; les 14 fixtures qui verrouillent
l'accord des deux formes cas par cas), et son choix assumé de relire les co-membres plutôt que de
recopier une règle d'admission localement est défendable. Elle est gardée telle quelle : ce cycle ne
réécrit rien de ce qu'elle a livré, il prend la suite là où elle s'arrête.

## Vérification

- **6 tests neufs** (`__tests__/unit/services/NotificationService.fanouttruncation.test.ts`),
  **5 rouges observés** : la saturation de chacun des trois seaux, le log qui nomme le post et le
  seau, la borne du graphe ami côté publication — et les deux cas sous la borne qui ne doivent RIEN
  consigner (sans eux, un log inconditionnel passerait les autres).
- **Suite gateway complète : 612 suites, 15 789 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,67 %** (95,66 % avant).
- Le lot B et le lot C ne changent aucun comportement observable : ils déplacent au build ce qui
  n'était protégé que par la discipline des appelants. Aucun test neuf ne peut en témoigner — la
  suite existante sert de filet, et les deux harnais que le compilateur a fait tomber sont la preuve
  que la garde mord.

## Reste ouvert après ce cycle

- **La file d'attente de fan-out** (cf. D1). La troncature est désormais mesurable ; le prochain pas
  est de regarder ce qu'elle mesure avant de choisir entre file, pagination et borne relevée.
  **Tête du prochain cycle si rien de plus grave n'apparaît.**
- **`getVisibilityFilteredRecipients` et `filterPostConsumers` traitent une visibilité inconnue de la
  même façon (retomber sur les amis), mais par deux chemins qui ne se citent pas.** L'un est un
  énumérateur, l'autre un test d'admission — les fusionner serait la faute du cycle 28 ; les faire
  se référencer mutuellement suffirait.
- **`@Display Name` reste inextractible dans le domaine social** — sixième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, aucune passe de lint n'a donc pu tourner sur ce cycle non plus.

---

# Cycle 31 — Deux tests d'admission pour une seule question, et le seau qui n'en avait aucun

Tête laissée par le cycle 30 : « **Deux tests d'admission coexistent** : `filterPostAudience`
(amis stricts) et `canUserConsumePost` (amis ∪ contacts DM). Un contact DM non-ami reçoit donc une
notification de réponse mais pas de mention. **Candidat sérieux pour le prochain cycle.** »

Pris tel quel. Le défaut annoncé était réel — et en le corrigeant, l'outil qu'il a fallu construire
a rendu visible un second trou, plus grave, dans le même fichier.

## Lot A — les deux tests d'admission avaient divergé

Une seule question, « celui-là a-t-il le droit de LIRE ce post ? », posée sous trois formes :

| forme | qui | audience AVANT |
|---|---|---|
| clause `where` | `buildPostVisibilityOrFilter` (feed, post unique) | amis ∪ contacts DM |
| destinataire unique | `canUserConsumePost` (fil, notifications unitaires) | amis ∪ contacts DM |
| lot de candidats | `filterPostAudience` (mentions) | **amis stricts** |

Trois formes imposées par la manière dont la question se pose — pas par l'audience. La troisième
avait dérivé, et la conséquence est observable par l'utilisateur : un contact DM non-ami voit le
post dans son feed, peut en ouvrir le fil, reçoit une notification quand on répond à son
commentaire — et **rien** quand on le nomme dans ce même post. Sous-livraison silencieuse.

**Correctif.** `filterPostAudience` → **`filterPostConsumers`**. Le renommage n'est pas cosmétique :
la doctrine posée au cycle 29 (D1) veut qu'un point d'entrée choisisse son audience en la
**nommant**, et l'ancien nom ne disait pas laquelle des deux il appliquait — c'est précisément ce
qui a permis la dérive. La branche `FRIENDS`/`EXCEPT` consulte désormais le lien DM.

**Le coût est nul sur le cas dominant.** `filterDirectContactIdsAmong` — pendant BORNÉ de
`getDirectConversationContactIds`, comme `loadFriendIdsAmong` l'est du graphe ami — n'est interrogé
que pour le **résidu** : les candidats dont l'amitié n'a rien dit. Un lot entièrement composé d'amis
ne coûte pas une requête de plus qu'avant. Les candidats déjà écartés par la liste noire `EXCEPT`
sortent des bornes avant toute lecture, comme dans `canUserViewPost`.

**Une panne partielle ne détruit pas ce qui est établi.** Le graphe ami qui échoue ne laisse rien —
on refuse tout. Le graphe DM qui échoue ne laisse indéterminé que le résidu — on garde les amis et
on refuse le reste. Distinguer les deux, c'est le corollaire du cycle 27 appliqué à un filtre.

**L'anti-dérive est un test de conformité, pas une implémentation partagée.** Fusionner les deux
formes serait faux : `filterPostConsumers` matérialise les co-membres (`getCommunityCoMemberIds`)
là où `canUserConsumePost` tranche en pairwise (`doUsersShareCommunity`) — c'est la raison d'être
des deux. 14 fixtures traversent donc les deux fonctions depuis le **même** double de graphe et
doivent rendre le même verdict.

## Lot B — le seau « engagés antérieurs » n'avait aucun test d'admission

Trouvé en branchant le lot A. `createStoryCommentNotificationsBatch` sert trois seaux :

| seau | nature | garde AVANT |
|---|---|---|
| auteur | possède le post | exempt, correct |
| `friendIds` | **sortie d'énumérateur** — amis actuels dépliés du graphe | table locale, correct |
| `previousCommenterIds` | **ensemble arbitraire** — commentateurs antérieurs ∪ réacteurs | table locale, **faux** |

La table locale `canSeePost` ne lisait aucun graphe : `default: return true` couvrait `FRIENDS`, et
`EXCEPT` se contentait de la liste noire. Pour les amis c'est juste — ils sont amis par
construction. Pour les engagés antérieurs c'est un trou : ils étaient admis **quand ils ont engagé
le post**, et une dés-amitié ou une édition de visibilité les en sort sans toucher à leur
commentaire. Un post `PUBLIC` passé en `FRIENDS` emporte d'un coup tous ceux qui n'ont jamais été
amis — et chacun reçoit `story_thread_reply` avec l'extrait du nouveau commentaire.

C'est le trou que le cycle 30 avait fermé pour la notification UNITAIRE de la même population
(`comment_reply` → `canNotifyAboutPost`). Le seau de fan-out l'avait gardé.

`engagedAudience` passe par `filterPostConsumers`. `canSeePost` devient `canSeeAsFriend` — il ne
filtre plus que les amis — et son cas `COMMUNITY`, devenu inatteignable, est retiré plutôt que
laissé en garde décorative (repéré par la ligne non couverte 1906, pas par relecture).

## Lot C — `visibility` requis (dette des cycles 28, 29, 30)

`visibility?` à défaut `PUBLIC` sur `createStoryCommentNotificationsBatch`, annoncé trois fois comme
« mécanique, sans risque ». Devenu `visibility: string | null | undefined` requis. Une visibilité
nulle se lit désormais comme `FRIENDS`, jamais comme publique.

Nuance apprise en le faisant : contrairement à ce qu'annonçait le cycle 28, la requiredness ne
protège **que la production** ici — `services/gateway/tsconfig.json` exclut `**/__tests__/**`, donc
aucun harnais n'échoue au build. Le seul appelant de production (`routes/posts/comments.ts`) est
bien couvert ; les 3 harnais ont été rattrapés par leurs assertions, pas par `tsc`.

## Vérification

- **19 tests neufs** : 14 fixtures de conformité + 8 cas de fan-out + 5 cas de borne/panne côté lot,
  et 3 cas de service pour la mention d'un contact DM. **10 rouges observés** avant implémentation
  (7 lot A, 3 lot B), vérifiés en neutralisant la branche DM puis en la rétablissant.
- **3 harnais** complètent leur double Prisma (`participant`) : sans lui, l'exception avalée faisait
  passer leurs refus pour des refus d'ACL — ils prouvaient moins qu'ils n'en avaient l'air.
- **Suite gateway complète : 611 suites, 15 783 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %** ; `postAudience.ts` et `directContactVisibility.ts` à 100 % lignes.

## Reste ouvert après ce cycle

- **`canUserInteractWithPost` reste amis stricts** et c'est volontaire (décision 2026-07-08) : ce
  cycle n'a réaligné que le côté CONSOMMATION, où les trois formes répondent maintenant à
  l'identique. L'asymétrie voir ⊇ interagir est intacte — ne pas la « réaligner » sans re-décider.
- **`getStoryNotificationRecipients` plafonne à 500 lignes par seau** sans le dire au destinataire ni
  au log. Sur un post viral, un fan-out silencieusement tronqué ressemble à un fan-out complet.
  **Tête du prochain cycle** si rien de plus grave n'apparaît.
- **`@Display Name` reste inextractible dans le domaine social** — cinquième report.
- **`eslint` inopérant sur le gateway** (pas de `eslint.config.js` en flat config) — inchangé depuis
  le cycle 29, et donc aucune passe de lint n'a pu tourner sur ce cycle non plus.

---

# Cycle 30 — Les notifications du fil suivaient l'auteur du commentaire, pas l'audience du post

Suite directe du cycle 29, sur la tête qu'il avait lui-même désignée : « `createCommentReplyNotification`
et `createCommentLikeNotification` ne filtrent pas leur destinataire unique. **Prochain lot naturel.** »

## Ce qui était ouvert

Trois notifications à destinataire UNIQUE visent l'auteur d'un commentaire :
`createCommentReplyNotification`, `createCommentLikeNotification` et
`createCommentReactionNotification` (chemin socket).

Leur destinataire A pu commenter — donc il était admis **à ce moment-là**. Rien ne garantit qu'il
le soit encore : une dés-amitié, ou une édition de visibilité via `PUT /posts/:postId`, le sort de
l'audience **sans toucher à son commentaire**. Les deux événements sont ordinaires.

Ce qui partait alors sur son écran verrouillé n'est pas un ping :

| notification | ce qu'elle portait |
|---|---|
| `comment_reply` | `replyPreview` — un extrait du contenu d'un **TIERS** — plus `parentCommentPreview` et la **vignette du post** (`resolvePostMedia` → `firstAttachmentUrl`, `postThumbnailUrl`) |
| `comment_like` | cette même vignette de post restreint |
| `comment_reaction` | un lien de tap vers un post qui le refuserait |

Le cycle 29 avait fermé la lecture et l'écriture du fil ; il restait ce qui en découle.

## D1 — la garde résout le post elle-même

Le cycle 28 avait tranché l'inverse pour les lots de mention : `visibility` **requis** en paramètre,
pour que TypeScript refuse l'appel incomplet à la compilation. Ici le choix est l'autre, et pour une
raison mesurable : ces trois méthodes sont invoquées en **fire-and-forget APRÈS la réponse**
HTTP/socket (toutes leurs invocations sont suivies d'un `.catch()` détaché). La requête
supplémentaire ne coûte donc rien d'observable, là où le cycle 28 gardait un chemin d'écriture chaud.

Et une garde sans paramètre ne peut pas être **désarmée par omission** — pas même par un appelant
futur qui ignorerait la règle. C'est la même propriété que D2 du cycle 28 visait, obtenue sans
élargir l'API de trois méthodes.

`canNotifyAboutPost(postId, recipientId)` : `loadPostAcl` puis `canUserConsumePost`. Audience de
**consommation** (amis ∪ contacts DM) — être informé d'un contenu qu'on a le droit de lire dans le
fil est la même question que le lire. **En panne ou post introuvable, on REFUSE** : une notification
manquée se rattrape en ouvrant le post, un extrait poussé ne se rappelle pas.

## D2 — `NOT_DELETED` sort de `postIncludes`

Brancher la garde a fait tomber **16 suites** de `NotificationService` d'un coup. Le diagnostic est
plus intéressant que le symptôme : `postVisibility` importait `NOT_DELETED` depuis `postIncludes`,
qui construit ses `Prisma.validator` **au chargement du module**. Les harnais de notification
doublent le client Prisma et n'ont aucune raison de connaître les formes d'`include` des posts —
ils cassaient sur un import qu'ils n'avaient pas demandé.

Corriger les 16 harnais aurait masqué le vrai défaut : un module d'ACL feuille ne doit pas dépendre
d'un module de formes. `NOT_DELETED` vit désormais dans `services/posts/softDelete.ts`, re-exporté
par `postIncludes` pour ses appelants historiques. **16 rouges → 6**, et les 6 restants sont la
vraie déclaration d'audience.

## Vérification

- **11 tests neufs** (`__tests__/unit/services/NotificationService.threadaudience.test.ts`),
  **6 rouges observés** : le destinataire dés-ami, le post devenu `PRIVATE`, la liste `ONLY`, le
  post introuvable qui refuse, l'auteur toujours admis sur son propre `PRIVATE`, le `PUBLIC` qui
  n'interroge pas le graphe — et deux verrous qui vérifient que la **vignette n'est même pas lue**
  quand le destinataire est hors audience.
- **7 harnais** complètent leur double : audience du post, et `PostVisibility` (le module d'ACL
  compare `post.visibility` à l'enum Prisma — un double qui ne l'expose pas fait valoir `undefined`
  à toute comparaison, donc refuser).
- **Suite gateway complète : 609 suites, 15 751 tests, tout vert.** `tsc --noEmit` propre.
  Couverture lignes **95,66 %**.

## Reste ouvert après ce cycle

- **Deux tests d'admission coexistent** : `filterPostAudience` (lots de mention, amis stricts) et
  `canUserConsumePost` (fil + notifications unitaires, amis ∪ contacts DM). Un contact DM non-ami
  reçoit donc une notification de réponse mais pas de mention. L'écart est **conservateur** (sous-
  livraison, jamais fuite) et les deux formes diffèrent — lot de candidats arbitraires contre
  destinataire unique déjà engagé. Les unifier demande de re-décider si `filterPostAudience` doit
  admettre les contacts DM. **Candidat sérieux pour le prochain cycle.**
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  annoncé par les cycles 28 et 29, toujours ouvert. Mécanique, sans risque.
- **`@Display Name` reste inextractible dans le domaine social** — quatrième report.
- Les autres points du cycle 29 (réparations base à lancer à la main, suppression de branche
  distante impossible depuis cette routine, `eslint` inopérant sur le gateway) sont inchangés.

---

# Cycle 29 — Le fil d'un post n'héritait d'aucune de ses règles d'audience

Tête laissée par le cycle 28 :
« **`@Display Name` reste inextractible dans le domaine social.** […] **Tête du prochain cycle si
rien de plus grave n'apparaît** — deux cycles de suite, quelque chose de plus grave est apparu. »

Trois cycles de suite. Le défaut annoncé retourne à la file, avec sa raison inchangée.

## Ce qui était ouvert

Les six routes de `routes/posts/comments.ts`, le like/unlike REST du post et les quatre handlers de
réaction socket ne consultaient **jamais** `Post.visibility`. Un utilisateur authentifié connaissant
un `postId` pouvait, sur un post `PRIVATE` / `ONLY` / `FRIENDS` / `COMMUNITY` :

| surface | ce qu'elle donnait |
|---|---|
| `GET /posts/:postId/comments` | tout le fil — contenu, médias, auteurs |
| `GET .../comments/:commentId/replies` | idem, et sans même regarder le post |
| `POST /posts/:postId/comments` | **écrire** dedans, puis notifier l'auteur |
| `POST`/`DELETE .../like` | réaction persistée sur un commentaire du fil |
| `comment:reaction-add` / `-remove` | idem par socket |
| `post:reaction-add` / `-remove` | réaction sur le post lui-même |
| `POST`/`DELETE /posts/:postId/like` | réaction REST sur le post lui-même |

Différence de nature avec le cycle 28 : cette fuite est **tirée par l'appelant**, pas poussée. Elle
ne demande aucun préalable — ni mention, ni relation, ni notification — seulement un identifiant.

## Pourquoi c'était visible dans le dépôt

Le post, lui, était protégé : `PostService.getPostById` et `recordMediaDownloads` appliquent
`buildVisibilityFilter`, et `post:join` refusait déjà l'abonnement à la room d'un post restreint
via `canUserViewPost`. Le fil était la seule île sans ACL.

Et la preuve était dans le fichier même : `CommentReactionHandler` **importait** `canUserViewPost`
et portait un wrapper privé `_canUserViewPost` — que rien n'appelait. L'intention avait été écrite,
le branchement n'avait jamais eu lieu.

## D1 — une asymétrie documentée n'est pas une asymétrie appliquée

`postVisibility.ts` porte depuis la décision 2026-07-08 : le filtre de LISTE admet amis ∪ contacts
DM, tandis que `canUserViewPost` — « ce qui garde RÉAGIR / COMMENTER » — reste amis stricts. Cette
règle n'existait qu'en prose : rien ne permettait de l'appliquer à UN objet.

Quatre primitives la rendent exécutable, dans le fichier qui la documente plutôt que dans un module
de plus :

| primitive | question | audience |
|---|---|---|
| `loadPostAcl` | tranche ACL de ce post | — (`null` si absent OU supprimé) |
| `loadCommentPostAcl` | ... du post PORTANT ce commentaire | — (id d'URL jamais cru) |
| `canUserConsumePost` | peut-il LIRE le fil ? | amis ∪ contacts DM |
| `canUserInteractWithPost` | peut-il ÉCRIRE / RÉAGIR ? | amis stricts |

Les deux verdicts ne diffèrent que par `canUserViewPost(..., { includeDirectContacts })`. Un point
d'entrée choisit son audience en la **nommant**, pas en réglant un booléen.

Choisir la consommation pour la lecture n'est pas un élargissement, c'est l'absence d'une
régression : un contact DM non-ami à qui le feed montre déjà une story `FRIENDS` doit pouvoir en
lire les commentaires. Le verdict d'interaction en aurait fait un 404 — une garde qui casse un
lecteur légitime n'est pas une garde.

## D2 — l'identifiant du chemin ne vaut rien

Trois surfaces adressent leur cible par `commentId` tout en recevant un `postId` (segment d'URL ou
champ de payload) : les réponses, les likes de commentaire, les réactions socket. Le post y est
désormais résolu **DEPUIS le commentaire**. Sans cela, un appelant annonçait le post public de son
choix tout en visant le fil d'un post privé — le `postId` reçu n'est plus qu'une adresse de room et
un segment de chemin.

## Les deux transports répondent pareil

`likePost` et `PostReactionService.addReaction` ne vérifient, eux aussi, que l'existence et le
non-effacement du post. Gardier le seul chemin socket aurait fait dépendre l'ACL du **transport** :
un client refusé sur `post:reaction-add` réussissait en repassant par `POST /posts/:postId/like`.
Les deux reçoivent donc la même garde et le même refus indistinct.

## D3 — refuser sans confirmer

`404` partout, jamais `403`, et `null` indistinct entre post absent, supprimé et invisible. Même
doctrine que `recordMediaDownloads` : distinguer ferait de la route un oracle d'existence de posts
privés. Côté socket, l'ACK rend « Post/Comment not found » pour la même raison.

## Coût

- Cas dominant (post `PUBLIC`) : une requête bornée, **aucune** lecture de graphe ensuite.
- `FRIENDS`/`EXCEPT` : une requête d'amitié ; le contact DM n'est consulté qu'en dernier recours.
- `EXCEPT` court-circuite sur sa liste noire **avant** toute lecture de graphe (nouveau).
- `doUsersShareDirectConversation` est le pendant **pairwise** de `getDirectConversationContactIds`,
  exactement comme `doUsersShareCommunity` l'est de `getCommunityCoMemberIds` : deux requêtes
  bornées au lieu de matérialiser le carnet d'adresses. Définition du contact DM reprise mot pour
  mot du feed. **En panne, il refuse.**

## Contreparties assumées

**1. Un contact DM non-ami perd le droit d'ÉCRIRE dans le fil d'un post `FRIENDS`/`EXCEPT` qu'il
peut pourtant VOIR** (il garde la lecture). C'est le seul cas où une action qui réussissait pour un
utilisateur *voyant* le post échoue désormais — il mérite d'être appelé par son nom plutôt que
caché derrière « on ferme un trou ». Ce n'est pas un effet de bord : c'est exactement la décision
produit du 2026-07-08 citée dans `postVisibility.ts` (« un DM-contact peut ouvrir une story FRIENDS
et compter comme viewer, mais pas y réagir »), restée sans point d'application jusqu'ici. Si
l'équipe produit veut au contraire ouvrir l'interaction aux contacts DM, la correction tient en une
ligne (`canUserInteractWithPost` passant `includeDirectContacts: true`) — et doit se faire en
RE-DÉCIDANT l'ACL, jamais en retirant la garde. **Point de validation humaine.**

**2. Un utilisateur qui perd l'accès à un post ne peut plus retirer une réaction qu'il y avait
laissée.** Elle lui est de toute façon invisible, et une ACL qui dépend du sens du geste est un
footgun ; le retrait suit donc la pose. À rouvrir si un cas d'usage réel apparaît.

## Vérification

- **51 tests neufs**, écrits AVANT l'implémentation, **24 rouges observés** :
  - `__tests__/unit/services/posts/postThreadAccess.test.ts` — 22 cas (les six modes, l'auteur
    toujours admis sur son `PRIVATE`, le contact DM admis en lecture ET refusé en écriture, le post
    résolu depuis le commentaire, la visibilité inconnue qui restreint, la panne qui refuse, les
    court-circuits sans requête).
  - `__tests__/unit/routes/posts/comments-audience.test.ts` — 17 cas sur les cinq routes, dont
    « le `:postId` du chemin ne vaut rien » et « lire est ouvert là où écrire est refusé ».
  - `__tests__/unit/routes/posts/interactions-audience.test.ts` — 8 cas sur le like/unlike REST,
    dont « un contact DM non-ami est refusé, comme sur le chemin socket ».
  - 9 cas d'audience ajoutés aux deux suites de handlers socket, dont « le `postId` du payload
    n'est pas cru ».
- **15 harnais ont dû déclarer leur audience.** C'est voulu, et c'est le même choix qu'au cycle 28 :
  un double qui n'expose pas la tranche ACL échoue au lieu de rendre un verdict par défaut.
- Le wrapper mort `_canUserViewPost` est retiré.
- **Suite gateway complète : 608 suites, 15 740 tests, tout vert** (avant : 605 / 15 682).
  `tsc --noEmit` propre. Couverture lignes **95,66 %**, en légère hausse.

## Reste ouvert après ce cycle

- **`@Display Name` reste inextractible dans le domaine social** — rendu à la file une TROISIÈME
  fois, même raison mesurée : les deux clients insèrent un **handle**, jamais un nom d'affichage
  (web `MentionAutocomplete` → `onSelect(suggestion.username)`, iOS `FeedCommentsSheet` →
  `"@\(username) "`). Le cas ne se produit qu'en frappe manuelle. **Tête du prochain cycle si rien
  de plus grave n'apparaît.**
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  candidat sérieux annoncé par le cycle 28, non traité : ce cycle a trouvé plus grave dans le même
  chemin. Un seul appelant, qui passe bien le paramètre ; le rendre requis est mécanique.
  **Candidat sérieux pour le prochain cycle**, deux fois annoncé.
- **`createCommentReplyNotification` et `createCommentLikeNotification` ne filtrent pas leur
  destinataire unique** — l'auteur du commentaire parent reçoit un extrait de la réponse **et la
  vignette du post** (`resolvePostMedia`) sans test d'audience. Le cas exige une restriction
  postérieure à son commentaire (dés-amitié, édition de visibilité), donc plus étroit que ce cycle,
  mais c'est le même défaut : `filterPostAudience` s'y applique tel quel. **Prochain lot naturel.**
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). À lancer SANS `--apply`
  d'abord. Action humaine — cette routine n'a aucun accès MongoDB.
- **Les `PostMention` périmées déjà écrites restent en base** (cycle 27, inchangé).
- **Aucune lecture déjà servie n'est rattrapable.** Le correctif ne vaut que pour l'avenir ; les
  fils restreints déjà lus l'ont été.
- **`getMentionsForMessage` / `getRecentMentionsForUser` n'ont aucun consommateur d'écran**
  (cycle 27, inchangé).
- **`MeeshySocketIOManager.getConversationParticipantsForMention`** reste un deuxième exemplaire du
  chargeur de participants (cycle 21, inchangé).
Deux doubles de `TrackingLinkService` ne stubaient que 3 méthodes et **inventaient donc le contrat**
(`MessageProcessor.test.ts`, `conversation-messages-advanced.test.ts`). Ils ont échoué bruyamment
dès que le code a appelé la vraie surface — ce qui est le bon comportement (cf. leçon du 2026-08-07).
Ils reflètent désormais le contrat réel. Les 13 tests qui exerçaient l'exemplaire DUPLIQUÉ de
l'algorithme dans `MessageProcessor` sont remplacés par 3 tests de délégation : l'algorithme a une
seule maison, et un seul lieu de test (`TrackingLinkService.test.ts` +
`TrackingLinkService.dollarSequences.test.ts`, séquences `$` comprises — le cas `<url>` qui n'y
existait pas y a été ajouté).

## Vérification

```
services/gateway : 601 suites / 15640 tests — tous verts
tsc --noEmit     : propre
```

Nouveaux tests : 13 sur l'unité (`reconcileEditedLinks` × 8, `mergeTrackingLinksIntoMetadata` × 5),
11 sur le chemin socket (contenu réécrit persisté + diffusé, retraduction depuis le texte réécrit,
collecte sur le contenu réécrit, mapping d'une URL ajoutée, voisins de `metadata` préservés, vide
établi qui efface, panne qui n'efface rien, hoist top-level, omission du champ sur panne), 4 sur la
route REST (mapping minté et persisté, voisins préservés, vide établi, panne qui n'efface rien),
1 sur le repli `$` du chemin `<url>`.

## Reste ouvert après ce cycle

- **`MessageHandler.handleMessageEdit` ne recalcule pas `conversationMessageStatsService
  .onMessageEdited`** que REST appelle après édition. Septième asymétrie du même handler — la
  dernière recensée, et elle porte sur les statistiques de conversation, pas sur le message.
  **Tête du prochain cycle.**
- **Le payload `message:edited` porte `trackingLinks: []` quand le texte n'en a plus.** Le décodeur
  iOS (`MessageModels.swift`) ne retient le champ top-level que s'il est NON vide, puis retombe sur
  `metadata.trackingLinks` — absent du payload d'édition. Un client qui fusionne
  `{ ...cached, ...edited }` garde donc un mapping périmé jusqu'au prochain rechargement REST.
  Inoffensif (l'URL n'est plus dans le texte, l'entrée est inerte), mais le contrat de décodage
  mériterait de distinguer « champ absent » de « champ vide », comme le fait déjà le serveur.
- **L'édition REST n'émet toujours aucun `mention:created`** (cycle 21). Le chemin socket le fait ;
  REST n'a pas d'`io` sous la main — le câblage passe par `fastify.socketIOManager`.
- **Le domaine social extrait encore avec `extractMentions`.** `routes/posts/core.ts` (création ET
  édition) et `routes/posts/comments.ts` : un `@John Doe` dans un post ou un commentaire ne nomme
  personne — jamais, pas seulement à l'édition.
- **`repair-mention-user-ids.ts` n'a jamais été exécuté** — aucun accès base depuis cette routine.
  À lancer sans `--apply` d'abord.
- **`MentionCreatedEventData.mentionedParticipantId` reste dans les types partagés** et n'est peuplé
  par aucun émetteur ; le SDK iOS le décode. Champ mort des deux côtés.
- **`getMentionsForMessage` et `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est toujours un deuxième
  exemplaire du chargeur de participants** (cycle 21, inchangé).
- **`getLatestMessageSummary` résume le DERNIER message de la conversation, pas celui qu'on vient
  d'acquitter** (cycle 19, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9. Condition préexistante ; la CI ne gate que sur `test:coverage`.
- **La suppression de branche distante échoue depuis cette routine** — à supprimer depuis
  l'interface GitHub.

---

# Cycle 28 — Nommer quelqu'un ne lui donne pas le droit de VOIR

Tête laissée par le cycle 27 :
« **`@Display Name` reste inextractible dans le domaine social.** […] **Tête du prochain cycle
si rien de plus grave n'apparaît.** »

Quelque chose de plus grave est apparu, dans le bloc voisin du même chemin. Le défaut annoncé est
rendu à la file, avec la raison (voir *Reste ouvert*).

## Ce que les deux lots de mention faisaient

`createPostMentionNotificationsBatch` et `createCommentMentionNotificationsBatch` poussaient une
notification `user_mentioned` à **tout** utilisateur nommé dans le texte, sans jamais regarder qui
avait le droit de voir le post. La charge utile n'est pas un simple ping : elle porte
`postPreview` / `commentPreview` — un extrait de 100 caractères du contenu — et
`action: 'view_post'`.

Nommer `@carol` dans un post `PRIVATE`, `ONLY [bob]`, `FRIENDS` (Carol n'étant pas amie) ou
`COMMUNITY` (Carol n'étant pas membre) lui envoyait donc **un extrait du contenu sur son écran
verrouillé**, plus un lien de tap vers un post qui la refuserait. Le même trou existait pour un
commentaire : l'extrait du fil d'un post restreint partait vers un mentionné hors audience.

C'est une fuite de contenu, pas de métadonnée, et elle est **irréversible** — une notification
poussée est arrivée.

## Pourquoi c'était visible dans le dépôt

Ces deux lots étaient les **seules** surfaces d'éventail du domaine social à ne pas filtrer.
Toutes leurs voisines le font déjà, chacune sous un commentaire qui l'explique :

| surface | filtre |
|---|---|
| `createStoryCommentNotificationsBatch` | `canSeePost` (ONLY/EXCEPT/PRIVATE/COMMUNITY) |
| `createFriendContentNotificationsBatch` | branches ONLY/EXCEPT/COMMUNITY |
| `SocialEventsHandler.getVisibilityFilteredRecipients` | tous les broadcasts temps réel |
| `StoryTextObjectTranslationService.resolveBroadcastRecipients` | garde `PRIVATE` explicite |
| **les deux lots de mention** | **aucun** |

## D1 — l'admission n'est pas l'énumération

Toutes les gardes existantes sont des **énumérateurs** : auteur → liste de destinataires, obtenue
en dépliant son graphe. Une mention pose la question **inverse** — l'ensemble des nommés est
ARBITRAIRE (n'importe quel `@handle` du texte) et il faut trancher, un par un, « celui-là a-t-il le
droit ? ».

Réutiliser un énumérateur ici aurait été faux, et de façon coûteuse : pour `PUBLIC` ils rendent
`friendIds`. C'est un choix de **ciblage** (on ne pousse une publication qu'aux contacts), pas une
règle d'admission — un post public se **lit** par n'importe qui. Un inconnu légitimement nommé dans
un post public aurait perdu sa notification, soit le cas le plus courant de tous.

D'où `services/gateway/src/services/posts/postAudience.ts` → `filterPostAudience`, le test
d'admission, distinct et nommé comme tel :

| `visibility` | admis | coût |
|---|---|---|
| `PUBLIC` | tout le monde | **aucune requête** |
| `FRIENDS` | les amis de l'auteur | 1 requête bornée |
| `EXCEPT` | les amis, moins `visibilityUserIds` | 1 requête bornée |
| `ONLY` | exactement `visibilityUserIds` | aucune |
| `COMMUNITY` | les co-membres (cache Redis existant) | mutualisée |
| `PRIVATE` | personne | aucune |
| inconnue | comme `FRIENDS` — **jamais** comme publique | 1 requête bornée |

Trois décisions dans cette table :

1. **L'auteur est toujours admis**, y compris sur un `PRIVATE` : il possède le post, et aucun
   graphe ne l'affirme (on n'est pas ami avec soi-même).
2. **Une visibilité inconnue retombe sur `FRIENDS`**, pas sur `PUBLIC` : un mode ajouté demain au
   schéma sans passer par cette table restreint par défaut au lieu d'ouvrir en grand.
3. **En panne, on REFUSE.** L'échec d'une notification légitime est réparable (la ligne
   `PostMention` est persistée, la mention reste visible en ouvrant le post) ; la fuite ne l'est
   pas. `getCommunityCoMemberIds` rendait déjà `[]` sur exception — même politique.

La requête d'amitié est **bornée aux candidats** (`in: [...candidates]` des deux côtés) et non au
graphe entier : un auteur à 5 000 contacts nommant une personne coûte l'intersection, pas 5 000
lignes. Et le cas dominant — post public — ne coûte **rien**.

## D2 — une garde qu'on peut désarmer par omission n'est pas une garde

`createStoryCommentNotificationsBatch` prend `visibility?` avec défaut `PUBLIC` : oublier le
paramètre rouvre le trou en silence. Les deux lots de mention reçoivent au contraire
`visibility` **requis** (et `postAuthorId` requis côté commentaire, l'audience étant celle du POST
et non celle du commentateur). TypeScript refuse alors l'appel incomplet à la compilation.

C'est la raison de ne PAS avoir choisi l'autre option — recharger le post depuis `postId` dans le
lot : le paramètre requis donne la même garantie, sans requête supplémentaire sur un chemin
d'écriture chaud, et l'échoue au build plutôt qu'à l'exécution. La contrepartie assumée : **9
harnais** ont dû déclarer leur audience. Ils l'ont fait en `PUBLIC` avec la raison écrite — ils
portent sur le contenu, la langue, la priorité, le débit et l'auto-mention, pas sur le droit de
voir.

## Ce qui n'est PAS filtré, et pourquoi

Les lignes `PostMention` / `CommentMention` continuent d'être écrites pour **tous** les nommés.
Elles consignent un FAIT sur le texte (« ce post nomme Carol »), vrai quelle que soit l'audience ;
seule la **livraison** est conditionnée. Trois raisons :

1. Élargir plus tard la visibilité d'un post ne doit pas laisser un mentionné sans ligne.
2. Le consommateur d'affinité (`PostFeedService.getMentionsByPost` → `getReelSeed`) ne classe que
   des `candidateIds` **déjà filtrés par le feed** — vérifié : aucune seconde fuite par ce chemin.
3. Une ligne manquante ne se reconstruit pas (personne ne relit le texte après coup), là où une
   notification manquée est rattrapée par l'ouverture du post.

Les listes de déduplication des routes (`mentionedUserIds` → `excludeUserIds`) restent
**volontairement** l'ensemble complet des nommés. Un mentionné hors audience exclu des buckets de
priorité inférieure ne perd rien : ces buckets appliquent leur propre filtre de visibilité et
l'auraient écarté aussi.

## Vérification

- **25 tests neufs**, écrits AVANT l'implémentation, RED observé à chaque étape :
  - `__tests__/unit/services/posts/postAudience.test.ts` — 15 cas, unité à **100 % lignes et
    branches** (les six modes, l'amitié dans les deux sens, la borne aux candidats, l'auteur
    toujours admis, la panne qui refuse, la visibilité inconnue qui restreint, les court-circuits
    sans requête).
  - `__tests__/unit/services/NotificationService.mentionaudience.test.ts` — 10 cas sur les deux
    lots, dont « l'audience est celle du POST, pas celle du commentateur » et « aucune notification
    quand le graphe est illisible ».
- **4 régressions au niveau ROUTE** : l'audience du post persisté atteint le lot (création),
  l'audience **APRÈS** édition est celle qui s'applique (restreindre et nommer dans la même requête),
  l'audience du post atteint le lot de commentaire, et un post commenté introuvable ne notifie
  personne.
- **Suite gateway complète : 605 suites, 15 682 tests, tout vert** (avant : 603 / 15 655).
  `tsc --noEmit` propre. Couverture globale lignes **95,65 %**, en hausse.

## Reste ouvert après ce cycle

- **`@Display Name` reste inextractible dans le domaine social** — tête annoncée par le cycle 27,
  rendue à la file une seconde fois, et pour la même raison mesurée : les deux clients insèrent un
  **handle**, jamais un nom d'affichage (web `MentionAutocomplete` → `onSelect(suggestion.username)`,
  iOS `FeedCommentsSheet` → `"@\(username) "`). Le cas ne se produit qu'en frappe manuelle. Coût non
  nul : un post n'a pas de participants, l'audience équivalente (auteur + commentateurs + amis, cf.
  `getUserSuggestionsForPost`) demanderait deux requêtes de plus sur un chemin d'écriture chaud.
  **Tête du prochain cycle si rien de plus grave n'apparaît** — deux cycles de suite, quelque chose
  de plus grave est apparu.
- **`createStoryCommentNotificationsBatch` garde son `visibility?` optionnel à défaut `PUBLIC`** —
  le footgun que D2 vient de fermer sur les mentions reste ouvert là. Il n'a aujourd'hui qu'un seul
  appelant, qui passe bien le paramètre ; le rendre requis est mécanique et sans risque.
  **Candidat sérieux pour le prochain cycle.**
- **Les commentaires n'ont pas de route d'édition** — `comments.ts` n'expose que création,
  like/unlike et suppression. Il n'y a donc rien à réconcilier côté `CommentMention` aujourd'hui ;
  le jour où une édition de commentaire apparaît, elle doit naître avec `reconcilePostMentions`
  pour jumeau.
- **Les deux réparations de base attendent une exécution avec accès base**
  (`repair-mention-user-ids.ts`, `repair-tracking-link-created-by.ts`). À lancer SANS `--apply`
  d'abord. Action humaine — cette routine n'a aucun accès MongoDB.
- **Les `PostMention` périmées déjà écrites restent en base.** Les lignes de mentionnés retirés
  avant le cycle 27 survivent. Réparable par le même patron que les deux scripts ci-dessus.
- **Aucune notification déjà poussée n'est rattrapable.** Le correctif de ce cycle ne vaut que pour
  les mentions à venir ; les extraits partis vers des mentionnés hors audience sont arrivés.
- **`getMentionsForMessage` / `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran (cycle 27, inchangé).
- **`MeeshySocketIOManager.getConversationParticipantsForMention`** est toujours un deuxième
  exemplaire du chargeur de participants (cycle 21, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
- **`eslint` ne peut pas tourner sur le gateway** : aucun `eslint.config.js` depuis la migration
  ESLint v9 (`bun run lint` échoue immédiatement). Condition préexistante, non couverte par la CI
  — qui ne gate que sur `test:coverage`.
- **La suppression de branche distante échoue depuis cette routine** (`git push --delete` répond
  « Everything up-to-date » sans agir). Les branches mergées s'accumulent côté remote — à supprimer
  depuis l'interface GitHub.

---

# Cycle 25b — Addendum d'une session parallèle

Deux sessions ont livré le cycle 25 en parallèle. Le refactor des liens de la PR #2650 est
**strictement meilleur** : en réunissant les deux copies, il a trouvé que `createdBy` recevait un
`Participant.id` là où la route `/tracking-links` attend un `User.id` pour AUTORISER l'accès. La
seconde session s'aligne dessus et n'apporte que ce qui manquait — appliqué par-dessus, jamais à la
place. (Leçon d'intégration du cycle 23 : comparer défaut par défaut, jamais « qui est arrivé en
premier ».)

Le cadrage du `@Display Name` social revient au cycle 26 ci-dessus, mieux étayé : les deux clients
insèrent un **handle**, jamais un nom d'affichage. La note de cette session sur le sujet est donc
retirée au profit de la sienne.

## Champ mort retiré — `MentionCreatedEventData.mentionedParticipantId`

Porté par le backlog depuis le cycle 24, vérifié et retiré. Les **trois** émetteurs de
`mention:created` — envoi WS (`MessageHandler`), envoi REST/ZMQ (`MeeshySocketIOManager`), édition
(`emitMentionCreated`) — l'omettent : il n'a jamais circulé sur le fil. Le SDK iOS le décodait dans
`MentionCreatedEvent`, et rien ne lisait la propriété.

Le test de décodage SDK garde la clé dans le JSON **et lui en ajoute une inconnue** : ce qui compte
désormais n'est plus la valeur du champ mais le fait qu'une clé inconnue ne casse pas le décodage —
donc qu'aucun client ne souffre d'une gateway qui l'enverrait encore.

À ne pas confondre avec la colonne physique `Mention.mentionedParticipantId` (Prisma/Mongo), bien
vivante et utilisée par les scripts de migration.

## Écarté après enquête — `getLatestMessageSummary` n'est pas un défaut

Le backlog le portait depuis le cycle 19 : « résume le DERNIER message de la conversation, pas
celui qu'on vient d'acquitter ». **Ce n'en est pas un, et le "corriger" serait une régression.**

iOS applique le `summary` via `bufferBatchDelivery(conversationId:event:)` — un lot au niveau
**conversation**, jamais par message (`ConversationSocketHandler.swift:801`). Le contrat client est
donc « état de livraison de la conversation, ancré sur son dernier message », ce que la méthode
calcule exactement.

Si le serveur résumait le message ACQUITTÉ, lire un vieux message #5 produirait un résumé « lu »
que le client appliquerait **en lot à tous les messages**, y compris #7 non lu. Passer au
par-message demanderait de plumber des reçus par message des deux côtés client : chantier de
contrat, pas correctif. Retiré du backlog comme défaut.
- Les points hérités du cycle 19 restent ouverts tels quels : `getLatestMessageSummary` décrit
  le DERNIER message de la conversation et non celui qu'on vient d'acquitter ; les mentions du
  chemin de lien attendent toujours l'extraction qui écrit `Message.validatedMentions` ; aucun
  client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de lien n'entrent pas
  dans le pipeline audio ; l'arbitrage `delete-for-me` du cycle 12 attend une validation
  humaine.
- **`emitConversationPreviewUpdate` et les autres émetteurs par room personnelle n'ont pas été
  audités contre la même clé.** Ce cycle a traité les trois copies de l'éventail d'accusés ; la
  règle « adresser par `userId ?? id` » vaut pour tout émetteur personnel, et rien ne garantit
  que les autres la respectent. À instruire par une recherche sur `ROOMS.user(` plutôt que par
  déduction.
