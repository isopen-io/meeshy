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
   `{ in: [...] }` — `userId` TOUJOURS présent, même quand la liste des sièges
   est vide ou que sa lecture a échoué.
   **`services/participants/accountParticipantIds.ts`** est le producteur unique
   de la liste des sièges (`accountSeatIds`, `accountSeatIdBatches`), que TROIS
   sites lisaient avec trois `where` différents.
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
rejointes : borné par construction, par rien d'écrit. **Un `take` seul
tronquerait en silence**, c'est-à-dire laisserait des octets d'un compte supprimé
hors de portée de tout balayage futur, après que `privacy.json` a promis
« suppression définitive ». La pagination l'empêche, et elle est stable sans
curseur : `purgeAccountIsolatedData` garde délibérément les lignes
`Participant`, « ce qu'un AUTRE participant continue de VOIR ».

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


## L'audit adversarial a rendu le lot BLOQUANT, et il avait raison sur les sept

Lancé avant fusion parce que le lot touche une purge de données et un export
RGPD (directive porteur 2026-10-03). Verdict : **bloquant sur deux constats**,
cinq autres à solder. Le correctif lui-même a tenu — pas de fuite, pas d'octet
d'autrui détruit — et ce sont **la preuve et le récit** qui ne tenaient pas.

### F1 — un témoin JUMEAU existait, et le lot ne l'avait pas cherché

`purgeDeletedAccountMedia.test.ts` assertait `{ uploadedBy: USER_ID }` sous un
intitulé qui disait « *même filtre que export-sections.ts* » — c'est-à-dire
exactement la propriété que le lot changeait des DEUX côtés. Le lot a adapté la
jumelle EXPORT et oublié la jumelle PURGE.

> « Les témoins du lot sont verts » est une phrase vraie et **sans
> pertinence** : le gate n'exécute pas les témoins du lot, il exécute la suite.
> La question « cette entité a-t-elle une jumelle ? » vaut du TÉMOIN comme du
> CODE, et c'est le même lot qui doit se la poser.

### F2 — « la fournée manquée est rejouée par la passe suivante » : il n'y a PAS de passe suivante

Écrit à TROIS endroits par moi, dont le commentaire du témoin qui « prouvait » le
comportement. Le dépôt dit l'inverse à l'endroit qui décide
(`MaintenanceService`) : `processAccountDeletionRequests` n'élit que les demandes
`CONFIRMED`, et la demande ne l'est plus quand ces étapes tournent ; le seul
rejeu manuel n'appelle même pas ce balayage. Une lecture de sièges en échec
laissait donc des octets d'un compte supprimé **perdus pour toujours**, sous un
`log.info` disant « purgé ».

> Le code fail-open était défendable ; le justifier par un rejeu INEXISTANT ne
> l'était pas. C'est la famille « un commentaire qui ÉNONCE une contrainte est
> une AFFIRMATION », et la forme la plus coûteuse : **une fausse raison ferme la
> question** pour tous ceux qui la reliront.

Soldé : `complete` sur le résultat, `log.error` qui DIT l'incomplétude, les trois
phrases corrigées, et #10021 nommée comme ce qui manque vraiment.

### F3 — la pagination, moitié la plus argumentée du lot, n'avait AUCUN témoin

Le double du seul témoin de la purge rendait UNE ligne, donc
`rows.length < batchSize` sortait à la première fournée : le chemin
multi-fournées n'était jamais exercé. L'audit l'a prouvé par la pire mutation
possible — retirer `skip += rows.length`, ce qui fait boucler la passe HORAIRE de
maintenance indéfiniment — et **58 témoins sont restés verts**.

> Un argument de deux paragraphes dans un document de décision n'est pas une
> garde. Ce qu'un lot défend le plus longuement est ce qu'il doit mesurer le plus
> précisément.

Et le premier témoin écrit pour l'attraper **PENDAIT** au lieu de rougir — en CI,
indistinguable d'un environnement cassé. D'où le vrai correctif, qui est de
PRODUCTION : la descente porte un **plafond de pages** (500), un `for (;;)` dont
la sortie dépend d'une dépendance n'ayant aucune borne de vivacité. La mutation
rougit maintenant en 24 ms.

### F4 — la raison du `failedIds` par fournée était fausse, et le coût réel l'inverse

« Un attachment qui résiste n'appartient qu'à une seule fournée » : faux par
l'invariant que j'avais moi-même déclaré deux fichiers plus loin —
`uploadedByOfAccount` met `userId` dans CHAQUE fournée. Une pièce de l'espace
nominal appartenait donc à toutes, et était retentée une fois par fournée : 250
fois pour un compte à 50 000 participations. `failedIds` est hissé hors de la
boucle.

### F5 et F6 — la loi tenait le FILTRE, pas le PRODUCTEUR

Trois sites lisaient « les sièges de ce compte » avec trois `where` :
`{ userId, type: 'user' }` (export), `{ userId }` (purge), `{ userId }`
(télémétrie d'appel) — et le nouveau cliquet ne voyait rien de cette divergence,
puisqu'il ne cherche que la forme du filtre. Piège armé concret : dix lignes sous
la clause de l'export, `contacts` écrit `{ userId, type: 'user', isActive: true }`,
et l'aligner « par cohérence » ferait disparaître de l'archive de l'art. 15 les
médias transférés dans les conversations QUITTÉES, **sans qu'un témoin tombe**.

Et `SECTIONS_NEEDING_PARTICIPANT_IDS` affirmait plus qu'elle ne mesurait : la
section `calls` avait besoin de la même liste et la relisait chez elle —
quatrième lecture de la même liste dans la même requête. Leçon 261, dans le lot
qui la cite.

Soldé par un producteur unique, et par un cliquet de SOURCE qui garde l'absence
d'un second lecteur. Son discriminant est le **`select`**, pas la table : une
lecture qui ne demande que `id` ne peut répondre qu'à une question, et la lecture
de `contacts` — qui demande la conversation et ses co-participants — en pose une
autre, donc sort par CONSTRUCTION et non par exemption.

### Le durcissement que je n'avais pas vu, et que l'audit a nommé

Avant ce lot, un `userId` falsy rendait `uploadedBy: undefined`, que **Prisma
IGNORE** : un `where` qui apparie TOUT — du côté de la purge, la destruction de
toutes les pièces jointes du dépôt. `uploadedByOfAccount` rend `{ in: [] }`.
C'était le meilleur effet du lot et il n'était écrit nulle part.

### Ce que l'audit a cherché et NON trouvé

Voir ou détruire la pièce d'autrui (les deux producteurs sont scopés sur le
`userId` de l'appelant, d'origine sûre) ; libérer un octet PARTAGÉ
(`deleteAttachment` ne délie qu'à `count({ filePath }) === 0`, après la ligne) ;
double comptage, non-terminaison ; collision `Participant._id` ↔ `User.id`
(théorique) ; la divergence `type` (inerte, mais armée) ; l'arité d'`exportMedia`
(un seul appelant de production).

### Un cliquet d'inventaire ne se relâche pas pour faire de la place

Le producteur unique a d'abord porté son `where` dans un helper partagé — forme
que le cliquet des audiences ne peut pas traverser : il publiait les deux
lectures en `appel` et son plafond de lectures non jugeables montait de 52 à 54.
Le `where` est redevenu LITTÉRAL aux deux lectures, et la loi tient par le
MODULE : trente lignes d'écart, un témoin de source contre tout second lecteur,
et chaque lecture jugeable là où elle est posée.

## Ce qui RESTE, en issues

- **#10021** (« rejouer une étape de suppression jusqu'au succès ») devient le
  chemin critique de la promesse « suppression définitive ».
- `exportMedia` sert des pièces de messages SUPPRIMÉS ou EXPIRÉS, là où la
  section `messages` filtre — préexistant, élargi par ce lot.
- L'archive ne porte **ni provenance** (`isForwarded`, art. 15(1)(g)) **ni
  marque de chiffrement** (`isEncrypted`/`encryptionMode`, art. 20) : des octets
  chiffrés y sont présentés comme un média ordinaire, sans clé et sans le dire.
