# L'accusé de remise d'un push ne grave que ce qu'il nomme (#20084)

> Journal daté. Il raconte ce qui était vrai le 2026-11-20 ; l'état de la tâche
> vit dans l'issue #20084, qui a raison en cas d'écart.
>
> Nom sans numéro de cycle, délibérément : quatre sessions parallèles avaient
> déjà écrit `cycle188-*` et `cycle189-*` ce jour-là. Le numéro d'ISSUE est
> unique par construction (leçon #5102).

## Le défaut

`POST …/messages/:messageId/delivery-receipt` — la porte que la **NSE iOS** et le
**service worker web** appellent quand un push réveille un destinataire **hors
ligne** — gravait `deliveredAt` sur tout message depuis le curseur précédent
jusqu'à `now`, et pas sur le message rapporté.

La chaîne, quatre maillons, tous ouverts et lus :

```
NSEDataSync.swift:401        POST …/messages/{mid}/delivery-receipt
receipts.ts (alias)          → { type: 'delivered', messageIds: [messageId] }
receipts.ts markFor          → for (const id of args.targeted)
                                 markMessagesAsReceived(p, c, id)   ← aucun `options`
MessageReadStatusService:651 → if (options?.messageIds)   ⇒ FAUX, branche EXACTE sautée
MessageReadStatusService:740 → freezeMessageStatus({ since, at: now })  ← ni ids ni `until`
freezeMessageStatus.ts:115   → createdAt: { lte: until ?? at, gt: since }
                                          ↑ `until` absent ⇒ borne haute = `now`
```

L'appelant TENAIT la liste exacte (`args.targeted`, le lot vetté) et la passait
en **troisième argument positionnel** (`latestMessageId`), jamais dans
`options.messageIds`.

### Le point contre-intuitif

**La boucle par message n'y changeait rien.** Le PREMIER appel figeait déjà toute
la fenêtre `(curseur, now]` ; les suivants étaient des no-ops, le gel étant
write-once. Une écriture « par message » dans sa **CADENCE d'appel** était une
écriture « par fenêtre » dans son **EFFET**.

C'est ce qui a rendu le défaut invisible : tout le monde lisait la boucle et y
voyait une borne.

### Pourquoi c'est irréparable

`EXACT_READ_TRACKING_SINCE` est armée en staging et en production : pour tout
message postérieur, `resolveCursorDeliveredAt` rend `null` et
`MessageStatusEntry.deliveredAt` est la SEULE autorité. Le gel est write-once,
`_advanceCursor` est monotone, et `_computeExactDeliveredCursorTarget` part de la
position du curseur — un trou SOUS elle n'est jamais rejoué.

### Mesuré

R hors ligne, S envoie M1…M5, APNs ne délivre que le push de M5. Témoin RED, sur
la réponse réelle : un accusé nommant **M3 seul** gravait
`[M1, M2, M3, M4, M5]` — dont **M4 et M5, POSTÉRIEURS** au message acquitté.
Chez S, les cinq bulles passent ✓✓ pour des messages qui n'ont jamais atteint
l'appareil.

## Le correctif

Router la branche `delivered` vers la branche EXACTE, qui existait déjà et fait
exactement ce qu'il faut : `freezeMessageStatus({ messageIds })` grave l'ensemble
nommé, puis `_computeExactDeliveredCursorTarget` n'avance le curseur que sur le
**préfixe contigu PROUVÉ** — et ne l'avance pas du tout si le trou est en tête,
ce qui sert « une réponse plus PAUVRE, jamais une réponse FAUSSE ».

UN seul appel, `latestMessageId` VIDE : la branche exacte ne s'en sert pas pour le
curseur, et l'ordre de `args.targeted` vient d'un `findMany` **sans `orderBy`** —
en tirer « le plus récent » serait une affirmation que la requête ne porte pas.

## HUIT sites portaient la prémisse fausse

C'est la part la plus instructive. Aucun n'avait été confronté aux appelants.

| # | site | ce qu'il affirmait |
|---|---|---|
| 1 | `MarkReceivedScope` (doc) | « le rejeu hors ligne est le seul dans ce cas » ; `receipts.ts` rangé **en bloc** parmi les appelants EN LIGNE |
| 2 | branche fenêtre (commentaire) | « ce bloc ne sert plus qu'eux depuis #18731 » |
| 3 | branche exacte (commentaire) | « le rejeu hors ligne, seul dans ce cas » |
| 4 | `broadcastReadStatus.messageIds` (doc) | « l'écriture étant, elle, déjà par message » |
| 5 | `applyReceipt` (table) | « `delivered` : le curseur, **borné aux messages RAPPORTÉS** » |
| 6 | `receipts.ts` ligne ~397 | « `read` et `delivered` figent les ids vettés (le second un par un) » |
| 7 | `markMessagesAsReceived-scope.test.ts` (doc) | « `receipts.ts` (deux portes REST) » ⇒ la fenêtre y est juste |
| 8 | `conversation-receipts.test.ts` (témoin) | intitulé « **borne la livraison aux messages RAPPORTÉS**, un par un » |

Les huit sont corrigés.

> **Un appelant ne se classe pas par son FICHIER mais par ce que sa porte sait de
> son lecteur.** « Tout ce qui précède est arrivé » est une affirmation sur le
> RÉSEAU du destinataire, jamais sur le module qui écrit. Ranger `receipts.ts`
> en bloc parmi les appelants en ligne est l'erreur qui a tenu le défaut en vie :
> le fichier a deux portes, dont l'une sert la population exactement inverse.

### Le site 8 est celui qui a GELÉ le défaut

Son intitulé promettait une BORNE ; son assertion mesurait une CADENCE
(`toHaveBeenCalledWith(p, c, MESSAGE_ID)`, un appel par id). L'assertion était
JUSTE et l'intitulé FAUX — et c'est l'intitulé qu'on relit. Motif connu du
dépôt : « un témoin qui nomme correctement la moitié qu'il GARDE gèle l'autre ».

### Le site 4 est celui qui a coûté un lot

#16961 a corrigé la DIFFUSION (elle nommait le dernier message du fil au lieu de
l'acquitté) **sur la prémisse que l'écriture était déjà exacte**. Sa correction
tient ; la moitié qu'il n'a pas regardée est restée fausse quatre mois.

> La leçon n'est pas « #16961 avait tort » mais qu'**une correction bâtie sur une
> prémisse non mesurée laisse intacte la moitié qu'elle n'a pas regardée** — et
> qu'elle la laisse avec une apparence de garantie, puisqu'un lot est passé par
> là.

## Le témoin

`delivery-receipt-freezes-only-what-it-names.test.ts` — cinq témoins, vrai
Fastify, route montée par son spécificateur de production, **vrai
`MessageReadStatusService`** (non mocké, donc `freezeMessageStatus` en personne
compose le `where`), assertion sur l'**EFFET** : quels messages reçoivent une
entrée `deliveredAt`.

Le double résout les DEUX formes de `where` que `freezeMessageStatus` produit —
`id: { in: [...] }` et `createdAt: { gt, lte }` — et **lève** sur toute clé
inconnue. C'est l'instrument de mesure : un double qui ne saurait résoudre qu'une
des deux ne pourrait pas voir la différence entre les deux modes, c'est-à-dire
exactement ce qui est en jeu.

### Deux choix de forme, tous deux nécessaires

**La mesure INVERSE est un témoin à part entière.** `type: 'received'` doit
GARDER la fenêtre : c'est sa sémantique juste (lecteur en ligne, dans le fil) et
resserrer les deux échangerait une réponse fausse contre une autre. Ce témoin
PASSAIT avant le correctif et passe après — c'est ce qui prouve qu'on n'a pas
trop serré.

**Une conversation par témoin, et ce n'est pas cosmétique.**
`MessageReadStatusService.recentActionCache` est STATIQUE, clé
`participant:conversation:received:message:scope`. Le témoin `received` passait
SEUL et échouait dans la suite : aujourd'hui `delivered` ne passe aucun
périmètre, donc sa clé de scope est celle de la FENÊTRE — la **même** que
`received` —, et le second appel était avalé par le TTL. Le couplage était donc
un **symptôme du défaut** ; après correctif les deux clés diffèrent. Un témoin ne
doit pas en dépendre pour être indépendant.

## Preuve

- ROUGE prouvé sur 4 témoins (le 5e, la mesure inverse, vert avant comme après) ;
  VERT 5/5 après.
- `tsc --noEmit` EXIT=0 ; 22 suites / 346 tests sur tout le périmètre touché ;
  1 836 suites / 28 987 tests sur `unit/{services,routes,socketio}`.
- Les deux rouges de ce balayage large sont étrangers : `UploadProcessor.heif-conversion`
  (outillage HEIF absent du conteneur, vert en CI) et le budget de taille, traité
  ci-dessous.

## Ce que le budget de taille a coûté, et ce qu'il a appris

`routes/conversations/receipts.ts` était à **999** lignes — UNE sous le seuil de
1 000. La première rédaction de ce lot y ajoutait ~30 lignes de commentaire et
faisait rougir `route-file-size-budget`. La réparation n'est pas de monter le
seuil : le récit est descendu dans ce journal, et le site garde la règle, la
raison, et un pointeur ici. Net final : 999 lignes.

> **Un fichier à une ligne du seuil est un fichier où aucun commentaire n'est
> gratuit.** Le budget n'a pas seulement empêché un dépassement — il a forcé le
> récit à l'endroit où il appartient (un journal daté), et laissé au site ce
> qu'un lecteur de code a besoin de savoir.

### Et une erreur d'outil, consignée parce qu'elle était destructrice

Pour condenser, j'ai découpé le fichier en Python avec deux ancres
`s.index(...)`. L'ancre de FIN (`return ctx.readStatusService.markMessagesAsReceived(`)
matchait une occurrence ANTÉRIEURE à celle de début — la branche `received` porte
le même appel. Le `slice` était donc vide, et `str.replace("", new)` a inséré le
texte **entre chaque caractère** : le fichier est passé à **959 349 lignes**.
Restauré par `git checkout --`, puis refait avec des remplacements de chaîne
EXACTS.

> **Une ancre de fin qui existe aussi plus haut dans le fichier ne borne rien.**
> `str.replace` sur une chaîne vide est une bombe silencieuse : elle ne lève pas,
> elle réussit. Pour une édition ponctuelle, un remplacement de chaîne exact et
> unique ; le découpage par index n'est sûr que si l'on a vérifié que les deux
> ancres sont uniques ET ordonnées.
