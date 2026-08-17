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
      + leçon 213

## Revue

Voir `tasks/realtime-sync-audit-2026-08-16-cycle54.md` — pourquoi un canal sans
écouteur survit à des audits successifs (rien ne casse qui se voie), le piège de
méthode des deux formes d'abonnement qui a failli faire abandonner la piste, et
les cinq pistes du cycle 55.

PR #3113.
