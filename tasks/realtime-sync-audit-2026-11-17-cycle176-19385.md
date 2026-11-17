# Cycle 176 — une loi déclarée partout et appliquée nulle part, parce que son résolveur ne savait pas QUI demandait

*2026-11-17. Branche `claude/exciting-planck-pjjp7a`, partie de la tête de `dev`
(`56e4bf53`).*

**NON LIVRÉ — BLOQUÉ par l'audit adversarial.** #19385 est développé, poussé, et
son PR (#19413) est en BROUILLON. Le constat tient entièrement ; le PÉRIMÈTRE et
la MESURE DE PRODUCTION du lot étaient faux. La décision qui gouverne la reprise
est **#19419**. Ce journal décrit donc un cycle qui a trouvé un vrai défaut et
n'a pas su le refermer — le § « Ce que l'audit a cassé » en fin de fichier dit
quoi, et c'est la partie qui vaut.

*Rédaction : les §§ qui suivent ont été écrits AVANT l'audit et sont conservés
tels quels, parce que c'est leur confrontation au § final qui instruit. Là où
ils affirment que le lot est juste ou complet, ils ont tort, et le § final le
nomme ligne à ligne.*
**Ouvert** : #19386 (réciprocité, décision), #19402 (agrégats, décision),
#19403 (jumelle des pièces jointes), #19404, #19405, #19406, #19407, #19408 —
les six constats de l'audit qui n'étaient pas ce lot.

---

## Comment le lot a été choisi

Le cycle précédent avait fermé la chaîne horloge/position (#19261, #19303), et
le relevé de branches a montré qu'une session sœur tenait déjà
`MessageReadStatusService.markMessagesAs*` (PR #19315, suivi #19299 sur la
chaîne de LECTURE). **Règle d'asymétrie appliquée sans négociation : celui qui
n'a rien écrit cède.** L'audit est donc parti ailleurs — quatre passes
parallèles sur des surfaces disjointes (mutations de message, accusés et frappe,
rejeu à la reconnexion, état conversation/communauté).

Les quatre ont rendu un constat solide. Celui retenu n'est pas le plus gros,
c'est le plus INSTRUIT : **#14107 est encore OUVERTE**, et son critère MSG-04
(« les accusés de lecture sont réglables à partir de Connaissance ») n'avait
aucun site d'application, quand MSG-05 — son voisin de liste, le même plancher,
le même lot — était livré depuis des semaines.

## Le défaut

```
$ grep -rn "feature: '" services/gateway/src --include=*.ts | grep -v __tests__ \
    | sed "s/.*feature: '\([^']*\)'.*/\1/" | sort | uniq -c
      1 dm.typing        ← MSG-05, appliqué
                         ← `dm.readReceipts` : ZÉRO
```

La loi vivait dans le catalogue (`relation-levels.ts`), dans son témoin, et dans
les deux miroirs clients Swift et Kotlin. **Aucun appelant dans la passerelle.**
Aucun fichier de décision ne la différait : ce n'était pas un report écrit,
c'était une moitié de lot jamais posée.

### Ce qu'elle valait

Mallory à `PUBLIC` avec Alice — aucun cercle accordé, pas ami — lui envoie une
demande de message, état NOMINAL que `decideOpenings` autorise explicitement.
Alice ouvre le fil :

- `read-status:updated` part vers la room de conversation ET la room personnelle
  de chaque participant, Mallory compris, portant `userId: <Alice>` et
  `updatedAt` en horloge murale ;
- `GET …/receipts?detail=people` lui sert les `deliveredAt`, `receivedAt` et
  `readAt` nominatifs d'Alice.

Le même Mallory demandant le profil d'Alice reçoit `isOnline: null,
lastActiveAt: null` : `presence.online` exige `FRIEND`.

> **Le canal des accusés livrait un horodatage d'activité PLUS FIN que celui que
> le canal de présence refuse, au lecteur précis que la loi restreint.**

Et le canal jumeau du MÊME lot consulte, lui, l'état de demande en attente :
`CallEventsHandler.ts:1990` — `!p.messageRequestAt`, « une demande en attente ne
sonne pas ». Les accusés ne consultaient rien.

## La cause, qui est le vrai sujet du lot

Les deux résolveurs d'accusés sont AVEUGLES AU VIEWER :

| canal | ce qui décidait | le viewer |
|---|---|---|
| socket | `shouldShowReadReceipts(acteur)` — un réglage GLOBAL | jamais lu |
| REST | `filterReadReceiptVisible(identities)` | **pas même un paramètre** |

C'est `resolvePrefsOnly`, que la loi de PRÉSENCE a **SUPPRIMÉE**, avec une garde
de source qui interdit son retour sous trois racines (directive 2026-08-25).

> **Une résolution aveugle au viewer ne PEUT PAS porter une loi par paire.** La
> loi n'était pas oubliée : elle n'avait aucun endroit où s'appliquer. Chercher
> l'appel manquant est le mauvais bout — il faut demander ce que le résolveur
> REÇOIT, et s'il a de quoi répondre à la question que la loi pose.

Et la garde de la présence ne pouvait pas le voir : elle interdit un
IDENTIFIANT, pas une FORME. Le canal des accusés portait la même forme sous un
autre nom.

## Le correctif

| ce qui change | où |
|---|---|
| le socket EXCEPTE les refusés de TOUTE la chaîne | `broadcastReadStatus` + `readReceiptDeniedAmong` |
| les 3 portes nominatives masquent par cercle | `MessageReadStatusService._receiptsHiddenFrom` + `readReceiptHiddenFromViewer` |
| le viewer devient REQUIS | les trois signatures ; `getMessageStatusDetails` perd son `options = {}` |

**`.except()` et non le retrait de la room personnelle** : la room de
CONVERSATION tient le lecteur dès qu'il a le fil à l'écran. Un correctif qui ne
retirerait que la room personnelle serait inopérant pour exactement les lecteurs
qui regardent — le cas nominal de la fuite. C'est la seconde précondition écrite
sur l'issue avant le premier témoin.

**Les cinq sites d'appel ont été nommés par `tsc`** (`TS2554`, `TS2345`), pas
par un `grep` : forme forte de #19303, un paramètre requis supprime la
discipline au lieu de la déplacer.

### Deux replis OPPOSÉS, et le lot n'« unifie » rien

| garde | ce qu'elle décide | repli |
|---|---|---|
| `showReadReceipts` | est-ce que J'ÉMETS des accusés ? | **OUVERT** (#4530) |
| `dm.readReceipts` | à QUI cet accusé a-t-il le droit d'arriver ? | **FERMÉ** |

Le témoin de #4530 annonçait tomber « le jour où l'on voudra unifier les deux
postures ». Il n'est pas tombé, et c'est juste : une préférence ABSENTE a un
défaut écrit, un NIVEAU illisible n'en a pas — servir y serait deviner un droit.
Son doc-comment porte désormais le tableau des trois postures.

### `null` est PERMISSIF ici, à l'inverse de la présence

Un viewer `null` est un invité de lien : il participe légitimement et n'a pas de
cercle. Le masquer retirerait les accusés de tous les fils à lien partagé, que
rien dans MSG-04 ne demande. Même arbitrage que `dm.typing`.

## La mesure de production, faite AVANT la première ligne

La question qui pouvait tuer le lot : **si les niveaux ne sont pas peuplés en
production, ce gate coupe les accusés de tout le monde.** Trois faits répondent :

1. une demande d'ami ACCEPTÉE rattrape la ligne à `FRIEND`
   (`friendshipBackfillProjection` écrit `grantedByLow/High: 'FRIEND'`), au-dessus
   du plancher ;
2. `dm.direct` est au MÊME plancher et **déjà appliquée** — toute paire qui peut
   s'écrire en direct est donc déjà ≥ `ACQUAINTANCE`, sans quoi la messagerie
   directe serait en panne ;
3. ce qui perd ses accusés est exactement ce que MSG-03/RG-22 désigne : un groupe
   d'inconnus, une demande non acceptée — là où la frappe est masquée depuis
   #14107.

MSG-01 (« un message de demande n'affiche pas de confirmation de lecture ») est
satisfait par le même gate, sans clause dédiée.

---

## Ce que ce cycle a appris

### Une loi déclarée sans site d'application est zéro garde avec l'apparence d'une

Trois artefacts l'étayaient — le catalogue, les deux miroirs clients, le témoin
de catalogue — et le témoin passait au vert en attestant le catalogue. Personne
ne va chercher derrière trois verts. Détail :
`tasks/lessons/2026-11-17-une-loi-declaree-sans-site-d-application-est-zero-garde-avec-l-apparence-d-une.md`.

### Une mutation verte accuse le témoin — sauf quand elle mesure une symétrie réelle

Six mutations, toutes vérifiées APPLIQUÉES. Quatre rouges, deux vertes qui ne
disaient PAS la même chose :

- **« le viewer est toujours nul »** : vrai trou. `receiptViewerOf` — seul maillon
  entre l'authentification et la loi, sur les TROIS portes REST — n'avait aucun
  témoin, les suites appelant les portes avec un viewer écrit à la main. La
  mutation retirait la loi des trois portes d'un coup sans rien faire tomber.
  Fermé par une suite à lui (M3bis : 2 rouges).
- **« inverser le sens de la loi »** : vert JUSTE. Mesuré, `dm.readReceipts` n'a
  pas de bouclier des mineurs, son privilège d'équipe exige les deux côtés, et le
  niveau est le minimum des deux accords.

Les deux cas se ressemblent exactement et ne se distinguent qu'en allant lire ce
qui pourrait désymétriser la loi. La réponse est écrite dans le module, sinon le
prochain lot « prouve » la direction par un témoin incapable de tomber.

### Un audit à quatre passes rend quatre lots, et trois doivent devenir des issues le jour même

Les constats non retenus (#19404 à #19408) sont instruits avec leur scénario, leur
garde vérifiée absente et leur fix esquissé — dont deux qui valent plus que ce
lot en gravité brute (`DELETE /messages/:id` sans sa garde optimiste, double
décrément de stats irréversible ; le signal de rattrapage du drain inatteignable
quand tout le lot est perdu). **Les garder dans un journal les aurait perdus** :
le cycle 87 a mesuré qu'un outil laissé dans un journal se refait à la main deux
cycles plus tard.

---

## Preuve

- `readReceiptCircleGate.test.ts` : **15 verts** (les deux sens de la loi, le
  dérivateur du viewer, le fail-closed par levée) ;
- `broadcastReadStatus.circleGate.test.ts` : **5 verts**, dont les 3
  non-régressions (tous ≥ Connaissance, invité de lien, acteur sans compte) ;
- `readReceiptCircleRest.test.ts` : **6 verts**, dont le cumul loi × préférence
  dans les deux sens ;
- **4 mutations ROUGES**, 2 vertes INSTRUITES (ci-dessus), 1 non appliquée et
  signalée comme telle plutôt que lue — le motif échoue bruyamment s'il ne
  matche pas exactement une fois ;
- la garde STRUCTURELLE prouvée dans les deux sens : `tsc --noEmit` EXIT=0 sur
  l'arbre livré, `TS2554`/`TS2345` dès qu'un site omet le viewer ;
- `tsc --noEmit` lu comme CODE DE SORTIE, jamais à travers un pipe.

## Suivis

- **#19402** (agrégats) et **#19403** (pièces jointes) : différés avec leur
  raison, pas oubliés. Le second ne se transpose PAS par analogie — son canal a
  un repli RESTRICTIF là où celui-ci est ouvert, et transposer serait la faute du
  cycle 107.
- **#19386** : la réciprocité de MSG-04, question de produit.
- **#14107 reste OUVERTE** : MSG-04 n'est livré que côté serveur, et son volet
  client reste à vérifier (aucun client ne fabrique un accusé qu'il n'a pas reçu,
  mais c'est à MESURER, pas à supposer).

---

## Ce que l'audit adversarial a cassé — et c'est le vrai résultat du cycle

L'audit exigé par le `CLAUDE.md` pour un lot de contrôle d'accès a rendu onze
constats et un verdict BLOQUANT. J'ai vérifié moi-même les quatre qui décident ;
les quatre tiennent.

| # | constat | vérifié comment |
|---|---|---|
| 1 | le socket a **QUATRE** émetteurs de `READ_STATUS_UPDATED`, le lot n'en garde **un** | `grep` des émetteurs de production |
| 2 | le lot **fabrique** un faux « lu par tous » (`hidden` retiré avant `totalMembers`) | lecture de `MessageReadStatusService.ts:1542-1550` |
| 3 | la mesure de production est **fausse** : répondre à une demande ne relève AUCUN lien | `messageRequests.ts:385-410`, `raiseLink: false` |
| 4 | en 1:1 l'**agrégat EST l'identité**, donc le renvoi à #19402 ne tient pas | `MessageReadStatusService.ts:2603` |

### La leçon que ce cycle a ÉCRITE puis VIOLÉE dans le même commit

Le fichier de leçon de ce cycle cite la leçon 261 : *« une énumération de sites
porte DEUX affirmations : "ces sites appliquent la règle" (vérifiable) et "ce
sont les sites où la règle s'applique" (presque jamais vérifiée) »*.

Mon relevé a annoncé « 1 socket + 3 REST ». Le socket en a quatre, et
`broadcastReadStatus.ts:148` — **le fichier que j'ai modifié** — porte déjà la
phrase : « une règle de confidentialité qui tient à trois portes sur quatre n'est
pas une règle : il suffit d'entrer par la quatrième. »

> **Citer une leçon n'est pas l'appliquer, et l'écrire dans le même lot ne protège
> de rien.** J'ai cherché les sites qui RÉSOLVENT un accusé (d'où les trois portes
> REST, toutes justes) et jamais les sites qui en ÉMETTENT un. La question « qui
> applique cette règle ? » rend ce qu'on sait déjà chercher ; celle qui attrape
> les quatre est **« qui ÉMET cet événement ? »**, posée sur le nom de
> l'événement, pas sur le nom de la règle.

### La garde de présence m'a attrapé en citant son propre interdit

`presence-visibility-viewer-aware-guard` rougit sur « ni défini, ni appelé, **ni
cité** » : mon doc-comment écrit `resolvePrefsOnly` pour expliquer l'analogie.
La garde a raison — un identifiant supprimé ne revient pas, même en prose, parce
qu'un `grep` futur le retrouverait et croirait le site vivant.

Et cela **précise** le constat du lot au lieu de le contredire : la garde
interdit un IDENTIFIANT, le canal des accusés portait la même FORME sous un autre
nom. C'est pourquoi elle ne l'avait jamais vu, et pourquoi elle m'a vu, moi, à
l'instant où j'ai écrit le mot.

### « Le compilateur tient la règle » ne vaut que là où le compilateur regarde

J'ai annoncé les cinq sites d'appel « nommés par `tsc` ». Vrai des sites de
PRODUCTION seulement : le `tsconfig` du gateway **exclut** `__tests__`. Retirer
le `= {}` de `getMessageStatusDetails` a donc cassé à l'EXÉCUTION une dizaine de
suites qui l'appellent sans options, et `tsc --noEmit` restait à EXIT=0.

> La forme forte de #19303 reste juste ; son énoncé doit porter sa borne. **Un
> paramètre requis supprime la discipline dans le périmètre du compilateur, et
> la déplace ailleurs** — ici vers `ts-jest`, qui ne le dit qu'au moment où la
> suite tourne.

### Le gate complet, que je n'avais pas lancé avant d'annoncer

**52 rouges, 23 suites** sur l'arbre fusionné (42 586 verts). Six suites sont les
échecs HEIF/AVIF préexistants des cycles 173-175 ; les autres sont de moi, dont
trois gates de maison : `receipts.ts` à **1015 lignes** (plafond 1000), le cumul
hors budget qui REMONTE, et la garde de présence ci-dessus.

> **Annoncer une preuve sur ses propres témoins est une mesure, pas une preuve.**
> Les 26 verts et le `tsc` EXIT=0 étaient exacts et ne disaient rien des gates de
> maison, que le lot n'avait pas lancés. L'ordre juste est : gates d'abord,
> annonce ensuite.

### Ce qui reste vrai

Le CONSTAT tient entièrement, et aucun des onze points ne l'attaque :
`dm.readReceipts` est déclarée, miroitée par les deux SDK, couverte par un témoin
de catalogue, et appliquée par **aucun site** ; la fuite vers un pair sous
Connaissance est réelle, et son asymétrie avec le canal de présence aussi.

Réutilisables : `readReceiptCircleGate.ts` (citation à retirer, symétrie à
corriger), le helper de témoins (l'audit le déclare non affaiblissant), les 26
témoins, et le choix `.except()` (déclaré juste et nécessaire).
