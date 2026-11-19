# Cycle 181 — une loi existait en JS, sa jumelle côté `where` n'existait pas, et six portes l'ont recomposée à la main

*2026-11-19, à la suite du cycle 180 (#19690, fusionné dans `dev`).
Branche `claude/exciting-planck-knhtt9`. Instruit **#19799**, premier tri par
colonne de **#19748** — la dette des 126 égalités nues que le cycle 180 avait
mesurée sans la trancher.*

---

## Pourquoi celui-là, et pas les autres suivis du cycle 180

Les suivis ouverts étaient #19677 (199 lookups `isActive: true` à trier), #19739
(une mesure contre `mongo:8`, qui demande une base), #19748 (les 126 égalités
nues), #19754 (un gate qui ne journalise pas sa clause), #19755 (le coffre de
clés — **déjà pris**, PR #19781), et #19756–#19760 (cinq constats bornés
d'« Ensemble »).

#19748 les surclasse pour une raison de méthode : c'est le seul qui porte une
**taille mesurée** et une **question tranchable par colonne**. Et le cycle 180
avait écrit pourquoi il ne fallait pas le geler d'un bloc :

> Elles ne sont pas toutes fausses, et c'est ce qui interdit de les geler d'un
> bloc. […] Le tri est donc une question PAR COLONNE — « quels sont ses sites de
> création, et écrivent-ils TOUS la colonne ? » — qui se répond par une mesure,
> jamais en lisant le nom de la discipline.

La colonne choisie est `deactivatedAt`, pour une propriété et une seule :
**`User` est le seul modèle qui la porte**. Son verdict ne dépend donc d'aucune
désambiguïsation — contrairement à `deletedAt`, que sept modèles portent sous
trois disciplines différentes.

## Le défaut

`User.deactivatedAt` et `User.deletedAt` sont des `DateTime?`. Les deux chemins
de création de compte, lus ligne à ligne, n'en écrivent **aucun** :

- `services/auth/registration.service.ts:471` — l'inscription, 28 colonnes ;
- `services/admin/user-management.service.ts:261` — la création par un
  administrateur.

Sous MongoDB, `{ champ: null }` est une ÉGALITÉ : elle n'apparie pas un document
dont la clé est ABSENTE. **L'absence est donc l'état de tout compte qui n'a jamais
été désactivé ni supprimé**, c'est-à-dire la population entière ; seuls
`updateStatus` (`:485`) et la réactivation (`:682`) posent `deactivatedAt: null`.

Six portes composaient ce prédicat à la main, et les six refusaient tout le monde :

| site | ce qu'il rendait | ce qui était perdu |
|---|---|---|
| `routes/communities/addable-user.ts:19` | `null` | le site **UNIQUE** des deux routes qui ajoutent sans accord (`POST …/invite`, `POST …/members`) : **404 pour tout le monde — personne ne pouvait être invité dans une communauté, ni ajouté par un administrateur** |
| `socketio/presence-audience.ts` (`TEAM_COLLEAGUES_WHERE`) | `[]` | `_resolveModeratorIds` ne trouvait aucun collègue : la présence d'équipe du #16623 inerte pour l'équipe entière |
| `services/conversations/communityMembershipSync.ts:64` | `living = []` | `everyoneAddable` rendait `false` pour toute liste non vide — aucune synchronisation d'appartenance n'ajoutait personne |
| `services/conversations/communitySalonAdoption.ts:109` | `∅` | aucun occupant adopté dans un salon de communauté |
| `services/notifications/community-added.ts:85` | `recipients = []` | la notification « ajouté à une communauté » ne partait jamais |
| `services/MentionService.ts` (`canMentionUser`) | `null` | personne n'était mentionnable dans une conversation d'annuaire |

## Ce qui rend ce cas instructif

**La loi EXISTAIT, et elle était juste.** `services/relations/usableAccount.ts`
porte `isUsableAccount` et `ACCOUNT_STATE_SELECT` depuis le #16623 — et elle est
EXACTE, parce qu'elle juge une ligne DÉJÀ CHARGÉE : le client Prisma rend `null`
pour une colonne absente comme pour une colonne nulle, donc une lecture JS n'a
rien à savoir de MongoDB.

> **Une loi de LECTURE et une loi de SÉLECTION ne sont pas la même loi, et la
> première peut être exacte sans rien apprendre à la seconde.** Le fichier
> portait la moitié JS, nommée, testée, documentée — et rien côté `where`. Six
> sites ont donc écrit la clause à la main, et aucun n'avait de loi à importer.

La forme juste était pourtant dans le dépôt **deux fois** :

- `services/community-online-count.ts:50` la portait **EN LIGNE**, pour exactement
  ce prédicat : `{ isActive: true, AND: [unsetOrNull('deletedAt'), unsetOrNull('deactivatedAt')] }` ;
- `jobs/broadcast-recipients.ts:132` la porte sur `User.deletedAt` seul, avec sa
  raison écrite — « la diffusion n'atteignait personne (leçon 318) ».

C'est donc la **cinquième** fois que cette sémantique se paie sur `User`, et la
leçon était écrite à deux fichiers des sites fautifs. Ce qui manquait n'était pas
la connaissance : c'était **un endroit où l'importer**. `USABLE_ACCOUNT_WHERE`
vit désormais à côté de sa jumelle JS, et `community-online-count` en devient un
consommateur — il n'y a plus deux exemplaires à faire dériver.

## Le témoin, et pourquoi aucun des existants ne pouvait tomber

Les cinq suites concernées PASSAIENT, chacune pour une variante du même défaut
de harnais :

1. **La fixture écrivait l'état MINORITAIRE.** `presence-audience.test.ts`
   évaluait bien `TEAM_COLLEAGUES_WHERE` par `matchesMongoWhere` — contre des
   lignes portant `deletedAt: null, deactivatedAt: null` **explicitement**.
   C'est mot pour mot le défaut du cycle 180 (`togetherRelay.test.ts`), et la
   leçon s'y applique sans changer un mot : *un témoin de soft-state s'écrit sur
   la forme que la PRODUCTION crée, pas sur celle qui se lit bien dans une
   fixture.* Remise à la forme nominale, elle fait tomber 3 témoins sur 26.

2. **Le double répondait depuis son PROPRE ensemble.**
   `communityMembershipSync.test.ts` filtrait `vivants.has(id)` sans jamais
   regarder les clauses de soft-state ; `community-salon-adoption.test.ts`
   branchait sur `args.where.isActive === true` ; `community-added.test.ts`
   rendait sa liste telle quelle. Les trois **acceptaient une clause que la base
   refuse** — le jumeau de « un double Prisma qui rend `[]` rend tout témoin de
   contenu trivialement vert », pris par l'autre bout.

3. **L'évaluateur de `where` écrit à la main.**
   `communities-invite-guards.test.ts` portait son propre `userMatches`, bâti sur
   `row[key] === value` : la sémantique de la clé absente n'y existe pas. Il est
   remplacé par `findFirstIn`, le double partagé qui la porte.

4. **Le témoin comparait la CLAUSE à sa propre copie.** `community-added.test.ts`
   portait `expect(where).toMatchObject({ isActive: true, deactivatedAt: null, deletedAt: null })`
   — vert avec une clause juste **comme avec une clause qui ne nomme personne**.
   Il assert désormais le RÉSULTAT : un compte désactivé, supprimé ou inactif ne
   reçoit rien, un compte à la forme nominale reçoit.

5. **Le double rendait la ligne quoi qu'on demande.** `MentionService.test.ts`
   posait `prisma.user.findUnique.mockResolvedValue({ id: userId })`.

> Cinq suites, cinq mécanismes différents, **un seul effet** : la clause n'était
> confrontée à aucune sémantique. La question à poser à un harnais n'est donc pas
> « teste-t-il ce site ? » mais **« qu'est-ce que ce double ACCEPTE que la base
> refuserait ? »**.

## Le cliquet, et pourquoi sa clé est `deactivatedAt`

`__tests__/usable-account-equality-filter-guard.test.ts`, inventaire **VIDE**.
La colonne n'appartenant qu'à `User`, il n'y a pas d'occurrence légitime à
porter : quand il tombe, la réparation est `USABLE_ACCOUNT_WHERE`, jamais une
ligne d'inventaire.

Il ne refait pas la preuve du balayage (pile des cadres, écriture contre filtre,
`where` imbriqué, commentaires, conjonction impossible) — elle vit chez son
jumeau. Il prouve **trois** choses de plus :

- que l'instrument voit une forme nue **sur CETTE colonne**, sur fixtures —
  constat H du cycle 180 : une sonde satisfaite par une seule colonne est aveugle
  sur l'autre ;
- que les **deux moitiés de la loi** rendent le même verdict sur sept formes de
  document, la forme nominale comprise — le témoin qui n'existait pas, et dans
  l'espace duquel le défaut a vécu ;
- **plus un témoin qui interdit l'accord par le bas** : les deux moitiés
  s'accorderaient aussi en refusant TOUT, donc un témoin dit séparément que la
  loi RETIENT la forme nominale.

## L'instrument nommait la mauvaise LIGNE

Trouvé en ouvrant les sites que le cliquet accusait : `withoutComments`
remplaçait chaque bloc `/* … */` par la chaîne vide, **emportant ses retours à la
ligne**. Tout ce qui suit remontait d'autant, et le site
`routes/communities/addable-user.ts:19` était annoncé `:8` — onze lignes de
doc-comment plus haut.

> **Un cliquet dont la valeur est de NOMMER fichier, ligne, colonne et graphie
> n'a pas le droit de se tromper sur le plus actionnable des quatre.** Il envoie
> lire le mauvais endroit — et comme il n'y a rien à cet endroit, la conclusion
> naturelle du lecteur est que le cliquet s'est trompé de SITE, pas de ligne. Un
> instrument qui a tort de façon crédible est plus coûteux qu'un instrument muet.

Le bloc est désormais remplacé par ses PROPRES retours à la ligne, et un témoin
de fidélité de ligne le garde. **C'est en réparant la ligne que le tri des autres
colonnes est devenu possible** : avant, le sujet interrogé par chaque site se
lisait quarante lignes trop haut, et mes trois premières lectures de `deletedAt`
ont désigné des modèles faux (un schéma de réponse, un `groupBy` de langues).

## Un tri à la main manque ce qu'un balayage voit

Ma première passe avait **quatre** sites `deactivatedAt`. Le cliquet, posé après
le correctif, a nommé le **cinquième** — `routes/communities/addable-user.ts` —
et c'était le plus grave des cinq : le site UNIQUE des deux routes d'ajout en
communauté, donc deux routes qui répondaient `404` à tout le monde.

> La leçon 261 à l'envers. « Zéro trouvé » n'est pas « zéro existe », **y compris
> quand c'est soi-même qui a compté** — et un balayage posé APRÈS le correctif
> vaut mieux que pas de balayage, parce qu'il mesure ce que le correctif a
> oublié.

## Le tri des quinze colonnes de #19748

Mesuré en énumérant les créateurs de chaque modèle et en vérifiant qu'ils
écrivent TOUS la colonne. Détail et preuves : commentaire de #19748.

| verdict | colonnes |
|---|---|
| **EXACT** par une discipline d'écriture mesurée COMPLÈTE | `deletedAt` (81/83 — `LIVE_MESSAGE_MARK` sur les cinq créateurs de `Message`), `retiredAt` (12, `NEW_DEVICE`), `settledAt` (5), `ackedAt` (2, `UNRESERVED` pour `usedAt`), `usedAt` (2), `provenAt` (1) |
| **EXACT et RAISONNÉ** — l'absence est exploitée, et c'est écrit | `firstMessageSentAt` (5) |
| **BÉNIN** | `maxUses` (1) |
| **FAUX POSITIF** du balayage | `parentId` (1) — le site exige la PRÉSENCE, la forme juste |
| **DÉFAUT corrigé** | `deactivatedAt` (4 + 1 trouvé par le cliquet) |
| **DÉFAUT instruit** | `expiresAt` → #19755 (PR #19781) · `lastActivityAt` → #19800 · `messageId` → #19801 · `verifiedAt` + `lastReminderAt` → #19802 · les 2 derniers `deletedAt` → #19803 |

Les quatre issues ouvertes partagent une forme que ce cycle nomme :

> **Une file de « pas encore fait » dont la lecture rate l'absence est pire qu'une
> porte qui refuse : elle s'AUTO-ENTRETIENT.** Une porte finit par être réparée
> parce qu'un chemin voisin écrit la colonne ; une file vide n'est jamais traitée,
> donc sa colonne n'est jamais écrite, donc elle reste vide. `lastActivityAt`
> (jamais écrit une seule fois), `lastReminderAt` (le PREMIER rappel ne part
> jamais) et `verifiedAt` (la file de vérification des partenaires) sont les trois
> exemplaires, et aucun ne se serait guéri tout seul.

## Preuve

- **RED de la présence d'équipe** : fixture remise à la forme nominale ⇒
  3 témoins sur 26 tombent ; 26 verts après le correctif ;
- **RED de la synchronisation d'appartenance** : double rendu honnête ⇒
  7 témoins sur 15 tombent ; 15 verts après ;
- **RED par mutation** (filtre nu remis) : adoption de salon **8 témoins**,
  notification de communauté **9**, mention **2** ;
- **RED de l'invitation** : évaluateur manuscrit remplacé par `findFirstIn` ⇒
  5 témoins sur 17 tombent, dont `POST …/invite` qui rendait **404** pour un
  nouveau venu parfaitement ordinaire ; 17 verts après ;
- **RED du cliquet** par mutation : il NOMME fichier, **vraie** ligne, colonne et
  graphie ; et son témoin de fidélité de ligne tombe sous l'ancien
  `withoutComments` ;
- `tsc --noEmit` **vert** sur `services/gateway` (code de retour lu hors pipe —
  la leçon « le code de retour d'un pipeline est celui de sa DERNIÈRE commande »
  a failli coûter un faux vert ici même) ;
- suite gateway complète : voir le commentaire de livraison de #19799.

## Ce qui n'a pas été vérifié, et ne doit pas se lire comme vert

- **aucun comportement contre un vrai MongoDB 8** : pas de base ici, pas
  d'intégration DB dans la CI de la passerelle (c'est #19739, ouverte au
  cycle 179). La sémantique de la clé absente est prise de `utils/prisma-unset.ts`,
  qui la dit mesurée contre `mongo:8` (#8309) ;
- **la distribution réelle des lignes en production** : combien de comptes
  portent les nulls explicites plutôt que l'absence. L'ampleur annoncée est donc
  une déduction des chemins de création, pas un comptage en base ;
- **ce que les clients font** d'une présence d'équipe qui se met soudain à
  arriver, et d'une file d'invitation de communauté qui cesse de rendre 404.
