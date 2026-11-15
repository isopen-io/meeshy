## Leçon 92 — un schéma de réponse qui ment ne dégrade pas : il fait tomber la route entière (2026-08-11, routine messaging, cycle 67)

Le cycle 66 laissait comme tête « le mensonge de type » : `Message.translations` est déclaré
`readonly MessageTranslation[]` alors que Prisma en rend une carte Mongo. Chercher à démêler le
type aurait été un chantier de contrat. Chercher **ce que le mensonge produit** a trouvé, en une
heure, une route qui répond 500 en production.

1. **Un mensonge de type se chasse par ses SITES, pas par sa définition.** La question utile n'est
   pas « comment démêler les deux formes ? » mais « qui recopie le résultat Prisma tel quel dans
   une réponse ? ». Elle est greppable (`translations: true` en `select`, puis remonter à ce que
   la route renvoie), elle est finie — dix routes ici — et elle a séparé les huit qui appellent le
   transformateur des deux qui ne l'appellent pas. Démêler le type reste à faire ; il n'aurait rien
   trouvé de plus, et beaucoup plus tard.
2. **`fast-json-stringify` JETTE, il ne coerce pas — donc un champ mal formé casse la RÉPONSE, pas
   le champ.** C'est contre-intuitif : on s'attend à un `translations` vide ou tronqué, on obtient
   un 500 sur l'endpoint entier. Ça change le diagnostic (« la liste d'épingles ne marche plus »
   ne ressemble pas à un problème de traductions) et ça change la gravité. **Avant de conclure
   qu'un champ mal typé « dégrade », faire tourner le vrai schéma de réponse sur la vraie valeur :
   trois lignes de node, et la réponse n'est pas devinable.**
3. **Un fixture de test qui n'existe pas en production est pire qu'une absence de test.** Les
   quatre témoins de la route posaient `translations: null` — le seul cas qui ne casse pas ; le
   fixture du fil posait `translations: []` — une forme que Prisma ne rend JAMAIS. Les deux suites
   étaient vertes et décrivaient fidèlement un monde où le défaut n'existe pas. **Quand un champ
   vient d'une colonne, le fixture doit porter la forme de la COLONNE, pas une forme plausible.**
4. **Deux défauts sur la même surface se masquent l'un l'autre, et le second n'a aucune chance
   d'être trouvé par l'utilisateur.** La bannière web lisait `data.messages[0]` sur une enveloppe
   `{success, data:[…]}` : elle ne s'affichait jamais. Sans épingle traduite, la route répondait
   200 et la bannière restait vide « parce qu'il n'y a rien à épingler » ; avec, la requête
   échouait en 500 et la bannière restait vide pareillement. **Un symptôme d'absence — un écran qui
   ne montre rien — n'a pas de signature : ne jamais s'arrêter au premier défaut qui l'explique.**
5. **Un composant que toutes les suites remplacent par `() => null` n'est pas testé : il est
   caché.** `PinnedMessageBanner` était `jest.mock`é dans les deux seules suites qui le montent.
   Le mock est légitime — ces suites testent autre chose — mais l'absence de suite PROPRE au
   composant l'était moins. **La forme est greppable : un composant `jest.mock`é partout et testé
   nulle part est un candidat de défaut, pas une commodité de test.**
6. **Poser une donnée sur un fil, c'est hériter de ses exclusions.** Corriger le Prisme de la
   bannière mettait pour la première fois `translations[].isEncrypted` sous ses yeux ; sans
   l'exclusion du chiffré, le correctif aurait affiché du base64 dans les conversations chiffrées —
   le défaut exact que le cycle 65 venait de fermer côté iOS. Ce n'est pas un élargissement de
   périmètre : c'est la conséquence directe du geste. **Après avoir branché un champ sur un rendu,
   chercher qui d'autre rend ce champ et RECOPIER ses exclusions, pas ses valeurs.**
7. **Quand le vrai défaut est un mensonge que le compilateur ne peut pas tenir, le témoin le plus
   durable ne porte sur aucune route.** Le contrat `translations` ↔ `messageSchema`, vérifié en
   compilant le vrai schéma, protège toute route future déclarant `messageSchema` — y compris
   celles qui n'existent pas encore. Corriger deux routes ferme deux défauts ; épingler l'invariant
   ferme la classe.
