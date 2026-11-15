## Leçon 84 — Deux modèles, un même piège, deux moitiés opposées : ne jamais transporter la réparation de l'un chez l'autre (2026-08-10, routine messaging, cycle 58)

`Post` et `Message` portent tous deux un `deletedAt DateTime?` et affrontent le même piège MongoDB
(une colonne optionnelle jamais écrite est ABSENTE, pas `null`). Ils l'ont résolu par les deux
moitiés OPPOSÉES : `Post` côté lecture (`NOT_DELETED` = `{ isSet: false }`, les posts vivants n'ont
pas la colonne), `Message` côté écriture (les lectures filtrent `deletedAt: null`, les créateurs
écrivent la colonne).

Les deux marchent. Et **la réparation de l'un est un incident de production chez l'autre** :
basculer les lectures de `Message` sur `NOT_DELETED` — le geste « d'alignement » qui saute aux yeux
quand on vient de lire `softDelete.ts` — n'apparierait AUCUN message existant, tous portant un
`deletedAt` présent-et-null. C'est très exactement le post-mortem de `postIncludes.ts`, à l'envers.

Ce que ça ajoute aux leçons 89 et 90 : celles-ci disent qu'une symétrie de SCHÉMA ne prouve rien sur
le comportement. Celle-ci dit qu'une symétrie de PIÈGE n'en prouve pas davantage. Deux modèles
peuvent partager un piège à l'identique et avoir des données incompatibles avec la solution de
l'autre. Le geste : avant de transporter un remède d'un modèle à l'autre, se demander non pas
« le piège est-il le même ? » mais « à quoi ressemblent les LIGNES DÉJÀ ÉCRITES de ce modèle-ci ? ».
La réponse tient dans un `create`, pas dans un schéma.
