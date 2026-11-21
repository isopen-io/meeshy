## Un `where` AFFIRME un espace de clés autant qu'une écriture — et c'est là que se cachait la conséquence qui compte

**#20113 / #20114, 2026-11-20.** `MessageAttachment.uploadedBy` avait deux
écrivains et deux espaces de clés : les quatre sites de téléversement y posaient
l'identité de compte, les deux sites de copie le `Participant.id` du
transférant. Le schéma dit `String` ; rien ne distingue les deux.

**Le symptôme par lequel le défaut s'est présenté** était un bouton : le web
compare `piece.uploadedBy === viewerId` pour offrir « supprimer cette pièce », et
le cachait donc sur une copie transférée — que la route de suppression accordait
pourtant, #13608 ayant appris à cette route-là les deux espaces.

**La conséquence qui compte était ailleurs**, et aucune lecture du symptôme n'y
menait :

| site | requête | ce qui manque |
|---|---|---|
| `routes/me/export-sections.ts` | `{ uploadedBy: userId }` | l'export RGPD ne contient pas les médias transférés du compte |
| `services/purgeDeletedAccountMedia.ts` | `{ uploadedBy: userId }` | la purge de fin de période de grâce ne voit pas ces lignes |

### Ce qui l'a rendue visible

Pas une relecture plus attentive du bouton : **un inventaire dont le
discriminant comptait les `where` comme des usages de la clé.** Le premier
balayage que j'avais écrit ne relevait que les ÉCRIVAINS — « les écrivains
décident de l'espace, les lecteurs ne font que comparer ». C'était vrai et
insuffisant : un `where: { uploadedBy: userId }` ne compare pas, il **apparie**,
donc il affirme qu'il n'existe qu'un espace. Quand l'affirmation est fausse, il
ne rend pas un mauvais résultat — **il rend un résultat incomplet, sans erreur,
sans trace.** Un `===` qui se trompe refuse un bouton ; un `where` qui se trompe
omet des lignes d'un export légal.

### La règle

Quand un champ porte une identité et qu'on soupçonne deux espaces de clés,
l'inventaire doit couvrir **trois** formes, pas une :

1. ce qui **pose** la valeur (`data: { champ: … }`) — la cause ;
2. ce qui l'**apparie** (`where: { champ: … }`) — là où une erreur se manifeste
   par une ABSENCE, donc silencieusement, et d'autant plus gravement que la
   requête porte sur un compte entier (export, purge, comptage) ;
3. ce qui la **compare** (`champ === id`) — le plus bruyant, le moins coûteux, et
   le seul qu'un utilisateur signale.

Et l'ordre de gravité est l'inverse de l'ordre de visibilité. Unifier les
écrivains ne répare que les lignes À VENIR : les lignes déjà écrites restent
invisibles aux appariements, et leur reprise est une migration de données — donc
une décision du porteur, pas un lot qu'une session prend (#20114).

### À quoi la reconnaître ailleurs
Tout champ qui porte un identifiant écrit par plus d'un site : `uploadedBy`,
`actorUserId`, `senderId`, les clés de file hors ligne, les clés de room
personnelle. Le dépôt a déjà la convention qui les unifie — `userId ?? id` — et
le défaut est toujours le même : un site qui n'avait pas à la connaître.
