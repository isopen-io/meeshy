---
'@meeshy/gateway': patch
'@meeshy/shared': patch
---

La famille est complète : toute notification qui DÉSIGNE un message hérite de son échéance.

Le lot précédent a branché les trois producteurs que l'éventail d'un message appelle — message
régulier, réponse, mention — et a laissé en backlog les deux autres ancrés sur un
`context.messageId`. Les voici, et l'un des deux n'existait pas vraiment.

**La réaction.** `createReactionNotification` lisait déjà le message pour en tirer l'extrait
(`select: { content: true }`) : `expiresAt` voyage dans la même lecture, aucune requête ajoutée. Une
réaction à un message éphémère ouvrait sinon, après expiration, un message absent.

**La mention ajoutée par ÉDITION.** `reconcileEditedMentions` est le second appelant de
`createMentionNotificationsBatch` — le paramètre existait depuis le lot précédent, personne ne le
lui passait. Les deux transports REST chargent déjà le message par `include` (donc `expiresAt` est
là) ; le transport socket ajoute un champ à un `select` qu'il émettait déjà. Aucune requête ajoutée
là non plus.

**La traduction prête n'était pas un producteur.** `createTranslationReadyNotification` n'avait
AUCUN appelant de production — un test était sa seule invocation dans tout le dépôt. Il n'a jamais
écrit une ligne, et aucun client n'a jamais reçu ce type. Retiré. `NotificationTypeEnum.TRANSLATION_READY`
reste déclaré (le SDK iOS le décode) mais porte désormais la mention explicite qu'aucun producteur
ne l'émet — la leçon du lot précédent : une valeur déclarée n'est pas une fonctionnalité, et sans
cette note l'énumération redonnerait à tout audit un cinquième cas à instruire.

L'énumération est vérifiable et fait partie de la revue : quatre méthodes `create*` posent un
`context.messageId`, les quatre estampillent l'échéance.
