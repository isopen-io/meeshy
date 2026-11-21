## Un refactor qui sort un discriminant du LITTÉRAL casse le cliquet qui le lit — et le remplace par un choix de nom (cycle 192, #20050)

Le dépôt tient une distinction de sécurité par un balayage de SOURCE
(`conversation-audience-living-participation`, #16690) :

| l'ensemble répond à | la loi attendue |
|---|---|
| qui REÇOIT (audience) | la plus ÉTROITE — `PARTICIPATION_VIVANTE` |
| qui ne doit RIEN recevoir (exclusion) | la plus LARGE — `isActive` nu |

Le balayage lit le **littéral du `where`** : il relève chaque
`participant.findMany({ where: { … } })`, regarde si la clause de participation
y est ÉPELÉE, et exige une entrée motivée pour chaque site qui ne l'épelle pas.

En bornant les trois lectures de la loi du plancher (#20050), j'ai factorisé la
machinerie — borne, sonde `cap + 1`, journal de troncature, verdict de
complétude — dans une fonction qui recevait la clause en **paramètre** :

```ts
// Le `where` de production, désormais :
where: { conversationId, ...participation }
```

Les deux questions passaient par ce site unique : l'audience (clause étroite) et
l'exclusion (clause large). **Le discriminant avait quitté le code pour devenir
un choix de NOM DE FONCTION** (`scanLiveParticipants` contre
`scanActiveParticipants`), que ce balayage — et aucun autre — ne lit. Le cliquet
est devenu rouge en nommant un site qu'il ne pouvait plus juger, et c'est le
meilleur cas : il aurait pu se taire.

### La réparation n'est pas d'apprendre le nouveau nom au balayage

Ajouter `participation` à la liste des façons d'épeler la loi aurait accepté
**n'importe quel identifiant** à cette place — c'est-à-dire supprimé le
discriminant en ayant l'air de le maintenir. La machinerie reçoit donc la
**LECTURE**, jamais le `where` :

```ts
return boundedScan(conversationId, options, async (probe) =>
  prisma.participant.findMany({ where: { conversationId, ...PARTICIPATION_VIVANTE }, select, take: probe }));
```

Chaque question épelle sa clause chez elle ; la machinerie ne décide que de la
borne ; et la sonde reste incessible — un appelant REÇOIT `probe`, il ne le
choisit pas. Le site unique de la BORNE et le littéral de la CLAUSE ne sont pas
le même site unique, et vouloir les confondre coûte le cliquet.

> **Avant de factoriser une requête, demander : qu'est-ce qu'un balayage de
> source lit dans ce littéral ?** Une clause, une projection, un `take`, un nom
> d'événement, une clé de localisation — le dépôt a un cliquet pour chacun, et
> aucun ne suit une valeur à travers un paramètre.

### Corollaire — une DÉCISION déménage avec le site qu'elle motive

L'entrée d'exemption `translationReaders.ts#1` (« cette lecture est
délibérément large, voici pourquoi ») désignait une requête manuscrite qui
n'existait plus. Le cliquet a un témoin pour cela — « ne garde aucun refus
périmé » — et sa raison est écrite : une entrée qui ne désigne plus rien
**autorise en silence un site futur qui reprendrait la même clé**. La décision
a donc suivi l'adresse (`conversationAudienceRooms.ts#1`), raison comprise ;
elle ne se supprime pas, c'est la seule trace de l'arbitrage.

### Corollaire — un `await` de plus révèle les témoins qui attestaient par CHANCE

Le même refactor a fait tomber trois témoins d'une garantie DURABLE
(`AttachmentReactionHandler`, enfilage hors ligne). La production était
intacte : l'enfilage part en promesse DÉTACHÉE (`void p.catch(…)`), que
`await handler.handleAdd(…)` n'attend pas, et ces témoins l'observaient par
ordonnancement des microtâches. Un `await` de plus dans la chaîne de lecture
suffisait à les décaler.

La réparation est dans le TÉMOIN — drainer les microtâches (`setImmediate`),
comme le `CLAUDE.md` du gateway le prescrit déjà pour un `.catch` détaché — et
elle vaut **dans les deux sens** : les deux témoins NÉGATIFS du même bloc
(`not.toHaveBeenCalled()`) n'attendaient pas non plus, donc passaient
trivialement, sans rien prouver. Compter les ticks pour les faire repasser
aurait rendu le prochain refactor rouge au même endroit.
