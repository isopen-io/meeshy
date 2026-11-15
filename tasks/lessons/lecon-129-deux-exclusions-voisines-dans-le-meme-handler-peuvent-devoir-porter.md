## Leçon 129 — deux exclusions voisines dans le même handler peuvent devoir porter sur des identités OPPOSÉES (2026-08-12, routine messaging, cycle 89)

Dans `handleMessageDelete`, deux fan-outs se suivent à dix lignes d'intervalle et excluent chacun
quelqu'un. La file hors ligne exclut **l'ACTEUR** (un modérateur supprime, l'auteur doit l'apprendre
— corrigé à un cycle précédent, avec un commentaire de quinze lignes). Le recalcul du badge de
non-lus exclut **l'AUTEUR** (ses propres messages n'ont jamais compté dans ses non-lus ; le
modérateur, lui, est un destinataire à rafraîchir).

1. **Copier l'exclusion du voisin est le réflexe à combattre.** Les deux lignes se ressemblent, le
   commentaire d'à côté est long et convaincant, et il dit l'inverse de ce qu'il faut faire ici.
   L'exclusion se dérive de la question « de qui l'état ne peut PAS changer ? », jamais de « qui le
   code voisin exclut-il ? ».
2. **Réutiliser l'unité partagée ne dispense pas de rejouer son contrat.** `emitUnreadCountsToRecipients`
   nomme son paramètre `senderId` parce que ses trois appelants d'origine sont des chemins d'ENVOI.
   Sur un chemin de SUPPRESSION, le même paramètre reste juste — mais parce que l'auteur est le bon
   exclu, pas parce que le nom du paramètre le suggère.
3. **Un paramètre trop large invite au cast, et le cast masque le contrat.** `_updateUnreadCounts`
   exigeait un `Message` complet pour n'en lire que `senderId` ; le chemin de suppression, qui ne
   dispose que d'un `select` étroit, ne pouvait l'appeler qu'en mentant (`as Message`). Réduire le
   paramètre à ce que l'unité lit vraiment a supprimé le cast — et rendu l'exclusion visible sur la
   ligne d'appel.

---
