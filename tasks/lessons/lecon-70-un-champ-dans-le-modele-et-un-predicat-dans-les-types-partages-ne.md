## Leçon 70 — Un champ dans le modèle et un prédicat dans les types partagés ne prouvent pas que la règle est CÂBLÉE (2026-08-10, routine messaging, cycle 49b)

`Notification.expiresAt` existait dans le schéma Prisma. `formatNotification` le publiait, le schéma
de réponse Fastify le laissait traverser, `packages/shared/types/notification.ts` en dérivait
`isNotificationExpired`, et `isNotificationUnread` s'en servait pour définir « non lue **ET
valide** ». Un audit qui cherche « est-ce que le produit gère la péremption des notifications ? » en
grepant le nom du champ trouve **cinq preuves que oui**, à cinq étages différents.

La règle n'existait pas. Aucun producteur n'écrivait la colonne — `createNotification` acceptait un
`expiresAt` que personne ne lui passait — et aucune des sept lectures serveur ne la filtrait. Les
deux moitiés étaient écrites, jamais présentées l'une à l'autre.

**Ce qui rend ce cas invisible, c'est qu'il n'a pas de site de défaut.** Un champ oublié dans un
`select` a un endroit précis où l'on peut pointer le manque ; une chaîne dont les extrémités
existent n'en a aucun. Le seul test qui la révèle est celui qui traverse : « une valeur écrite ici
change-t-elle ce qui est lu là-bas ? », jamais « ce champ existe-t-il ? ».

**Règle d'audit** : pour toute colonne dont la présence tient lieu de fonctionnalité, chercher
d'abord **qui l'ÉCRIT avec une valeur non nulle**, et seulement ensuite qui la lit. Un `grep` du nom
du champ mélange les déclarations, les projections et les copies de type — qui coûtent zéro et
prouvent zéro — avec les deux seuls sites qui comptent. Corollaire : une valeur par défaut `null`
généreuse fait passer une colonne morte pour une colonne inutilisée, deux états qu'aucune requête ne
distingue.
