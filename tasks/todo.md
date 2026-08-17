# Cycle 58 — la socket des notifications pouvait mourir DÉFINITIVEMENT, en silence

## La piste

- [x] Piste ouverte par la relecture de la stratégie de reconnexion (PHASE 2 :
      « reconnection strategy, exponential backoff »). Le couloir principal
      (`socketio/connection.service.ts`) porte DEUX corrections documentées ;
      sa jumelle `notification-socketio.singleton.ts` n'en porte AUCUNE des deux

## Le constat — deux défauts jumeaux, dont le premier ARME le second

- [x] **(a) Le jeton du handshake est un LITTÉRAL** : `auth: { token }`, figé à
      la construction. Socket.IO rejoue `auth` à CHAQUE tentative de
      reconnexion — toutes re-présentent donc le jeton d'origine. Après un
      rafraîchissement silencieux (chemin 401 REST), chaque tentative présente
      des identifiants que la gateway refuse
- [x] **(b) `reconnect_failed` n'est écouté par personne.** La boucle interne de
      Socket.IO abandonne DÉFINITIVEMENT après `reconnectionAttempts: 5`. Rien
      ne la relance : `connect()` n'est appelé que par un `useEffect` monté sur
      l'authentification (`use-notifications-manager-rq.tsx:128`), qui ne
      re-tourne pas sur un échec de socket
- [x] (a) fait tomber (b) en ROUTINE et non seulement sur une longue coupure :
      un rafraîchissement de jeton suffit à brûler les 5 tentatives
- [x] `reconnectionDelay: 5000` sans `reconnectionDelayMax` ⇒ les 5 tentatives
      tiennent ~25 s. Une coupure réseau de 30 s tue le canal
- [x] Conséquence : plus AUCUN `notification:new`, `read`, `deleted`, `counts`
      pour le reste de la session d'onglet. La pastille gèle. Et le rattrapage
      ne part pas non plus — `emitDesync('reconnect')` ne peut plus jamais
      être émis, alors que le fichier documente lui-même que React Query est en
      `staleTime: Infinity` et n'a « aucune autre voie de rattrapage »
- [x] `this.reconnectAttempts++` (dans `connect_error`) est un compteur ÉCRIT et
      JAMAIS LU — il donne l'apparence d'une gestion de tentatives qui n'existe pas

## Correctif — mirroir de la jumelle, plus une subtilité qu'elle n'avait pas

- [x] **(a)** `auth` devient un RÉSOLVEUR appelé à chaque handshake
      (`authManager.getAuthToken()`, repli sur le jeton confié à `connect()`
      pour les porteurs sans localStorage) — exactement `resolveHandshakeToken()`
      de la jumelle
- [x] **(b)** `reconnect_failed` passe la main à une boucle de backoff manuelle
      (exponentielle, plafonnée, avec gigue), qui reconstruit la socket
- [x] **La subtilité propre à ce fichier** : la reprise ne doit PAS passer par
      `disconnect()`. Celui-ci remet `hasConnectedBefore = false` et réinitialise
      `syncSeq` — donc la reconnexion réparée n'émettrait PAS `desync('reconnect')`
      et perdrait le curseur `_seq`. Or ce signal EST le rattrapage. Séparer le
      démontage TECHNIQUE du reset SÉMANTIQUE
- [x] Aligner `reconnectionDelay`/`Max`/`randomizationFactor` sur la jumelle
      (1000 → 30000, gigue 0.5) : la boucle interne couvre alors une coupure
      bien plus longue avant de céder la main
- [x] Retirer le compteur mort, ou l'utiliser réellement pour le backoff

## Gates

- [x] Suite web ciblée verte, témoins neufs
- [x] `tsc --noEmit` web : zéro erreur NOUVELLE (dette préexistante mesurée sur main)
- [x] Preuve par mutation dans les deux sens
- [x] `main` refusionné à la main avant push
- [x] CHANGELOG + journal de cycle + leçon

## Revue

Voir `tasks/realtime-sync-audit-2026-08-17-cycle58.md` — le tableau des deux
sockets web, pourquoi (a) arme (b), et la subtilité du §3-3 (rendre la socket
SANS rendre le rattrapage) sur laquelle une reprise « évidente » se serait
trompée en silence. Huit pistes pour le cycle 59.

Gates constatés : **suite web complète 582 suites / 12 485 témoins verts**, le
fichier visé de 55 à **65 témoins**, `tsc --noEmit` à **1234 sur `main` contre
1233 sur la branche** (zéro nouvelle, une préexistante supprimée), et
**6 mutations** — 5 sous-dosages tous rouges, 1 sur-dosage vert qui a fait
RETIRER une garde inatteignable plutôt que l'habiller d'un témoin.

Deux témoins écrits d'abord passaient à VIDE (ils émettaient sur la socket
d'origine) ; corrigés par une assertion d'identité posée avant l'émission.
Leçon 222.
Gates constatés : **740 suites / 17 937 témoins verts**, `tsc --noEmit` à 0
erreur sur tout le gateway, `conversationWriteAdmission.ts` à 100 % (lignes,
branches, fonctions), 9 témoins neufs, 4 mutations (2 sous-dosages, 2
sur-dosages) toutes rouges comme attendu.

---

# Cycle 54-bis — la carte du Prisme suit le message que la ligne décrit (web)

## La piste

- [x] La leçon 212 (cycle 53) laisse une question mécanique : *quels sont TOUS
      les écrivains de ce que la ligne AFFICHE ?* — posée ici au reste du fichier

## Le constat

- [x] La ligne compose son texte de DEUX moitiés qui ne vivent pas au même
      endroit : `conversation.lastMessage` (objet) et la carte du Prisme
      (`lastMessageTranslations` / `lastMessageOriginalLanguage`, scalaires au
      niveau conversation)
- [x] `resolveLastMessagePreview` PRÉFÈRE la carte au contenu brut — c'est elle
      qui gagne à l'écran
- [x] **Six** écrivains locaux réécrivaient l'objet, **zéro** ne touchait la
      carte : `message:new`, sa branche `fetched`, `message:edited`,
      `message:deleted`, `link:message:new`, et `use-conversations-v2` — un
      SECOND écouteur du même `message:new` sur le MÊME cache
- [x] Cinq ont un `conversation:updated` jumeau qui rattrape — mélange
      transitoire
- [x] **`link:message:new` n'en a pas, délibérément** (`broadcastLinkMessage` :
      « the clients already applied it » — vrai de l'objet, faux de la carte) ⇒
      ligne DURABLEMENT fausse sur les conversations de lien partagé
- [x] Le cycle 52 avait conclu l'inverse (« l'atomicité vient du modèle ») — vrai
      de l'objet, et la carte n'est pas dans l'objet

## Correctif

- [x] `withPreviewMessage({ conversation, message, textChanged? })` — geste
      unique, pur, exporté ; les six écrivains y passent
- [x] **L'identité décide, jamais le contenu** : même id ⇒ la carte reste vraie
- [x] `textChanged` déclaré par l'écrivain — une édition garde l'id et périme les
      traductions côté serveur, l'identité ne peut pas le dire
- [x] Carte périmée ⇒ `lastMessageOriginalLanguage` réaligné sur le message
      installé (règle #3 du Prisme : la langue d'origine concourt à son RANG)
- [x] **Périmer, pas recomposer** : dériver la carte de `message.translations`
      dupliquerait dans le client les 4 exclusions serveur + le plafond de 300
- [x] Ne touche ni `lastMessageAt` ni `updatedAt` — les 6 appelants n'en font pas
      le même usage
- [x] Témoin de SOURCE sur `use-conversations-v2.ts` : deux écouteurs sans ordre
      garanti ⇒ la règle d'identité n'est sûre que si TOUS y passent

## Gates

- [x] Suite web COMPLÈTE : 581 suites, 12 445 témoins verts, 21 ignorés, 0 échec
- [x] 16 témoins neufs — 10 sur le geste pur, 2 de source, 4 d'intégration,
      posés sur la sortie de `resolveLastMessagePreview`, pas sur le champ brut
- [x] **Preuve par mutation dans les deux sens** : neutraliser le correctif tue
      10 témoins, le sur-doser en tue 2 (la borne)
- [x] `tsc --noEmit` — aucune erreur sur les 2 fichiers touchés (le dépôt en
      porte 1234 par ailleurs, préexistantes, comparées fichier par fichier)
- [x] `prisma generate` + `packages/shared` reconstruit avant la campagne
- [x] `main` refusionné à la main avant push
- [x] CHANGELOG racine + journal cycle 54 + leçon 215

## Revue

Voir `tasks/realtime-sync-audit-2026-08-17-cycle54-bis.md` — le tableau des six
écrivains, pourquoi le chemin des liens partagés était le seul sans filet, et
les quatre pistes du cycle 55.

---

# Cycle 54 — le canal que le serveur diffusait pour un client qui n'écoutait pas

## Piste

- [x] Les quatre pistes du cycle 53 ré-instruites — trois RÉTROGRADÉES : les
      handlers de suppression web convergent dans les deux ordres d'arrivée, et
      la garde monotone du web n'a rien à protéger tant qu'aucun recul non
      autoritatif n'existe
- [x] Piste retenue ailleurs : un **diff de couverture d'événements** entre les
      deux clients, sur les 180+ entrées de `SERVER_EVENTS`
- [x] Le premier passage rend un tableau FAUX — le web s'abonne par la
      CONSTANTE, iOS par le LITTÉRAL ; les deux formes se cherchent séparément

## Constat

- [x] `message:hidden-for-me` : web abonné, **iOS aucun abonné**
- [x] `message:restored-for-me` : web abonné, **iOS aucun abonné**
- [x] `personalMessageVisibilitySync.ts` a été écrit pour fermer exactement ça —
      son en-tête décrit l'état d'iOS, quatorze cycles plus tard
- [x] La raison est celle de `delta-tombstones.ts` : **un filtre de LECTURE ne
      rétrécit que ce qu'une NOUVELLE requête renvoie ; il n'a aucune prise sur
      une ligne que le client détient déjà**
- [x] À l'écran : la bulle restait affichée dans le fil iOS pour toute la
      session, pendant que la ligne de liste, corrigée par le
      `conversation:updated` jumeau, annonçait le remplaçant — **l'aperçu et le
      fil se contredisaient franchement**
- [x] Seul un rechargement à froid (`GET /sync`, tombstones `hidden` fusionnées
      dans `deleted`) refermait l'écart

## Pourquoi PAS `markDeleted`

- [x] Le web route bien `hidden-for-me` vers son chemin de suppression — parce
      que ce chemin FILTRE le message hors du cache
- [x] iOS pose une **pierre tombale** : `deletedAt` + contenu vidé, « ce message
      a été supprimé »
- [x] Juste pour une suppression POUR TOUS ; faux ici — le message reste VIVANT
      pour les autres participants
- [x] Et **durable** : le serveur ne renverra plus jamais ce message à ce
      lecteur, donc aucune relecture n'effacerait la pierre. On aurait échangé
      une bulle fantôme contre une tombstone à vie

## Correctif

- [x] SDK — `MessageHiddenForMeEvent` + `PersonalMessageVisibilityRef`, publisher
      `messageHiddenForMe` au protocole, `socket.on` correspondant
- [x] Une LISTE, pas un id (la route en lot en accepte cent) ; `hiddenAt`
      optionnel — il n'arbitre rien, son absence ne doit pas perdre le retrait
- [x] SDK — `MessagePersistenceActor.purgeMessages(ids:)`, le pendant DUR de
      `markDeleted` : la ligne PART
- [x] Résolution par `localId` **OU** `serverId`, comme `markDeleted` —
      l'événement nomme l'id serveur, la ligne locale peut porter son id
      optimiste
- [x] Tables filles balayées depuis les lignes RETROUVÉES, jamais depuis les ids
      reçus (elles sont clées sur le `localId` réel)
- [x] Un refresh PAR conversation touchée — les observateurs de `MessageStore`
      filtrent par `conversationId`
- [x] App — `ConversationSocketHandler` borne le lot au fil qu'il tient ; le
      retrait des favoris accompagne la purge

## Portée assumée

- [x] `message:restored-for-me` NON traité — une APPARITION ne s'écrit pas comme
      une tombstone inversée, et iOS n'expose aucun geste de masquage par message
- [x] Consommateur per-conversation, pas global — les autres fils se réparent au
      prochain chargement REST, déjà filtré côté serveur
- [x] `local_attachments` orpheline : fuite PRÉEXISTANTE (`deleteAll` non plus ne
      la balaie), non introduite ici

## Gates

- [x] Guards CI locales vertes : `check-law-literals.sh`,
      `check-swift-viewbuilder.sh` (2547 fichiers Swift)
- [x] 10 témoins neufs — 3 de décodage, 5 sur la purge, 2 sur le handler
- [x] Aucun fichier TypeScript touché : suites web/gateway/shared non concernées
- [x] Compilation et exécution Swift déléguées à la CI (`iOS` macos-15,
      `SDK Tests`) — aucun toolchain Swift sur l'hôte de cette routine
- [x] CHANGELOG racine + ADR `packages/MeeshySDK/decisions.md` + journal cycle 54
      + leçon 221

## Revue

Voir `tasks/realtime-sync-audit-2026-08-16-cycle54.md` — pourquoi un canal sans
écouteur survit à des audits successifs (rien ne casse qui se voie), le piège de
méthode des deux formes d'abonnement qui a failli faire abandonner la piste, et
les cinq pistes du cycle 55.

PR #3113.
