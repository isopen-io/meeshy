# Cycle 167 — l'invariant était écrit, gardé, et il mourait une couche plus bas

*2026-11-15. Branche `claude/exciting-planck-jexwib`, repartie de la tête de
`dev` (`cfaea72f3d`), c'est-à-dire du cycle 166 fusionné.*

**Livré** : #18614 — l'accusé de remise du rejeu nomme les messages RÉELLEMENT
livrés, au lieu d'estampiller une fenêtre de temps.

---

## Comment le cycle a été ouvert

Le cycle 166 a laissé six issues, et celle-ci était la seule que son propre lot
avait DÛ documenter sur place : en corrigeant les trois raisons de refus du
plancher, il a fallu écrire, dans le commentaire de l'autorisation, que la
phrase « ne compte dans AUCUN des trois signaux » est fausse du troisième.
L'audit adversarial l'a trouvée indépendamment (son constat C2). Deux chemins,
le même site : c'est ce qui en fait une propriété et pas une impression.

## Le constat

Le drain va à de vraies longueurs pour tenir les entrées REFUSÉES hors de
`delivered` — quatre refus nommés, un journal par entrée, trois signaux
séparés — sous un invariant ÉCRIT :

> « Un accusé affirme “ce message est arrivé chez son destinataire” —
> l'affirmer d'un message qu'on vient de refuser de livrer mentirait à son
> auteur. »

`_emitDeliveryForDrainedMessages` filtre ensuite aux ARRIVÉES seules et garde
la plus récente par conversation. Tout cela est juste. **Et l'invariant meurt
au maillon suivant** : `markMessagesAsReceived` ne reçoit que le plus récent
id, et appelle `freezeMessageStatus` SANS `messageIds` — qui résout alors une
PLAGE.

| ce que le drain SAIT | ce que le gel FAIT |
|---|---|
| M2 est parti, M1 a été refusé | `createdAt > curseur` ⇒ **M1 et M2** reçoivent `deliveredAt` |

Et l'écriture est **write-once** : rien ne la défait.

## Deux déclencheurs, et le second n'exige AUCUNE panne

1. une émission qui LÈVE — `dropEntry(…, 'emit-failed')` sort l'entrée de
   `delivered` et la laisse dans la fenêtre estampillée ;
2. **le plafond de 500 de la file** (`LTRIM`, `RedisDeliveryQueue`) : les
   arrivées évincées n'entrent JAMAIS dans le drain, et sont pourtant dans la
   fenêtre. Il suffit d'une absence un peu longue.

Le second est le plus coûteux à raconter : il n'y a rien à diagnostiquer, pas
d'exception, pas de log — seulement une coche qui dit « remis » pour un message
qui ne l'a jamais été.

## La leçon du cycle : un invariant se vérifie au MAILLON qui l'exécute

Le dépôt a ici tout ce qu'il faut pour croire l'invariant tenu : il est écrit,
il est commenté, il a un témoin à son nom, et trois couches le respectent
scrupuleusement. **La quatrième le défait**, et aucune des trois ne peut le
voir — chacune est juste de son côté.

> **Un invariant énoncé à l'étage où on le DÉCIDE ne dit rien de l'étage où on
> l'APPLIQUE.** La question n'est pas « cette unité tient-elle sa promesse ? »
> mais **« à qui remet-elle le soin de la tenir, et cette unité-là sait-elle
> qu'elle a une promesse à tenir ? »** — ici la réponse était non : la méthode
> d'accusé ne reçoit pas assez d'information pour distinguer « tout ce qui
> précède » de « ces trois-là ».

C'est la forme du cycle 122 (« qui AFFICHE ce qu'il élit ? ») déplacée du
RENDU vers la PERSISTANCE, et le témoin en porte la marque — voir ci-dessous.

Détail : `tasks/lessons/2026-11-15-un-invariant-se-verifie-au-maillon-qui-l-execute.md`.

## Le témoin qui portait exactement ce nom

`n'accuse pas la remise d'une entrée qu'il n'a pas su diffuser`
(`MeeshySocketIOManager.test.ts`) **mocke `_emitDeliveryForDrainedMessages`** et
n'assert que le tableau qu'on lui passe. Il prouve le FILTRE et n'exerce jamais
l'EFFET.

> **Un double posé À L'ENDROIT EXACT où la garantie se rompt transforme le
> témoin en tautologie** : il atteste que l'appelant passe la bonne liste, ce
> qui était vrai, et ne peut rien dire de ce que le callee en fait. Devant un
> témoin qui mocke la couche suivante, demander : *la propriété que je garde
> vit-elle au-dessus ou au-dessous de ce double ?*

Les témoins de ce lot traversent donc la chaîne entière, jusqu'au `where` que
`freezeMessageStatus` remet à Prisma.

## Pourquoi le paramètre est OPTIONNEL, et doit le rester

Quatre autres sites de production appellent `markMessagesAsReceived`, et pour
eux la FENÊTRE est la sémantique JUSTE — ils disent « tout ce qui précède est
arrivé », parce que le lecteur est EN LIGNE et dans le fil : `receipts.ts`
(deux portes REST), `messages-list.ts` (remise à la lecture) et
`MessageHandler.autoDeliverToOnlineRecipients`.

**Seul le REJEU sait qu'il a livré un sous-ensemble STRICT de la fenêtre.**
`MarkReceivedScope` nomme ce savoir-là ; son absence garde le comportement
d'origine à l'octet près. Et une liste VIDE dit « j'ai livré, et rien » — jamais
« je n'ai pas calculé » : c'est la distinction `bridgeComputed` /
`bridgeNotComputed` du dépôt, un étage plus bas, et un témoin la garde.

## Preuves

| preuve | résultat |
|---|---|
| mutation par mutation (4 mutations) | voir ci-dessous |
| `src/socketio` + `unit/services` + `routes/conversations` | **824 suites / 14 995 témoins** |
| `tsc --noEmit` gateway | **EXIT=0**, lu hors pipe |

| mutation de production | témoins qui tombent |
|---|---|
| le service IGNORE `messageIds` (retour à la plage) | 2 |
| le drain ne nomme RIEN (`messageIds: undefined`) | 4 |
| le drain ne nomme que le PLUS RÉCENT (l'ancien comportement) | 1 |
| la liste bâtie hors d'`arrivals` | 4 |

## Ce que le lot a trouvé dans son PROPRE harnais

`jest.clearAllMocks()` efface les APPELS, **pas les IMPLÉMENTATIONS**. Le
`mockImplementation` qui fait LEVER l'émission d'un message — posé par le
premier témoin pour mettre en scène `'emit-failed'` — survivait aux témoins
suivants, et le troisième tombait en nommant un seul id au lieu de deux. Il
tombait pour la bonne raison apparente et la mauvaise cause réelle.

> Un double qui met en scène une PANNE doit être désarmé explicitement
> (`mockReset` + implémentation neutre), sans quoi la panne devient le décor
> par défaut de tout le fichier.

## Les cinq autres suivis du cycle 165, relus

| # | état |
|---|---|
| #18615 | **fermée** au cycle 166 (PR #18676, fusionnée) |
| #18623 | cédée à la branche sœur (PR #18656) |
| #18616 | ouverte — la seconde instance de `RedisDeliveryQueue`, jamais drainée |
| #18617 | ouverte — `POST /links/:identifier/messages` rend 500 au renvoi |
| #18618 | ouverte — rien n'ordonne le direct contre le drain |
| #18619 | ouverte — la file enfile l'adresse NUE d'une pièce liée au lecteur |

Et les deux ouvertes PAR le cycle 166 : #18680 (la récupération d'une perte de
rejeu n'existe que sur le web) et #18681 (le rejeu révèle l'EXISTENCE d'un
message sous plancher).
