# Cycle 194 — un cliquet dont la portée est un RÉPERTOIRE mesure une propriété de ce répertoire

*2026-11-20, à la suite du cycle 192 (#20050, #20051) et du 193 (#19971, autre
session). Branche `claude/exciting-planck-gdujxi`. Livre **#20091**, ouvert par
ce cycle. Numéroté 194 : 193 est pris par la session qui porte #19971 — un
identifiant qui ne s'alloue pas collisionne (#5102).*

---

## Le lot n'était pas celui que je cherchais

Le cycle devait prendre la question 1 de #20051 — l'EFFECTIF : neuf sites
servent `memberCount`, et huit le dérivent du `.length` d'une liste. En
mesurant **lesquelles de ces huit listes sont bornées**, le relevé a rendu
autre chose : six de ces huit lectures sont invisibles au balayage de bornes
parce qu'elles épellent la clause de participation À LA MAIN
(`{ conversationId, isActive: true }`), la « quatrième forme » que le
doc-comment de `live-audience-bound-sweep.ts` annonce comme sortant de son
discriminant — sans que personne ait jamais compté combien elles étaient.

En cherchant à qui d'autre cette clause manuscrite appartenait, j'ai fait
tourner le classifieur du cliquet de #16690 — « une audience de DIFFUSION lit
la participation VIVANTE, jamais `isActive` NU » — sur `src/` au lieu de
`src/socketio/`.

| portée | audiences | qui n'épellent pas la loi |
|---|---|---|
| `src/socketio/` — **ce que le cliquet balaie** | 15 | 2, toutes deux DÉCLARÉES avec leur raison |
| hors `src/socketio/` | **51** | **50** |

Le cliquet était VERT. La propriété tenait sur 13 sites du dépôt, et le cliquet
l'affirmait de l'ensemble.

> **C'est la leçon 261 appliquée à la PORTÉE, et c'est pire que son application
> à un inventaire.** Une énumération porte deux affirmations : « ces sites
> respectent la règle » (vérifiable, et ici vérifiée) et « ce sont les sites où
> la règle s'applique ». La seconde n'était même pas une liste — c'était
> `path.resolve(__dirname, '..')`, une ligne qui ne RESSEMBLE pas à un
> inventaire, donc que personne ne relit comme une affirmation. Une audience de
> diffusion ne vit pas dans un répertoire : elle vit partout où quelque chose
> part vers des membres.

## Le défaut que la portée cachait, et il casse DANS LES DEUX SENS

`E2EEEnvelopeRelay.directoryOf` est l'annuaire des appareils qui REÇOIVENT
l'enveloppe chiffrée. Il lisait `isActive` NU, donc admettait l'état legacy
`isActive: true, bannedAt ≠ null` — celui que le doc-comment de #16690 nomme
lui-même, dont le producteur est fermé (#19688, #10436) et dont **aucune
migration n'a repris les lignes existantes**.

Et `compareDeviceSets` exige une correspondance EXACTE entre ce que l'émetteur
adresse et l'annuaire. L'écart ne dégradait donc pas d'un cran :

| ce que l'émetteur adresse | sous la lecture NUE |
|---|---|
| les membres que les portes lui servent (sans le banni) | **409 `DEVICES_MISMATCH` à chaque envoi** — le chiffrement est MORT dans ce fil |
| l'annuaire tel qu'il est servi (le banni compris) | admis : le banni reçoit le chiffré sur chacun de ses appareils non retirés |

> **Une audience trop large derrière une égalité EXACTE devient une panne ou une
> fuite, jamais rien.** La passerelle ne voit pas le clair ; elle décide quand
> même à qui il arrive.

Le ROUGE l'a dit plus fort que je ne l'avais prévu : ajouter UNE ligne
banni-mais-actif à la fixture du relais fait tomber **9 témoins sur 11** — tous
les envois nominaux. Je cherchais une fuite ; la mesure a d'abord montré la
panne.

## Les quatre sites resserrés, et pourquoi ceux-là

Pas les douze audiences du relevé : un lot par famille, et les familles ne se
décident pas pareil.

| site | ce que la liste décide | ce qu'un banni-mais-actif obtenait |
|---|---|---|
| `E2EEEnvelopeRelay.directoryOf` | les appareils qui reçoivent le chiffré | le chiffré, ou la panne pour tout le fil |
| `participant-rights-core` (les autres HÔTES) | une charge délibérément CACHÉE à la room | les décisions de modération intégrales : `rights` non rabotés + `historyVisibleFrom` |
| `shareLinkArrivalAnnounce` (les GESTIONNAIRES) | le flux de surveillance du lien | compteur d'usages, et par arrivée le participantId, l'anonymat, le PAYS et l'heure |
| `ensureGlobalConversationMembership` (`others`) | qui apprend une arrivée dans le salon GLOBAL | l'identité de chaque arrivant et l'effectif |

Les trois premiers ont un témoin qui tombe sur la mutation inverse. **Le
quatrième n'en avait AUCUN, et c'est le fait du cycle.**

## Un correctif sans témoin est un correctif qui se perdra — mesuré, pas supposé

J'ai resserré `ensureGlobalConversationMembership`, puis rejoué la mutation
inverse pour voir le cliquet rougir. **Il est resté VERT.** Son `where` est une
VARIABLE (`where: others`), et le discriminant est TEXTUEL : il n'y avait pas
de littéral à lire, donc rien à juger — et l'ancien balayage passait au suivant
**sans rien dire.**

Deux conséquences, et la seconde est celle qui compte :

1. Le balayage **PUBLIE** désormais ce qu'il ne sait pas juger
   (`sweepUnjudgeableParticipantReads` : `variable`, `appel`, `ternaire`,
   `absent`). « Zéro trouvé » et « zéro existe » ne sont pas la même
   affirmation (cycle 164) ; un instrument qui écarte en silence publie une
   propriété de lui-même en la faisant passer pour une propriété du dépôt.
2. Il **RÉSOUT** la variable quand le fichier la déclare — étroitement : un
   `const` du même fichier, jamais un import, un paramètre ni un appel. La
   résolution rend le site jugeable, donc le correctif gardé ; l'étroitesse
   garde la capacité de dire « je n'ai pas pu juger ». Même discipline que
   `response-payload-mismatch`.

Et le discriminant avait une seconde cécité, purement syntaxique : il exigeait
`findMany({ where: {` d'affilée. **28 des 215 lectures de `Participant` du
dépôt lui échappaient par la seule forme de leur appel** — un `select` écrit
avant le `where` suffisait, et `groupBy` n'était pas lu du tout. Deux de ces 28
vivaient dans son PROPRE répertoire, donc étaient invisibles même avant
l'élargissement de portée.

> **Deux cécités composées : une de PORTÉE, une de SYNTAXE.** Chacune laisse le
> cliquet vert pour une raison différente, et aucune des deux ne ressemble à un
> trou — l'une est un chemin, l'autre une expression régulière.

## Deux inventaires, et ne pas les confondre est tout le sujet

Les 51 sites nus ne pouvaient pas tous être instruits dans un cycle. Les ranger
dans `DELIBERATELY_WIDE` les aurait rendus verts en affirmant 51 fois une
décision que personne n'a prise.

| inventaire | la phrase | pour y entrer |
|---|---|---|
| `DELIBERATELY_WIDE` | « ce site DOIT être large » | la raison, instruite, écrite sur place |
| `MEASURED_NOT_INSTRUCTED` | « on ne sait pas encore ce que ce site décide » | sa famille, et une issue |

Dix décisions (dont sept neuves : `callRingPolicy`, `newMemberAdmission`, les
deux d'`obsoleteCapability`, `GameAbuseGuard`, `ArrivalHistoryBackfill`,
`shared-translations`, `E2EESignalRelay`) — toutes des listes de REFUS, qui se
construisent sur le sur-ensemble : resserrer y retirerait quelqu'un de
l'exclusion, donc lui servirait ce qu'il faut taire. **Elles étaient justes par
accident ; elles sont désormais justes par décision.**

Quarante et une lignes de dette, en six familles, chacune disant ce qu'elle
retient. Trois témoins les tiennent honnêtes : les deux inventaires sont
DISJOINTS (une clé dans les deux laisse choisir la phrase qu'on préfère lire, et
on lira « décidé »), chaque ligne DÉSIGNE encore un site, et la dette ne
GROSSIT pas.

La famille la plus intéressante n'est pas celle des audiences : c'est
`mesure-denominateur-destructif`, où **le sur-ensemble échoue OUVERT**. Un
banni-mais-actif ne verra jamais le message, donc `readByAllAt` ne se pose
jamais, la vue unique n'est jamais « entièrement consommée », et la destruction
de l'éphémère n'est **jamais programmée** — de la rétention qui ne s'éteint
pas. La doctrine « sur-ensemble ⇒ fail-closed » du REFUS ne s'y applique pas, et
c'est pour cela que ces quatre-là ne sont pas des décisions.

## Un site que j'ai failli « corriger », et la mesure qui l'a sauvé

`messageMentions.loadMentionParticipants` lit la clause nue, et la liste décide
qui peut être mentionné — donc notifié. J'ai écrit le constat avant de le
vérifier : **il est faux.** C'est un RÉSOLVEUR (`@Nom d'affichage` → `userId`),
et l'autorisation vit en AVAL, dans `validateMentionPermissions`, qui épelle la
loi. Le picker de mentions exclut déjà les bannis ; la résolution est large et
la porte est étroite.

> **« Un audit qui liste des `select:` ne liste pas des fuites » vaut aussi des
> `where:`.** La question n'est pas « cette clause est-elle la bonne ? » mais
> « qui AUTORISE ce que cette clause rend ? ». Le site reste dans l'inventaire,
> classé pour ce qu'il est — un piège armé, pas un défaut — plutôt que corrigé
> au passage sous une étiquette de sécurité qu'il ne mérite pas.

## Une clé par RANG est stable à l'édition, pas à l'ÉLARGISSEMENT

Le cliquet clé ses lignes par `fichier#rang-de-la-requête`, et son commentaire
dit pourquoi : une clé de LIGNE dérive à la première édition. C'est juste — et
le rang, lui, dérive quand l'INSTRUMENT change de vue. Résoudre les variables a
rendu `participants-reads.ts#0` à une AUTRE requête que celle que j'avais
classée (la liste paginée, et non son `totalCount`).

> Aucune clé n'est stable sous les deux mutations. Celle par rang est la bonne —
> le code change plus souvent que l'instrument — **mais un lot qui touche le
> DISCRIMINANT doit reclasser l'inventaire entier, pas seulement l'étendre.**

## Les mutations, et ce que chacune fait voir

| mutation | ce qui tombe |
|---|---|
| annuaire E2EE en `isActive` NU | **9 témoins sur 11** du relais — tous les envois nominaux |
| surveillance du lien en `isActive` NU | 2 témoins : `u-mod-banni` revient dans les destinataires |
| hôtes de `rights-core` en `isActive` NU | le cliquet, qui NOMME le site |
| arrivée du salon global en `isActive` NU | le cliquet — et il restait VERT avant la résolution des variables |

Le double de `share-link-arrival-live` **juge le `where`** (`isActive` et la
clause de bannissement) : sans cela il rendait ses membres quoi qu'on lui
demande, et aucun témoin de clause n'aurait pu tomber.

## Ce qui RESTE

- **#20091** — 41 lignes de dette mesurée en six familles, dont 10 audiences à
  resserrer. Sept d'entre elles partent avec le lot EFFECTIF : elles passeront
  par `scanLiveParticipants`, qui ÉPELLE la loi, donc en sortiront par
  CONSTRUCTION. Les resserrer ici aurait doublé ce lot (règle d'asymétrie
  #5243).
- **#20051, question 1** — l'EFFECTIF, non livré par ce cycle. Le relevé qui
  l'a ouvert : neuf producteurs de `memberCount`, huit depuis un `.length`, et
  `presentMemberCount` porte DÉJÀ la forme « au moins N »
  (`memberCountCapped`) que les trois clients rendent en « N+ ». Une troncature
  ne serait donc un nombre FAUX que pour les lecteurs à effectif EXACT (admins
  de conversation, MODERATOR+) — ceux qui l'administrent.
- **17 lectures de `Participant` restent illisibles** au balayage (`appel`,
  `ternaire`, `absent`). Elles sont publiées, pas jugées ; chacune est une
  adresse pour un lot futur.
- **Non mesuré** : combien de lignes `isActive: true, bannedAt ≠ null` existent
  en production. Le dépôt sait que le producteur est fermé et qu'aucune
  migration n'a repris les anciennes ; personne n'a compté. Tout ce cycle
  raisonne sur une population dont la taille est inconnue — et c'est le bon
  arbitrage pour une porte de confidentialité, où l'on échoue en montrant
  moins, jamais en montrant plus.

---

## L'audit adversarial a rendu BLOQUANT, et le constat portait sur le cœur du lot

Tout ce qui précède a été écrit avant l'audit. Le raisonnement de la portée a
tenu, les trois resserrements secondaires ont été vérifiés sains jusqu'à leur
consommateur, et la défense contre l'homonyme était déjà en place. **Et le
resserrement le plus important du lot était net-NÉGATIF.**

### B1 — la prémisse du resserrement E2EE, mesurée fausse

Mon doc-comment justifiait le resserrement ainsi : « le client compose son envoi
depuis la participation que les portes lui servent, et toutes ces portes
épellent `PARTICIPATION_VIVANTE` ». Les quatre lectures qui décident ce que le
client adresse sont en `isActive` NU :

| site | clause |
|---|---|
| `conversationDetailInclude.participants` | `where: { isActive: true }` |
| le `select` de la LISTE de conversations | `where: { isActive: true }` |
| `GET …/participants` | `isActive: true` |
| `mayReadKeysOf`, qui autorise la lecture des clés | `isActive: true` ×2 |

J'avais vérifié `access-control.ts` — la FONCTION de garde. Je n'avais pas
ouvert le `select` qui SERT la liste.

> Le dépôt écrit déjà « CHARGER n'est pas SERVIR » (cycle 83). Voici sa
> troisième face : **GARDER n'est pas SERVIR.** Deux sites, rien qui les tienne
> ensemble, et le plus rassurant des deux porte le nom qui contient « access
> control ».

Et derrière `compareDeviceSets`, qui exige l'égalité EXACTE, l'écart n'est pas
une dégradation : c'est un `409 DEVICES_MISMATCH` sur CHAQUE envoi, que la
boucle Sesame du client ne répare pas (elle rescelle depuis la même liste).
L'E2EE étant réservé aux PAIRES, **le banni-mais-actif EST le seul pair** : la
« fuite » n'avait aucun tiers, et la panne frappait le membre légitime,
définitivement, dans une conversation que rien ne ramène en clair (#12949).

**La phrase que j'avais écrite comme un argument POUR le resserrement était
l'argument CONTRE.** « Une audience trop large derrière une égalité exacte
devient une panne ou une fuite » — il fallait mesurer LAQUELLE, et QUI PAIE.

Le site est redevenu nu, avec la mesure écrite en entier dessus, et un témoin
GÈLE le comportement large : un piège armé qui tombera sur quiconque resserre
cette clause seule. Le resserrement juste est #20093.

### Ce que le lot se contredisait à lui-même, dans deux de ses fichiers

Mon inventaire rangeait `participants-reads.ts#0` — l'une des lectures nues qui
servent la liste — en dette mesurée, **dans le même lot** où j'affirmais que les
portes épellent la loi. Aucun témoin ne confronte une entrée d'inventaire à une
phrase de doc-comment.

> Quand un lot pose un inventaire de dette ET une affirmation d'absolu, relire
> l'inventaire CONTRE l'affirmation : la dette est la liste des contre-exemples
> qu'on vient d'écrire soi-même.

### I3 — mon propre cliquet rendait un faux VERT

`spellsTheLaw` testait `/bannedAt/` — le MOT, pas la polarité. Mesuré par
l'audit : `{ conversationId, isActive: true, bannedAt: { not: null } }` — une
audience composée EXCLUSIVEMENT de bannis — était déclarée **conforme à la loi
qui existe pour les exclure**. Il exige désormais une forme reconnue
(`unsetOrNull('bannedAt')`, `bannedAt: null`, `{ isSet: false }`).

> Un cliquet qui se trompe dans le sens rassurant est pire que pas de cliquet, et
> celui-ci était écrit DANS le lot qui dénonçait un cliquet trop permissif.

### I4 — et il écartait en silence ce qu'il prétendait publier

`if (!where.includes('conversationId')) continue;` jetait sans rien dire tout
`where` littéral dont la portée vient d'un spread (`{ ...SCOPE, isActive: true }`)
— **onze lectures**, dont la seconde requête du site même que ce lot resserre.
Le lot écrivait « ce que l'instrument ne sait pas juger, il le PUBLIE », et pour
cette forme il l'écartait. La forme `portée-indirecte` est publiée désormais.

### I1 et M4 — deux raisons d'inventaire fausses sur dix

- `GameAbuseGuard#0` affirmait que le sur-ensemble échoue FERMÉ. `shapeOf` a
  TROIS branches et DEUX frontières ; l'entrée n'en avait raisonné qu'une. À la
  frontière 2↔3 la direction S'INVERSE — `group` ne passe ni par
  `accountsAllowed` ni par le plafond d'entre-soi — et un banni de trop
  transforme `quarter` en `full` et `none` en `full`, **créditant les deux abus
  que la garde refuse**. Le fichier se déclare lui-même fail-OUVERT. Sorti des
  décisions, passé en dette avec la mesure.
- `obsoleteCapability#0` : décision juste, raison fausse (`NOT_YET_ACCEPTED` est
  ORTHOGONAL à `isActive`/`bannedAt`, pas son complément). Réécrite.

> **Un témoin qui exige `reason.length > 200` atteste qu'une prose est longue.**
> Deux des dix raisons étaient fausses, et l'une faisait 300 caractères.

### M1 — et les chiffres que je publiais n'étaient pas reproductibles

« 51 au dehors, dont 50 nues » était vrai du discriminant d'AVANT ; le lot
l'élargissait dans le même mouvement, si bien que l'avant et l'après ne
comptaient pas la même chose. Les comptes vivent désormais dans un témoin
(`audience-law-scope.test.ts` § « la distribution mesurée »), en `<=` / `>=`
pour qu'une dégradation rougisse sans qu'une amélioration ait à les rééditer.

### Le suivi que l'audit ouvre, et que je n'ai pas pris

- **I2 — le discriminant ne voit pas les `include`/`select` imbriqués**
  (`participants: { where: … }`) ni `findFirst`. Mesuré par l'audit : **40 sites
  du gateway portent cette forme, dont 37 nus**, et au moins quatre sont des
  audiences qui servent du contenu — dont `messageNotificationFanOut`, l'éventail
  de notifications push, « l'audience la plus porteuse de contenu de la
  passerelle ». Le lot corrige l'affirmation de PORTÉE et laisse intacte
  l'affirmation de FORME. C'est la même erreur, un cran plus haut, dans le lot
  qui la dénonce — et c'est la suite la plus chère de #20091.
- **I5 — `messages-send.ts` admet sur `isActive` nu sans `canAccessConversation`** :
  un banni-mais-actif peut encore ENVOYER. Resserrer la réception en laissant
  l'émission ouverte retourne la garde contre la personne qu'elle protège.
  C'est dans #20093.
- **La mesure qui déciderait tout, en lecture seule** : combien de lignes
  `isActive: true, bannedAt ≠ null` en production, et combien dans un `e2ee` ?
  Si l'état n'existe pas, ce lot ne corrige rien de mesurable ; s'il existe, le
  resserrement annulé aurait briqué ces conversations. **Un lot ne peut pas
  tenir les deux affirmations**, et c'est une question à poser AVANT d'écrire le
  correctif.
