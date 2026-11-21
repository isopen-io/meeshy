## Cycle 197 — l'export RGPD et la purge apparient les DEUX espaces de clés, sans attendre aucune migration (#20129)

**Date** : 2026-11-21. **Base** : `dev` à `feab8d070`. **Issue** : #20129.
**Prédécesseur direct** : cycle 196 (#20113), dont ce lot solde le suivi le plus
coûteux.

### Ce que le cycle 196 avait laissé, et l'erreur de cadrage qu'il portait

#20113 a unifié les écrivains de `MessageAttachment.uploadedBy` sur l'identité de
COMPTE. Les lignes déjà écrites — les copies transférées, portant un
`Participant.id` — gardent l'ancien espace, et cinq requêtes à l'échelle d'un
compte entier les ratent. Le cycle 196 en a conclu qu'il n'y avait qu'un remède,
la reprise des lignes héritées, donc **une migration de données de production,
donc une décision du porteur** (#20114, `décision-produit`).

C'était faux pour les deux sites qui comptent, et le relevé qui le montre est à
CÔTÉ du défaut : `exportReactions`, dans le même fichier, traite exactement ce
problème depuis toujours — son doc-comment nomme « deux conventions de
propriétaire » et elle reçoit `participantIds`. La liste est calculée **une
fois** par `me/export.ts`, dix lignes au-dessus de l'appel à `exportMedia`, qui
ne la recevait pas.

> **La valeur qui répond à la question était déjà en main, et c'est la
> PROJECTION du paramètre qui rendait la réponse impossible en aval** — leçon
> 276, troisième occurrence après #19971 et #20113. Deux cycles de suite, le
> lot a cherché la réponse dans une migration ou dans un verdict servi, quand
> elle était dans la signature de la fonction voisine.

### Le livrable

1. **`services/attachments/uploaderIdentity.ts`** reçoit la troisième
   responsabilité du module, et la loi des deux espaces vit à UN endroit :
   `uploadedByOfAccount(userId, participantIds)` rend le filtre
   `{ in: [...] }` — `userId` TOUJOURS présent, même quand la liste des
   participations est vide ou que sa lecture a échoué. `accountParticipantIdBatches`
   sert le balayage qui n'a que son `userId` en main.
2. **`exportMedia(prisma, participantIds, userId, page)`** — la signature de sa
   voisine `exportReactions`, et la même raison.
3. **`SECTIONS_NEEDING_PARTICIPANT_IDS` / `needsParticipantIds`** : la condition
   qui décide si `me/export.ts` calcule la liste vit avec les sections qui en
   dépendent, parce que c'est le seul endroit où l'on sait POURQUOI. `media` y
   manquait — un export qui ne demande QUE les médias ne calculait donc rien, et
   le correctif de `exportMedia` seul serait resté sans effet sur le cas le plus
   probable d'un export ciblé.
4. **`purgeAttachments`** boucle sur les fournées de participations.
5. Le cliquet gagne un verdict, `account-and-legacy`, et son plafond d'aveugles
   passe de **5 à 3** — la seule direction autorisée.

### Pourquoi des FOURNÉES à la purge, et pas une liste

Le nombre de participations d'un compte est le nombre de conversations qu'il a
rejointes : borné par construction, par rien d'écrit. Un `findMany` nu
rejoindrait la dette gelée par `unbounded-findmany-guard.test.ts` ; **un `take`
seul tronquerait en silence**, c'est-à-dire laisserait des octets d'un compte
supprimé hors de portée de tout balayage futur, après que `privacy.json` a promis
« suppression définitive ». La pagination rend les deux impossibles, et elle est
stable sans curseur : `purgeAccountIsolatedData` garde délibérément les lignes
`Participant`, « ce qu'un AUTRE participant continue de VOIR ».

Le filtre d'ids en échec (`notIn`) est PAR fournée : un attachment qui résiste
n'appartient qu'à une seule d'entre elles.

### Le ROUGE, prouvé par mutation

| mutation | témoins rouges |
|---|---|
| `exportMedia` revient à `uploadedBy: userId` | 1 (la pièce héritée n'est plus servie, ni comptée) |
| la purge apparie `{ in: [userId] }` | 2 |
| `media` quitte `SECTIONS_NEEDING_PARTICIPANT_IDS` | 1 |
| un site RECOPIE la loi au lieu de l'appeler (`{ in: [userId, ...ids] }` inline) | le cliquet |

### Ce que le cliquet a appris de lui-même, et qui a changé le code

Le premier jet mettait le filtre dans une variable passée à la fonction de
fournée, donc le `where` s'écrivait **`uploadedBy,`** — une forme abrégée que le
discriminant du balayage (`/\buploadedBy\s*\??\s*:\s*/`) ne peut pas voir. Le
cliquet est resté VERT, et ce qu'il comptait à la place était l'annotation de
TYPE du paramètre (`uploadedBy: { in: string[] }`) : un compte juste pour une
raison fausse.

> **Un cliquet qui rassure à tort est pire que pas de cliquet** (#20113, F2-F4),
> et il peut y arriver sans qu'on touche à son discriminant : il suffit que le
> code change de FORME. La question à poser après tout refactor d'un site gelé
> n'est pas « le cliquet passe-t-il ? » mais **« voit-il encore ce qu'il
> prétend voir ? »** — et elle se répond en imprimant ce qu'il relève, jamais en
> lisant son verdict.

La structure du lot en a été changée : le générateur rend des identifiants de
participation, et **le `where` est composé à l'endroit où il est posé**. Plus un
témoin qui rend l'étiquette MESURABLE — les deux sites passent par le site
unique, et cesser d'y passer le fait tomber.

### Ce qui RESTE, et qui le dit

- **#20114 reste pertinente comme hygiène de données** — une colonne à deux
  espaces est une dette, même quand ses lecteurs qui comptent savent lire les
  deux. Elle cesse d'être le chemin critique d'une conformité : elle peut
  attendre sa mesure et son feu vert sans que rien ne manque entre-temps.
- **Les trois sites aveugles restants sont des compteurs d'AFFICHAGE**
  (`GlobalAchievements`, `routes/admin/user-member-stats.ts`,
  `routes/admin/users.ts`) : ils sous-comptent les copies héritées. Un
  sous-compte d'affichage n'est pas un manquement, et les corriger changerait
  des succès déjà attribués — c'est écrit dans le gel, pas déduit à chaque
  lecture.
- **`PostMedia.uploaderId` n'a qu'UN espace** (la question de la jumelle, posée
  et mesurée) : ses quatre écrivains (`PostService`, `postMediaCopy`,
  `siblingPublicationMedia`, `mediaOwnership`) posent tous une identité de
  compte, et son chemin de reprise (`mediaOwnershipBackfill`) la résout depuis
  l'auteur du post. L'export et la purge continuent de l'apparier par égalité,
  et c'est juste.
