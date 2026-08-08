# Cycle 20 — Un `@alice` envoyé par lien de partage ne nomme personne

Suivi direct du deuxième point laissé ouvert par les cycles 17 à 19 :
« **`mention:created` et les mentions du chemin de lien** — ce n'est pas l'émission qui manque
mais la DONNÉE. `Message.validatedMentions` n'est écrit que par
`MessageProcessor.processMentionsInDB`. `notifyMessageRecipients` accepte déjà
`validatedMentionUserIds` pour que le câblage soit un argument le jour venu. »

Vérifié : réel, et le trou est plus large que « une notification manquante ». Trois effets
partaient ensemble, et les trois manquaient ensemble.

## D1 (racine) — la résolution des mentions vit sous deux niveaux de `private`

`processMentionsInDB` ← `handleMentionsAndNotifications` ← `saveMessage`, toutes `private` sur
`MessageProcessor`. Les deux routes de lien de partage contournent
`MessagingService.handleMessage`, donc `MessageProcessor` en entier — exactement la même forme
qu'aux cycles 15 à 19 (`broadcastLinkMessage`, `runMessagePostSaveEffects`,
`emitUnreadCountsToRecipients`, `notifyMessageRecipients`, `autoDeliverToOnlineRecipients`).

Trois conséquences observables, pour tout `@` envoyé par lien :

1. **Aucune ligne `Mention`.** L'inbox `GET /mentions/recent` lit ce modèle : la mention
   n'existe nulle part côté destinataire.
2. **Aucun `Message.validatedMentions`.** Le web surligne DEPUIS ce champ
   (`use-message-display.ts:50`) : le `@alice` reste du texte brut chez tous ses lecteurs, et
   `staleTime: Infinity` ne relit jamais — donc à vie, pas jusqu'au prochain rafraîchissement.
3. **Aucune notification de mention.** Le mentionné ne recevait que la notification « message
   régulier » — celle que `mentionsOnly` et `isMuted` suppriment toutes deux. Une mention perce
   la sourdine par le lot dédié ; sans le lot, un destinataire en sourdine n'apprenait
   strictement rien.

Portée : le lien de partage est le seul transport d'envoi dont dispose un participant anonyme.
Tout ce trafic, plus celui des inscrits qui écrivent par lien, ne nommait personne.

## D2 (corollaire) — le payload et son schéma 201

Câbler la résolution ne suffit pas : `buildLinkMessagePayload` ne portait pas
`validatedMentions`, et `linkMessageSchema` ne le nommait pas. Le schéma de réponse ne laisse
passer que ce qu'il NOMME — c'est la troncature silencieuse que le cycle 7 avait déjà documentée
sur cinq champs. Un champ ajouté au payload sans l'être au schéma est un no-op côté client.

## D3 (dérive préexistante, corrigée au passage) — `validatedMentions` contenait des rejetés

Le chemin de création persistait `Array.from(userMap.keys())` : TOUS les usernames résolus, y
compris ceux que `validateMentionPermissions` venait d'écarter. Le champ s'appelle
« validatedMentions » et sert à surligner : y laisser un mentionné rejeté surligne quelqu'un qui
n'a reçu ni ligne `Mention` ni notification. Le chemin d'édition
(`messages-advanced.ts`) filtrait déjà, lui, par `validUserIds` — la source unique tranche la
divergence dans le bon sens.

## Plan

- [x] Extraire `resolveMessageMentions` dans `services/messaging/messageMentions.ts` — publique,
      structurale, best-effort, court-circuit inclus
- [x] `MessageProcessor.processMentionsInDB` délègue (l'affectation en mémoire reste chez lui :
      ce sont ses émetteurs socket qui relisent `message.validatedMentions`)
- [x] Supprimer `MessageProcessor.getConversationParticipants`, devenu mort
- [x] Câbler les DEUX routes de lien, avant le payload et avant l'éventail
- [x] `validatedMentions` dans `buildLinkMessagePayload` ET dans `linkMessageSchema`
- [x] 12 unités + 10 tests de route, vus ROUGES avant le correctif

## Revue

### Le court-circuit appartient à l'unité, pas à l'appelant

`handleMentionsAndNotifications` portait la garde « pas de `@`, pas de requête » AVANT d'appeler
la résolution. Recopiée dans deux routes, elle aurait été la moitié oubliable de la leçon 85 :
un troisième écrivain la laisserait tomber et ferait payer quatre requêtes à chaque message.
Déplacée dans l'unité, aucun appelant n'a à la connaître — et les tests de route le verrouillent
(`extractMentionsWithParticipants` jamais appelée sur un contenu sans `@`).

### Attendu, pas fire-and-forget — contrairement à ses quatre unités sœurs

`runMessagePostSaveEffects` et `notifyMessageRecipients` sont lancées sans `await` : leurs effets
ne changent rien à ce que la route rend. La résolution de mentions, si : ses DEUX sorties partent
avec le message — les usernames dans le payload 201 et dans l'événement socket, les ids dans
l'éventail de notifications. L'attendre est ce qui lui donne son sens ; le court-circuit est ce
qui rend le coût nul pour la majorité des messages.

### Le paramètre `senderId` reste un `Participant.id`

`validateMentionPermissions(conversationId, ids, senderId)` compare `senderId` aux `userId` des
membres dans la seule branche `direct`. Le chemin nominal lui passe déjà un `Participant.id`
depuis toujours ; les routes de lien font pareil. La divergence avec le chemin d'édition (qui
passe un `User.id`) est réelle mais préexistante, et une conversation par lien n'est jamais de
type `direct` — voir le point ouvert ci-dessous.

### Reste ouvert après ce cycle

- **Le chemin d'édition est un quatrième écrivain de `validatedMentions`, et il extrait moins
  bien.** `messages-advanced.ts` appelle `extractMentions` (handles bruts) là où la création
  appelle `extractMentionsWithParticipants` (qui résout aussi `@Display Name`). Conséquence :
  éditer un message qui contenait `@John Doe` **efface** la mention — ligne `Mention` supprimée,
  `validatedMentions` remis à `[]` — alors que rien dans le texte n'a changé pour elle. Le
  remède est le même passe-plat : lui faire appeler `resolveMessageMentions` avec une variante
  « remplacement » (purge des lignes existantes + écriture même vide). Non fait ici pour garder
  le cycle d'une seule pièce ; l'unité est en place pour le recevoir.
- **`validateMentionPermissions` reçoit un `Participant.id` à la création et un `User.id` à
  l'édition.** Sans effet observable aujourd'hui (la comparaison ne sert qu'en `direct`, où la
  création laisse donc passer une auto-mention que l'édition refuserait), mais c'est un contrat
  à deux lectures dans une même signature.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est un troisième exemplaire du
  chargeur de participants** (le deuxième vient d'être supprimé de `MessageProcessor`). Même
  corps, même `select`, aucun appelant commun pour l'instant.
- **`getLatestMessageSummary` résume le DERNIER message de la conversation, pas celui qu'on
  vient d'acquitter** (cycle 19, inchangé).
- **Aucun client iOS n'écoute `link:message:new`** — les conversations par lien restent une
  fonctionnalité web (cycle 15). Les mentions de ce cycle suivent le même transport, donc la
  même portée ; la notification de mention, elle, passe par APNs et atteint bien iOS.
- **Les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio** (cycle 16).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
