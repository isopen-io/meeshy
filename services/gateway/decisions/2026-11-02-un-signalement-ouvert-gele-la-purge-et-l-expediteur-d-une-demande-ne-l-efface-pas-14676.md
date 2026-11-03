## Un signalement ouvert gèle la purge, et l'expéditeur d'une demande non acceptée ne rend pas la directe obsolète (2026-11-02, #14676)

**Statut** : Accepté — option (a) REMPLACÉE le 2026-11-03 par [la décision #14691](2026-11-03-une-conversation-obsolete-n-est-pas-un-objet-de-signalement-elle-est-detruite-a-48-h-14691.md) : aucun signalement ne gèle plus la purge. L'option (c) reste en vigueur. Le texte ci-dessous décrit l'état du 2026-11-02.

### Contexte

Depuis #14653, l'un OU l'autre membre d'un tête-à-tête le rend obsolète : tout le
contenu des deux devient illisible (`deletedAt` sur chaque message), puis la purge
l'efface à 48 h (`jobs/obsolete-conversation-purge.ts`). L'audit adversarial a
montré qu'un harceleur pouvait ainsi effacer ses messages ET ceux de sa victime,
signalement en cours compris : `Report` ne garde que `reportedEntityId`, et la
purge ne lisait aucun signalement.

### Décision (porteur, options a + c)

**a. Gel de modération.** La purge n'efface pas une conversation visée par un
signalement NON CLOS — `reportedType: 'conversation'` sur elle,
`reportedType: 'message'` sur l'un de ses messages (compté sans regarder
`deletedAt`), ou `reportedType: 'user'` sur l'un de ses membres (ligne
`Participant` active ou partie), comme l'option (a) l'énonce. « Non clos » = tout statut hors `resolved`, `rejected`, `dismissed`,
un statut inconnu gèle (fail-closed). La conversation gelée reste obsolète côté
membres (masquée, hors des listes) ; sa purge recule de
`OBSOLETE_PURGE_REPORT_HOLD_MS` (6 h), et la passe qui suit la clôture du dernier
signalement la reprend. Les signalements se lisent une fois par passe ; si cette
lecture échoue, la passe n'efface rien. Le rapport de passe compte `held`.

**c. Demande non acceptée.** Dans une `direct`, tant qu'une autre ligne
`Participant` porte une demande non acceptée — `NOT_YET_ACCEPTED`, le prédicat
d'`acceptMessageRequest` : `messageRequestAt` OU `messageRequestFromId`, posés sur
le destinataire, effacés par « Accepter » seulement (une réponse garde la
provenance, une ligne antérieure à la provenance n'a que la date) — l'appelant est l'expéditeur : 403
sans écriture, avant toute règle de rôle (l'expéditeur est le créateur de la
directe, donc administrateur) et quel que soit son rôle de plateforme. La ligne
n'est pas filtrée sur `isActive` : un destinataire parti ne rend pas la main.

### Conséquences

- Rétrocompatible : aucune route, aucun champ, aucun événement ne change ; seul
  un nouveau 403 apparaît pour l'expéditeur d'une demande non acceptée.
- Clients : l'expéditeur ne sait pas que sa demande est en attente (les colonnes
  de demande ne lui sont jamais servies, `withoutRequestFields`) ; il reçoit le
  403, et l'action reste proposée — suivi client par issue.
- Le membre signalé avait d'abord été laissé hors périmètre ; l'audit adversarial
  l'y a remis (l'option choisie le nommait). La console de modération ne sert pas d'extrait d'un message
  `deletedAt`, donc un contenu gelé est préservé mais pas encore relu par la
  console — suivi par issue. Une conversation E2EE n'a pas de clair serveur : le
  gel ne préserve que ce que le serveur détient.
