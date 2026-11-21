## Une clause nue n'est pas une fuite — suivre la valeur jusqu'au site qui REFUSE

**Date** : 2026-11-21. **Lot** : #20183 (cycle 202 de la routine temps réel).
**Famille** : #16690 / #20135 / #20155 / #20093.

**Le constat**

Deux documents du dépôt — `services/gateway/CLAUDE.md` et l'issue #20093 —
affirmaient que `POST /conversations/:id/messages` laisse un membre
actif-et-banni ENVOYER un message, sur la foi de sa clause :

```ts
const participant = await prisma.participant.findFirst({
  where: { userId, conversationId, isActive: true },   // ← nue
  select: { id: true }
});
if (!participant) return sendForbidden(reply, '…');
```

La clause est bien nue. **L'envoi est bien refusé.** Cette lecture est un
RÉSOLVEUR d'identifiant ; l'autorisation vit une couche plus bas, dans
`MessagingService.handleMessage`, qui relit la ligne (`findUnique`, `bannedAt`
PROJETÉ) et refuse (#10440) — son cache porte `bannedAt`, et les deux sites de
bannissement l'invalident.

**La règle**

> **« Un audit qui liste des `select:` ne liste pas des fuites » vaut aussi des
> `where:`.** La question n'est pas « cette clause est-elle la bonne ? » mais
> **« qui AUTORISE ce que cette clause rend ? »**, et elle se répond en suivant
> la valeur jusqu'au site qui REFUSE — jamais en lisant la requête.

Le dépôt portait déjà la moitié de cette phrase, pour
`messageMentions.loadMentionParticipants`. Elle n'avait pas été appliquée à
l'inverse : une clause nue **dont on a conclu à la fuite sans suivre la
valeur**.

**Le coût, et il n'est pas documentaire**

Une porte déclarée ouverte par deux documents envoie réparer ce qui tient. Et
pendant que ces deux documents nommaient un site gardé, **six portes de la
famille des liens de partage n'avaient aucune garde** — dont la FABRICATION
d'un lien, c'est-à-dire un contournement du bannissement par procuration. Le
faux constat ne se contente pas de mentir : il **occupe l'attention** qui aurait
trouvé les vrais.

C'est la même économie que « un cliquet qui se trompe sur un site juste coûte sa
crédibilité, et avec elle les constats voisins » — vue depuis le document plutôt
que depuis l'instrument.

**Ce qu'il faut faire, mécaniquement**

Devant une clause nue dont on veut dire qu'elle AUTORISE trop :

1. **Nommer le site du refus** — `sendForbidden`, `throw`, `return null` suivi
   d'un refus. S'il n'est pas dans la même fonction, le trouver.
2. **Lire ce que le callee RELIT.** Un identifiant remis à une couche qui relit
   la ligne entière n'a transporté aucune autorisation.
3. **Regarder le CACHE sur ce chemin**, et qui l'invalide : une garde juste
   derrière un cache que le bannissement n'invalide pas est une garde à TTL.
4. **Prendre la branche la moins fréquentée.** Ici la branche ANONYME ne lisait
   RIEN du tout, et c'est elle qu'on aurait crue la plus exposée — elle tombe
   sur la même garde aval, plus deux refus de plus.

Et symétriquement : **une clause nue dont le site d'appel refuse LUI-MÊME est
une vraie porte**, sans autre vérification à faire. C'est à cela que
ressemblaient les six portes des liens de partage.

**La règle jumelle, du même lot**

> **La question à poser à une porte n'est pas seulement « que LIT-on à travers
> elle ? » mais « que peut-on FABRIQUER avec ce qu'elle rend, et ce que l'on
> fabrique porte-t-il encore le refus ? »** — un artefact neuf hérite des
> droits de son auteur, jamais de ses interdits.

Un lien de partage fabriqué par un membre banni n'a aucun passé :
`resolveConversationEntry` refuse la ligne du banni, il n'a rien à refuser à
l'inconnu qui emprunte son lien. Cinq des six portes rendaient de
l'INFORMATION ; celle-là rendait une CAPACITÉ, et c'est la seule qui rouvrait la
conversation.

**Détail**

`tasks/realtime-sync-audit-2026-11-21-cycle202-20183.md`.
