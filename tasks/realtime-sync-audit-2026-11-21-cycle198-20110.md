## Cycle 198 — l'arrivée dans un groupe ne nomme plus le membre banni (#20110)

**Date** : 2026-11-21. **Base** : `dev` à `599536476`. **Issue** : #20110.
**Milestone** : #286.

### Le défaut, et sa forme

#20100 a resserré l'AUDIENCE de `announceStartedGroup` — qui REÇOIT — et laissé
le sur-ensemble alimenter ce que la charge DIT :

| ce qui partait | d'où |
|---|---|
| `participantIds` nommant un banni-mais-actif | `members.map(…)` |
| le `displayName` du banni comme TITRE du groupe | `generateDefaultConversationTitle(members, …)` |

La seconde est la plus durable : le titre est émis à tous les invités **et**
persisté dans `createConversationInviteNotification`.

> C'est la leçon 275 (cycle 125) appliquée à une ARRIVÉE : une protection se
> mesure sur tout ce que la charge TRANSPORTE, pas sur sa seule liste de
> destinataires. Le lot précédent avait gardé les DESTINATAIRES et laissé
> voyager l'IDENTITÉ — dans la charge qu'il leur remet.

### La mesure qui précède le resserrement, et pourquoi elle n'est pas optionnelle

`CLAUDE.md` énonce le cas où resserrer est **net-négatif** : une liste comparée
par égalité exacte (l'annuaire d'appareils E2EE, #20093) diverge de ce que
l'émetteur adresse, et la panne frappe le membre légitime. La question à poser
est donc *« que fait le site d'en face quand la liste ne correspond pas ? »*.

Relevé sur les trois clients : **aucun ne LIT `participantIds` de cet
événement.**

| client | ce qu'il fait de `conversation:new` |
|---|---|
| iOS | recharge la ligne (`ConversationDiscoveryRowFetcher` — « ne porte que des identifiants ») |
| Android | recharge la ligne (`ConversationRepository`, #13795) |
| web | recharge le fil |

Toutes les occurrences clientes du nom `participantIds` sont le **corps de
création** (client → serveur). Il n'y a donc pas de liste d'en face, et le
resserrement ne peut pas faire diverger quoi que ce soit.

### La décision, écrite sur le site

**Un membre dont la participation n'est pas VIVANTE n'est pas nommé** : il n'a
accès ni à la room ni au REST de la conversation, et l'annoncer comme membre à
ceux qui y entrent affirme une appartenance que toutes les autres portes
refusent.

**Le créateur fait exception, et elle ne coûte rien** : `creatorId` le nomme dans
la MÊME charge, la bannière dit « X vous a ajouté », donc le retirer de la liste
ne cacherait rien et romprait la promesse du contrat
(`ConversationNewEventData.participantIds` — « tous les participants y compris le
créateur »). `generateDefaultConversationTitle` l'écarte du titre par son
`currentUserId`, mesuré sur la fonction.

### Le troisième constat est DOCUMENTÉ, pas corrigé

`startSilentGroup` bascule `firstMessageSentAt` **avant** l'annonce, par un
`updateMany` gardé sur `null` qui ne réapparie jamais. Si tous les membres
non-créateurs sont bannis à l'instant du premier message, l'annonce est perdue
pour toujours. Trois raisons d'assumer :

1. le cas exige que le SEUL autre membre soit banni à cet instant précis ;
2. la perte est RÉCUPÉRABLE — `GET /conversations` sert la conversation au
   membre débanni ; seule la bannière manque ;
3. l'inverse (basculer après, ou ne pas basculer sur audience vide) ferait
   rejouer l'annonce à chaque message suivant — soit le défaut que #14644 a
   fermé. **On échangerait une bannière manquante contre une bannière répétée.**

Comportement NEUF depuis #20100, écrit sur place pour qu'il ne se redécouvre pas
comme un bug.

### Le ROUGE

| mutation | témoin rouge |
|---|---|
| `participantIds` sur le sur-ensemble | « ne nomme pas un membre actif-et-banni » |
| le TITRE sur le sur-ensemble | « ne compose pas le titre avec le nom d'un banni » |
| l'exception du créateur RETIRÉE | « nomme le créateur même banni » |

La troisième est le resserrement **excessif**, que les deux premiers ne
verraient pas : un lot qui ne garde que la fuite peut la fermer trop fort, et la
mesure inverse est ce qui l'en empêche. Chaque témoin tombe seul — la
distribution est la preuve qu'ils mesurent trois choses distinctes.
