## Leçon 280 — une garde qui protège la population la plus NOMBREUSE peut manquer la plus EXPOSÉE (2026-08-24, cycle 127)

`createMessageNotification` relit l'état du message juste avant de pousser, et
abandonne quand il a été rappelé ou a expiré dans la fenêtre de l'éventail. Son
commentaire dit exactement pourquoi, depuis toujours :

```ts
// If the sender soft-deletes / … / lets the message expire in that window we
// MUST NOT leak the original content via the banner.
```

Cette phrase vaut mot pour mot pour les deux autres éventails. Ni
`createReplyNotification` ni `createMentionNotification` ne portaient la moindre
garde : un message rappelé entre son commit et l'éventail poussait son texte
ORIGINAL sur l'écran verrouillé de la personne à qui l'on répond et de tous les
mentionnés, pendant que les membres ordinaires du fil — protégés — ne voyaient
rien.

> **Le lot `regular` sert la population la plus NOMBREUSE ; la réponse sert la
> personne VISÉE, et la mention perce jusqu'à la sourdine.** Une garde posée sur
> le chemin le plus fréquenté se lit comme une garde posée sur le sujet. Elle ne
> l'est que sur son chemin.

### La relecture était DÉJÀ LÀ, et c'est ce qui rend le défaut invisible

Les trois éventails relisent la MÊME ligne, dans la MÊME fenêtre. Le lot
`regular` le fait par `prisma.message.findUnique` ; les deux autres par
`loadMessagePrismSource`, dont le `select` demandait `translations`,
`originalLanguage`, `createdAt`, `messageType` — et passait à côté de `deletedAt`
et `expiresAt`, les deux colonnes qui disent la vie du message.

La garde ne coûtait donc pas une requête : **deux colonnes sur une lecture qui se
faisait déjà.** Même forme qu'au cycle 126, une question plus loin.

Ce qui a tenu le défaut hors de vue est une phrase de doc-comment, écrite comme
un contrat alors qu'elle DÉCRIVAIT un défaut :

```ts
// … pour les éventails dont la lecture n'est PAS un gate d'éligibilité
```

Elle est vraie du code, et c'est tout ce qu'elle est. Rien dans « ce n'est pas un
gate » ne dit *pourquoi ça ne devrait pas en être un* — mais posée en tête d'une
unité, elle se relit comme une décision qu'on n'a pas à instruire. Même famille
que le commentaire du cycle 91 bis qui scellait la 2FA en l'annonçant.

> Devant un doc-comment qui EXEMPTE une unité d'une règle que sa voisine
> applique, la question n'est pas « est-ce exact ? » mais **« qu'est-ce qui
> justifie l'exemption ? »**. Ici : rien.

### Le balayage de rétraction ne rattrape pas ce cas — il ferme la BASE, pas l'ÉCRAN

L'éventail relit le message APRÈS ses trois lots et retire les lignes
`Notification` d'un message rappelé. Sa démonstration est juste et son raisonnement
de fenêtre est exact — pour ce qu'il vise. Il retire une LIGNE ; la bannière, elle,
est déjà sur l'écran verrouillé, et rien ne la rappelle.

> **Une compensation en aval ne remplace pas une garde d'admission quand l'effet
> qu'elle compense est IRRÉVERSIBLE.** La question à poser à tout nettoyage
> a-posteriori : *que reste-t-il de fait que ce nettoyage ne défait pas ?*

### Ce qui a été mesuré et NON corrigé, et pourquoi c'est la moitié la plus utile

Le premier correctif traitait une ligne ABSENTE comme une preuve de rappel. Deux
témoins existants sont tombés — dont un, explicite, qui asserte que la bannière
d'un message VOLATILISÉ part quand même. Il avait raison, et le dépôt disait déjà
pourquoi, dans le balayage de rétraction du même éventail :

> `deletedAt` non nul est la SEULE preuve d'un rappel. Une ligne absente ne prouve
> rien, et aucun chemin de la gateway ne supprime un message physiquement.

Le mécanisme est réel : le message vient d'être committé, et une lecture servie
par un secondaire en retard sur le jeu de réplicas rend `null` pour un message
parfaitement vivant. En faire une preuve ferait perdre des annonces qu'aucun
réessai ne rattrape.

> **Un verdict de garde a trois états, pas deux** : `live`, `gone` (la lecture
> PROUVE), `unknown` (elle n'a rien prouvé — elle a levé, ou n'a rien rendu). Les
> deux derniers se ressemblent et s'arbitrent à l'opposé : fail-CLOSED sur la
> preuve, où c'est un secret qui est en jeu ; fail-OPEN sur l'absence de preuve,
> où c'est une livraison. C'est la leçon 112 (« un `catch` fail-open couvre aussi
> la question qu'on a mal posée ») lue dans l'autre sens.

**Et un témoin qui tombe n'a pas forcément tort.** Deux tests rouges ont fait
CHANGER LA CONCEPTION, pas la fixture : ils portaient une décision antérieure,
raisonnée et écrite. Le réflexe d'ajuster le double pour retrouver le vert aurait
retiré une garantie de livraison sans que rien ne le dise. La décision est
désormais gardée en POSITIF, des deux côtés — les lots qui annoncent quand même,
et celui qui se tait — pour qu'elle cesse de dépendre de la mémoire d'un cycle.

### Un select mort nommait une garde qui n'a jamais existé

Le commentaire du lot `regular` énumérait TROIS causes d'abandon — rappelé, brûlé,
expiré — et `isViewOnce` / `viewOnceCount` étaient SÉLECTIONNÉS pour la deuxième.
Aucune ligne ne les lisait : `NotificationService` était le seul site du dépôt à
demander `Message.viewOnceCount`, et il n'en faisait rien.

Le correctif est de RETIRER le select, pas d'ajouter la garde, et la raison se
mesure : `viewOnceCount > 0` dit que QUELQU'UN a consommé, jamais que CE
destinataire l'a fait — s'y fier ferait taire l'annonce pour tous les autres. Et
le contenu d'un message à vue unique est de toute façon masqué en amont par
`protectedPreview`.

> **Une garde ANNONCÉE par un commentaire et PROVISIONNÉE par un `select` se lit
> comme une garde en place.** C'est la forme du cycle 124 (« annoncée par deux
> champs, appliquée par aucun ») dans sa variante la plus discrète : ici, le
> champ provisionné donne au lecteur la preuve matérielle que quelqu'un y a
> pensé. Vérifier que le champ est LU, pas qu'il est demandé.
