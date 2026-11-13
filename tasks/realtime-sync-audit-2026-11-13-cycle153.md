# Cycle 153 — ce qui QUALIFIE une bannière, et l'exemption qu'on n'a pas instruite

*2026-11-13. Branche `claude/exciting-planck-wvcd01`, partie de `dev` à
`3c4acef1` après la fusion du cycle 152 (PR #17209).*

Le cycle 152 laissait son suivi le plus actionnable en toutes lettres : *la
composition de bannière est toujours écrite trois fois*. En l'instruisant, le
lot a trouvé deux défauts de COMPORTEMENT dans les deux éventails qu'il allait
fondre — et les trois tiennent en une phrase :

> **Ce qui ne compose aucune chaîne n'est trouvé par aucune recherche de
> « qui compose ce texte ? ».**

| lot | issue | ce qui change de comportement |
|---|---|---|
| R | #18029 | la bannière d'une RÉPONSE de groupe porte l'avatar de la conversation |
| S | #18030 | l'échéance d'une réponse / mention se relit CHEZ ELLE |
| T | #18038 | les deux éventails composent leur bannière au même endroit |

## Lot R — un champ présent sur deux éventails, absent du troisième

Le relevé n'est pas une lecture, c'est un dépouillement mécanique des clés de
`context` des trois `createNotification`. Une seule ligne diverge :

| clé | `createMessage…` | `createMention…` | `createReply…` |
|---|---|---|---|
| `conversationAvatar` | ✅ | ✅ | **absente** |

Et la cause est une colonne en AMONT : le `select` de la conversation de
l'éventail RÉPONSE lisait `{ title, type, encryptionMode }` — sans `avatar` —
quand les deux autres lisaient `{ title, type, avatar, encryptionMode }`.

### Ce que ça coûtait

`conversationAvatar` est le repli de GROUPE de la bannière iOS, lu en deux
endroits du SDK : `SocketNotificationEvent+Toast.swift` (l'avatar ET les
initiales — quand la bannière retombe sur l'avatar du groupe, les initiales
représentent le groupe) et `+Persistence.swift` (le contexte PERSISTÉ).

Donc, dans un groupe, pour un expéditeur **sans photo personnelle** : son
message simple et sa mention affichaient l'avatar du groupe ; **sa réponse
n'affichait rien** et retombait sur ses propres initiales. Même message, même
conversation, même instant — trois bannières, deux apparences.

C'est la forme du cycle 126 rejouée, et le mécanisme qui la rend invisible est
exactement celui que le cycle 126 avait nommé : *un champ qui QUALIFIE un texte
ne se trouve pas en cherchant « qui compose ce texte ? », puisque par
construction il n'apparaît dans aucune composition.*

> **Et un témoin de RENDU ne pouvait pas le voir.** Un double Prisma rend ce
> qu'on lui dit quel que soit le `select` : seul un témoin de PROJECTION, qui
> assert sur la REQUÊTE, tombe sur une colonne absente. Les deux sont écrits.

## Lot S — une exemption ÉCRITE, et personne ne l'avait instruite

Réponse et mention posaient `expiresAt: params.messageExpiresAt ?? undefined` —
l'échéance telle que l'APPELANT la croyait à l'envoi — sous ce doc-comment :

> Fournie par l'appelant plutôt que relue ici — l'éventail la tient déjà
> (`FanOutMessage.expiresAt`), et **`Message.expiresAt` est écrit à l'insertion
> et jamais modifié ensuite, donc sa copie ne peut pas dériver.**

Leur voisine fait l'inverse, et écrit pourquoi : « la valeur vient de la
relecture VIVANTE, pas de l'appelant : celui-ci ne pourrait que rapporter ce
qu'il croyait savoir à l'envoi ». Le dépôt a une règle pour exactement cette
configuration, posée au cycle 127 :

> **Un doc-comment qui EXEMPTE une unité d'une règle que sa voisine applique se
> vérifie comme une AFFIRMATION.** La question n'est pas « est-ce exact ? » mais
> « qu'est-ce qui justifie l'exemption ? ».

### L'affirmation est fausse — quatre écrivains post-insertion

| site | écriture | sens |
|---|---|---|
| `messaging/ephemeralCountdown.ts:275` | `{ expiresAt: destruction }` | POSE l'échéance au démarrage du décompte, à la RÉCEPTION |
| `messaging/consumeAfterReadMessages.ts:186` | `{ expiresAt: destruction }` | « RAPPROCHER seulement » (son propre commentaire) |
| `messaging/captureNoticeRetention.ts:98,121` | `{ expiresAt: until }` | RACCOURCIT la rétention d'un message capturé |
| `messaging/purgeViewOnceContent.ts:328` | `{ expiresAt: null, viewOnceBurnAt }` | remplace l'échéance par la preuve de brûlure |

Les trois premiers ne font que **RAPPROCHER**. La copie de l'appelant peut donc
être strictement plus TARDIVE que la réalité, et dans le seul sens qui compte :
la ligne `Notification` — qui porte le corps servi, c'est-à-dire le texte du
message, et `context.encryptedContent` — survivrait au message qu'elle annonce.

### C'était GRATUIT, et c'est ce qui rendait l'issue actionnable

`loadMessagePrismSource` **sélectionne déjà `expiresAt`**, par
`MESSAGE_LIVENESS_SELECT`, depuis le cycle 127. La colonne entrait dans la
requête et ne ressortait pas de `MessageBannerSource` : seul le VERDICT de
vivacité en sortait. Zéro requête de plus — l'argument du cycle 127 et de
#17195, repris tel quel : *avant de conclure qu'une garde coûterait une requête,
regarder ce que le site lit déjà.*

### L'arbitrage n'est PAS « la base gagne »

C'est le point du lot, et il se serait mal décidé sans le témoin qui le nomme.
Les deux valeurs répondent à la même question à deux INSTANTS, et **chacune peut
être la seule à savoir quelque chose** :

- la base RAPPROCHE après l'insertion (les trois écrivains ci-dessus) ⇒ la copie
  de l'appelant est périmée ;
- l'appelant tient une échéance que la base n'a PAS encore écrite — c'est le cas
  NOMINAL d'un éphémère, dont le décompte ne démarre qu'à la réception quand
  l'éventail court avant. « La base gagne » retirerait là l'échéance d'un
  message autodestructible.

D'où la règle, qui est celle que ces modules s'appliquent déjà à eux-mêmes
(« RAPPROCHER : toujours permis ») : **la plus PROCHE des deux valeurs non
nulles gagne, et un `null` ne retire jamais rien.** Une notification qui
s'efface trop tôt ne retire qu'une bannière ; une notification qui survit laisse
un texte en base. Site unique : `servedMessageDeadline`.

Et `UNKNOWN_BANNER_SOURCE` — ce qu'une relecture EN ÉCHEC rend — porte
`expiresAt: null` : une panne de lecture n'autorise ni à PROLONGER une échéance,
ni à en retirer une.

### Ce que ce lot n'affirme pas

**Piège armé, pas panne mesurée.** La fenêtre de dérive est une course entre le
RAPPROCHEMENT d'une échéance et l'éventail qui la recopie, et ce lot ne l'a pas
observée en production. Le dépôt sait ce que coûte d'annoncer une panne qu'on
n'a pas mesurée (cycle 103), et il sait aussi qu'on ne laisse pas un piège armé
au motif que personne n'a encore marché dessus (cycle 84). Les deux tiennent
ensemble : on corrige, et on dit laquelle des deux choses on a vue.

Il reste par ailleurs une compensation en aval, qu'il faut nommer pour ne pas la
confondre avec la garde : `ExpiredMessagesCleanupService` →
`applyMessageRemovalEffects` → `retractMessageNotifications` retire les lignes
quand le message expire. Elle est réelle, et elle ne dispense pas — c'est la
question du cycle 127 : *que reste-t-il de fait que ce nettoyage ne défait
pas ?* Entre l'échéance du message et le passage du balayage, la ligne porte le
texte en base.

## Lot T — le suivi que deux cycles avaient nommé et reporté

Les deux éventails portaient le bloc de composition au mot près, `readerId`
excepté, plus six fragments de contexte identiques.
`replyOrMentionBanner` les compose une fois.

Le report des cycles 151 et 152 avait une raison juste — *un lot de
confidentialité ne refactore pas le chemin qu'il garde* — et c'est pourquoi
l'extraction est ici un commit SÉPARÉ, posé APRÈS les deux lots de comportement
et prouvé autrement : une extraction pure se prouve par le fait qu'**aucun
témoin ne change de verdict**, jamais par un témoin neuf.

`createMessageNotification` garde la sienne, et ce n'est pas un oubli : trois
différences de COMPORTEMENT, pas de forme — source VIVANTE qui lui sert de gate
d'éligibilité, élection d'un MÉDIUM que les deux autres n'attachent pas
(décision du cycle 125 bis), refus d'une ligne absente là où les deux autres
continuent d'annoncer.

## Preuve

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** (après `packages/shared && bun run build`) |
| rouge, lots R et S | **4 des 18 témoins tombent** — l'avatar sur la RÉPONSE seule (la mention était déjà conforme, et ses témoins VERTS le disent), l'échéance sur les deux |
| mutations | **5 sur 5 attrapées** — colonne `avatar` retirée du `select` (2 rouges), repli sur l'appelant seul (2), repli sur la base seule (6), la plus TARDIVE au lieu de la plus proche (4), colonne `expiresAt` non ressortie de la source (2) |
| lot T | **186 suites / 4 086 témoins**, verdicts IDENTIQUES avant et après — c'est toute la preuve qu'une extraction pure peut porter |
| zone d'impact | 94 suites / 1 495 témoins verts (notifications) ; 330 suites / 5 958 verts (messagerie, socket) |
| cliquets | 96 suites / 1 452 témoins verts |
| budget de taille | `NotificationService.ts` 3 660 → **3 710** (gelé à 3 761) ; `notification-preview.ts` 565 → 624 |

### Sur le budget, contre ce que l'issue du lot T annonçait

L'issue #18038 disait que l'extraction *« rend des lignes à son budget »*. **Elle
n'en rend aucune : le fichier GROSSIT de 29 lignes sur ce seul commit.** Le code
dupliqué s'est bien effondré ; le raisonnement qui vivait en deux exemplaires
PARTIELS est désormais écrit une fois et plus complètement, et il coûte plus que
les lignes de code gagnées. Il reste 51 lignes de marge sous le gel — à savoir
avant d'y ajouter quoi que ce soit.

C'est la règle du cycle 93, appliquée à une affirmation qu'on avait écrite
soi-même deux heures plus tôt : **un compte est une AFFIRMATION, comme un tri ;
il se compte dans le FICHIER, il ne s'hérite pas d'une prévision.**

## Ce que ce cycle laisse ouvert

- **#18032 — `dev` est ROUGE sur six suites d'appels** (18 témoins,
  `CallEventsHandler-*`), mesuré sur un arbre PROPRE par `git stash`. Deux
  symptômes : un `call:signal` sans charge rend `SIGNAL_FAILED` là où le témoin
  attend `INVALID_SIGNAL`, et l'éviction du cache de session ne se produit plus
  sur `call:leave` / `call:force-leave` / `call:end`. Dernier commit sur ce
  chemin : #17952. **Ce cycle ne touche pas les appels et ne l'a pas corrigé** —
  il l'a relevé, mesuré sur `dev` sans le lot, et ouvert.
- **#17196 / #17197** — l'effet de bord du cycle 151 sur iOS, et le fait qu'un
  client sur trois lit l'enveloppe. Inchangés : pas de Xcode ici.
- **#17075** — « supprimer pour moi » n'annonce à personne. `décision-produit`.
- **#17139**, **#17140** — l'ORDRE sur un agrégat non planchéisé, et le
  fail-OPEN décisionnel d'un `shareLinkId` orphelin.
- **La troisième composition.** Le lot T fond deux éventails sur trois, pour une
  raison écrite. Les trois différences de `createMessageNotification` sont des
  décisions, pas des accidents — mais ce sont des décisions qu'aucun témoin ne
  garde. Rien ne rougirait si l'une d'elles disparaissait.

**Et ce que ce lot ne couvre pas, comme ses deux prédécesseurs** : la
cryptographie. La session AES-GCM par pair et la couche libsignal par appareil
n'ont pas été revues. **Un audit cryptographique TIERS reste requis avant de
présenter Meeshy comme une messagerie chiffrée** — ce lot n'en tient pas lieu.
