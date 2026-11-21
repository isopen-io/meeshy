## Une loi de LECTURE exacte n'apprend rien à la loi de SÉLECTION (cycle 181, #19799)

`services/gateway/src/services/relations/usableAccount.ts` portait, depuis
#16623, la loi « un compte utilisable » : `isUsableAccount` et son
`ACCOUNT_STATE_SELECT`. Nommée, testée, documentée, et **exacte** — parce
qu'elle juge une ligne DÉJÀ CHARGÉE : le client Prisma rend `null` pour une
colonne absente comme pour une colonne nulle, donc une lecture JS n'a rien à
savoir de la sémantique MongoDB.

Six portes avaient besoin de la même loi **en SÉLECTION**, et il n'y avait rien
à importer. Chacune a donc écrit la clause à la main —
`where: { id: { in: ids }, isActive: true, deactivatedAt: null, deletedAt: null }`
— alors qu'aucun des deux chemins de création de compte n'écrit ces colonnes.
Sous MongoDB `{ champ: null }` est une ÉGALITÉ, qui n'apparie pas un document
dont la clé est ABSENTE : l'absence étant l'état de la population entière, les
six portes refusaient **tout le monde**. `POST /communities/:id/invite` et
`POST …/members` rendaient 404 pour tous (site unique `isAddableUser`), la
présence d'équipe (#16623) était inerte, aucune notification « ajouté à une
communauté » ne partait, personne n'était mentionnable dans une conversation
d'annuaire.

> **Une loi de LECTURE et une loi de SÉLECTION ne sont pas la même loi, et la
> première peut être parfaitement exacte sans rien apprendre à la seconde.** Une
> lecture juge une ligne que la base a déjà rendue ; une sélection doit la
> DEMANDER, et c'est là seulement que la sémantique du stockage entre. Devant un
> module qui publie une loi en JS, la question est donc : **« et quand il faut
> CHOISIR les lignes, qu'est-ce qu'on importe ? »** Si la réponse est « rien »,
> chaque site qui en a besoin la réécrira.

Trois corollaires, tous mesurés dans le même lot :

- **La forme juste était dans le dépôt deux fois, et personne ne pouvait
  l'importer.** `services/community-online-count.ts:50` la portait EN LIGNE pour
  exactement ce prédicat, et `jobs/broadcast-recipients.ts:132` la porte sur
  `User.deletedAt` seul avec sa raison écrite (leçon 318). Ce qui manquait n'était
  pas la connaissance : c'était **un endroit où l'importer**. Un correctif en
  ligne, même juste et commenté, n'enseigne rien — il faut qu'il devienne une
  constante que le voisin TROUVE.

- **Cinq doubles de test mentaient de cinq façons pour un seul effet** : fixture
  écrite dans l'état minoritaire (`deletedAt: null` explicite — le défaut de
  fixture du cycle 180, rejoué mot pour mot) ; double répondant depuis son propre
  ensemble sans lire les clauses ; évaluateur de `where` écrit à la main sur
  `row[key] === value` ; témoin comparant la CLAUSE à sa propre copie
  (`toMatchObject({ deactivatedAt: null, … })`, vert avec une clause qui ne nomme
  personne) ; `mockResolvedValue({ id })`. La question à poser à un harnais n'est
  donc pas « teste-t-il ce site ? » mais **« qu'est-ce que ce double ACCEPTE que
  la base refuserait ? »**

- **Les deux moitiés d'une loi se confrontent par un témoin, sinon elles vivent
  dans un espace que rien ne regarde** — et ce témoin doit interdire l'accord par
  le BAS : deux moitiés s'accordent aussi en refusant TOUT, donc l'une d'elles
  dit séparément qu'elle RETIENT la forme nominale.
