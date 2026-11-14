# Cycle 162 — cinq cliquets, une seule direction

*2026-11-14. Branche `claude/exciting-planck-h1yyyt`, repartie de la tête de
`dev` (`6504055f3c`).*

**Livré** : #18499 — le cliquet de la direction MONTANTE du contrat socket, et
`CALL_EVENTS` ramené dans la portée des gardes.

---

## Le relevé qui a ouvert le cycle

Le contrat socket est gardé par cinq cliquets. En les listant pour choisir où
chercher, une chose se voit d'un coup :

| cliquet | ce qu'il répond | direction |
|---|---|---|
| `socket-event-name-gate` | un nom épelé par un client existe-t-il au contrat ? | ↓ |
| `socket-event-emitter-gate` | tout `SERVER_EVENTS` a-t-il un émetteur ? | ↓ |
| `socket-event-orphan-gate` | … au moins un lecteur client ? | ↓ |
| `socket-event-platform-parity-gate` | lequel des trois ne le lit pas ? | ↓ |
| `socket-payload-dead-field-gate` | un champ déclaré que le miroir ne lit pas | ↓ |

**Les cinq regardent en bas.** Le `CLAUDE.md` de `packages/shared` nommait
pourtant la garde manquante, et disait ce qui l'empêchait :

> « Une déclaration parasite comme celle-là est aussi ce qui empêche d'écrire un
> garde “tout `CLIENT_EVENTS` a un handler gateway” sans liste d'exemptions. »

L'obstacle était `user:status`, déclaré des deux côtés alors que c'est un
événement serveur pur — **retiré au cycle 60**. La garde était écrivable depuis,
et personne ne l'avait écrite.

## Pourquoi c'est une classe de défaut, pas une coquetterie

Un nom de `CLIENT_EVENTS` sans `socket.on` est le défaut symétrique du cycle 75
(`call:force-leave` : contrat écrit, récepteur iOS complet et testé, aucun
émetteur serveur). Il est **pire en exploitation** : Socket.IO laisse tomber un
événement non écouté **sans lever la moindre erreur**. Le contrat affirme que le
canal existe, un client le croit et l'implémente, l'utilisateur appuie — et rien
ne part : pas d'ACK, pas de journal, pas de rejet. Un bouton inerte.

## La mesure, et le premier instrument qu'il a fallu jeter

Premier balayage : **21 noms** sans mention passerelle, dont 20 en `call:*`.
Vingt sur vingt-un dans la même famille ne ressemble pas à vingt lacunes — c'est
la signature d'un idiome non reconnu (leçon du cycle 107 : *un balayage qui
cherche UN idiome mesure sa popularité*). Vérification : la passerelle épelle
`CALL_EVENTS.INITIATE`, jamais `CLIENT_EVENTS.CALL_INITIATE`, parce que
**`CALL_EVENTS` est une seconde carte de noms de fil**, dans
`types/video-call.ts`. L'instrument était faux, et il portait aussi
`user:status` — capté par une capture de bloc trop large sur `SERVER_EVENTS`.

Deuxième balayage, sur la résolution de jeton que `socket-event-emitter-gate`
avait déjà écrite pour cette exacte raison : **66 noms de `CLIENT_EVENTS`,
61 nommés par `services/gateway/src`, 5 jamais.**

| nom | déclaré | émetteur client | `socket.on` |
|---|---|---|---|
| `call:audio-chunk` | `CLIENT_EVENTS` + `ClientToServerEvents` | aucun | aucun |
| `call:transcription-capability` | idem (+ `CALL_EVENTS`) | aucun | aucun |
| `call:transcription-role` | idem (+ `CALL_EVENTS`) | aucun | aucun |
| `call:translation-request` | idem | aucun | aucun |
| `call:translation-response` | idem | aucun | aucun |

Vérifiés nom par nom sur `packages`, `services`, `apps`, `packages/MeeshySDK`,
en TS, Swift et Kotlin : **zéro citation hors des déclarations de `shared`**.
Ce sont les restes d'une conception abandonnée — morceaux audio poussés au
serveur, négociation de capacité et de rôle, traduction en requête/réponse. Le
chemin vivant est tout autre : le client émet `call:transcription-segment`, la
passerelle relaie `call:translated-segment` **par destinataire**. Et sa moitié
descendante, `call:translation-requested`, était **déjà inventoriée** par
l'orphan gate comme « ni émis ni lu — dette de contrat » : ces cinq-ci sont la
moitié montante de la même dette, et aucun cliquet ne la voyait.

## Le second trou, celui qui est structurel

`CALL_EVENTS` n'est pas seulement une carte de plus : c'est **celle que la
passerelle importe**. Les cinq cliquets énumèrent `SERVER_EVENTS` /
`CLIENT_EVENTS`. Mesuré : **3 noms ne vivent que dans `CALL_EVENTS`** —
`call:transcription`, `call:translation`, `call:mode-changed` — donc hors de
portée de toutes les gardes. Les deux premiers ne sont cités nulle part, et
aucun doc-comment ne le dit.

> **Une garde qui énumère une carte garde cette carte, pas le fil.** Dès qu'un
> second registre déclare les mêmes noms, un nom ajouté à l'un et pas à l'autre
> échappe à tout — et c'est le registre que le CODE importe qui gagne, pas celui
> que la garde lit.

La quatrième assertion du cliquet neuf tient donc `CALL_EVENTS` dans la portée :
tout nom qu'il déclare est aussi au contrat socketio, ou nommé à l'inventaire.

## Le refactor qui porte la garde

`isNamedByGateway` et son scan vivent désormais dans
`socket-payload-shape/gateway-event-names.ts`, et `socket-event-emitter-gate`
le CONSOMME. Sans cela, la direction montante aurait relevé une seconde fois le
fait que la descendante relevait déjà — la forme que ce dépôt a payée plusieurs
fois, et que le cycle 161 avait soldée en faisant de `eventsNamedByClients`
l'union de `eventsNamedByPlatform`.

## Ce que l'inventaire porte, et ce qu'il ne porte pas

Il NOMME chacun des 5 + 3 et porte une raison par FAMILLE. Il ne porte **aucun
verdict** : écrire l'écouteur, retirer la déclaration ou ressusciter la
conception appartient au produit — même partage que #18342, et la même raison
qu'au cycle 161 : 8 issues de nettoyage substitueraient mon verdict au sien sur
8 décisions distinctes, dont `call:mode-changed` qui porte déjà sa condition de
retrait (abandon FORMEL du mode SFU).

## Deux dimensions mesurées MÛRES, et c'est un résultat

Deux balayages lancés dans le même cycle n'ont rien trouvé, et il faut le dire
plutôt que de les taire :

- **limitation de débit des canaux montants** : 88 `socket.on` dans la
  passerelle ; les seuls fichiers qui n'en mentionnent aucune sont
  `guestLinkWatch.ts` et `tokenExpiryWatch.ts`, et ils n'écoutent que
  `disconnect` — qui n'est pas déclenchable en rafale par un client. Aucune
  surface de déni de service ouverte.
- **frontière de typage** : 62 noms résolus en `socket.on`, **0** absent de
  `ClientToServerEvents`. Aucune charge montante n'arrive non typée.

## Preuves

| preuve | résultat |
|---|---|
| `socket-event-handler-gate` | 9/9 |
| ROUGE, sens 1 — entrée retirée de l'inventaire | « names every declared client event, or inventories it » |
| ROUGE, sens 2 — canal VIVANT (`message:send`) inventorié | « keeps the inventory free of channels the gateway now listens to » |
| ROUGE, typo (`call:audio-chunkk`) | les DEUX témoins concernés |
| ROUGE, `call:mode-changed` retiré de `HORS_CONTRAT` | « declares every call wire name in the socketio contract » |
| ROUGE, `call:ended` inventorié hors contrat | « keeps the inventory free of names the contract has since adopted » |
| `socket-event-emitter-gate` sous le refactor | 5/5, inchangé |
| `packages/shared/__tests__/ci/` | 23 fichiers, 198 témoins (22 / 189 avant) |
| `tsc --noEmit` shared | EXIT=0 |

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18499 | les 5 canaux montants sourds + les 3 noms hors contrat | **inventoriés** ; le verdict de produit reste à rendre |
| #18342 | la jumelle descendante (6 événements qu'aucun client ne déclare) | ouverte |
| #18115 | les trois champs morts de `AttachmentUpdatedEvent` | ouverte |
| #18456 | le consommateur iOS de `AttachmentReactionUpdateEvent.userId` | ouverte — demande Xcode |
