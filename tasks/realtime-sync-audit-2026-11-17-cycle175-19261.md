# Cycle 175 — la troisième horloge murale, et la jumelle qui en portait deux

*2026-11-17. Branche `claude/exciting-planck-pqz9ln`, repartie de la tête de
`dev` (`8ed69c323`). Nom de fichier suffixé par son issue, comme aux cycles 171
à 174 — un nom de fichier partagé FUSIONNE en silence (#18632).*

*Numéro 175 : relevé sur ce que les sessions ont écrit, journaux ET issues,
jamais sur un compte de fichiers (leçon du cycle 173).*

**Livré** : #19261 — la fenêtre du gel de livraison s'ancre sur la POSITION.
**Ouvert** : #19299 — la chaîne de LECTURE porte les deux horloges que la
livraison vient de perdre.

---

## Le relevé avant d'écrire

- `git diff --name-only origin/dev...<branche>` sur les 30 branches distantes les
  plus récentes ⇒ **aucune** n'écrit `MessageReadStatusService.ts`,
  `freezeMessageStatus.ts` ni `read-exactness.ts` ;
- `git log --all --grep="#19261"` ⇒ une seule occurrence, le commit de
  documentation du lot de #18731 qui a ouvert l'issue. Jamais pris ;
- commentaire d'allocation publique sur l'issue **avant** d'écrire — la primitive
  du cycle 172, parce qu'un numéro d'issue est un espace de noms que personne
  n'alloue.

L'issue était instruite, chiffrée, et son scénario reproductible. Deux de ses
affirmations ont quand même bougé à l'ouverture des sites, et ce sont elles qui
ont décidé de la FORME du lot.

---

## Ce que l'ouverture a corrigé dans l'énoncé

L'issue nommait « trois sites ». Les trois existent. Ils ne sont pas dans le même
état, et un seul des trois décrit un défaut VIVANT.

| site | `since` reçu | état réel |
|---|---|---|
| `markMessagesAsReceived`, mode EXACT | l'horloge | **INERTE** — `freezeMessageStatus` ignore `since` dès qu'une liste d'ids est nommée |
| `markMessagesAsReceived`, mode FENÊTRE | l'horloge | le défaut, vivant |
| `markMessagesAsRead`, cascade « lu ⇒ remis » | l'horloge | le défaut, vivant — **et son `select` ne charge pas la colonne de position** |

### Le site inerte

Mesuré sur la seule ligne qui lit `since` dans tout `freezeMessageStatus` :

```ts
...(messageIds ? { id: { in: [...messageIds] } } : { createdAt: { lte: until ?? at, ...(since ? { gt: since } : {}) } }),
```

`since` n'a aucun autre usage dans la fonction. Le site EXACT passait donc une
valeur fausse **sans conséquence mesurable**. Il reçoit quand même la position :
une valeur fausse mais inexploitée est un **piège armé** (règle du cycle 84), et
le jour où ce paramètre compterait en mode exact, l'horloge serait de retour sans
qu'un témoin tombe.

### Le site qui ne pouvait pas être corrigé par un remplacement de variable

C'est le point qui a décidé du lot. La cascade « lu ⇒ remis » lisait

```ts
select: { lastReadAt: true, lastDeliveredAt: true }
```

— `lastDeliveredMessageCreatedAt` n'y figure pas. Y changer la variable passée
aurait été un **no-op MUET** : la descente était impossible faute de PROJECTION,
pas faute d'appel. Et le symptôme d'une projection trop étroite est qu'il n'y en
a aucun — un double Prisma rend ce qu'on lui dit quel que soit le `select`, donc
un témoin de verdict passe au VERT sur un site dont la requête ne ramène pas la
colonne.

C'est la **leçon 276** mot pour mot (`utils/recipient-language.ts`, dix-sept
sites), rencontrée sur un autre sujet : *c'est la projection trop étroite, pas
l'appel manquant, qui rend une descente impossible en aval sans qu'aucun témoin
ne rougisse.*

---

## La forme : une loi structurelle, pas une discipline

`services/messaging/deliveryFloor.ts` tient ENSEMBLE ce qu'aucun site ne tient
seul — `DELIVERY_FLOOR_SELECT` (la projection), `deliveryFloorOf` (la descente),
et `DeliveryFloorCursor` dont les deux champs sont **requis**.

Cette dernière ligne est tout le lot. La leçon 276 avait résolu son cas par un
module partagé que les sites doivent **penser à appeler** ; ici le type du
paramètre fait rougir le compilateur sur un site qui ne charge pas la colonne.
Mesuré, en réduisant la projection du troisième site :

```
src/services/MessageReadStatusService.ts(866,49): error TS2345: Argument of type
'{ lastReadAt: Date; lastDeliveredAt: Date; }' is not assignable to parameter of
type 'DeliveryFloorCursor'.
```

> **Une règle qu'il faut retaper à chaque site est une règle qu'un site finira
> par ne pas avoir** — le dépôt l'écrit déjà. Sa suite utile : quand la règle a
> une forme de DONNÉE (une projection, une carte, un jeu de champs), elle peut
> cesser d'être retapable. Un module partagé déplace la discipline ; un type qui
> EXIGE la lecture la supprime.

### Le minimum, et non la position seule

La mutation la plus plausible de ce lot est aussi celle qu'il fallait écarter :
`position ?? clock`. L'invariant attendu est `position <= horloge` — un message
est créé avant d'être remis — donc les deux formes coïncident sur toute donnée
saine. Elles divergent sous une **dérive d'horloge entre deux serveurs**, et là
la position seule RÉTRÉCIRAIT la fenêtre sous ce qu'elle couvrait AVANT ce lot :
une régression introduite par le correctif. Le minimum ne peut que l'élargir, et
élargir est sûr pour deux raisons qui tiennent ensemble — le gel est write-once,
et un message sous le plancher est un message que le curseur DÉCLARE remis.

Aucun site de production ne peut fabriquer cette forme : elle est exercée chez la
loi (`deliveryFloor.test.ts`), pas au service.

---

## La jumelle, posée AU MOMENT du correctif

« Cette entité a-t-elle une jumelle ? » — à poser quand on corrige, pas des
cycles plus tard. La réponse est oui, et elle porte **deux** défauts, pas un :

| ce que la lecture reçoit | le défaut correspondant |
|---|---|
| `_computeExactReadCursorTarget({ since: prevReadAt })` | celui de **#18731**, non corrigé pour la lecture |
| `freezeMessageStatus({ since: prevReadAt, field: 'readAt' })` | celui de **#19261**, non corrigé pour la lecture |

Le premier est le plus coûteux, et c'est l'argument même de #18731 : **un
balayage de contiguïté ancré sur l'horloge part AU-DESSUS du trou.** Ancré sur
11:00, il ne voit jamais M2 (10:05), donc le compte comme « rien à franchir » et
laisse le curseur de lecture avancer par-dessus. La contiguïté — la seule
propriété capable de voir un trou ANTÉRIEUR — y est calculée sur une fenêtre qui
exclut le trou par construction.

Et la dette d'inventaire qui va avec : l'idiome `lastReadMessageCreatedAt ??
lastReadAt` est **retapé six fois** en production, chaque fois avec un
commentaire expliquant que « `lastReadMessageCreatedAt` est le vrai plancher ».
Le dépôt SAVAIT. Deux sites ne l'avaient pas.

**#19299**, pas corrigé ici, et la raison n'est pas le périmètre : l'arbitrage
« élargir est sûr » **ne se transpose pas sans être réinstruit**. Pour la
livraison il est facile. Pour la lecture, le dépôt écrit lui-même l'inverse du
confort — « un message gravé lu à tort l'est pour toujours » (`until` de #16744,
`MarkReadBodySchema.caughtUpToMessageId`). Transposer par analogie serait
exactement la faute du cycle 107 : une symétrie **lexicale** prise pour une
symétrie de fond.

---

## Ce que ce cycle a appris

### Un suivi INSTRUIT peut encore se tromper sur la forme de son correctif

#19261 était un suivi exemplaire : mesuré, chiffré, son scénario reproductible,
et il nommait déjà les trois sites. Le cycle 174 l'avait explicitement opposé aux
suivis recopiés (leçon du cycle 107). Il s'est quand même trompé sur **ce qu'il
faudrait faire** — il prescrivait « ancrer sur `lastDeliveredMessageCreatedAt`,
`prevDeliveredPosition` est **déjà calculé** sur le site », ce qui est vrai de
deux sites sur trois et faux du seul qui ne pouvait pas être réparé ainsi.

> **Un suivi instruit atteste de son DIAGNOSTIC, jamais de sa PRESCRIPTION.** La
> seconde est écrite depuis le site qu'on avait sous les yeux en diagnostiquant
> — ici le mode EXACT, celui où la variable existait déjà — et elle se généralise
> sans être vérifiée sur les autres. La question à poser à toute prescription
> héritée est celle de la leçon 261 : *vaut-elle de tous les sites qu'elle
> nomme, ou seulement de celui qui l'a suggérée ?*

### Les deux témoins d'un correctif de borne ne gardent pas la même chose

Quatre témoins rouges, et ils se répartissent en deux familles qu'il ne faut pas
confondre :

| famille | ce qu'elle voit | ce qu'elle NE voit pas |
|---|---|---|
| verdict (`frozenByCall()` contient M2) | l'effet produit | rien si la projection est muette |
| projection (`select.lastDeliveredMessageCreatedAt === true`) | la requête émise | rien de l'effet |

Le témoin de projection est le seul qui pouvait voir le troisième site, et il
n'assert aucun comportement. Le témoin de verdict est le seul qui prouve que le
trou est comblé, et il serait vert sur une requête aveugle. **Aucun des deux ne
subsume l'autre**, et le lot en avait besoin des deux — pour la même raison que
le dépôt exige, pour le Prisme, un témoin de rang ET un témoin de `select`.

### Une borne ne se teste ni au plancher, ni au plafond

Les deux témoins qui comptent exercent un préfixe **PARTIEL**. Au préfixe VIDE
comme au préfixe COMPLET, la position et l'horloge rendent le même verdict — un
témoin posé là ne peut pas tomber. C'est la leçon 261 (« un témoin de RANG
s'écrit sur un rang AUTRE que le premier ») portée d'un rang à une borne, et
c'est la mutation verte du cycle 174 qui avait rendu la règle exécutable.

---

## Preuve

- `MessageReadStatusService.deliveryFreezeWindowFloor.test.ts` : **6 verts**, 4
  prouvés ROUGES avant implémentation (les 2 autres sont les non-régressions —
  repli sur l'horloge, balayage depuis l'origine) ;
- `deliveryFloor.test.ts` : **7 verts**, dont la dérive d'horloge qu'aucun site
  de production ne peut fabriquer ;
- **5 mutations ROUGES**, chacune vérifiée APPLIQUÉE avant lecture du verdict
  (le motif échoue bruyamment s'il ne matche pas exactement une fois — forme
  adoptée au cycle 174, où trois mutations avaient d'abord rendu « vert » sans
  avoir été appliquées) ;
- la **garde structurelle** prouvée dans les deux sens : `tsc --noEmit` EXIT=0
  sur l'arbre livré, `TS2345` dès que la projection d'un site est réduite ;
- `src/__tests__/unit/services` + `read-exactness` : **12 778 verts**, 701
  suites ;
- `src/socketio` + `unit/socketio` + `unit/routes` : **17 741 verts**, 1 180
  suites ;
- cliquets de budget de taille : verts ;
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
  § Suivis). Ce lot ne touche ni l'ordre ni l'atomicité, seulement la borne : le
  constat du cycle 174 est inchangé.
- **Un participant SANS curseur** balaie toujours depuis le début de la
  conversation, et les messages antérieurs à son arrivée y restent des trous
  permanents. Le plancher est `null` dans ce cas — comportement d'avant ce lot,
  et l'issue ne le demandait pas.
