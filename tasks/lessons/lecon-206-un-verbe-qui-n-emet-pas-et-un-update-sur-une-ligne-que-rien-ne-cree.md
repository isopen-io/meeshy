## Leçon 206 — un verbe qui n'émet pas, et un `update` sur une ligne que rien ne crée (2026-08-16, routine temps réel, cycle 48)

**Le constat.** Sur un même groupe de routes, `PUT` et `PATCH` diffusaient
`user:preferences-updated` ; les deux `DELETE`, non. *Quand un groupe de verbes
partage un effet de bord, l'absence de cet effet sur UN verbe est un défaut
jusqu'à preuve du contraire — pas une décision.* La preuve du contraire existe
parfois (un verbe de lecture n'a rien à annoncer) ; ici les deux `DELETE`
changeaient exactement la même donnée que les deux verbes qui annonçaient.

**La ligne que personne ne crée.** `update` lève `P2025` quand la ligne visée
n'existe pas. La question « qui crée cette ligne ? » n'avait pas été posée : ses
seuls créateurs étaient les `upsert` de `PUT`/`PATCH`, donc un compte qui n'a
jamais rien écrit n'en a pas. *Avant d'écrire `update({ where: { userId } })`
sur une table de préférences, de réglages ou de profil étendu, chercher son
créateur. S'il n'y en a pas à l'inscription, `update` est une bombe à
retardement dont la mèche est « l'utilisateur n'a encore rien fait ».* Et le
symptôme est cruel : la remise à zéro échoue précisément pour celui qui est déjà
à zéro. `updateMany` dit « remets à zéro ce qui existe » sans rien inventer ;
`upsert` créerait une ligne vide pour dire qu'il n'y a rien.

**Le double qui rend vert un chemin rouge.** `update: jest.fn().mockResolvedValue({})` —
la ligne existe TOUJOURS en test. Deux témoins écrits pour le cas « compte sans
ligne » sont passés du premier coup, contre un défaut bien présent. *Un double
de base de données doit modéliser l'ABSENCE autant que la présence : si
`findUnique` peut rendre `null`, alors `update` peut lever, et le double qui ne
sait rendre que le succès rend vert un chemin rouge en production.* Quatrième
cycle consécutif où un double ne modélise qu'un seul état du rangement.

**Vérifier le folklore avant de bâtir dessus.** L'hypothèse de départ était que
`data: { champJson: null }` était lui-même invalide sur un champ `Json?` — la
règle `Prisma.DbNull` que tout le monde récite. Sondée contre un client généré
sur ce schéma, elle est FAUSSE sur MongoDB : le `null` brut passe, et c'est
`Prisma.DbNull` qui lève. Vingt minutes de sonde ont évité un « correctif » qui
aurait cassé les quatre routes. *Une règle d'ORM connue de mémoire dépend du
connecteur : la sonder coûte moins cher que de corriger ce qu'elle a fait casser.*

**Le site de trop.** En voulant faire émettre le `DELETE`, on trouve que le
facteur résolvait Socket.IO lui-même — quatrième site, alors qu'un point unique
est déclaré. Les quatre marchaient, mais l'un lisait un accesseur PUBLIC et les
autres un champ PRIVÉ que seul l'effacement des types à l'exécution rendait
lisible. *Deux sites qui rendent le même objet ne sont pas équivalents si l'un
passe par le contrat et l'autre par l'implémentation : le second casse au
premier renommage interne, sans erreur de compilation et sans appelant à
corriger — il se contente de ne plus rien émettre.*
