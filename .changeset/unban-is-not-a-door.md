---
'@meeshy/gateway': patch
'@meeshy/shared': patch
'@meeshy/web': patch
---

Débannir quelqu'un qui était parti de lui-même le faisait rentrer.

`PATCH …/participants/:userId/ban` cherche sa cible **sans filtrer `isActive`**, et c'est
délibéré : bannir un ancien membre est précisément ce qui l'empêche de revenir par un lien de
partage, `resolveConversationEntry` refusant toute entrée sur `bannedAt`. Cette capacité n'est pas
retirée. Mais les deux moitiés du geste écrivaient sans condition —
`ban: { bannedAt: now, isActive: false, leftAt: now }`,
`unban: { bannedAt: null, isActive: true, leftAt: null }` — et composées sur un ancien membre,
elles font autre chose que ce que leurs noms annoncent.

**Bannir effaçait le départ.** `leftAt` était réécrit à l'instant du bannissement alors qu'il datait
un départ volontaire vieux de plusieurs mois. L'information n'était pas remplacée par une
meilleure : elle était perdue, et c'est elle qui aurait permis au débannissement de savoir quoi
rendre.

**Débannir faisait entrer.** `{ isActive: true, leftAt: null }` sur une personne que le bannissement
n'avait pas sortie — parce qu'elle était déjà dehors — n'annule rien : ça CRÉE une appartenance. Le
débannissement devenait une **quatrième porte d'entrée** dans la conversation, la seule qui
n'obéisse pas à `resolveConversationEntry`, qui ne redonne ni rang ni permissions de nouvel arrivant
(l'ancien `admin` retrouvait son rang dans une ligne périmée — l'inverse exact de ce que la
leçon 89 exige), et qui rebranchait de force les sockets de quelqu'un qui était parti seul.

La décision vit désormais dans une unité pure, `services/conversations/conversationBanState.ts` :
un bannissement ne retire une appartenance que s'il en trouve une ; un débannissement ne rend que ce
que le bannissement a pris. Il lève l'interdiction dans tous les cas — sinon « débannir » ne lèverait
rien, et toutes les portes continueraient de refuser. Savoir laquelle des deux histoires s'est
produite ne demande aucun champ nouveau : le bannissement laisse la trace dans la ligne
(`leftAt === bannedAt` ⟺ c'est lui qui a mis fin à l'appartenance), et l'égalité est **exacte par
construction**, les deux champs recevant le même objet `Date`. Les lignes écrites avant ce cycle
portent toutes cette égalité, donc conservent à l'identique le comportement qu'elles ont toujours eu :
aucune réparation de base n'est nécessaire.

**Le débannissement n'oubliait pas la ligne mise en cache.** `participant-lookup-cache` mémorise
`isActive` 30 s pour éviter une lecture par message envoyé ; le bannissement l'invalide, le
débannissement ne le faisait pas. Pendant une demi-minute, la personne réintégrée restait
`isActive: false` pour le chemin d'envoi et chacun de ses messages était refusé sans qu'aucune ligne
en base ne le justifie.

**Les compteurs de membres des clients suivaient l'événement, pas le fait.**
`conversation:participant-banned` et `conversation:participant-unbanned` portent maintenant
`membershipEnded` / `membershipRestored`. Web (`use-socket-cache-sync`) et iOS
(`ConversationListViewModel`) décrémentaient et incrémentaient sans condition : bannir un ancien
membre faisait dériver le compteur vers le bas, durablement côté iOS où la valeur fausse est
persistée dans le cache local. Les deux champs sont optionnels et leur absence se lit comme `true` —
un serveur antérieur à ce contrat ne bannissait qu'en retirant. Android expose bien les deux
événements mais n'en dérive aucun effectif : rien à corriger de ce côté.
