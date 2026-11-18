# Cycle 180 — la feature était livrée sur trois surfaces, et son gate refusait TOUT LE MONDE

*2026-11-18, à la suite du cycle 179 (#19688, fusionné dans `dev` par `6825ee83b`).
Branche `claude/exciting-planck-iaaak0`. Instruit **#19690**, relevé par l'audit
adversarial de la PR #19686 comme constat e-6, « hors de son périmètre, et
vérifié ».*

---

## Pourquoi celui-là

Les suivis du cycle 179 étaient #19677 (199 lookups à trier), #19739 (une mesure
contre `mongo:8`, qui demande une base), #19740 et #19741 (deux défauts bornés et
rares). #19690 les surclasse sur un seul critère, et il est décisif :

> Ce n'est pas une fuite — c'est fail-closed — mais un défaut FONCTIONNEL qui
> porte sur la population entière.

Entre un lot qui corrige un cas rare et un lot qui rend une feature à tout le
monde, le second gagne. Et il se mesure : la séance « Ensemble » (#17011,
#17012) était INERTE pour toutes les paires.

## Le défaut

`services/together/togetherGate.ts`, clause 4 du gate (« les deux sont membres
ACTIFS de cette conversation ») :

```ts
where: { conversationId, userId: { in: [hostId, guestId] },
         isActive: true, leftAt: null, bannedAt: null }
```

Sous MongoDB, `{ champ: null }` est une ÉGALITÉ : elle n'apparie pas un document
dont la clé est ABSENTE. Et **aucun chemin de création de `Participant` n'écrit
ces colonnes sur une ligne VIVANTE** — Prisma n'écrit pas un `DateTime?` qu'on ne
lui donne pas. L'absence est donc l'état de l'immense majorité des membres :
ceux qui ne sont ni partis ni bannis.

*(Cette phrase disait d'abord « les huit sites de `participant.create` », et
l'audit l'a mesurée fausse en deux points : il y a **douze** chemins de création
— huit `create`, deux `createMany` dans `InitService`, deux
`participants: { create }` imbriqués — et l'un d'eux ÉCRIT `leftAt` : la pierre
tombale de `repairOrphanedMessageSenders`, qu'`isActive: false` exclut de toute
façon. La conclusion tient, l'énumération était fausse — et le dépôt traite un
commentaire qui ÉNONCE une contrainte comme une affirmation à vérifier,
cycle 94.)*

`bothActiveMembers` rendait `false` pour presque toutes les paires. Le `where`
compose désormais les deux prédicats d'absence par `AND` —
`AND: [PARTICIPATION_VIVANTE, unsetOrNull('leftAt')]` — par `AND` et non par
double spread, parce que chacun rend une clé `OR` que le second écraserait.

## Ce qui rend ce cas instructif, et ce que l'issue ne disait pas

L'issue note que « le même fichier connaît la règle et l'applique treize lignes
plus bas », pour `closedAt` (`openConversation`, avec sa note). C'est juste. Mais
la question qui reste est **comment une feature entière reste inerte sans que
personne ne le signale**, et la réponse est dans le doc-comment du gate :

> Tout refus rend le même verdict : un inconnu n'apprend ni l'existence d'un
> média, ni l'appartenance de quelqu'un à une conversation.

La fermeture INDIFFÉRENCIÉE est juste — c'est de la confidentialité, et elle est
voulue. Mais elle supprime aussi le seul signal qui aurait dit « cette porte
refuse tout le monde » : à l'écran, le défaut et le refus légitime sont le MÊME
message (`NOT_ALLOWED`, « Lecture ensemble indisponible »).

> **Un gate dont tous les refus rendent le même verdict ne peut pas distinguer
> son propre défaut d'un refus légitime** — et personne ne signale un refus qui a
> l'air voulu. Mesuré : `judgeTogether` ne journalise RIEN, pas une ligne, sur
> aucune de ses cinq clauses. Suivi : #19754.

Et la feature n'était pas un brouillon. Elle est livrée sur trois surfaces —
six fichiers iOS (`Features/Together/` : overlay, carte du player, pilote de
lecture, centre, rangée de profil), trois composants web (`together-host`,
`together-mount`, `together-player`), et ses types partagés. Tout cela était
injoignable en production.

## Le témoin, et pourquoi aucun des 68 existants ne pouvait tomber

La suite d'« Ensemble » (`togetherRelay.test.ts`, 68 témoins) **passait**. Sa
fixture de participation portait :

```ts
const membre = (…) => ({ id, userId, conversationId, isActive: true,
                         leftAt: null, bannedAt: null });  // ← explicitement
```

Les deux nulls EXPLICITES sont l'état minoritaire — celui qu'un chemin a remis à
zéro. Le monde de test, lui, est honnête : `messagingWorld` évalue chaque clause
par `matchesMongoWhere`, qui exige la clé PRÉSENTE et nulle. La fixture servait
donc exactement la ligne que le filtre fautif sait apparier.

Remise à la forme NOMINALE de production (les deux clés absentes), elle fait
tomber **31 des 68 témoins** avant le correctif, 0 après. Deux témoins nommés
(`it.each`) épinglent désormais les DEUX états « pas encore », et c'est le
premier qui garde la règle : au second, le filtre nu et le filtre juste rendent
le même verdict.

> **Un témoin de SOFT-STATE s'écrit sur la forme que la PRODUCTION crée, pas sur
> celle qui se lit bien dans une fixture.** Écrire `leftAt: null` à la main dans
> un objet de test est plus explicite, plus lisible, et ne peut pas tomber. Même
> famille que « un témoin de RANG s'écrit sur un rang AUTRE que le premier »
> (leçon 261) : la valeur qu'on choisit par confort est celle sous laquelle les
> deux implémentations s'accordent.

## La jumelle, et elle n'était pas dans le fichier

L'issue demandait de « chercher la jumelle dans le même fichier ». Le reste de
`togetherGate.ts` est sain : `openConversation`, `playableMedia` et `bothUsable`
lisent leurs colonnes en JS, pas en `where`. Le module `together/` entier ne
porte aucun autre filtre de ce genre.

Le balayage l'a trouvée **ailleurs** : `ACTIVE_CALL_SELECT`
(`routes/conversations/utils/list-activity.ts`), le `_count` qui alimente la
pastille « N en appel » de la liste des conversations, portait
`participants: { where: { leftAt: null } }` NU — donc sous-comptait les
`CallParticipant` d'avant l'écriture explicite de l'audit C5 (2026-07-02). Il
consomme désormais `LIVE_CALL_PARTICIPATION`, la loi déjà NOMMÉE chez les appels,
dont il devient le cinquième consommateur.

Son témoin dit la seconde moitié de la leçon : le `_count` était **injecté** dans
la fixture (`_count: { participants: 3 }`), si bien qu'aucun témoin n'exerçait
jamais la clause. Le nouveau l'ÉVALUE contre des documents plutôt que de la
comparer à sa propre copie — RED prouvé par mutation.

## Le cliquet : le jumeau ÉGALITÉ d'un cliquet de NÉGATION qui existait déjà

C'est la trouvaille structurelle du cycle, et elle était sous les yeux du dépôt
depuis #8309. La sémantique MongoDB des champs absents a DEUX moitiés :

| moitié | la forme | ce que le dépôt avait |
|---|---|---|
| NÉGATION — `NOT` écarte le document sans la clé | `differsOrUnset` | un cliquet, inventaire justifié (`negated-filter-on-absent-field-guard`) |
| ÉGALITÉ — `{ champ: null }` ne RETIENT pas le document sans la clé | `unsetOrNull` | **rien** |

Et c'est la seconde que `utils/prisma-unset.ts` dit avoir payée **quatre fois en
production** (feed vidé, 100 % des bascules média d'appel en no-op, balayage
éphémère inerte, compteur de vues uniques). Cinq avec celle-ci.

`__tests__/participation-soft-state-equality-filter-guard.test.ts` tient
l'inventaire des deux colonnes de la participation à VIDE. Son balayage
(`__tests__/helpers/where-equality-null-scan.ts`) prend l'ensemble des colonnes
en paramètre, tient une pile des clés d'objet pour séparer ce qui est un FILTRE
de ce qui est une ÉCRITURE — `{ bannedAt: null }` dans un `data` est la moitié
légitime du remède — et porte **cinq témoins de fixture sur lui-même** :
écriture non relevée, `where` imbriqué sous `select`/`_count` relevé, forme juste
reconnue, commentaires non lus, une colonne par occurrence.

Les témoins de fixture ne sont pas une coquetterie : le cycle 179 a mesuré que
**trois cliquets peuvent devenir aveugles ENSEMBLE** sans qu'une ligne de leurs
inventaires bouge, parce qu'ils cherchent une GRAPHIE. Et la sonde de
NON-VACUITÉ (`> 10` occurrences vues) est reprise de la même leçon : des trois
cliquets aveuglés, **seul celui qui portait une telle borne a rougi**.

## Ce que le cliquet ne garde pas, et sa TAILLE

Il ne tient que `leftAt` et `bannedAt`. Le même balayage sur TOUTES les colonnes
optionnelles rend, le 2026-11-18 : **174 occurrences en `where`, dont 48 disent
l'absence à côté, donc 126 NUES** — `deletedAt` 88, `retiredAt` 12,
`firstMessageSentAt` 5, `settledAt` 5, `deactivatedAt` 4, puis neuf colonnes à
une ou deux.

**Elles ne sont pas toutes fausses, et c'est ce qui interdit de les geler d'un
bloc.** Une égalité nue est exacte quand la colonne porte une discipline
d'ÉCRITURE qui la pose à chaque création, et le dépôt en a de nommées :
`LIVE_MESSAGE_MARK` (`Message.deletedAt`), `NEW_DEVICE` et `UNRESERVED`
(annuaire E2EE). Le tri est donc une question PAR COLONNE — « quels sont ses
sites de création, et écrivent-ils TOUS la colonne ? » — qui se répond par une
mesure, jamais en lisant le nom de la discipline. C'est **#19748**.

Geler les 126 avec une justification non mesurée serait exactement le défaut du
cycle 179 : une affirmation du côté qui ABSOUT.

## Preuve

- **RED de la suite entière** : fixture remise à la forme nominale ⇒
  `Tests: 31 failed, 37 passed, 68` avant le correctif ; `70 passed` après
  (68 + les deux témoins nommés) ;
- **RED du second site** par mutation : `LIVE_CALL_PARTICIPATION` remis à
  `{ leftAt: null }` ⇒ « compte la ligne nominale, sans clé leftAt » tombe ;
- **RED du cliquet** par mutation : filtre nu remis dans `togetherGate` ⇒ le
  cliquet NOMME `services/together/togetherGate.ts:53#leftAt` et `:54#bannedAt` ;
- `tsc --noEmit` **vert** sur `services/gateway` et `packages/shared` ;
- suite gateway complète : voir § ci-dessous.

## Ce que la fusion attend — et c'est la même cause qu'au cycle 179

**Les 25 workflows du dépôt sont toujours `disabled_manually`** (mesuré à
20:47 UTC ; leur `updated_at` est groupé à la minute, 19:20 UTC le même jour,
donc une désactivation en LOT et non une dérive). `workflow_dispatch` sur
`ci.yml` rend « Cannot trigger a 'workflow_dispatch' on a disabled workflow ».

La directive #9226 — « toute PR vers `dev` fusionne dès la CI verte » — reste
donc inapplicable pour tout le monde, et une session ne réactive pas un workflow
de dépôt. Le cycle 179 l'avait consigné sur sa PR ; **c'est désormais une
issue, #19752**, parce que la condition porte sur toutes les sessions et qu'elle
a survécu à un cycle.


---

## L'audit adversarial a rendu BLOQUANT, et il avait raison sur quatre points

Le lot est passé par `auditeur-adversarial` avant fusion (#9226 : contrôle
d'accès). Verdict **BLOQUANT**, dix constats. Les quatre qui ont changé le code :

### Constat F — le cliquet BÉNISSAIT la forme fausse

C'est le plus cher, et il est de la même famille que le défaut qu'il garde.
`absenceSaidToo` cherchait `isSet: false` **n'importe où** dans le `where`
englobant. Il certifiait donc correcte la clause :

```ts
AND: [{ leftAt: null }, { leftAt: { isSet: false } }]
```

`AND` exige les DEUX branches : la clé ne peut pas être à la fois nulle et
absente. **Cette clause n'apparie AUCUN document** — #19690 en pire (zéro ligne
au lieu de presque zéro), certifié correct par le cliquet censé l'interdire.

Et la faute n'était pas hypothétique : **ma propre rédaction l'invitait.** Le
doc-comment disait « se compose par `AND` quand le `where` porte déjà un `OR` »
— vrai des PRÉDICATS COMPLETS, dont chacun rend une clé `OR`. Appliquée aux deux
BRANCHES, la phrase produit exactement la conjonction impossible.

> **Un cliquet qui cherche la forme JUSTE doit chercher sa STRUCTURE, pas ses
> mots.** `null` et `isSet: false` sont une ALTERNATIVE : ils ne disent la bonne
> chose que SŒURS d'un même `OR`. Chercher les deux chaînes « dans le même bloc »
> revient à valider une conjonction en croyant lire une disjonction — et le
> cliquet est alors pire que rien, parce qu'il absout.

Le balayage tient désormais une pile des cadres `{` **et** `[`, et n'accorde
l'absence que dans le même tableau `OR`. La conjonction impossible est une
fixture.

### Constat G — une SECONDE graphie, et son exemplaire vivant

`{ champ: { equals: null } }` est le même filtre, invisible au balayage. Le
dépôt en porte plusieurs, dont un qui n'est pas une hypothèse :
**`ServerKeyVault.initialize()` charge ZÉRO clé de conversation à chaque
démarrage** (`expiresAt: { equals: null }`, aucun des deux créateurs n'écrit la
colonne). Vérifié ligne à ligne, hors périmètre du lot, ouvert en **#19755** —
le coffre de clés serveur relève de `crypto-e2ee`.

> Un balayage qui cherche UNE graphie mesure cette graphie, pas la propriété
> (cycle 105). J'avais appliqué la règle au PORTEUR d'un filtre et pas à son
> ÉCRITURE.

### Constat A — la règle du cycle 84, et c'est le lot qui l'avait déclenchée

Mon correctif fait passer un gate de « refuse presque tout le monde » à « admet
les membres légitimes ». L'audit a donc posé la bonne question : **quelle ligne
la nouvelle clause admet-elle que la loi ne devrait pas admettre ?** Une, et une
seule — et c'est celle que #17072 décrit comme un défaut payé en production :
`isActive: true` + `deletedForMe` posé.

`delete-for-me` écrit `{ deletedForMe, isActive: false }` d'un seul geste, donc
`isActive: true` suffisait pour une ligne BIEN écrite ; restent les lignes
HÉRITÉES d'avant #17072. L'égalité nue les refusait **par accident**. Une
conversation que `core-list` cache à ce lecteur et que la corbeille liste encore
n'a pas à ressurgir en invitation live.

`Participant` porte **TROIS** colonnes de départ, et le dépôt les lit ENSEMBLE là
où ça compte (`routes/sync/conversations.ts`). La clause les lit maintenant
toutes les trois. RED prouvé par mutation.

> **Réparer une porte, c'est hériter des décisions de visibilité de tout ce
> qu'elle gardait fermé par accident.** Le cycle 84 le dit du schéma de réponse ;
> c'est vrai mot pour mot d'un filtre qui refusait tout le monde.

### Constat I — un échec SILENCIEUX évité, sur le site le plus froid du lot

`isSet` dans un `_count.select.<relation>.where` n'est attesté **nulle part** dans
le dépôt (les sept autres comptes filtrés portent des égalités simples), et il
n'y a ni MongoDB ni testcontainers dans la CI de la passerelle — les « mesuré
contre `mongo:8` » du dépôt sont des mesures manuelles. Si le moteur refuse la
forme, `loadConversationListActivity` l'avale (`.catch(() => [])`) et **la
pastille « appel en cours » disparaît de TOUTE la page, sans une ligne de
journal.**

Le défaut corrigé, lui, était théorique (un appel actif est récent, donc ses
participations portent la clé). J'échangeais un sous-comptage invisible contre un
risque de panne totale silencieuse. La lecture prend donc la forme déjà
ATTESTÉE par `CallCleanupService` — les lignes, comptées en JS, bornées par
`CALL_MAX_PARTICIPANTS`.

> **Avant de prendre une forme de requête plus juste, demander qui l'a déjà
> mesurée** — et quand la réponse est « personne », préférer la forme attestée,
> surtout si l'échec de l'autre est avalé par un `catch` en amont.

### Constat H — ma sonde de non-vacuité mesurait la popularité d'un idiome

Mesuré : `leftAt` a 18 sites (tous des `OR` dépliés à la main chez les appels),
`bannedAt` **zéro**. La sonde « plus de 10 sites » était donc satisfaite par une
seule des deux colonnes — aveugle sur l'autre, ce qui est exactement l'organe
qu'elle prétendait être. Pire : le jour où quelqu'un branche ces 18 sites sur
`LIVE_CALL_PARTICIPATION` — un changement CORRECT, celui que ce lot vient de
faire au dix-neuvième — le compte tombe à 0 et le cliquet **rougit en invitant à
baisser le seuil.**

C'est l'erreur du cycle 107, dont le balayage avait été JETÉ pour cette raison.
La sonde porte désormais sur l'INSTRUMENT (1 719 fichiers de production lus, borne
à 900) ; la capacité à VOIR une forme nue est prouvée **par colonne**, sur
fixtures — où aucune consolidation ne peut l'éroder.

> **Une sonde de non-vacuité posée sur la production mesure l'état du dépôt ; sur
> une fixture, elle mesure l'instrument.** Seule la seconde reste vraie quand le
> dépôt s'améliore.

### Ce que l'audit a trouvé et que le lot n'absorbe pas

| constat | sort |
|---|---|
| le gate ne juge pas le DROIT DE LECTURE du média (plancher d'historique, `canViewHistory`, cycle de vie par lecteur) | **#19756** — la loi unique prend une `FastifyRequest`, que ce chemin socket n'a pas : l'extraire est un lot |
| `messageRequestAt` n'est pas lu, quand la sonnerie refuse de sonner pour cette raison | **#19757** (`décision-produit`) — refuser un Proche légitime pour une boîte oubliée est un choix de produit |
| les index de séance s'écrivent sous un verrou de PROCESSUS, donc perdent une séance à plusieurs instances — qui échappe alors à la coupure de compte | **#19758** |
| ~10 lectures Mongo par geste, 60 gestes/min/compte autorisés | **#19759** |
| le refus confond « pas le droit » et « je n'ai pas pu lire » ; une invitation refusée écrit une pierre tombale de 4 h | **#19760** |

**Et ce que l'audit a vérifié SANS rien trouver, qui compte autant** : la
composition `AND` ne perd aucune condition de l'ancienne clause (matrice de 12
formes de document évaluées par `matchesMongoWhere`) ; le `Set` de `userId` ne
crée pas de contournement (doublon de participation, `userId` nul, pierre
tombale) ; **les portes de COUPURE sont complètes** — départ, bannissement,
retrait, `delete-for-me`, révocation de lien, sortie de salon, blocage, baisse de
niveau, désactivation et suppression de compte rejugent toutes ; et **aucun
inventaire du dépôt ne nommait les sites que ce lot a fait disparaître** —
contrairement au cycle 179, où trois cliquets étaient devenus aveugles ensemble.

### Ce que l'audit n'a pas pu vérifier, et qui ne doit pas se lire comme vert

- **aucun comportement contre un vrai MongoDB 8** : pas de base ici, pas
  d'intégration DB dans la CI de la passerelle. C'est la raison du constat I, et
  c'est aussi #19739, ouverte au cycle 179 ;
- **la distribution réelle des lignes en production** : combien de `Participant`
  portent les nulls explicites plutôt que l'absence, et combien de lignes
  `isActive: true` + `deletedForMe` subsistent. L'ampleur du constat A est donc
  une possibilité documentée, pas une mesure ;
- **ce que le client web fait** d'une invitation nommant une conversation absente
  de sa liste, ou d'un média qu'il ne peut pas télécharger.

## Preuve, après les corrections

- `togetherRelay.test.ts` : **71 témoins verts** (68 + les deux formes de ligne
  + le refus de `deletedForMe`), RED prouvé par mutation sur le troisième ;
- le cliquet : **9 verts**, dont la conjonction impossible et la graphie
  `{ equals: null }` ; RED prouvé par mutation (il NOMME fichier, ligne, colonne
  et graphie) ;
- `list-activity` + `emitConversationActivityUpdate` : 20 verts sur la forme
  attestée ; 19 suites / 124 témoins sur la liste de conversations ;
- `tsc --noEmit` **vert** sur `services/gateway` et `packages/shared` ;
- **suite gateway complète, deux passages** : `6 failed, 2889 passed, 2895` /
  `17 failed, 43 733 passed` — les six sont les suites d'images HEIC/AVIF/EXIF,
  environnementales (`sharp` sans HEIF ici). Le premier passage en comptait sept :
  `tsc-never-loaded-tests-ratchet` y avait rougi **par sa propre sonde de
  non-vacuité** (`tsc` rendu 0 erreur sous la charge de 2 895 suites) ; seul,
  il passe en 111 s. Le lot n'ajoute aucun échec.
