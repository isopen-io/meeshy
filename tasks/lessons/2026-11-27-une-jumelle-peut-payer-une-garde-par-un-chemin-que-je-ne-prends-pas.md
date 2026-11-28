## 2026-11-27 — Une jumelle peut payer une garde par un chemin que je ne prends pas (#20204)

`PostFeedService.getStatuses` et `PostFeedService.getDiscoverStatuses` sont
voisines, lisent la même table, servent le même type de contenu. La première
écarte les auteurs qu'un blocage sépare du lecteur ; la seconde ne l'a **jamais**
fait, et aucune ligne ne manque dans son code.

La différence tient à une DÉLÉGATION. `getStatuses` appelle
`buildFeedVisibilityFilter`, qui lit les blocages **lui-même** quand on ne lui
passe pas d'ensemble, et pose donc `authorId: { notIn }` sans que personne
l'écrive. `getDiscoverStatuses` compose son `where` à la main — `deletedAt`,
`type`, `visibility: PUBLIC`, l'expiration, le curseur — parce qu'elle ne sert
qu'un `PUBLIC` dont l'audience ne se discute pas. Son prix a été de n'avoir
aucune des clauses que sa voisine reçoit gratuitement.

> **Ce qui rend ce défaut invisible n'est pas un oubli : c'est que la règle
> EXISTE, posée par un collaborateur que cette porte-ci n'appelle pas.** Rien ne
> manque dans la fonction fautive, puisqu'elle n'a jamais prétendu déléguer. Et
> rien ne manque dans la jumelle, qui applique bien la règle. Un relevé « qui
> épelle cette garde ? » ne les distingue même pas : aucune des deux ne l'épelle.
> La question qui l'attrape est **« ma jumelle paie-t-elle cette garde par un
> chemin que je ne prends pas ? »**

C'est la forme du cycle 85 (« un commentaire ne documente que l'exemplaire qu'il
touche ») appliquée non à un commentaire mais à une **composition** : ce qu'on
hérite d'un collaborateur n'est pas visible chez soi, donc son absence ne l'est
pas non plus.

Corollaire outillé, et il est bon marché : devant deux fonctions jumelles dont
l'une compose à la main ce que l'autre délègue, **lire le collaborateur ligne à
ligne** — pas son nom, pas sa signature. `buildFeedVisibilityFilter` déclare un
paramètre `separated` OPTIONNEL dont l'absence déclenche une LECTURE : c'est
exactement le genre de chose qu'on ne devine pas depuis le site d'appel, et c'est
toute la garde.

### Et la même question vaut du PRIX de la garde, pas seulement de sa présence

Le lot jumeau (`GET /posts/:postId`) a fait LIRE les blocages à
`servePublishedPost`, la composition unique d'une réponse de publication. Forme
juste — un paramètre optionnel aurait été un demi-correctif, son absence
désactivant la garde — et **quarante suites sont passées au rouge**, toutes de la
même façon : le double Prisma d'un harnais de création n'a pas de `user`, donc la
lecture lève, donc la route rend 500.

Fail-closed fonctionnait exactement comme annoncé. Et ce qu'il annonçait, c'est
que la garde **ne servait à rien là où elle coûtait** : une publication qu'on
vient d'écrire n'a aucun compagnon — pas de commentaire, et `repostOf` n'existe
que sur une republication. La lecture y décidait de RIEN.

> **Quarante rouges ne sont pas forcément quarante harnais à solder.** Devant une
> garde qui fait tomber un plateau entier de suites, la première question n'est
> pas « comment réparer les doubles ? » mais **« qu'est-ce que ma garde décide,
> sur chacun de ces chemins ? »** — et si la réponse est « rien », c'est le lot
> qui lit au mauvais endroit, pas les harnais qui mentent.

La réparation est un prédicat sur la charge SORTANTE — `hasSeparableCompanions`,
**dérivé des mêmes accesseurs** que le filtre qu'il gouverne, jamais recopié : un
prédicat recopié dériverait au premier compagnon ajouté, et du mauvais côté (en
répondant « rien à filtrer » sur une forme qui porte désormais un tiers). Son
témoin ne l'interroge donc pas seul : il prend chaque forme que le FILTRE sait
toucher, vérifie que le filtre la change, et exige que le prédicat l'annonce.

Et la distinction qui le sépare d'un raccourci de garde tient à ce sur quoi il
porte : **la charge qui SORT, jamais une autorisation.** `false` veut dire « il
n'y a rien à taire », pas « il n'y a rien à vérifier ». Un prédicat de la seconde
espèce — « ce lecteur a-t-il l'air concerné ? » — serait la famille « une garde
conditionnée à ce qu'elle garde est un no-op ».

Mesure après : **93 suites `routes/posts` vertes, 1 546 témoins, sans toucher un
seul harnais.**
