## 2026-08-11 : L'aperçu de la ligne de liste est un GROUPE, et il voyage PAR DESTINATAIRE

**Statut** : Accepté

**Contexte** : `GET /conversations` hydrate la ligne de liste avec trois champs solidaires —
`lastMessagePreview` (l'original tronqué), `lastMessageTranslations` (la carte du Prisme du lecteur)
et `lastMessageOriginalLanguage`. Les résolveurs jumeaux des deux clients
(`MeeshyConversation.resolvedLastMessagePreview`, `formatLastMessage`) **PRÉFÈRENT la traduction**
à l'aperçu brut : c'est le Prisme, et c'est le cas nominal du produit.

Les deux émetteurs de `conversation:updated` — `emitConversationPreviewUpdate` (édition/suppression)
et `MeeshySocketIOManager._broadcastNewMessage` (envoi) — n'envoyaient que `lastMessagePreview`.
Une édition périme pourtant `Message.translations` **dans la même écriture** que le nouveau contenu
(`routes/messages.ts`, atomique et délibéré). Les clients n'écrasaient donc que l'aperçu et
gardaient la carte de l'ANCIEN texte — **c'est elle qui restait affichée**, indéfiniment, jusqu'à un
rechargement complet de la liste.

**Décision** :
- **Les trois champs voyagent ensemble.** `conversation:updated` porte désormais la paire de Prisme
  à parité avec `GET /conversations`. Le contrat est déclaré sur `ConversationUpdatedEventData`
  (`packages/shared`) plutôt que laissé à l'`index signature`.
- **`null` est une VALEUR, jamais une omission.** Après une édition la carte reconstruite est vide,
  et c'est ce vide REÇU qui périme proprement celle du client. Le client ne peut pas le déduire :
  une édition garde le MÊME `lastMessageId`, donc « vider quand l'id change » laisse passer
  exactement ce cas. Côté iOS, `Optional` ne suffit pas à porter le signal — d'où le tri-état
  `LastMessagePreviewTranslations` (`.unchanged` = clé absente / `.replaced` = clé présente),
  décodé par la PRÉSENCE de la clé.
- **Le payload est construit PAR DESTINATAIRE.** La carte est filtrée aux langues du lecteur ; deux
  participants de prismes différents n'ont pas la même. La question était portée « non tranchée »
  par le backlog depuis le cycle 60 : **elle l'est par le code existant** — la boucle par
  participant était déjà là, elle envoyait simplement le même objet à tout le monde.
- **Les deux émetteurs sont traités ENSEMBLE**, via l'unité partagée
  `socketio/utils/lastMessagePreviewPrism.ts`. Traiter le seul chemin d'édition aurait rendu
  l'aperçu dépendant du transport : traduit après une édition, brut après un envoi.
- **La règle de dédup `userId ?? id` reste dans UN seul endroit.** `participantUserRoomTargets`
  rend `{ room, participant }` et `participantUserRooms` en devient une projection — c'est, selon
  le doc-comment du fichier, « la seule ligne que chaque copie de ce code a ratée ».

**Alternatives rejetées** :
- **Vider la carte côté client dès qu'un nouvel aperçu arrive** : casse le cycle 65. Le chemin
  d'envoi émet `conversation:updated` DERRIÈRE un `message:new` qui vient d'installer la carte ; un
  vide inconditionnel échange un défaut contre un autre.
- **Vider seulement si `lastMessageId` diffère** : une édition garde le même message, donc le même
  id. C'est précisément le seul cas que ce raffinement laisse passer.
- **Un payload unique partagé par la room**, quitte à envoyer les N traductions : multiplierait le
  poids de chaque événement par le nombre de langues de la conversation pour un champ dont le
  client n'affiche qu'UNE valeur — l'exclusion #1 que `buildLastMessagePreviewTranslations`
  documente déjà.
- **Réimplémenter l'ordre du Prisme dans les émetteurs** : `resolveUserLanguagesOrdered` est la
  seule autorité du dépôt sur cet ordre.

**Conséquences** :
- **Une requête de plus par participant sur le fanout d'aperçu** — un `include` du `user` sur une
  requête `participant.findMany` qui existait déjà. Aucune requête supplémentaire : le `select`
  s'élargit, la requête ne se dédouble pas.
- **Changement observable** : après une édition, la ligne de liste affiche enfin le NOUVEAU texte,
  et le fait dans la langue du lecteur dès que la retraduction arrive.
- **Ce que la décision n'assure PAS** : supprimer le DERNIER message ne met toujours pas la ligne à
  jour côté iOS — le nouveau dernier message est plus ANCIEN, donc le garde monotone le rejette, à
  raison selon sa règle. C'est un contrat distinct (« le dernier message recule »), qu'un seul
  timestamp ne peut pas exprimer. Par ailleurs le chemin d'envoi porte toujours
  `lastMessagePreview` NON tronqué, là où `GET /conversations` applique `truncateMessagePreview`.

**Tests** : 12 neufs côté gateway/web — 5 sur `emitConversationPreviewUpdate` (prisme du lecteur,
payload par destinataire, carte nulle après édition, colonnes sélectionnées, participant sans
compte), 2 sur le jumeau d'envoi dont une garde anti-régression du cycle 65 (le
`conversation:updated` d'envoi ne contredit jamais le `message:new` qui le précède, étant construit
depuis le MÊME message), 5 sur `normalizeConversationPatch` (web).
RED observé avant implémentation : 5 rouges côté gateway, 3 côté web. Gate complet : **650 suites /
16 378 tests verts** (base : 650 / 16 371 — l'écart est exactement les 7 témoins gateway, aucun
perdu), `tsc --noEmit` 0 erreur ; web 30 suites / 750 tests verts. Côté SDK iOS, 8 témoins écrits
(5 sur `applyConversationUpdated`, 3 sur le décodage tri-état) — non gatables dans ce conteneur
(aucune chaîne Swift), gate = `sdk-tests.yml` en CI. Total 20 témoins.
