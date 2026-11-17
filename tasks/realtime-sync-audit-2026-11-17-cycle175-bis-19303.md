# Cycle 175 bis — deux sessions sur la même issue, et ce qui restait une fois le doublon retiré

*2026-11-17. Branche `claude/exciting-planck-pqz9ln`, partie de la tête de `dev`
(`8ed69c323`), refusionnée sur `b25dc3e7f1`.*

*__« bis », et le nom de fichier est la mesure de ce cycle.__ La session `…Qbf5`
a publié son propre journal du cycle 175 — `tasks/realtime-sync-audit-2026-11-17-cycle175-19261.md`,
PR #19301 — sous le nom EXACT que celui-ci portait d'abord. Les deux sessions
avaient suivi la même règle de nommage (suffixer par l'issue, cycles 171 à 174)
et l'ont donc violée ensemble : #18632 dit qu'un nom de fichier partagé FUSIONNE
en silence, et la règle qui devait l'empêcher a produit la collision parce que
les deux lots partageaient l'issue. **Suffixer par l'ISSUE ne désambiguïse que
des lots d'issues différentes** ; deux sessions sur la même issue ont besoin
d'autre chose — ici le « bis » et le numéro de l'issue RÉELLEMENT livrée
(#19303).*

**Développé** : #19261 — la fenêtre du gel de livraison s'ancre sur la POSITION.
**Livré par une autre session**, PR #19300, pendant que celle-ci écrivait.
**Livré ici, une fois le doublon retiré** : #19303 — la règle du plancher cesse
d'être retapable.
**Ouvert** : #19299 — la chaîne de LECTURE porte les deux horloges que la
livraison vient de perdre.

---

## La collision, et ce qu'elle apprend

Le relevé a été fait, et il était juste à l'instant où il a été fait :

- `git diff --name-only origin/dev...<branche>` sur les 30 branches distantes les
  plus récentes ⇒ aucune n'écrivait `MessageReadStatusService.ts` ;
- `git log --all --grep="#19261"` ⇒ une seule occurrence, le commit de
  documentation du cycle 174 qui a ouvert l'issue ;
- **commentaire d'allocation publique posé sur l'issue avant la première ligne**
  — la primitive du cycle 172.

Les trois ont été insuffisants. La session `…Qbf5` développait le même lot, et sa
branche n'existait pas encore au moment du relevé. Elle a fusionné la première.

> **La doctrine de la branche poussée tôt réduit la FENÊTRE de collision ; elle
> ne la supprime pas, et le dépôt l'écrit déjà.** Ce cycle en est la mesure : un
> relevé irréprochable et une allocation publique ne protègent pas d'une session
> qui démarre dans le même quart d'heure. Le commentaire d'allocation n'est pas
> inutile pour autant — il est ce qui rend la collision LISIBLE après coup, et
> c'est par lui qu'on sait laquelle des deux sessions avait annoncé quoi.

**La résolution ne s'est pas négociée.** La directive du 2026-11-15 la donne :
*la correction déjà sur `dev` se garde et le lot s'y adapte ; un fichier de `dev`
ne se remplace jamais par la version entière de la branche.* Le conflit sur
`MessageReadStatusService.ts` a donc été résolu en prenant la version de `dev`
ENTIÈRE, et le témoin de comportement de cette session — qui doublait celui de
#19300 sur les six mêmes cas — a été **supprimé**, pas gardé « au cas où » : deux
témoins du même symptôme sont la jumelle divergente que ce dépôt interdit.

---

## Ce qui restait, une fois le doublon retiré

Trois choses, et aucune n'est un verdict. #19300 a corrigé le comportement ; ce
qui suit retire la condition qui a rendu le défaut possible.

### 1. La règle était retapée à trois endroits — et son propre commit le dit

Le message de #19300 porte, mot pour mot, « une règle qu'il faut retaper à chaque
endroit est une règle qu'un endroit finira par ne pas avoir » — puis la retape
aux deux endroits qu'il corrige, la troisième copie venant de #18731.

Ce n'est pas une inattention : c'est la forme NORMALE du correctif quand la règle
n'a pas d'endroit où vivre. Et **un endroit ne l'avait effectivement pas** —
c'est précisément ce que #19261 venait réparer.

### 2. La projection n'avait aucun témoin, et c'est la moitié qu'aucun verdict ne voit

#19300 a ajouté `lastDeliveredMessageCreatedAt` aux deux `select` et n'a rien
posé dessus. Ses six témoins sont tous des témoins de VERDICT : un double Prisma
rend ce qu'on lui dit quel que soit son `select`, donc **ils resteraient verts
sur une production aveugle** — l'état exact dans lequel la cascade « lu ⇒ remis »
avait vécu jusqu'à ce lot. Deux témoins de REQUÊTE ont été posés, et prouvés
rouges.

### 3. Le site EXACT porte encore l'horloge, classé « sans objet »

Les deux sessions ont fait le même constat, indépendamment : `freezeMessageStatus`
ignore `since` dès qu'une liste d'ids est nommée — la liste ÉTANT la borne, et
`since` n'ayant aucun autre usage dans la fonction. Le classement est juste
AUJOURD'HUI. #19300 a laissé l'horloge ; ce lot passe la position, parce qu'une
valeur fausse et inexploitée est un **piège armé**, pas une économie (cycle 84).

---

## La forme : un type qui EXIGE, et non un module qu'on pense à appeler

`services/messaging/deliveryFloor.ts` tient ensemble `DELIVERY_FLOOR_SELECT` (la
projection), `deliveryFloorOf` (la descente) et `DeliveryFloorCursor`, dont les
deux champs sont **requis**. Cette dernière ligne est tout le lot. Mesuré :

```
src/services/MessageReadStatusService.ts(866,49): error TS2345: Argument of type
'{ lastReadAt: Date; lastDeliveredAt: Date; }' is not assignable to parameter of
type 'DeliveryFloorCursor'.
```

La lesson du cycle 152 posait déjà que « le TYPE du paramètre est l'autre moitié
de la garde ». Sa forme FORTE est que les champs doivent être **requis, pas
optionnels** : `{ a?: Date | null; b?: Date | null }` ne peut PAS faire rougir un
appelant qui n'a chargé que `a`.

> **Un module partagé DÉPLACE la discipline — il faut penser à l'appeler ; un
> type qui exige la lecture la SUPPRIME.** Quand une règle a une forme de DONNÉE
> (une projection, un jeu de colonnes, une carte), elle peut cesser d'être
> retapable, et c'est le seul état où « une règle qu'il faut retaper à chaque
> site… » cesse de s'appliquer.

### Le MINIMUM, et non la position seule

Second écart avec #19300, et c'est un arbitrage. L'invariant attendu est
`position <= horloge` — un message est créé avant d'être remis — donc
`position ?? clock` et `min(position, clock)` coïncident sur toute donnée saine.
Elles divergent sous une **dérive d'horloge entre deux serveurs**, et là la
position seule RÉTRÉCIRAIT la fenêtre sous ce qu'elle couvrait avant #19261 : une
régression introduite par le correctif lui-même. Le minimum ne peut que
l'élargir, et élargir est sûr — le gel est write-once, et un message sous le
plancher est un message que le curseur DÉCLARE remis.

Aucun site de production ne peut fabriquer cette forme : elle est exercée chez la
loi, pas au service.

---

## La jumelle, posée AU MOMENT du correctif

« Cette entité a-t-elle une jumelle ? » — à poser quand on corrige, pas des
cycles plus tard. La réponse est oui, et elle porte **deux** défauts :

| ce que la LECTURE reçoit | le défaut correspondant |
|---|---|
| `_computeExactReadCursorTarget({ since: prevReadAt })` | celui de **#18731**, non corrigé pour la lecture |
| `freezeMessageStatus({ since: prevReadAt, field: 'readAt' })` | celui de **#19261**, non corrigé pour la lecture |

Le premier est le plus coûteux, et c'est l'argument même de #18731 : **un
balayage de contiguïté ancré sur l'horloge part AU-DESSUS du trou.** Ancré sur
11:00, il ne voit jamais M2 (10:05), donc le compte comme « rien à franchir » et
laisse le curseur de lecture avancer par-dessus. La contiguïté — la seule
propriété capable de voir un trou ANTÉRIEUR — y est calculée sur une fenêtre qui
exclut le trou par construction.

Et la dette qui va avec : l'idiome `lastReadMessageCreatedAt ?? lastReadAt` est
**retapé six fois** en production, chaque fois avec un commentaire expliquant que
« `lastReadMessageCreatedAt` est le vrai plancher ». Le dépôt SAVAIT ; deux sites
ne l'avaient pas.

**#19299**, pas corrigé ici, et la raison n'est pas le périmètre : l'arbitrage
« élargir est sûr » **ne se transpose pas sans être réinstruit**. Facile pour la
livraison. Pour la lecture, le dépôt écrit lui-même l'inverse du confort — « un
message gravé lu à tort l'est pour toujours » (`until` de #16744,
`MarkReadBodySchema.caughtUpToMessageId`). Transposer par analogie serait la
faute du cycle 107 : une symétrie LEXICALE prise pour une symétrie de fond.

---

## Ce que ce cycle a appris, et qui vaut plus que le lot

### Un suivi INSTRUIT atteste de son diagnostic, jamais de sa prescription

#19261 était l'anti-cas exemplaire du suivi recopié : ouvert par le cycle 174
précisément parce que sa première rédaction disait « sans conséquence mesurée » et
que la mesure l'avait contredit. Scénario reproductible, impact chiffré et borné,
trois sites nommés.

Son diagnostic était juste sur les trois sites. **Sa prescription était fausse
sur celui qui comptait** — « ancrer sur `lastDeliveredMessageCreatedAt`, et
`prevDeliveredPosition` est **déjà calculé** sur le site » : vrai de deux sites
sur trois, faux du seul qui ne chargeait pas la colonne, où changer la variable
aurait été un no-op MUET.

> Une prescription est écrite depuis le site qu'on avait sous les yeux en
> diagnostiquant, puis se généralise aux autres sans y être vérifiée. Ici le site
> observé était le mode EXACT, le seul où la variable existait déjà — et c'est
> lui qui a fourni la phrase « déjà calculé ». **Un diagnostic se vérifie en
> reproduisant le symptôme ; une prescription, en ouvrant CHAQUE site qu'elle
> nomme.** Les deux vérifications n'ont ni le même coût ni le même moment, et
> seule la première est faite d'habitude, parce que c'est elle qui décide si le
> lot vaut la peine.

Détail : `tasks/lessons/un-suivi-instruit-atteste-de-son-diagnostic-jamais-de-sa-prescription.md`.

### Un travail doublé n'est pas un travail perdu, à condition de le DÉMONTER

Le réflexe devant un doublon fusionné est de jeter la branche. Il aurait coûté
trois choses ici : la loi structurelle, les deux témoins de projection, et
**#19299** — la jumelle de lecture, trouvée en posant la question du dépôt sur un
lot qui, lui, ne l'a pas posée.

> Devant un doublon, la question n'est pas « qui a gagné ? » mais **« qu'est-ce
> que mon exemplaire porte que l'autre ne porte pas ? »** — et elle se répond en
> comparant les deux diffs ligne à ligne, jamais en comparant les intentions, qui
> sont par construction les mêmes puisque les deux lots lisaient la même issue.

---

## Preuve

- `deliveryFloor.test.ts` : **7 verts**, dont la dérive d'horloge qu'aucun site
  de production ne peut fabriquer ;
- `deliveryFloorProjection.test.ts` : **2 verts**, prouvés ROUGES par mutation de
  chacun des deux `select` ;
- les **6 témoins de #19300** passent INCHANGÉS contre la loi consolidée — c'est
  la mesure qui dit que ce lot ne change aucun verdict ;
- `MessageReadStatusService.contiguousDeliveryCursor.test.ts` (#18731) : **10
  verts** ;
- **5 mutations ROUGES**, chacune vérifiée APPLIQUÉE avant lecture du verdict (le
  motif échoue bruyamment s'il ne matche pas exactement une fois — forme adoptée
  au cycle 174, où trois mutations avaient muté la jumelle et rendu un faux vert) ;
- la **garde structurelle** prouvée dans les deux sens : `tsc --noEmit` EXIT=0 sur
  l'arbre livré, `TS2345` dès que la projection d'un site est réduite ;
- suites rejouées sur l'arbre FUSIONNÉ, pas sur celui d'avant (directive
  2026-11-15) — chiffres au § suivant du commit de livraison ;
- `tsc --noEmit` lu comme **code de sortie**, jamais à travers un pipe.

**2 échecs PRÉEXISTANTS, hors périmètre** : `UploadProcessor.heif-conversion`.
Vérifié par `git stash` — ils échouent à l'identique sans ce lot, le conteneur
n'ayant pas le support du codec HEIC de `sharp`. Même constat qu'aux cycles 173
et 174.

## Suivis

- **#19299** — la chaîne de LECTURE, ses deux horloges et ses six copies de
  l'idiome du plancher. Instruit ci-dessus, avec l'arbitrage qui RESTE à
  instruire avant la première ligne.
- **Toujours pas de transaction** entre l'avance du curseur et le gel (#18731
  § Suivis) : ce lot ne touche ni l'ordre ni l'atomicité.
- **Un participant SANS curseur** balaie toujours depuis le début de la
  conversation. Le plancher est `null` dans ce cas — comportement d'avant, et
  aucune des deux sessions ne l'a changé.
