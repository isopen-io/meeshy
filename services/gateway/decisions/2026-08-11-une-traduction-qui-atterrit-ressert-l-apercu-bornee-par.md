## 2026-08-11 : Une traduction qui atterrit RESSERT l'aperçu — bornée par `PreviewUpdateScope`

**Contexte** : `lastMessageTranslations` est posé sur la ligne de liste par les trois chemins REST
et par les émetteurs temps réel de `conversation:updated`. Le câblage était juste, l'INSTANT ne
l'était pas : l'aperçu est servi à l'ENVOI, quand `Message.translations` vaut encore `null` — la
traduction NLLB arrive une à deux secondes plus tard par ZMQ. Rien ne repassait ensuite. Un lecteur
francophone gardait « Hello » dans sa liste indéfiniment, et le comportement dépendait du parcours :
ouvrir la conversation traduisait la ligne, ne pas l'ouvrir la laissait dans la langue de
l'expéditeur.

**Décision** : `_handleTextTranslationReady` devient le QUATRIÈME émetteur de `conversation:updated`,
en réutilisant `emitConversationPreviewUpdate` — aucune copie du fan-out, du prisme par destinataire
ni de la recomputation du dernier message. Mais une traduction n'est pas une mutation de contenu, et
`PreviewUpdateScope` porte cette différence :

- **`onlyIfLatestIs`** — le fan-out est abandonné si le message traduit n'est plus le dernier de la
  conversation. Son propre chemin d'envoi a déjà servi l'aperçu ; ré-émettre l'ancien ferait
  **reculer** la ligne de liste.
- **`onlyIfPreviewCarriesLanguage`** — n'émet qu'aux destinataires dont la carte RÉSOLUE porte la
  langue qui vient d'atterrir. Le test porte sur la carte SORTIE, donc il hérite gratuitement des
  quatre exclusions de `buildLastMessagePreviewTranslations`.

**Alternatives rejetées** :
- **Faire patcher la ligne par les clients depuis `message:translation`** : l'événement arrive bien
  (tout socket rejoint TOUTES ses rooms de conversation à l'authentification), mais il porte
  `MessageTranslation` — un tableau — là où la ligne consomme une carte compacte `{ langue: aperçu }`
  déjà tronquée et filtrée au prisme. Reconstruire la seconde depuis le premier ferait vivre la
  règle de troncature et les quatre exclusions dans trois clients au lieu du serveur.
- **Un débounce par conversation** pour fusionner la rafale multi-langues en un seul fan-out :
  aurait introduit le PREMIER timer du manager, qui n'a aucun point de fermeture (pas de `shutdown`),
  donc un timer capable de survivre à la suite de tests. `onlyIfPreviewCarriesLanguage` obtient le
  même effet sans état — chaque langue ne touche que ses lecteurs.
- **Émettre inconditionnellement à tous les participants** : une conversation à N langues paierait N
  fan-outs complets par message, sur le chemin le plus chaud du service, dont N−1 strictement
  identiques à l'octet près pour chaque lecteur.

**Conséquences** :
- **Deux requêtes Prisma par traduction du dernier message** (participants + dernier message), en
  parallèle. Quand `onlyIfLatestIs` échoue elles sont toutes deux perdues. Sérialiser les
  économiserait sur ce chemin mais ralentirait l'appelant DOMINANT (l'édition, où les deux sont
  toujours nécessaires) : arbitrage assumé en faveur du chemin dominant.
- **`updatedBy` porte l'auteur du message traduit.** Une traduction n'a pas d'acteur humain et le
  champ est obligatoire ; c'est déjà le repli du chemin d'envoi (`senderUserId ?? message.senderId`),
  et les deux clients ignorent le champ.
- **Changement observable** : la ligne de liste se traduit toute seule, quelques secondes après
  l'arrivée du message, sans que le lecteur ait à ouvrir la conversation.
- **Ce que la décision n'assure PAS** : Android ne décode ni `lastMessageTranslations` ni
  `lastMessageOriginalLanguage` — sa ligne de liste reste dans la langue d'origine, avant comme
  après ce correctif. Le chemin AUDIO n'est pas touché non plus (l'aperçu d'un vocal est un libellé
  de type, pas un texte).

**Tests** : 10 neufs — 6 sur `emitConversationPreviewUpdate` (portée), 4 sur le manager (câblage).
RED prouvé par mutation : gardes retirées ⇒ 3 témoins de portée rouges ; appel neutralisé ⇒ le
témoin de câblage rouge. Deux témoins de portée sont non-discriminants seuls et le disent — ils
verrouillent ce qui ne doit PAS changer.

---
