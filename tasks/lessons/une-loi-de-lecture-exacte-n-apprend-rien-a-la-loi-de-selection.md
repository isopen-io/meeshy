# Une loi de LECTURE exacte n'apprend rien à la loi de SÉLECTION

*2026-11-19, cycle 181 — #19799, premier tri par colonne de #19748.*

## Ce qui s'est passé

`services/gateway/src/services/relations/usableAccount.ts` portait, depuis
#16623, la loi « un compte utilisable » : `isUsableAccount` + son
`ACCOUNT_STATE_SELECT`. Nommée, testée, documentée, et **exacte** — parce
qu'elle juge une ligne DÉJÀ CHARGÉE : le client Prisma rend `null` pour une
colonne absente comme pour une colonne nulle, donc une lecture JS n'a rien à
savoir de la sémantique MongoDB.

Six portes avaient besoin de la même loi **en SÉLECTION**, et il n'y avait rien à
importer. Chacune a donc écrit la clause à la main :

```ts
where: { id: { in: ids }, isActive: true, deactivatedAt: null, deletedAt: null }
```

Sous MongoDB, `{ champ: null }` est une ÉGALITÉ : elle n'apparie pas un document
dont la clé est ABSENTE. Aucun des deux chemins de création de compte n'écrit ces
colonnes — l'absence est donc l'état de la population entière, et les six portes
refusaient **tout le monde** : personne ne pouvait être invité dans une
communauté (`POST …/invite` et `POST …/members` rendaient 404 pour tous), la
présence d'équipe (#16623) était inerte, aucune notification « ajouté à une
communauté » ne partait, personne n'était mentionnable dans une conversation
d'annuaire.

## La règle

> **Une loi de LECTURE et une loi de SÉLECTION ne sont pas la même loi, et la
> première peut être parfaitement exacte sans rien apprendre à la seconde.** Une
> lecture juge une ligne que la base a déjà rendue ; une sélection doit la
> DEMANDER, et c'est là seulement que la sémantique du stockage entre.

Quand un module publie une loi en JS, la question à lui poser est donc :
**« et quand il faut CHOISIR les lignes, qu'est-ce qu'on importe ? »** Si la
réponse est « rien », chaque site qui en a besoin la réécrira — et la réécriture
est exactement ce qui produit des exemplaires divergents.

## Corollaires mesurés dans le même lot

- **La forme juste était dans le dépôt deux fois, et personne ne pouvait
  l'importer.** `services/community-online-count.ts` la portait EN LIGNE pour
  exactement ce prédicat, et `jobs/broadcast-recipients.ts` la porte sur
  `User.deletedAt` seul avec sa raison écrite (leçon 318). Ce qui manquait n'était
  pas la connaissance : c'était **un endroit où l'importer**. Un correctif en
  ligne, même juste et commenté, n'enseigne rien — il faut qu'il devienne une
  constante que le voisin trouve.

- **Un double de test mentait de CINQ façons différentes pour un seul effet.**
  Fixture écrite dans l'état minoritaire (`deletedAt: null` explicite) ; double
  répondant depuis son propre ensemble sans lire les clauses ; évaluateur de
  `where` écrit à la main sur `row[key] === value` ; témoin comparant la CLAUSE à
  sa propre copie (`toMatchObject({ deactivatedAt: null, … })`, vert avec une
  clause qui ne nomme personne) ; `mockResolvedValue({ id })`. La question à poser
  à un harnais n'est pas « teste-t-il ce site ? » mais **« qu'est-ce que ce double
  ACCEPTE que la base refuserait ? »**

- **Les deux moitiés d'une loi se confrontent par un témoin, sinon elles vivent
  dans un espace que rien ne regarde.** Le cliquet du lot évalue les sept formes
  de document contre les DEUX moitiés et exige le même verdict — **plus un témoin
  qui interdit l'accord par le bas** : deux moitiés s'accordent aussi en refusant
  TOUT, donc l'une d'elles doit dire séparément qu'elle RETIENT la forme
  nominale.

## À faire, la prochaine fois

Devant un fichier qui nomme une loi de lecture : chercher qui en a besoin en
`where`, et poser la jumelle dans le MÊME fichier — avec, dans son doc-comment,
la phrase qui dit pourquoi les deux ne se substituent pas.
