# Cycle 144 — la position en direct ne connaissait pas le blocage, et la garde du regard s'éteignait sur une panne

**Issues livrées** : #16745 (lot A, `LocationHandler`) et #16752 (lot B,
`ConversationViewingHandler`).
**Branche** : `claude/exciting-planck-4nctmx`. **Milestone** : « Un blocage coupe
TOUS les canaux temps réel, la position en direct comprise » (les deux issues y
étaient déjà, posées par le cycle 142).
**Issues ouvertes en chemin** : #16791 (perf, milestone #248) · #16794, #16796,
#16797 (suites de l'audit, milestone #248) · #16795, #16798 (décisions produit,
milestone #249).

## Ce cycle a été RÉÉCRIT par son propre audit, et c'est le fait principal

Le lot a d'abord été livré, poussé, et ouvert en PR #16793. L'audit adversarial
exigé par le `CLAUDE.md` pour un lot de contrôle d'accès a rendu **BLOQUANT**, et
il avait raison sur son point central : **la première version ouvrait une porte
neuve, pire sur son axe que le défaut qu'elle fermait.**

Tout ce qui suit décrit la version RÉÉCRITE. Ce que la première version faisait
est consigné, parce que c'est la partie instructive.

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
le posaient comme une question d'ANNONCE, en proposant pour les chemins de
retrait de rejouer la même garde fraîchement. Instruites ensemble, elles ont
rendu une règle que ni l'une ni l'autre ne formulait — et la première version du
lot s'est trompée sur la FORME de cette règle avant que l'audit ne la corrige.

**Première version (fausse) :** « une rétractation exclut exactement ceux qui
avaient été exclus de l'annonce ». Elle exigeait de connaître l'ensemble « qui
n'a RIEN reçu », tenu sur la session et rafraîchi, plus une **rétractation
CIBLÉE** vers qui entrait dans l'ensemble en cours de route.

**Ce que l'audit a mesuré :** cet ensemble ne PEUT PAS être juste. Il l'était
faux sur quatre chemins — un re-départ de partage (`_openSession` n'écrit aucune
rétractation), un `live-stop` sans partage (l'exclusion vient d'une session
absente), deux appareils du même compte (l'union au lieu de l'intersection), et
une émission ciblée perdue (l'ensemble est écrit AVANT l'émission, sans
rollback). *Qui porte l'épingle* dépend de l'instant de chaque annonce, du nombre
d'appareils, d'un rafraîchissement arrivé entre-temps.

**Version retenue, et elle ne tient aucun état :**

> **Les ANNONCES se filtrent. Les RÉTRACTATIONS non.**

`started`, `updated`, `viewing:start`, l'instantané et `viewing:activity`
excluent l'ensemble ; `stopped` et `viewing:stop` partent au salon. Une
rétractation ne porte pas la donnée sensible (`{conversationId, userId,
stoppedAt}`) et c'est le SEUL chemin qui retire ce qui est affiché :

| posture du retrait | ce qu'elle coûte |
|---|---|
| filtré | une épingle sur une position RÉELLE, jusqu'à 8 h, chez un bloqué |
| **non filtré** | un événement sans position, une fois par partage, à un membre du fil |

Le gain n'est pas seulement le bon arbitrage : **plus rien à tenir à jour, rien à
rejouer si une émission se perd, rien à recalculer au re-départ d'un partage, et
rien à décider entre union et intersection.** Les quatre défauts ci-dessus
disparaissent par construction, pas un par un.

Détail : `tasks/lessons/2026-11-08-une-liste-d-exclusion-inversee-en-liste-de-destinataires-change-de-perimetre.md`.

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
| `live-started` | ANNONCE — exclut l'ensemble ; une lecture qui ne conclut pas **refuse le partage** |
| `live-updated` | ANNONCE — exclut l'ensemble, rafraîchi par pas d'une minute |
| `live-stopped` (×2 sites) | RÉTRACTATION — part au salon, **sans exclusion** |
| rattrapage à la jonction | ANNONCE — lit l'ensemble de l'**ARRIVANT**, et ne rejoue rien s'il ne conclut pas |

Deux décisions valent d'être dites :

- **Le rattrapage lit du côté de l'arrivant.** La question est par PAIRE, et
  l'ensemble bidirectionnel du joignant y répond pour TOUS les partageurs d'un
  coup : une lecture par jonction, jamais une par session, et seulement s'il y a
  quelque chose à rejouer. Il devient asynchrone — d'où le `await` chez
  `ConversationHandler`, dont le commentaire affirmait « ne peut pas jeter,
  l'implémentation est synchrone et sans I/O ». Vrai quand il a été écrit ;
  **un commentaire d'impossibilité ne rougit jamais** (cycle 108), et ce lot l'a
  périmé, donc réécrit. Et parce qu'il devient asynchrone, il **revérifie
  l'appartenance après son `await`** : `socket.emit` vise le SOCKET, pas la room,
  donc une éviction concurrente ne le retiendrait pas (constat F12 de l'audit).
- **L'UNIQUE composeur d'exclusion du fichier est `_fromSocketExcept`**, et il
  n'a que deux appelants — les deux annonces. Son jumeau côté serveur
  (`_roomExcept`) a été SUPPRIMÉ en même temps que la rétractation ciblée : il
  n'existe plus aucune émission de ce handler qui filtre depuis `this.io`.

### La porte que la première version ouvrait, et qui était PIRE

`getBlockRelatedUserIds` rend l'ensemble bidirectionnel ENTIER du partageur,
**à l'échelle du dépôt et sans notion de conversation**. Son doc-comment dit
pourquoi c'est sans danger, et sa phrase porte sa propre condition :

> « an id in this set that owns no socket contributes nothing to **AN EXCLUSION
> LIST** »

La rétractation ciblée INVERSAIT cet ensemble en liste de DESTINATAIRES, servie
par `io.to(socketId)` — donc hors room et hors appartenance. **Dave, qui n'est
pas dans le fil et n'a aucun lien avec Alice, apprenait par son propre blocage
l'existence d'un identifiant de conversation auquel il n'a pas accès, le fait
qu'Alice y tenait un partage de position, et l'instant** — répétable à ~1
coup/minute en débloquant et rebloquant, soit une sonde d'activité GPS déclenchée
par le bloqueur.

> **Un ensemble a un périmètre, et ce périmètre dépend de l'usage qu'on en fait.
> Soustraire tolère le large ; adresser ne le tolère pas.** C'est la leçon 275
> retournée : on avait mesuré ce que la charge TRANSPORTE, pas à qui elle est
> ADRESSÉE.

**Aucun des deux cliquets du lot ne pouvait la voir.** Le témoin de comportement
couvrait les cinq portes existantes ; le cliquet de source cherchait les
émissions adressées à un SALON, donc par construction il ne regardait pas celle
qui ne l'était pas. Le lot part désormais avec un témoin qui assert la propriété
STRUCTURELLE — aucune émission de ce handler n'est adressée à un id de socket —
et pas seulement le symptôme.

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

Un témoin de comportement garde les sites qui EXISTENT ; le cliquet garde le
SUIVANT. `socketio/__tests__/locationBlockExclusionSweep.ts` relève les ANNONCES
`LOCATION_LIVE_STARTED` / `LOCATION_LIVE_UPDATED` dont la chaîne ne passe pas par
`_fromSocketExcept`. Il ne regarde pas les rétractations, et **ce silence est une
DÉCISION** : s'il les exigeait filtrées, il pousserait le prochain lot à reposer
le défaut qu'on vient de retirer.

### La première version du cliquet n'en voyait qu'un SEPTIÈME, et l'audit l'a compté

Elle exigeait `.to(` ET une cible matchant `/^ROOMS\./`. Elle était donc aveugle
à six formes qui compilent, exécutées sur le vrai module :

| forme | visible ? |
|---|---|
| `const room = ROOMS.conversation(id); io.to(room).emit(…)` | **non** |
| `io.in(ROOMS.conversation(id)).emit(…)` — `.in()` est l'alias de `.to()` | **non** |
| `this._roomAll(ROOMS.conversation(id)).emit(…)` — tout helper neuf | **non** |
| `const ev = SERVER_EVENTS.LOCATION_LIVE_STARTED; io.to(…).emit(ev, …)` | **non** |
| `io.to(…).volatile.emit(…)` — opérateur plausible sur un flux GPS | **non** |
| `const { conversation } = ROOMS; io.to(conversation(id)).emit(…)` | **non** |
| `io.to(ROOMS.conversation(id)).emit(…)` | oui |

**La première ligne est l'idiome DOMINANT du répertoire** — 15 sites
`const room = ROOMS.conversation(…)` en production, dont le jumeau de référence
lui-même (`StatusHandler`) et `ConversationHandler`. Un cliquet posé pour
attraper « le site qu'un lot futur ajoutera » ne voyait pas ce site s'il était
écrit dans le style de la maison.

> **Un cliquet se règle sur la forme CONFORME, dont il n'y a qu'une, et traite
> tout le reste comme à instruire.** Chercher la forme FAUTIVE, c'est énumérer —
> et une énumération est en retard par construction. Le discriminant est
> désormais inversé : toute chaîne d'annonce qui n'est pas produite par le
> composeur est signalée, et seules deux formes sont exemptées (l'émission à un
> socket nommé, et l'ACK), chacune avec son témoin de non-régression.

Et il balaye **tout `services/gateway/src`**, hors arbres de témoins — l'autre
reproche de l'audit, que le dépôt avait déjà payé : « `server-emit-door-sweep`
balaye `src/` ENTIER : la huitième copie vivait dans `utils/socket-broadcast.ts`,
à deux répertoires de la septième ».

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
| les 18 suites du périmètre (position, regard, jonction, cliquets) | **294 témoins verts** |
| cliquet d'exclusion, réécrit | **15 verts** |
| cliquets de taille (`gateway-file-size-budget`, variante tests) | **11 verts** |
| cliquet d'entrée de journal | **18 verts** |
| `server-emit-door-sweep`, `detached-promise-catch-sweep`, garde de présence | **21 verts** |
| suite gateway COMPLÈTE | **2 528 suites / 39 772 témoins verts** ; 6 suites rouges, **toutes étrangères au lot** — mesurée sur la 1re version, et les 18 suites du périmètre revérifiées après réécriture |
| **audit adversarial** | **BLOQUANT sur la 1re version** : 13 constats, 5 témoins rouges écrits contre elle |
| rouge prouvé, lot A | **9 des 15 témoins tombent** sans le correctif ; 3 verts des deux côtés |
| rouge prouvé, lot B | **5 des 8 témoins tombent** sans le correctif ; 3 verts des deux côtés |
| rouge prouvé, le pouls du regard | tombe quand on fige son rafraîchissement |
| rouge prouvé, cliquet | tombe sur **7 sources fabriquées** — dont les six formes que la 1re version ratait — et sur le fichier RÉEL muté **dans l'idiome de la maison**, en nommant fichier, ligne et forme |

**Les six témoins verts des deux côtés sont le second gate du lot.** Côté A :
« le rattrapage sert bien un partageur NON bloqué », « sans blocage, aucune
exclusion n'est posée », et le bloqueur ÉTRANGER qui ne reçoit rien. Côté B :
« `viewing:start` ne partait déjà rien sur une levée » (la posture préexistante,
par accident de forme), « un pair non bloqué reste servi », et « le pouls ne
relit la base qu'une fois par pas ». Sans eux, rien n'aurait signalé qu'une
resserre de confidentialité venait de couper le cas nominal — ni qu'elle venait
de mettre la base sur le trajet d'un signal qui bat toutes les deux secondes.

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
de salon filtre enfin le blocage ; la garde de la deuxième ne s'éteint plus sur
une panne ; son pouls d'activité cesse de nommer un lecteur à qui vient de le
bloquer ; et aucune émission de ce lot n'est adressée hors du salon.
**6 (Cohérence)** — même geste, même effet sur les trois signaux du même salon,
et une règle unique annonce/rétractation partagée par les deux handlers.
**11 (Maintenabilité)** — une posture par garde, deux requêtes de moins par
rétractation, **aucun état ne porte le retrait** (c'est le gain structurel de la
réécriture), et un cliquet réglé sur la forme conforme plutôt que sur une
énumération. **13 (Complétude)** — les cinq portes de la position, les trois
annonces du regard, et les deux moments de chacune.

**Restantes, avec leur issue** :

| issue | sujet | d'où elle vient |
|---|---|---|
| #16791 | une session dont la passerelle a perdu la trace relit la base à chaque point | relevé par la session ; **moitié préexistante** |
| #16794 | un blocage ne coupe pas un partage EN COURS — jusqu'à 120 points partent encore, et le registre est par processus | audit, F8 + le point multi-instances |
| #16795 | `location.live` est déclarée **SANG + consentement rituel** et appliquée NULLE PART | audit, F9 — **préexistant, et le plus gros** |
| #16796 | une socket est dans les rooms avant d'être dans `userSockets` : fenêtre sans exclusion pendant sa propre authentification | audit, F11 — préexistant, partagé par les trois signaux |
| #16797 | `live-start` rend deux verdicts contradictoires au même client | audit, F13 — préexistant |
| #16798 | un blocage garde les COMPTES, pas les PERSONNES : un bloqué revient par un lien partagé | audit, F10 — limite de MODÈLE |

**#16795 mérite d'être nommée à part.** `location.live` est déclarée au seuil le
plus haut du produit (`BLOOD`) et parmi les features à consentement rituel ; la
passerelle n'a **aucun** site d'application, et `LocationHandler` ne cite même pas
`pairAccessAmong`. Une coordonnée GPS vivante part donc à tout participant non
bloqué, `PUBLIC` compris, pendant que la FRAPPE du même salon est gardée à
`ACQUAINTANCE`. Vérifié ligne à ligne par la session. Et l'audit relève le coût
caché de notre propre lot : **invoquer `StatusHandler` comme « le jumeau conforme
de référence » en n'en reprenant que la moitié rend l'écart restant MOINS visible
qu'avant**, parce que le fichier a désormais l'air gardé.

## Ce que l'audit adversarial a coûté et rapporté

Il a tourné ~13 minutes et rendu **13 constats**, dont 5 avec un témoin rouge
écrit contre le code livré. Bilan honnête de sa précision, après re-vérification
ligne à ligne par la session :

| verdict | constats |
|---|---|
| réels et INTRODUITS par le lot | F1 (la porte neuve), F2, F3, F5, F7, F12 |
| réels et PRÉEXISTANTS | F4 (le pouls, dans le périmètre — corrigé), F9, F10, F11, F13 |
| justes mais déjà assumés et chiffrés par la session | F8 (la fenêtre de 60 s) |
| défaut de l'OUTILLAGE du lot | F6 (le cliquet aveugle à six formes) |

Aucun constat ne s'est révélé faux. C'est la première fois dans cette série
qu'un audit rend un verdict BLOQUANT sur un lot qui avait déjà `tsc` à zéro,
2 528 suites vertes et son rouge prouvé dans les deux sens — et il avait raison.

> **Ce qu'un audit adversarial attrape, c'est ce que les gardes du lot ne peuvent
> pas voir PAR CONSTRUCTION.** Le témoin de comportement couvrait les portes qui
> existaient ; le cliquet cherchait les émissions adressées à un SALON, donc il
> ne regardait pas celle qui ne l'était pas. Les deux étaient verts, et la fuite
> était dans l'angle exact que leur forme leur interdisait de couvrir. Un lot de
> confidentialité qui s'autovalide valide son propre angle mort.

## Ce qui reste du dépôt du cycle 142

| issue | sujet | pris par |
|---|---|---|
| #16706, #16749 | clair d'un message détruit, relance d'un envoi en vol | PR #16769 (cycle 143) |
| #16688, #16747, #16748 | convergence hors ligne, clair d'un message enfilé, deux flushers | **cédés** — fichiers de la PR #16769 |
| #16750 | un invité de lien ne se reconnecte jamais | libre (SDK iOS, preuve par CI macOS) |
| #16751 | la traduction d'une story compte les événements, pas les langues | libre (passerelle) |
| #16753 | le rang 2 du registre de lecture n'a aucun appelant | libre (SDK iOS) |
