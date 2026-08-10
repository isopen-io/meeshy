---
"@meeshy/web": patch
"@meeshy/shared": patch
---

Le web applique enfin le Prisme Linguistique à la ligne de liste, et la langue
d'origine cesse de rétrograder la langue primaire du lecteur.

Le cycle précédent a mis `lastMessageTranslations` et `lastMessageOriginalLanguage`
sur le fil de `GET /conversations`. Le web n'en voyait rien : le type `Conversation`
ne déclarait pas ces champs, `transformConversationData` — un objet construit à la
main — les jetait, et `formatLastMessage` rendait `lastMessage.content` brut. Quatre
couches, aucune donnée. Un lecteur francophone lisait « Hello » dans sa sidebar et
« Bonjour » une fois le fil ouvert, alors que la traduction était déjà arrivée.

`resolveLastMessagePreview` (`@meeshy/shared`) devient le jumeau TypeScript de
`MeeshyConversation.resolvedLastMessagePreview`, et la chaîne web est câblée de
bout en bout : type → transformer → résolveur → ligne.

**Correctif de règle, sur les deux plateformes.** Le résolveur iOS court-circuitait
dès que la langue d'origine apparaissait *quelque part* dans le prisme du lecteur.
Cette formulation par appartenance rétrograde silencieusement la langue PRIMAIRE
dès que la langue d'origine occupe un rang inférieur — précisément ce que produit
la locale appareil, entrée en 4e priorité. Prisme `['fr', 'en']`, message anglais,
traduction française disponible : elle rendait « Hello ». `CLAUDE.md` dit l'inverse
noir sur blanc — « un utilisateur francophone avec un iPhone en anglais voit
TOUJOURS ses messages en français (priorité 1) » — et le chemin du CORPS des
messages appliquait déjà la bonne règle en ne comparant qu'à la langue de tête.

Le prisme est désormais parcouru par RANG : la langue d'origine y concourt à sa
place, et la première langue servie gagne — par traduction, ou parce que le message
est déjà écrit dedans. La règle #3 est inchangée : jamais de repli sur une
traduction quelconque.
