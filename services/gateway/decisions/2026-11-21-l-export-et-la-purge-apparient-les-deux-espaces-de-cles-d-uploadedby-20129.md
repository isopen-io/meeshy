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

### Un seul producteur de la liste des sièges

`accountSeatsWhere` / `accountSeatIds` / `accountSeatIdBatches`
(`services/participants/accountParticipantIds.ts`) : **un seul `where`**,
`{ userId }`. Trois sites le réécrivaient — l'export en
`{ userId, type: 'user' }`, la purge et la télémétrie d'appel en `{ userId }` —
et la divergence était un piège armé : dix lignes sous la clause de l'export, la
section `contacts` écrit `{ userId, type: 'user', isActive: true }`, et
quelqu'un l'alignera « par cohérence » un jour, ce qui ferait disparaître de
l'archive de l'art. 15 les médias transférés dans les conversations QUITTÉES,
sans qu'un témoin tombe. Le `type` classe le SIÈGE, pas l'identité qu'il porte ;
le resserrement est inerte sur l'arbre d'aujourd'hui (aucun écrivain ne pose
`userId` sur un siège `anonymous`, et il n'existe aucun écrivain de siège `bot`).

`exportCallTelemetry` et `eraseCallTelemetryOf` y passent aussi : la requête
d'export faisait QUATRE lectures de la même liste, et la section `calls`
manquait à la liste qui décide du calcul — l'énumération affirmait « ce sont les
sections qui en ont besoin » sans l'avoir vérifié (leçon 261).

### Pourquoi par fournées à la purge, et ce qu'une fournée manquée coûte

Le nombre de participations d'un compte est borné par construction, par rien
d'écrit. **Un `take` seul tronquerait en silence** — c'est-à-dire laisserait des
octets d'un compte supprimé indéfiniment, après une promesse de suppression
définitive. La pagination est stable sans curseur : `purgeAccountIsolatedData`
garde délibérément les lignes `Participant`.

**Il n'y a PAS de passe suivante**, et c'est la correction d'une affirmation que
ce lot avait d'abord écrite à trois endroits : `processAccountDeletionRequests`
n'élit que les demandes `CONFIRMED`, et la demande ne l'est plus quand ces
étapes tournent — le seul rejeu manuel (`routes/account-deletion.ts`) n'appelle
même pas ce balayage. Une lecture de sièges en échec laisse donc des octets
**perdus jusqu'à #10021**. Le résultat porte `complete`, le journal de fin passe
en `error` et DIT l'incomplétude : un `info` annonçant « purgé » couvrirait une
perte irréversible.

La descente porte en plus un **plafond de pages** (500). Un `for (;;)` dont la
sortie dépend d'une dépendance n'a aucune borne de vivacité, et celle-ci tourne
dans la passe HORAIRE : une page qui ne progresse pas y bouclait pour toujours.
Le plafond en fait une incomplétude annoncée — et un témoin qui rougit en 24 ms
au lieu de PENDRE, ce qui, en CI, ne se distingue pas d'un environnement cassé.

### Le durcissement qui n'avait pas été dit

Avant ce lot, `uploadedBy: userId` avec un `userId` falsy rendait
`uploadedBy: undefined`, que **Prisma IGNORE** : un `where` qui apparie TOUT.
Du côté de la purge, c'était la destruction de toutes les pièces jointes du
dépôt. `uploadedByOfAccount` rend `{ in: [] }`, qui n'apparie rien, et trois
témoins le gardent.

### Ce qui n'est PAS décidé ici

La reprise des lignes héritées (#20114) reste une migration de données de
production, donc une décision du porteur (directive #9223). Elle garde sa valeur
d'hygiène — une colonne à deux espaces est une dette — et perd son caractère
d'urgence.
