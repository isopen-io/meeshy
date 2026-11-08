## Une protection se lit à sa VALEUR, pas à sa présence — et le champ que j'ajoutais vivait entre deux champs gardés

*2026-11-08 — #17080, cycle 151*

### Ce qui s'est passé

J'ai fait voyager l'enveloppe E2EE sur les trois éventails de notification, pour
qu'une réponse et une mention cessent de rester « 🔒 💬 » dans un groupe
chiffré. Neuf témoins, deux étages, rouge prouvé. Un audit adversarial l'a rendu
BLOQUANT.

Ce que j'avais ouvert : **le texte intégral d'un message à VUE UNIQUE, FLOUTÉ ou
à flamme-œil, sur l'écran verrouillé.** La NSE déchiffre l'enveloppe et ÉCRASE le
corps de la bannière, sans jamais lire la clé de protection. Et sans consommer la
vue unique — le message reste « non vu » dans l'app.

### Pourquoi j'ai cru la question réglée

Parce que j'ai cherché le verrou du cycle 125 et je l'ai TROUVÉ. Le dépôt dit :
`notificationLocKey` est le second verrou, posé par `protectedPreview`, et « sa
présence est une DÉCLARATION de protection, jamais un indice ». J'ai vérifié que
le champ était gardé par `showPreview` et je me suis arrêté là.

Le piège est que la règle citée est **vraie du média et fausse de l'enveloppe**,
pour une raison d'une ligne : **en E2EE, `protectedPreview` rend TOUJOURS un
placeholder.** La présence du verrou ne distingue donc rien. Ce qui distingue est
sa VALEUR, et sa préséance est *éphémère > vue unique > flouté > chiffré* : un
message E2EE **et** à vue unique porte `notification.view_once_message`, pas
`notification.encrypted_message`.

> **Un verrou qui est toujours posé n'est pas un verrou, c'est un champ.** Avant
> de s'adosser à la présence d'un drapeau de protection, demander : *dans le
> régime où je travaille, peut-il être absent ?* S'il ne peut pas, la question à
> poser n'est plus « y a-t-il une protection ? » mais « LAQUELLE a gagné ».

### Et la leçon 275 avait la réponse, à la ligne près

« La charge que ce site remet contient-elle autre chose que ce que je viens de
garder ? — et elle se répond en lisant l'objet remis LIGNE À LIGNE. »

L'enveloppe que j'ajoutais vivait **littéralement entre les deux champs que le
verrou retient** : `pushMediaFields` juste au-dessus, `contentDetailPushFields`
juste en dessous. Si j'avais lu l'objet au lieu de lire le code qui le compose,
trois lignes suffisaient.

### Le corollaire d'audience, qui est le cycle 127 rejoué

Le même audit a trouvé que l'éventail RÉPONSE ne bornait pas son destinataire à
`memberIds` — un membre PARTI ou BANNI recevait la bannière, l'éventail MENTION
bornant la sienne depuis toujours. Nuisance avant mon lot ; **fuite après**, la
clé de session de la NSE étant par EXPÉDITEUR et rien ne la tournant au départ
d'un membre.

> **Donner une charge plus riche à un éventail oblige à relire SON audience, pas
> seulement sa charge.** Ce que je transportais était gardé ; à QUI je le
> transportais ne l'était pas, et les deux questions se posent séparément.

### Ce que je retiens pour le prochain lot de ce genre

Trois questions, dans cet ordre, avant de faire voyager un champ de contenu :

1. **La charge remise contient-elle autre chose ?** — se lit sur l'objet.
2. **Le verrou que j'invoque peut-il être absent dans mon régime ?** — s'il ne
   peut pas, il ne garde rien.
3. **À qui cet éventail remet-il, et qui le borne ?** — la charge et l'audience
   sont deux gardes.
