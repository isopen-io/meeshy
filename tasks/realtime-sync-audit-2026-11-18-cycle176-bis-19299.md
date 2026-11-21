# Cycle 176 bis — la jumelle de LECTURE, et un arbitrage qui refuse de se transposer

*2026-11-18. Branche `claude/exciting-planck-a9lywv`, partie de la tête de `dev`
(`0f5647e45`).*

*__« bis », et le nom de fichier est encore la mesure.__ Une autre session
(`claude/exciting-planck-pjjp7a`) a publié
`tasks/realtime-sync-audit-2026-11-17-cycle176-19385.md` — les accusés de
lecture suivant le CERCLE, #19385, son propre commit la disant BLOQUÉE. Le
cycle 175 bis avait appris que **suffixer par l'ISSUE ne désambiguïse que des
lots d'issues différentes** ; ici les issues diffèrent déjà, et ce journal porte
quand même trois discriminants — la DATE, le « bis » et le numéro — parce que le
cycle précédent a perdu un fichier sur un seul.*

**Développé et livré** : #19299 — la chaîne de LECTURE reçoit les deux
correctifs que la LIVRAISON avait eus, et la dette d'inventaire est soldée.
**Ouvert** : #19599 — la sixième copie, celle de `packages/shared`, et pourquoi
elle n'est pas dans ce lot.

---

## Ce que le lot corrige, mesuré

Trois lots ont retiré la confusion horloge/position de la chaîne de LIVRAISON :
#18701 de ce qui est SERVI, #18731 du BALAYAGE de contiguïté, #19261 de la
fenêtre du GEL. La chaîne de LECTURE a la même structure, les mêmes deux
colonnes, et **n'avait reçu aucun des deux derniers**.

```
curseur de lecture { position M1 = 10:00, horloge = 11:00 }
M2 (10:05) lu · M3 (10:10) NON LU · M4 (11:30) lu, et c'est lui qu'on rapporte
```

| ancre du balayage | fenêtre | verdict |
|---|---|---|
| l'HORLOGE (11:00) | `[M4]` | M4 lu ⇒ le curseur **SAUTE à M4**, franchissant M3 dont l'état n'a jamais été interrogé |
| la POSITION (10:00) | `[M2, M3, M4]` | le préfixe contigu s'arrête à **M2** |

C'est l'argument même de #18731, jamais porté à la lecture : **la contiguïté est
la seule propriété capable de voir un trou ANTÉRIEUR, et l'ancrer sur l'horloge
la calcule sur une fenêtre qui exclut le trou par construction.** Le curseur
affirmait donc un préfixe qu'il n'avait pas vérifié — et le compte de non-lus
dérive de lui.

---

## L'arbitrage, et pourquoi il ne se transposait pas

L'issue l'exigeait avant la première ligne, et c'est la partie du lot qui valait
le plus cher à écrire.

#19261 a tranché pour la livraison en une ligne : **le gel est write-once, et un
message sous le plancher est un message que le curseur DÉCLARE remis.** Cet
argument-là ne vaut pas ici. Le dépôt écrit lui-même l'inverse du confort pour
la lecture — « sans élargir d'un seul message l'ensemble déclaré LU »
(`MarkReadBodySchema.caughtUpToMessageId`), et la borne `until` de #16744 : *un
message gravé lu à tort l'est pour toujours.* Transposer par analogie aurait été
la faute du cycle 107, une symétrie LEXICALE prise pour une symétrie de fond.

Instruit par CONSOMMATEUR, les trois répondent — **par trois raisons
DIFFÉRENTES, et c'est exactement ce qu'une transposition aurait manqué** :

| consommateur | pourquoi abaisser le plancher est sûr |
|---|---|
| la FENÊTRE du GEL | n'ajoute **aucune** affirmation : le compte de non-lus dérive du curseur par `createdAt > lastReadAt`, donc tout message de `(position, horloge]` était DÉJÀ compté lu par le badge. Le gel rend la vérité DURABLE par message conforme à ce que l'index affirmait déjà. Et la borne HAUTE (`until`) ne bouge pas : rien au-dessus de la frontière RAPPORTÉE n'est jamais gravé |
| le BALAYAGE | strictement **CONSERVATEUR** : plus de candidats, et un trou BLOQUE l'avance |
| le site EXACT | `since` y est **INERTE** (la liste ÉTANT la borne). Il reçoit la position quand même : une valeur fausse mais inexploitée est un piège armé, pas une économie (cycle 84) |

> **Le premier n'est pas « élargir est sûr ».** C'est « les deux moitiés de
> l'état cessent de se contredire » — un argument de CONVERGENCE, pas de
> tolérance. La distinction n'est pas rhétorique : sous « élargir est sûr », on
> n'aurait eu aucune raison de vérifier que `until` reste en place, et c'est
> `until` qui empêche le lot de graver au-dessus de ce que le lecteur déclare.

**Ce que coûte un trou qui ne se referme pas, ici.** Plus cher que pour la
livraison, et il faut le dire plutôt que de l'omettre : le compte de non-lus
dérive du curseur de LECTURE, donc un curseur bloqué derrière un trou laisse un
badge non nul. Deux raisons de l'accepter — le balayage s'arrêtait DÉJÀ au
premier trou (descendre l'ancre ne crée pas le blocage, il rend visible un trou
que la borne masquait), et le RATTRAPAGE le délie (`resetUnreadCount: true` ne
regarde aucun trou, sur les deux modes). Un badge bloqué se vide à la première
lecture rapportée ; un message gravé lu à tort ne se dégrave jamais.

---

## La forme : un type qui EXIGE, et le site où il n'avait rien à attraper

`services/messaging/readFloor.ts` est la jumelle stricte de `deliveryFloor.ts` —
même répertoire, même forme : `READ_FLOOR_SELECT` (la projection), `readFloorOf`
(la descente), `ReadFloorCursor` dont les deux champs sont **requis**. Mesuré :

```
src/services/MessageReadStatusService.ts(283,58): error TS2345: Argument of type
'{ participantId: string; lastReadAt: Date; }' is not assignable to parameter of
type 'ReadFloorCursor'.
```

**Et un site où cette garde n'aurait rien attrapé, ce qui vaut d'être noté.**
`unreadCountOfParticipant` fait ses deux `findUnique` **sans aucun `select`** :
la ligne entière revient, donc elle est assignable, donc le compilateur se
taisait — et se tairait encore. La discipline y tenait pour une raison qui n'est
pas la discipline.

> **Une garde structurelle garde ce qu'elle peut VOIR.** Un type qui exige une
> colonne protège les sites qui PROJETTENT ; il est muet sur ceux qui ramènent
> tout. Les deux ont l'air également gardés dans un `tsc` vert, et seul le
> premier l'est. La question à poser à un cliquet de type n'est pas « est-il
> rouge sur la mutation que j'ai en tête ? » mais **« quelle forme de site
> échappe à sa prise ? »**.

---

## La dette d'inventaire, et la SEPTIÈME copie

L'idiome `lastReadMessageCreatedAt ?? lastReadAt` était retapé **six fois** en
production, chaque fois avec son commentaire expliquant que
« `lastReadMessageCreatedAt` est le vrai plancher » — et deux sites ne l'avaient
pas. **Le dépôt SAVAIT ; les deux sites qui comptaient ne le savaient pas.**

Cinq sites du gateway passent désormais par la loi. `unreadCountOfParticipant`
garde son troisième terme (`joinedAt`) **au site** : il n'appartient pas au
curseur, il appartient au COMPTAGE — un plancher de curseur et un plancher
d'appartenance ne sont pas la même question, et les mêler aurait donné à la loi
une responsabilité qu'elle n'a pas.

**Et l'issue ne nommait que six copies de la VALEUR.** Il y en avait une
septième, de nature différente : le **TYPE** lui-même, réécrit inline —

```ts
{ readonly lastReadAt: Date | null; readonly lastReadMessageCreatedAt: Date | null }
```

— dans `ConversationBridgeService` (`cursorsByParticipant`) et dans
`broadcastReadStatus`. Elle n'apparaît dans aucun relevé de l'idiome, parce
qu'elle ne porte **ni `??` ni `select`** : elle ne calcule rien et ne demande
rien, elle DÉCLARE. Trouvée en consolidant, pas en cherchant.

> **Un inventaire d'idiome recense des CALCULS ; une règle qui a aussi une forme
> de TYPE a donc deux populations de copies, et le relevé n'en voit qu'une.**
> C'est la leçon 261 d'un cran plus haut : l'énumération a été faite dans la
> langue du défaut (« qui descend le plancher ? »), et la copie qui ne descend
> rien était hors de cette langue tout en portant la même dérive — un champ
> ajouté au curseur manque à la déclaration inline sans qu'aucun site ne
> rougisse.

---

## La sixième copie, et pourquoi elle n'est pas là — #19599

`packages/shared/utils/first-unread.ts:155`. L'écart est DÉLIBÉRÉ, et il est
consigné plutôt que soldé en silence, pour trois raisons dont la troisième
tranche :

1. **autre paquet** — `shared` ne peut pas importer la loi du gateway, et y
   déplacer la descente séparerait les jumelles (`deliveryFloorOf` restant
   côté gateway), soit la divergence même que ces lots retirent ;
2. **pas de moitié PROJECTION** — ce site reçoit son curseur depuis la charge
   d'API, pas depuis Prisma : `READ_FLOOR_SELECT` et l'exigence de type n'y ont
   rien à tenir. **Seule la moitié descente est partagée**, donc la
   généralisation ne se recopie pas telle quelle ;
3. **`??` n'est pas `min`, et ce site POSITIONNE au lieu de COMPTER.** La
   direction sûre d'un COMPTE (abaisser : un badge trop haut se vide à la
   lecture, un badge trop bas cache un message) n'est pas la direction sûre d'un
   SÉPARATEUR : posé trop bas il fait remonter dans du déjà-lu, trop haut il
   saute du non-lu. L'arbitrage est à faire, et **ce n'est pas celui de ce
   lot.**

> C'est la règle de ce cycle appliquée à lui-même. L'arbitrage du gateway a
> refusé de se transposer depuis la livraison ; il refuse aussi de se
> transposer vers un consommateur client dont la question n'est pas la même.
> **Le périmètre d'un arbitrage est le jeu de consommateurs dont on a lu ce
> qu'ils font de la valeur** — pas la portée du nom qu'on lui a donné.

---

## Preuve

- `readFloor.test.ts` : **8 verts**, dont la dérive d'horloge qu'aucun site de
  production ne peut fabriquer — exercée chez la loi, pas au service ;
- `MessageReadStatusService.contiguousReadCursor.test.ts` : **5 verts**, dont un
  témoin de PROJECTION (la moitié qu'aucun témoin de verdict ne peut voir, un
  double Prisma rendant ce qu'on lui dit quel que soit son `select` — leçon 276) ;
- le témoin du balayage s'écrit sur un préfixe **PARTIEL** : cible M2,
  STRICTEMENT entre `null` et M4. Un témoin de borne posé sur un préfixe vide ou
  complet ne peut pas tomber (leçon 261 portée à une borne, mesurée au
  cycle 174) ;
- **mutation vérifiée APPLIQUÉE avant lecture du verdict** : la descente
  revertie à l'horloge rend **3 ROUGES**, et le témoin de projection reste
  **VERT** — ce qui prouve que les deux moitiés sont indépendantes, dans les
  deux sens ;
- garde structurelle prouvée dans les **deux** sens : `tsc --noEmit` **EXIT=0**
  sur l'arbre livré, **TS2345** dès que la projection d'un site est réduite ;
- `tsc --noEmit` lu comme **code de sortie**, jamais à travers un pipe ;
- **30 suites / 450 témoins** verts sur les familles touchées (lecture, non-lus,
  pont ✦, diffusion d'accusés) ;
- suite **COMPLÈTE** du gateway : **2 834 suites, 43 113 témoins**.

### Les rouges de la suite complète, et ce que la comparaison a tranché

Trois familles, et une seule était à moi — c'est le tri qui compte, pas le
compte :

| famille | verdict |
|---|---|
| 6 suites / 17 témoins de pièces jointes (HEIC, AVIF, EXIF, téléversement) | **PRÉEXISTANT, environnemental.** Le conteneur n'a ni `heif-convert` (`spawnSync … ENOENT`, binaire vérifié ABSENT) ni les codecs HEIC/AVIF de `sharp`. Même famille qu'aux cycles 173 à 175 |
| `media-metadata-strip-failure` | **flocon de CHARGE.** Rouge dans la passe complète à **20,6 s**, VERT en isolation sur les deux arbres — c'est un délai dépassé sous parallélisme, pas un verdict |
| `journal-one-file-per-entry-guard` | **À MOI, et réparé.** Mon fichier de leçon portait un `#` et quatre `##` ; le cliquet de #7711 exige UNE entrée par fichier — première ligne en `## `, un seul titre de ce niveau. Réparé : titre en `## `, sous-titres en `### `, **18/18 verts** |

**La comparaison a été faite comme le cycle 175 bis a appris à la faire**, et
pas comme il l'avait d'abord faite : les six chemins de production du lot
ramenés au contenu de `dev` (`git checkout origin/dev -- …`), les trois fichiers
neufs mis de côté, puis les SEPT suites rejouées des deux côtés.

```
arbre ramené à dev : Test Suites: 6 failed, 1 passed, 7 total · Tests: 17 failed, 44 passed
arbre du lot       : Test Suites: 6 failed, 1 passed, 7 total · Tests: 17 failed, 44 passed
```

Et surtout : **le banc rend VERT sur l'une des sept, des deux côtés.** C'est le
contrôle que l'erratum du cycle 175 bis exige avant de lire une égalité comme
« le défaut préexiste » — là-bas, les deux côtés échouaient pour une raison
(`dist` absent) qui n'appartenait à aucun des deux, et l'égalité s'était lue
comme la conclusion la plus rassurante disponible.

> **Et un cliquet m'a attrapé sur le fichier même où j'écrivais la leçon du
> cycle.** Le journal est ce qui reste, donc le dépôt garde sa FORME par un
> témoin et non par une convention — et la convention, je l'avais lue sans la
> suivre. Un cliquet qui tombe sur l'auteur d'une leçon est la meilleure preuve
> que le cliquet valait d'être écrit.

## Suivis

- **#19599** — la sixième copie, instruite ci-dessus avec les trois questions à
  trancher avant la première ligne, et le cliquet qu'aucun des deux lots n'a
  posé : la protection de #19299 est le TYPE, et le type ne porte pas jusque
  dans `shared`.
- **Toujours pas de transaction** entre l'avance du curseur et le gel (#18731
  § Suivis) : ce lot ne touche ni l'ordre ni l'atomicité, de part ni d'autre.
- **Un participant SANS curseur** balaie toujours depuis le début de la
  conversation (plancher `null`). Comportement d'avant, inchangé.
