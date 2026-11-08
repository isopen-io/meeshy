# Cycle 144 — la position en direct ne connaissait pas le blocage, et la garde du regard s'éteignait sur une panne

**Issues livrées** : #16745 (lot A, `LocationHandler`) et #16752 (lot B,
`ConversationViewingHandler`).
**Branche** : `claude/exciting-planck-4nctmx`. **Milestone** : « Un blocage coupe
TOUS les canaux temps réel, la position en direct comprise » (les deux issues y
étaient déjà, posées par le cycle 142).
**Issue ouverte en chemin** : #16791 (milestone #248).

## Le périmètre, et pourquoi celui-là

Le cycle 142 a déposé huit défauts vérifiés et en a livré deux. Au démarrage de
celui-ci, la PR **#16769** (cycle 143, session sœur) portait #16706 et #16749 et
réécrivait `offlineParticipantQueue.ts`, `RedisDeliveryQueue.ts`,
`delivery-queue-registry.ts`, `OfflineQueue*.swift` et six autres fichiers de la
file hors ligne. Trois des huit dépôts (#16688, #16747, #16748) exigent
précisément ces fichiers.

Le corollaire d'asymétrie a tranché sans négociation : **celui qui n'a rien
écrit cède.** Relevé au démarrage, sur les branches poussées dans les quatre
derniers jours : aucune n'écrit `LocationHandler.ts` ni
`ConversationViewingHandler.ts`. C'est ce qui a choisi les deux lots, et la
cohérence du couple n'était pas prévue — elle est apparue en les instruisant.

Le squelette a été poussé AVANT la logique (#5243) : un commit de réservation
nommant les quatre fichiers du lot.

## Les deux défauts étaient le même défaut, vu des deux bouts

Les deux issues portaient sur le blocage dans un signal de salon, et toutes deux
le posaient comme une question d'ANNONCE. Instruites ensemble, elles ont rendu
une règle que ni l'une ni l'autre ne formulait, et qui contredit la correction
que les deux proposaient pour leurs chemins de retrait :

> **Une rétractation exclut exactement ceux qui avaient été exclus de
> l'annonce — et personne de plus.**

Un pair bloqué APRÈS l'annonce a REÇU l'annonce : son interface porte le point
« ici », ou l'épingle. L'exclure du retrait laisse ce point allumé — et pour la
position, c'est une coordonnée GPS réelle, figée, d'apparence vivante, jusqu'à
huit heures. **Relire le blocage à la rétractation, comme les deux issues le
suggéraient, protège le blocage en publiant plus longtemps ce qu'il doit
cacher.** Détail : `tasks/lessons/2026-11-08-une-retractation-exclut-ceux-qui-avaient-ete-exclus-de-l-annonce.md`.

L'ensemble voulu est déjà RETENU par les deux handlers, et c'est un ensemble
PROUVÉ. Donc : aucune lecture, aucun fail-open possible, et deux requêtes de
moins par rétractation.

## Lot B — la garde du regard échouait OUVERT (#16752)

`blockRelatedOf` rendait un `Set` VIDE sur une levée. Un ensemble vide ne se lit
pas « je ne sais pas » : il se lit **« personne à exclure »**. Une bascule de
réplique de vingt secondes suffisait donc à publier `VIEWING_SNAPSHOT` — la
liste NOMINATIVE des gens présents dans chacune des conversations du socket qui
s'authentifie — aux pairs bloqués dans les deux sens.

L'asymétrie était dans le MÊME fichier : `viewing:start` appelait la loi
partagée **sans `catch`**, si bien qu'une levée remontait au `.catch` de `listen`
et que rien ne partait. La même garde était donc fail-CLOSED sur un verbe et
fail-OPEN sur deux autres. Une asymétrie interne à un fichier est le signe d'un
oubli, pas d'un arbitrage.

Trois états, nommés (`ReadonlySet | null`), et deux postures :

| site | posture |
|---|---|
| `start`, `emitRoomSnapshots` | une lecture qui ne conclut pas ⇒ **rien ne part** |
| `retract`, `retractViewingForDepartedMember` | **aucune lecture** — l'ensemble retenu par l'annonce |

Le second n'est pas un repli sur panne : c'est le retrait de la lecture. Le
fail-open se ferme par CONSTRUCTION, pas par un test de `null` qu'un site futur
pourrait oublier. Et `retractViewingForDepartedMember` capture l'ensemble AVANT
`untrack`, qui efface les entrées d'où il se lit.

Le long commentaire d'`activity` qui justifie un fail-**open** pour
l'APPARTENANCE n'est pas touché : il est juste, et il parle d'autre chose — on
ne retire pas quelqu'un d'un fil sur une panne, mais un blocage est une
exclusion de confidentialité.

## Lot A — la position en direct ne connaissait pas le blocage (#16745)

Cinq portes, zéro occurrence du mot `block`. Et la route de blocage ÉNUMÈRE les
canaux temps réel qu'un blocage coupe — `cancelAutoAcquaintanceOnBlock`,
`stopBringsAfterUserBlock`, `cutTalkiesOnBlock`, `refreshNowPlayingAfter`. La
position en direct, le plus révélateur des cinq, n'y figurait pas.

`LiveLocationSession.blockRelated` porte l'invariant, et il n'est pas nommé
« cache » à dessein : **c'est l'ensemble des pairs qui n'ont PAS d'épingle.** Un
nom qui annonce un cache invite à le rafraîchir ; un nom qui annonce un
invariant invite à le TENIR. De lui découle la posture de chaque porte :

| porte | ce qu'elle fait |
|---|---|
| `live-started` | exclut l'ensemble ; une lecture qui ne conclut pas **REFUSE le partage** |
| `live-updated` | exclut l'ensemble, rafraîchi par pas d'une minute |
| `live-stopped` (×2 sites) | exclut l'ensemble RETENU ; session inconnue ⇒ **aucune exclusion** |
| rattrapage à la jonction | lit l'ensemble de l'**ARRIVANT**, et ne rejoue rien s'il ne conclut pas |

Trois décisions valent d'être dites :

- **Le rattrapage lit du côté de l'arrivant.** La question est par PAIRE, et
  l'ensemble bidirectionnel du joignant y répond pour TOUS les partageurs d'un
  coup : une lecture par jonction, jamais une par session, et seulement s'il y a
  quelque chose à rejouer. Il devient asynchrone — d'où le `await` chez
  `ConversationHandler`, dont le commentaire affirmait « ne peut pas jeter,
  l'implémentation est synchrone et sans I/O ». Vrai quand il a été écrit ;
  **un commentaire d'impossibilité ne rougit jamais** (cycle 108), et ce lot l'a
  périmé, donc réécrit.
- **Un blocage posé EN COURS de partage produit une rétractation CIBLÉE.** Quand
  le rafraîchissement découvre un pair entré dans l'ensemble, cesser de lui
  parler ne suffit pas : son épingle resterait plantée sur une position réelle.
  C'est ce geste qui tient l'invariant, et c'est lui qui rend l'exclusion du
  retrait exacte.
- **Une session INCONNUE diffuse son retrait au salon ENTIER.** Après un
  redémarrage, le registre ne sait plus qui porte l'épingle : la seule erreur
  coûteuse serait de la laisser plantée.

### La forme conditionnelle n'est pas cosmétique

`_roomExcept` / `_fromSocketExcept` posent `.except(...)` **seulement s'il y a
quelqu'un à exclure** — la forme du voisin (`StatusHandler:385`). Sans blocage,
la chaîne d'émission est EXACTEMENT celle d'avant le lot. C'est ce qui garde le
correctif d'être trop large, et un témoin l'assert explicitement.

### Le cliquet, parce que le correctif de comportement est la moitié du lot

Ce qui a tenu ce défaut en vie n'est pas une erreur de raisonnement : **rien
n'obligeait à poser la question.** Chaque handler appliquait la règle chez lui,
avec son commentaire chez lui, et un fichier qui ne mentionne pas une règle ne
peut pas la mentionner de travers — **le silence n'a pas de place où rougir.**

Un témoin de comportement garde les cinq sites qui EXISTENT ; le cliquet garde
le SIXIÈME. `socketio/__tests__/locationBlockExclusionSweep.ts` relève les
émissions `LOCATION_LIVE_*` adressées à un SALON sans passer par un composeur
d'exclusion. Son discriminant est la **CIBLE**, pas la méthode : il laisse
passer l'émission à un socket nommé du rattrapage et la rétractation ciblée dont
les destinataires SONT les bloqués.

**Ce qui n'a PAS été fait, et c'est délibéré** : un balayage « ce handler cite-t-il
la loi de blocage ? » sur les trois familles. C'est exactement ce qui a rendu
sept faux positifs au cycle 107 — une recherche d'idiome mesure la popularité
d'un idiome, jamais une propriété. Détail :
`tasks/lessons/2026-11-08-une-famille-de-signal-se-compte-avant-d-affirmer-qu-elle-est-gardee.md`.

## Ce que les doubles de test devaient apprendre

Sept suites de `LocationHandler` sont devenues rouges : leurs doubles Prisma
n'exposaient pas `prisma.user`, donc `getBlockRelatedUserIds` levait un
`TypeError` que le `try` du handler traduisait en refus. Un double doit ACCEPTER
ce que la production appelle.

Une FABRIQUE (`socketio/__tests__/helpers/no-blocks.ts`), et non sept copies :
un double dont la forme se retape à chaque site est un double qu'un site finira
par ne pas avoir.

Deux témoins existants ont demandé plus qu'un double :

- **`LocationHandler.globalMinor`** portait DÉJÀ un `user.findUnique` (la date de
  naissance de la règle 5). Les deux questions passent par la même méthode sous
  deux `select` : le double rend les deux colonnes. Et son témoin
  « *sans lire sa date de naissance* » comptait les APPELS — un proxy valide
  tant que la date de naissance était la seule question posée à cette table.
  Il assert désormais sur `select.birthDate`. **Mesuré** : sous la mutation qui
  fait lire la règle 5 pour tout fil, le témoin réécrit TOMBE ; la version qui
  comptait les appels serait au contraire restée verte le jour où une autre
  lecture occupe le compteur.
- **`LocationHandler.lifecycle`** appelait le rattrapage sans l'attendre : sept
  `await` ajoutés, conséquence directe du changement de signature.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0**, 0 ligne (lu HORS pipe) |
| les 8 suites `LocationHandler` | **116 témoins verts** |
| les 3 suites du regard | **49 témoins verts** |
| cliquet d'exclusion (#16745) | **11 verts** |
| cliquets de taille (`gateway-file-size-budget`, variante tests) | **11 verts** |
| suite gateway COMPLÈTE | **2 528 suites / 39 772 témoins verts** ; 6 suites rouges, **toutes étrangères au lot** |
| `server-emit-door-sweep`, `detached-promise-catch-sweep`, garde de présence | **21 verts** |
| rouge prouvé, lot A | **9 des 11 témoins tombent** sans le correctif ; 2 verts des deux côtés |
| rouge prouvé, lot B | **4 des 6 témoins tombent** sans le correctif ; 2 verts des deux côtés |
| rouge prouvé, cliquet | tombe sur **3 sources fabriquées** et sur le fichier RÉEL (une seule porte revertie), en nommant la cible |

**Les quatre témoins verts des deux côtés sont le second gate du lot.** Côté A :
« le rattrapage sert bien un partageur NON bloqué » et « sans blocage, aucune
exclusion n'est posée ». Côté B : « `viewing:start` ne partait déjà rien sur une
levée » (la posture préexistante, par accident de forme) et « un pair non bloqué
reste servi ». Sans eux, rien n'aurait signalé qu'une resserre de confidentialité
venait de couper le cas nominal.

`LocationHandler.ts` passe de 681 à 916 lignes — dans le budget (plafond dur
1200, seuil de découpage 1000), mais il s'en approche, et la majeure partie de
l'ajout est du doc-comment.

### Les rouges restants, et le septième qui était MIEN

Les six rouges de la suite complète sont les suites de CODECS d'image (HEIF,
AVIF 10 bits, carte de gain HDR, orientation EXIF) que les cycles 139 et 142
ont mesurées et documentées : capacité libvips du conteneur, vertes en CI.
**Remesurées ici sur un arbre PROPRE** (`git stash -u`, mêmes 5 suites, 15
témoins) — elles tombent sans une ligne de ce lot. Ne pas hériter d'un verdict :
un rouge attribué au cycle précédent se revérifie, sinon un rouge NEUF se cache
derrière la réputation d'un ancien.

Le septième était à moi, et il est réparé : `journal-one-file-per-entry-guard`
exige d'une entrée de `tasks/lessons/` que sa PREMIÈRE ligne soit son titre
`## ` et qu'elle ne porte **aucun autre titre** hors bloc de code. Les deux
fichiers de leçons étaient écrits en `#` + sections `##`. Le cliquet a fait
exactement son travail — et c'est un cliquet qu'une session qui écrit des leçons
rencontre forcément, donc il valait d'être nommé ici : la forme d'une entrée est
*un* titre `## `, le reste en prose et en amorces gras.

## Dimensions

**Mûres** : **1 (Sécurité / confidentialité)** — la troisième famille de signal
de salon filtre enfin le blocage, et la garde de la deuxième ne s'éteint plus
sur une panne ; **6 (Cohérence)** — même geste, même effet sur les trois signaux
du même salon ; **11 (Maintenabilité)** — une posture unique par garde, deux
requêtes de moins par rétractation, un cliquet qui garde la famille plutôt que
ses membres ; **13 (Complétude)** — les cinq portes de la position, et les deux
moments (annonce / rétractation) de chacune.

**Restantes, avec leur issue** : #16791 — une session dont la passerelle a perdu
la trace relit la base à chaque point (jusqu'à 240 requêtes/minute/partageur).
La MOITIÉ de ce coût est préexistante (`refusesMinorInConversation`, #9927) ;
ce lot l'a doublée et chiffrée plutôt que d'élargir un lot de confidentialité à
une question de performance.

**Non tranché, et déposé comme tel** : l'« Optionnellement » de #16745 — éteindre
un partage en cours au MOMENT du blocage, à l'image de `cutTalkiesOnBlock`. Ce
lot y répond autrement, et à son échelle (la rétractation ciblée au
rafraîchissement, bornée à une minute). Le faire depuis `routes/directory/blocks.ts`
exigerait un canal inter-instances, comme le talkie en a un : le registre de
position vit en mémoire d'un seul processus. C'est une question d'architecture,
pas la complétion de celle-ci.

## Ce qui reste du dépôt du cycle 142

| issue | sujet | pris par |
|---|---|---|
| #16706, #16749 | clair d'un message détruit, relance d'un envoi en vol | PR #16769 (cycle 143) |
| #16688, #16747, #16748 | convergence hors ligne, clair d'un message enfilé, deux flushers | **cédés** — fichiers de la PR #16769 |
| #16750 | un invité de lien ne se reconnecte jamais | libre (SDK iOS, preuve par CI macOS) |
| #16751 | la traduction d'une story compte les événements, pas les langues | libre (passerelle) |
| #16753 | le rang 2 du registre de lecture n'a aucun appelant | libre (SDK iOS) |
