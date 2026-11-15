# Cycle 166 — l'acquittement déclaré que personne ne rendait

*2026-11-15. Branche `claude/exciting-planck-6ub3i7`, repartie de la tête de
`dev` (`134848579`).*

> **Numéroté 163 à l'écriture, renuméroté 166 à l'intégration — et le fichier a
> dû être RECONSTRUIT.** Trois sessions ont écrit le même jour : l'une a pris
> « 163 » la veille (#18573), une autre a pris « 163 » le même jour ET LE MÊME
> NOM DE FICHIER (#18649, `claude/exciting-planck-hg95mt`), et un « 165 »
> existait déjà. Deux journaux sans rapport portant le même chemin, git les a
> fusionnés LIGNE À LIGNE : un document de 436 lignes où leur titre tombait au
> milieu du mien, aucun texte perdu et les deux illisibles. Les deux fichiers
> ont été restaurés depuis leurs sources faisant foi — le leur depuis
> `origin/dev`, le mien depuis `d936475a3` — puis renommés.
>
> Je prends le premier numéro libre APRÈS le plus haut, jamais le trou 164, qui
> laisserait croire que ce cycle précède le 165. C'est la collision d'espace de
> noms que le `CLAUDE.md` racine annonce (#5102) : **un identifiant qui ne
> s'alloue pas collisionne**, et un nom de fichier dérivé de cet identifiant
> transforme la collision en fusion silencieuse. Le vrai correctif n'est pas de
> mieux choisir son numéro, c'est de ne plus le choisir seul.*

**Livré** : #18632 — le cliquet des SORTIES d'acquittement, et les sept sorties
muettes de `call:signal` qu'il a nommées.

---

## Le relevé qui a ouvert le cycle

Le contrat socket est gardé par six cliquets, et le cycle 162 a montré qu'ils
regardaient tous dans la même direction. En cherchant la septième question, une
autre dimension se voit : **ils interrogent tous un NOM ou une FORME, jamais un
CHEMIN D'EXÉCUTION.**

| cliquet | ce qu'il interroge |
|---|---|
| `socket-event-name-gate` | un nom épelé par un client existe-t-il au contrat ? |
| `socket-event-emitter-gate` | tout `SERVER_EVENTS` a-t-il un émetteur ? |
| `socket-event-orphan-gate` | … au moins un lecteur client ? |
| `socket-event-platform-parity-gate` | lequel des trois ne le lit pas ? |
| `socket-payload-dead-field-gate` | un champ déclaré que le miroir ne lit pas |
| `socket-event-handler-gate` | tout `CLIENT_EVENTS` a-t-il un `socket.on` ? |
| `ack-door-sweep` | la porte d'acquittement est-elle LUE sur le contrat ? |

Le dernier est le plus proche, et c'est ce qui le rend trompeur : il garde la
**FORME** de la déclaration d'un rappel. Il ne demande à aucun moment si ce
rappel est **APPELÉ**. Une porte bien déclarée, bien typée, et jamais franchie
est verte aux sept.

## La mesure

Trente-huit canaux montants déclarent un acquittement. Sur les 88 `socket.on` de
la passerelle, **treize sorties ne rendaient pas le rappel qu'elles
déclaraient**, sur trois handlers — et sept d'entre elles sur `call:signal`, la
poignée de main WebRTC :

| sortie de `call:signal` | `call:error` | acquittement |
|---|---|---|
| `NOT_AUTHENTICATED` | oui | **non** |
| débit dépassé | oui | **non** |
| validation Zod (`INVALID_SIGNAL`) | oui | **non** |
| `NOT_A_PARTICIPANT` | oui | **non** |
| `SIGNAL_SENDER_MISMATCH` | oui | **non** |
| `TARGET_NOT_FOUND` (absent de l'appel) | oui | **non** |
| `catch` (`SIGNAL_FAILED`) | oui | **non** |
| débit ICE dépassé | oui | `{ success: false }` nu |
| cible sans socket | oui | `{ success: false }` nu |
| succès | — | oui |

**Ce qui n'était pas une lacune de diagnostic.** Chaque refus DIT quelque chose,
sur `call:error`. Mais `call:error` est un canal DIFFUSÉ, sans corrélation avec
l'émission qui l'a causé ; l'acquittement est le seul signal qu'un appelant
puisse rattacher à son propre envoi.

## Pourquoi c'est pire qu'une valeur manquante

`SocketAck.parse` (`packages/MeeshySDK/.../SocketAck.swift:53`) rend `.timedOut`
quand rien n'arrive et `.refused(SocketAckRefusal)` quand un `{ success: false }`
arrive. **La passerelle collapsait donc un refus DÉFINITIF en panne de réseau** —
et le SDK sait déjà lire un refus : `SocketAckRefusal` décode `code`,
`error.code` et `error.message`, tous optionnels.

L'appelant, lui, REJOUE sur une expiration. `CallSdpSignaler`
(`apps/ios/.../CallCollaborators/`) :

- `emitOfferWithRetry` — jusqu'à `signalOfferMaxAttempts` tentatives, 3 s
  d'attente chacune, en backoff exponentiel ;
- `emitAnswer` / `emitAnswerRetry` — la première tentative est attendue EN LIGNE
  pour que `CXAnswerCallAction.fulfill()` soit apparié à une réponse relayée.

Donc, mesuré sur le chemin le plus sensible du produit :

1. un refus définitif (`NOT_A_PARTICIPANT`, `SIGNAL_SENDER_MISMATCH`,
   `INVALID_SIGNAL`) était **rejoué à l'identique**, pour être refusé
   identiquement — et chaque rejeu consommait le budget de débit (100 req/10 s),
   dont le refus, lui, acquittait. **La boucle finissait par abandonner sur une
   raison fausse** : elle recevait enfin un refus, celui du débit qu'elle venait
   elle-même d'épuiser ;
2. sur l'ANSWER, la fenêtre de CallKit était tenue **3 secondes** pour un refus
   que la passerelle connaissait immédiatement, pendant que le pair restait sur
   « Connexion… ».

> **C'est le jumeau MONTANT du cycle 122** (« qui AFFICHE ce que le résolveur
> élit ? »). Là-bas, une traduction correctement élue voyageait dans des champs
> qu'aucun client ne lisait. Ici, un refus correctement calculé n'est remis à
> personne. Même forme : la valeur existe, le canal existe, et le dernier mètre
> manque. Et il échoue par le mécanisme le plus discret du dépôt — une attente
> qui expire, donc un diagnostic de RÉSEAU pour un refus d'AUTORISATION.

## Le lot précédent avait posé la bonne question, dans la mauvaise langue

`CallEventsHandler-validation-error-emission.test.ts` existe déjà, et son en-tête
raconte un audit antérieur : cinq handlers d'appel « silently dropped malformed
payloads (`if (!validation.success) return;`) » et ont reçu leur
`socket.emit(CALL_EVENTS.ERROR, …)`.

Ce lot-là a demandé : **« ce refus dit-il quelque chose ? »** — et y a répondu.
Il n'a pas demandé : **« le dit-il à celui qui ATTEND ? »**. Les deux questions
se ressemblent assez pour que la première paraisse épuiser la seconde.

> C'est la leçon 261 d'un cran plus haut : un lot ferme une classe **dans sa
> langue**. « Le refus est muet » s'est traduit en « il n'émet pas d'événement
> d'erreur », parce que c'est ce que le dépôt savait déjà nommer. Devant un lot
> qui répare une SIGNALISATION, demander : *qui l'attendait, et sous quelle
> forme ?*

## Le correctif : un refus se dit DEUX FOIS, par un SEUL site

Les cinq refus répétaient `socket.emit(CALL_EVENTS.ERROR, { code, message,
callId }); return;`. Recopier `ack?.(…)` sous chacun aurait réparé les sept
sorties et laissé la huitième exposée : **une règle qu'il faut retaper à chaque
site est une règle qu'un site finira par ne pas avoir** — et c'est exactement ce
qui venait d'arriver, cinq fois de suite.

Une fermeture locale, `refuse(code, message, details?)`, rend les deux moitiés
indissociables. Le contrat reçoit la forme de refus de ses voisins
(`CallSignalAck`, calquée sur `CallInitiateAck` / `CallJoinAck`), additive sur le
fil : relevé des trois consommateurs avant de l'écrire — iOS la décode déjà, le
web fabrique un rappel VIDE, Android n'envoie pas d'acquittement.

### Ce que le correctif élégant exigeait du cliquet

`refuse(…)` ne NOMME pas `ack`. Un balayage qui cherche le nom du rappel aurait
donc **nommé fautives les sept sorties réparées** — un cliquet qui punit le
correctif juste se fait désarmer dans le mois.

Le balayage admet donc une troisième forme de « rendre » : une **fermeture
locale dont le corps rend l'acquittement**. C'est la forme « remise » déjà
reconnue (`this._sendError(callback, …)`), avec un avantage qu'aucun callee d'un
autre module n'offre : on peut VÉRIFIER qu'elle rend.

## Trois erreurs d'instrument, et ce que chacune a appris

Le balayage a été faux trois fois avant d'être juste. Les trois corrections sont
la valeur du cycle autant que le correctif.

**1. `.catch(` n'est pas un `catch`, et un `catch` imbriqué n'est pas une
sortie.** Premier jet : 46 constats. Le mot `catch` comptait les promesses
détachées, et le compte d'accolades partant de `} catch (error) {` — net NUL —
refermait le bloc à sa première accolade fermante, donc avant l'acquittement des
trois handlers qui en portent un. Et un `catch` IMBRIQUÉ absorbe l'échec d'une
opération best-effort : le corps CONTINUE, ce n'est pas une sortie. Seul le
`catch` de profondeur 1 rend la main. 46 → 13.

**2. Un acquittement rendu dans un bloc ANCÊTRE compte.** `CommentReactionHandler`
acquitte son succès, puis sort d'un `if (reaction.unchanged) { return; }` quelques
lignes plus bas. Un balayage borné au bloc intérieur le déclarait muet. La règle
juste est la DOMINANCE : même ligne, puis blocs englobants — jamais un bloc
FRÈRE, dont l'acquittement n'est pas sur le chemin qui mène à cette sortie.

**3. Nommer n'est pas rendre.** La correction 2 a fait DISPARAÎTRE le constat de
`relayTranscriptionSegment`, qui ouvre par `const { userId, data, ack } =
request;` — une **déstructuration**, à la profondeur qui domine tout le corps.
Elle déclarait acquittées les sorties d'une unité dont le refus
`NOT_A_PARTICIPANT` ne rend rien.

> C'est le cycle 107 par l'autre bout : *un balayage qui cherche un IDIOME mesure
> sa popularité* ; **un balayage qui cherche un NOM mesure sa portée lexicale.**
> Et la correction qui l'a révélé était juste : un instrument se corrige aussi
> par ce qu'il CESSE de voir, pas seulement par ce qu'il voit en trop. **Après
> chaque raffinement, relire les constats PERDUS, pas seulement les gagnés.**

Le discriminant est donc l'APPEL (`ack?.(…)`) ou la REMISE (`_sendError(callback,
…)`, `admitCallCaptions(…, { … ack })`, l'argument sur sa propre ligne). Une
DÉCLARATION ne rend jamais. Le reste est admis, **volontairement** : ce cliquet
préfère un faux positif, qui fait OUVRIR le site, à un faux négatif, qui le tait.

## Le harnais a menti, et un témoin passait pour la mauvaise raison

Quatrième exemplaire du « double PARTIEL » du dépôt (cycles 86, 91, 93, 104). Le
premier harnais énumérait quatre membres de `utils/socket-rate-limiter` et
omettait `callSignalBudgetId`, que le handler appelle juste avant sa garde de
débit. Les trois témoins qui franchissent cette ligne levaient un `TypeError` —
et **le témoin du `catch` PASSAIT**, par une levée du DOUBLE plutôt que celle
qu'il provoque.

> Un double partiel ne cache pas seulement un bug : il peut faire passer un
> témoin pour une raison qu'il n'a pas écrite. Deux des cinq témoins ont rougi en
> nommant `SIGNAL_FAILED` là où ils attendaient `INVALID_SIGNAL` — c'est ce
> désaccord, et non le vert du troisième, qui a nommé le double.

## Ce que l'inventaire GÈLE, et pourquoi il ne tranche pas

Les dix sorties restantes appartiennent aux DEUX acquittements de transcription,
et **aucun client ne les attend** : iOS émet `call:transcription-active` et
`call:transcription-segment` en « tire et oublie », le web et Android ne les
émettent pas du tout. Leur rappel n'est rendu que par l'admission e2ee — donc un
refus de chiffrement acquitte, et rien d'autre, **pas même le succès**.

Les rendre ou les retirer du contrat est un verdict de PRODUIT : un acquittement
que personne n'attend n'a pas de bonne réponse par défaut. Même partage qu'au
cycle 162 (#18499) et qu'à #18342.

## Preuves

| preuve | résultat |
|---|---|
| `ack-exit-sweep.test.ts` | 3/3 |
| `CallEventsHandler-signal-ack-refusal.test.ts` | 5/5 |
| ROUGE 1 — une sortie de `call:signal` revient à la forme fautive | les DEUX témoins concernés, le constat NOMMÉ |
| ROUGE 2 — `refuse()` cesse de rendre l'acquittement | les 7 sorties nommées (prouve le généralisateur) |
| ROUGE 3 — une entrée retirée de l'inventaire gelé | « aucune sortie muette au-delà de l'inventaire gelé » |
| garde négative — le balayage VOIT des portes | `length > 0`, dont un `catch` |
| suites `socketio` du gateway | 251 suites, 3435 témoins |
| `packages/shared` | 409 fichiers, 9727 témoins |
| `tsc --noEmit` shared + gateway | EXIT=0 |

Un témoin existant a changé : `CallEventsHandler.test.ts` figeait
`ack).toHaveBeenCalledWith({ success: false })` sur `TARGET_NOT_FOUND`. Il
assertait l'absence même qu'on corrige — l'enrichir est le lot, pas une
concession.

## Ce que la CI a nommé et que j'avais rangé sous « environnement »

Le premier passage de la suite COMPLÈTE du gateway en local a rendu **18 rouges
sur 41 662**. Le journal n'en avait conservé qu'un — `UploadProcessor` HEIC, qui
nomme sa cause (`image/heic illisible par le serveur`, libvips sans HEIF dans ce
conteneur) — et j'en ai conclu « environnementaux », au pluriel, sur la foi d'un
seul.

La CI en a nommé un qui ne l'était pas : **la règle 3 de
`gateway-test-file-size-budget`** — « le cumul des lignes hors budget ne remonte
pas », `socketio/__tests__/CallEventsHandler.test.ts : 4650 → 4656`. Ce fichier
porte 4 649 lignes de dette héritée, et la règle du dépôt est explicite :
*ajouter à un fichier déjà hors budget est interdit*. Mon enrichissement de
l'assertion `TARGET_NOT_FOUND` l'avait fait grossir de sept lignes au lieu
d'une.

Il n'y avait rien à EXTRAIRE : l'assertion devait changer de **forme**, pas de
taille. Elle tient sur une ligne, le fichier revient à l'identique de la base, et
la raison du changement vit là où elle a sa place — la suite neuve et ce journal.

Le relevé complet, fait APRÈS plutôt que supposé avant : **six des sept suites
rouges sont des suites de codec d'image** (`ExifStrip.gain-map`,
`ExifStrip.orientation`, `tus-handler-heif-conversion`,
`UploadProcessor.heif-conversion`, `heif-upload-conversion`, `avif-variants`) —
toutes exigent un libvips avec HEIF et AVIF, absent d'ici, et **les tranches 1/3
et 3/3 du gateway passent en CI**, ce qui le PROUVE au lieu de le supposer. La
septième était la mienne.

> Le dépôt porte déjà la leçon — « attribuer un rouge à la machine est une
> AFFIRMATION qui se vérifie » (cycle, 2026-11-14, #18466). Je l'ai enfreinte en
> la connaissant, et la forme exacte de l'erreur mérite d'être dite : **je n'ai
> pas affirmé qu'un rouge était environnemental, j'ai affirmé qu'un ENSEMBLE de
> rouges l'était en ayant lu un seul de ses membres.** Un journal qui ne garde
> que la queue du flux rend un échantillon de taille 1, et un échantillon de
> taille 1 ne décrit jamais un ensemble de 7. Le geste qui coûte deux secondes
> est `| grep -E "^FAIL"`, et il aurait nommé la règle du budget avant la CI.

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18632 | les 10 sorties de transcription muettes | **inventoriées et gelées** ; le verdict de produit reste à rendre |
| #18633 | la POLITIQUE de rejeu iOS : `CallSdpSignaler` rejoue encore un refus DÉFINITIF, il ne sait pas le distinguer d'une expiration. La passerelle lui en donne désormais les moyens (`error.code`) ; l'exploiter demande Xcode | **ouverte** |
| #18342 | la jumelle descendante (6 événements qu'aucun client ne déclare) | ouverte |
| #18115 | les trois champs morts de `AttachmentUpdatedEvent` | ouverte |
| #18456 | le consommateur iOS de `AttachmentReactionUpdateEvent.userId` | ouverte — demande Xcode |
