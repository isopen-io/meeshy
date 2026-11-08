## Une destruction muette ne laisse aucune preuve qu'une garde en aval puisse lire (cycle 143, #16706)

`purgeViewOnceContent` détruit le contenu d'une vue unique — `content: ''`,
`encryptedContent: null`, `translations: null`, `metadata: null`, fichiers
supprimés — et **n'écrit AUCUN `deletedAt`**. C'est délibéré et documenté : la
bulle reste, c'est la raison d'être du module.

La garde de vivacité du rejeu hors ligne (#16685), elle, se prononce sur
`deletedAt` et `expiresAt` — les deux seules preuves que `messageLivenessOf`
connaisse. Et `viewOnceBurnedAt` n'est lu par aucune garde de remise.

Conséquence : un destinataire hors ligne dont la file portait l'entrée `new` de
ce message recevait, à la reconnexion, **son texte entier** — après que le
serveur en ait détruit le contenu, les fichiers et les traductions. Le drain
interrogeait bien la base, et la trouvait **VIVANTE**.

**Aucun témoin ne pouvait l'attraper.** La garde est juste, testée, et son
cadrage est le bon. Elle ne peut simplement **rien lire** : il n'y a aucune
colonne à interroger. Un témoin de la garde l'exerce contre
`deletedAt`/`expiresAt`, et passe. Un témoin du module de purge vérifie que le
contenu est parti de la base, et passe. Le défaut vit dans l'espace exact entre
les deux, et aucune des deux suites n'a de raison d'y aller.

C'est **l'inverse du cycle 124**. Là, un champ (`notificationLocKey`)
**DÉCLARAIT** une restriction que rien n'appliquait. Ici, un module
**APPLIQUE** une destruction qu'aucun champ ne déclare — donc qu'aucune garde en
aval ne peut interroger. Les deux produisent le même symptôme (un secret qui
part) par des chemins opposés, et le second est plus discret : il n'y a pas de
champ trompeur à trouver, il n'y a rien du tout.

> **Devant une destruction, demander ce qu'elle LAISSE DERRIÈRE comme preuve, et
> QUI peut la lire.** Une destruction muette ne protège que ce qu'elle touche
> elle-même. Toute copie du contenu vivant ailleurs — un cache, une file, une
> table dénormalisée, une charge push — restera lisible, parce que la garde qui
> l'aurait refusée n'a aucun moyen d'apprendre que la destruction a eu lieu.

Corollaire opérationnel : **une destruction qui n'écrit aucun marqueur doit
purger elle-même**, site par site, au lieu de compter sur une garde en aval. Le
correctif de #16706 fait les deux — un prédicat de mort partagé pour les
destructions qui LAISSENT une preuve (`deleted` / `expired`), et un appel direct
à la purge pour celle qui n'en laisse pas.

Où elle s'applique encore : tout chemin qui rend un contenu illisible sans
l'annoncer dans une colonne — l'anonymisation de compte, les purges de
rétention. Avant de conclure qu'une garde de remise couvre un cas, vérifier
qu'elle a **quelque chose à lire** pour ce cas-là.
