# Itération 280 — La confidentialité des accusés de lecture protège aussi la consommation média

Issue : **#3907** (`bug`, `gateway`, `sécurité`) · milestone « La confidentialité de
lecture protège aussi la consommation média ».
Jumelle de `_loadReadReceiptOptOuts` (`MessageReadStatusService.ts`) et de
`broadcastReadStatus` (versant temps réel).

## État actuel

La réciprocité `showReadReceipts = false` (« je ne partage pas mes accusés ») est
posée côté SERVEUR — autoritaire — sur les accusés de lecture TEXTE. Elle vit
dans un helper unique, `_loadReadReceiptOptOuts`
(`services/gateway/src/services/MessageReadStatusService.ts:1174`), qui résout
l'opt-out par le SSOT `loadPrivacyPreferencesCached`. **Cinq lecteurs texte
l'appliquent** :

- `getMessageReadStatus` (résumé + détail par-participant),
- `getConversationReadStatuses` (lot),
- `getMessageStatusDetails` (feuille de détail texte),
- `getLatestMessageSummary` (résumé diffusé),
- et le versant TEMPS RÉEL `broadcastReadStatus` (`socketio/broadcastReadStatus.ts:285`),
  qui — sur un `read` — **ne diffuse RIEN aux pairs** quand l'acteur a coupé ses
  accusés (seule une synchro interne part vers sa propre room personnelle).

## Problèmes identifiés

La **consommation MÉDIA** (audio écouté, vidéo regardée, image ouverte) porte
exactement les mêmes accusés — position de lecture, couverture des segments,
indicateur « terminé », nombre d'ouvertures, langues consultées, et la TRACE
détaillée des écoutes avec leurs motifs d'arrêt. Deux surfaces la servent, et
**AUCUNE des deux ne consultait la préférence** :

1. **REST — `getAttachmentStatusDetails`** (`MessageReadStatusService.ts:2139`).
   Le tell : son `select` participant ne chargeait même pas `userId` (la clé
   dont `_loadReadReceiptOptOuts` a besoin). `total`, la page, `hasMore` et
   `languageBreakdown` étaient tous dérivés des lignes brutes, opt-out compris.
   Son doc-comment jumeau (`getMessageReadStatus:1731`) déclare pourtant que « la
   consommation d'attachment doit sortir en amont et ne pas reparaître par ce
   biais » — la règle était énoncée, jamais câblée sur cette porte.

2. **Temps réel — `attachment:status-updated`** (`routes/messages.ts:1340`).
   Poussait `userId` / `playPositionMs` / `durationMs` / `percentage` à TOUTE la
   room de conversation, sans aucune vérification de préférence — et le web la
   persiste activement en cache (`use-socket-cache-sync.ts`).

Les deux surfaces sont atteignables par TOUT participant actif de la
conversation (mêmes gates d'accès que le texte), pas seulement l'expéditeur.

## Causes racines

Le lot qui a posé la réciprocité (design « lecture exacte », 2026-07-24) a fermé
les CINQ lecteurs texte et n'a pas suivi la même donnée — les accusés — quand
elle change de MÉDIUM (du texte à l'audio/vidéo/image). C'est la forme, côté
confidentialité, de la règle du dépôt : *une protection de contenu se mesure sur
tout ce que la charge transporte* (cycles 125/128) — ici la charge n'est pas un
autre champ du même objet, c'est la même règle sur une autre TABLE
(`AttachmentStatusEntry`) et un autre CANAL (Socket.IO).

## Impact métier / technique

Contournement d'une garde de confidentialité. Un utilisateur qui a désactivé ses
accusés de lecture voyait quand même sa consommation média — la plus granulaire
qui soit (jusqu'où il a écouté, combien de fois il a rouvert une image, dans
quelles langues, et la trace des pauses/abandons) — servie aux autres membres,
alors que le versant TEXTE le masquait déjà sur la même conversation. Fuite
INCOHÉRENTE au sein d'une même surface produit.

## Évaluation du risque

Faible. Les deux correctifs alignent EXACTEMENT sur des jumeaux testés, réutilisent
le SSOT de préférence partagé (`_loadReadReceiptOptOuts` / `shouldShowReadReceipts`,
tous deux adossés à `loadPrivacyPreferencesCached`), et sont fail-OPEN sur erreur
de lecture de préférence (`_loadReadReceiptOptOuts` rend un `Set` vide → tout le
monde reste visible), cohérent avec les cinq sites existants — une notification
appauvrie se rattrape, jamais une panne de préférence qui masquerait tout.

## Améliorations proposées

- **REST** : résoudre les consommateurs DISTINCTS de la pièce jointe, charger
  leur `userId` (réutilisé pour l'affichage — pas de requête d'affichage en
  double), calculer l'opt-out via `_loadReadReceiptOptOuts`, et poser
  `participantId: { notIn: [...optedOut] }` sur le `whereClause` AVANT le `count`
  et la page — pour que total/page/hasMore/languageBreakdown restent cohérents.
- **Temps réel** : gate `shouldShowReadReceipts(userId, isAnonymous)` avant l'émission
  vers la room, exactement comme `broadcastReadStatus:285`. Anonyme ⇒ défaut ⇒
  diffuse.

## Critères de validation

- RED→GREEN sur `getAttachmentStatusDetails` : un opt-out absent de la réponse,
  exclusion portée par la REQUÊTE (count + page), pas par un tri JS.
- RED→GREEN sur le chemin de diffusion : opt-out ⇒ aucune émission
  `attachment:status-updated` aux pairs ; non-opt-out ⇒ émission normale.
- Non-régression : suite `MessageReadStatusService` (239/239), `messages-extended`
  (29/29), et les suites de lecture voisines (64), `tsc --noEmit` gateway EXIT=0.

## Dimensions

Sécurité (1) — mûre : garde fail-closed sur le contenu servi, champ voisin
(`userId`) relu, deux surfaces (REST + temps réel) fermées ensemble. Complétude
(13) — la matrice texte × média est désormais remplie côté serveur.
