## L'export RGPD et la purge apparient les DEUX espaces de clés de `uploadedBy`

**2026-11-21 — #20129** (suite de #20113, et désamorçage de #20114 comme chemin
critique de conformité).

### Le contexte

`MessageAttachment.uploadedBy` portait deux espaces de clés jusqu'à #20113 :
l'identité de COMPTE pour les quatre écrivains de téléversement, le
`Participant.id` pour les deux écrivains de COPIE. Les écrivains sont unifiés ;
les lignes déjà écrites gardent l'ancien espace, et rien ne les réécrit.

### La décision

**Une requête à l'échelle d'un compte ENTIER dont ce qui manque ne se rattrape
nulle part apparie les DEUX espaces, maintenant, sans attendre de migration.**
Deux sites sont dans ce cas, et seulement eux :

| site | ce qui manquait | sans recours ? |
|---|---|---|
| `exportMedia` (RGPD art. 15) | les médias TRANSFÉRÉS du compte | oui — aucune autre section ne les rend |
| `purgeAttachments` (fin de grâce) | leurs octets | oui — hors de portée de tout balayage futur |

Les trois autres sites aveugles (`GlobalAchievements`,
`routes/admin/user-member-stats.ts`, `routes/admin/users.ts`) **restent
inchangés, et c'est à dire** : un sous-compte d'AFFICHAGE n'est pas un
manquement, et les corriger changerait des succès déjà attribués.

### La loi, et où elle vit

`uploadedByOfAccount(userId, participantIds)`
(`services/attachments/uploaderIdentity.ts`) rend le filtre des deux espaces.
`userId` y figure TOUJOURS : l'espace nominal ne dépend pas d'une lecture
auxiliaire — ni de son succès.

Le module porte désormais trois responsabilités, séparées : ÉCRIRE l'identité
(`uploaderIdentityOf`, `resolveUploaderIdentity`), RECONNAÎTRE une ligne héritée
par jointure, pour UNE ligne (`ownsAsUploader`), et APPARIER les deux espaces,
pour un COMPTE (`uploadedByOfAccount`). La troisième existe parce que la deuxième
ne se transpose pas : **une requête de masse ne peut pas joindre.**

### Pourquoi par fournées à la purge

Le nombre de participations d'un compte est borné par construction, par rien
d'écrit. Un `findMany` nu rejoint une dette gelée ; **un `take` seul tronquerait
en silence** — c'est-à-dire laisserait des octets d'un compte supprimé
indéfiniment, après une promesse de suppression définitive. La pagination
(`accountParticipantIdBatches`) rend les deux impossibles, et elle est stable
sans curseur : `purgeAccountIsolatedData` garde délibérément les lignes
`Participant`.

Une lecture de participations en ÉCHEC rend exactement le comportement d'avant
#20129 (l'espace nominal seul), jamais rien : la fournée manquée est rejouée par
la passe de maintenance suivante.

### Ce qui n'est PAS décidé ici

La reprise des lignes héritées (#20114) reste une migration de données de
production, donc une décision du porteur (directive #9223). Elle garde sa valeur
d'hygiène — une colonne à deux espaces est une dette — et perd son caractère
d'urgence.
