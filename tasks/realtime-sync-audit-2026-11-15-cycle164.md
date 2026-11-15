# Cycle 164 — le jumeau du `Server` nu, et le chiffre que le cycle 163 n'avait pas le droit de publier

*2026-11-15. Branche `claude/exciting-planck-hg95mt`, repartie de la tête de
`dev` (`2e6b39e807`, qui porte la fusion du cycle 163).*

**Livré** : #18655 — le `Socket` NU fermé, et le champ non déclaré qu'il laissait
partir. **Ouvert** : #18657 (décision produit).

---

## Le lot précédent a publié un chiffre faux, et c'est le sujet

Le cycle 163 s'est clos sur une mesure : « 262 sites d'émission réels, **zéro
champ non déclaré** », et l'a rangée dans « mesuré MÛR ». La mesure était juste
**sur ce que l'instrument regardait**, et c'est tout le problème : pour résoudre
le type déclaré d'un canal, il exigeait un nom d'événement **LITTÉRAL**. Il a
compté **9 sites « nom non résolu »** et les a écartés — sans les ouvrir.

L'un d'eux porte une instance de la classe que le journal déclarait vide.

> **« Zéro trouvé » et « zéro existe » ne sont pas la même affirmation.** Un
> balayage qui écarte ce qu'il ne sait pas résoudre doit PUBLIER ce qu'il écarte,
> et quelqu'un doit l'ouvrir — sinon le chiffre se lit comme une propriété du
> DÉPÔT alors qu'il n'est qu'une propriété de l'INSTRUMENT. C'est la leçon 261
> (« une énumération porte deux affirmations ») appliquée à une mesure, et le
> cycle qui l'a écrite est le même qui l'a enfreinte.

## Ce qu'il y avait à cette adresse

```ts
// services/gateway/src/utils/socket-rate-limiter.ts
import { Socket } from 'socket.io';                       // ← le Socket NU

export async function checkSocketRateLimit(
  socket: Socket, …, errorEvent: string = 'call:error'
): Promise<boolean> {
  socket.emit(errorEvent, {
    code: 'RATE_LIMIT_EXCEEDED',
    message: `Too many requests. …`,
    retryAfter: Math.ceil(info.resetIn / 1000),            // ← aucun contrat
  });
}
```

`CallError` déclare `code`, `message`, `details?`, `callId?`. **`retryAfter`
voyageait à la racine**, et le relevé sur les trois clients ne rend que des
chemins HTTP 429 : **aucun lecteur**. Il vit désormais dans `details`, le champ
que le contrat porte pour cela — rétrocompatible dans les deux sens, puisque
personne ne le lisait.

## Pourquoi aucun cliquet ne le voyait

Le cycle 108 a fermé le **`Server`** nu. Son jumeau — le **`Socket`** nu — a la
MÊME cause (`DefaultEventsMap` ⇒ `emit(ev: string, ...args: any[])`) et le MÊME
effet. `typed-socket.ts` le dit depuis le cycle 99 : `typed-socket.ts` existe pour
cette raison, et nomme le défaut qui l'a motivé (`conversation:join-error`, huit
sites d'émission, deux consommateurs, jamais au contrat).

`sweepRawServerEmitters` ne cherche que `Server`. Il était **vert**.

## Le discriminant du jumeau ne se recopie pas — mesuré

Celui de `Server` exige un `import type`, pour une raison écrite sur place :
`MeeshySocketIOManager` importe `Server` en VALEUR parce qu'il le CONSTRUIT.

**Cette exception n'a pas de jumelle** : personne ne construit un `Socket`,
socket.io le remet à un handler. Et ce n'est pas une généralisation de confort —
le site fautif écrivait `import { Socket } from 'socket.io'`, en **VALEUR** :

> Le discriminant de `Server`, recopié tel quel, **aurait manqué le site qui
> motive le lot.** Règle du cycle 91, une fois de plus : la forme juste d'à côté
> s'ouvre contre le cas présent, elle ne se copie pas.

La seconde condition, elle, est reprise sans changement parce qu'elle garde la
même propriété — **détenir n'est pas ÉMETTRE**. Quatre fichiers déclarent le
`Socket` nu ; trois lisent des rooms ou résolvent un utilisateur, le quatrième
(`typed-socket.ts`) en DÉRIVE `MeeshySocket`. Aucun n'émet, tous sortent par
CONSTRUCTION, et l'inventaire n'a aucune liste d'exceptions.

## Une correction de méthode, à dire à voix haute

Le premier relevé de ce cycle annonçait **trois** fichiers tenant le `Socket` nu,
dont `MeeshySocketIOManager`. **Faux** : la mesure venait de deux `grep`
indépendants sur le même fichier (« importe quelque chose de socket.io » ET
« nomme `Socket` quelque part »), et le manager importe `Server as SocketIOServer`
de socket.io, puis `MeeshySocket as Socket` de `typed-socket` — il est GOUVERNÉ
depuis le cycle 99. Le relevé précis (`import … { … Socket … } from 'socket.io'`,
à la frontière de mot) en rend **quatre**, dont **un seul** émet.

Deux balayages faux en deux cycles, tous deux attrapés avant d'être gelés, et la
même cause : **une conjonction de conditions évaluées sur le FICHIER se lit comme
une conjonction évaluée sur le SITE.**

## Le grain est le FICHIER, et la fixture l'a enseigné

Dans un fichier qui ÉMET, toute déclaration `: Socket` nue est relevée, même
d'une fonction qui n'émet pas elle-même — c'est le même socket, et le gouverner
de bout en bout est strictement meilleur.

Ce point n'a pas été décidé à l'avance : la fixture NÉGATIVE mélangeait d'abord
les deux motifs légitimes dans un fichier, et **elle a rougi**. Les deux motifs
vivent donc dans deux fichiers, parce que ce sont deux choses.

> Une erreur commise en écrivant un cliquet est le meilleur cas de test qu'il
> aura jamais (cycle 109 bis) — ici elle a produit la seule phrase du lot qui
> dise ce que le grain signifie.

## Ce que le lot ne touche pas, et pourquoi — #18657

Le doc-comment de `CallError.callId` sanctionne les erreurs SANS `callId` et
nomme le cas : « generic rate limits ». Or le web les ÉCARTE en silence :

```ts
if (error === null || call === null || error.callId !== call.callId) return;
```

`decodeError` rend `callId: string | null` ⇒ pour les **sept** sites qui
appellent `checkSocketRateLimit` PENDANT un appel, un refus de débit n'atteint
jamais l'utilisateur web : il appuie, rien ne se passe. Android arbitre plus
finement (`CallErrorDisposition.resolve`).

Trois réponses sont défendables et n'engagent pas la même chose — dont « passer
le `callId` », la plus tentante et la plus risquée : elle ferait entrer un refus
de débit dans le chemin qui peut TERMINER un appel sain, exactement ce que le
doc-comment interdit. **C'est une décision de produit**, ouverte en #18657 plutôt
que tranchée ici.

## Preuves

| preuve | résultat |
|---|---|
| `tsc --noEmit` gateway | **EXIT=0** |
| ROUGE 1 — `Socket` nu réintroduit en production | le cliquet tombe en NOMMANT `utils/socket-rate-limiter.ts` |
| ROUGE 2 — `retryAfter` remis à la RACINE | `TS2353 … 'retryAfter' does not exist in type 'CallError'` |
| fixture positive | les DEUX formes d'import vues (`type` ET valeur) |
| fixture négative | ni la DÉRIVATION, ni la simple DÉTENTION, ni la porte dérivée |
| `server-emit-door-sweep.test.ts` | **12/12** (9 au cycle 163, 6 avant) |
| suites touchées (appels, débit, porte, `together`, manager) | **196 suites, 2 934 témoins** |
| `check-any-debt.sh` | EXIT=0 (488 / 488, inchangé) |

Trois témoins ont été REPOINTÉS, pas supprimés : ils assertaient `retryAfter` à
la racine, et l'un passait `'custom:error'` — un canal arbitraire que le
narrowing interdit désormais. Un témoin qui atteste une capacité qu'on vient de
retirer se réécrit sur la capacité qui reste ; le supprimer aurait effacé la
question.

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18657 | le web écarte les `call:error` sans `callId` | **ouverte** — décision produit |
| #18499 | les 5 canaux montants sourds + les 3 noms hors contrat | inventoriés ; verdict à rendre |
| #18342 | la jumelle descendante (6 événements qu'aucun client ne déclare) | ouverte |
| #18115 | les trois champs morts de `AttachmentUpdatedEvent` | ouverte |
| #18456 | le consommateur iOS de `AttachmentReactionUpdateEvent.userId` | ouverte — demande Xcode |

## Les 9 sites écartés, OUVERTS un par un — l'angle mort est soldé

Le cycle 163 les avait comptés sans les ouvrir. Ils le sont, et le compte tombe
juste :

| site | ce que c'est | verdict |
|---|---|---|
| `ZmqMessageHandler:302`, `ZmqTranslationClient:205/221/227/341` | `extends EventEmitter` — un `emit` de Node, pas un canal socket.io | **hors périmètre par construction** |
| `MessageTranslationService:1760` | idem (`extends EventEmitter`), consommé par les `.on(...)` du manager qui, LUI, émet sur socket.io | **hors périmètre** — son commentaire (« Émettre événement Socket.IO ») décrit l'INTENTION en aval, pas cet appel |
| `MeeshySocketIOManager.broadcast<K>:3448` | `K extends keyof ServerToClientEvents` + `Parameters<ServerToClientEvents[K]>` | **corrélé** — rien à faire |
| `togetherRelay:89` | `event as never, data as never` | **réparé au cycle 163** (#18649) |
| `socket-rate-limiter:510` | `Socket` nu + `errorEvent: string` + `retryAfter` non déclaré | **réparé ici** (#18655) |

Deux défauts sur neuf, sept exemptions qui tiennent par CONSTRUCTION et non par
décision. La direction émetteur → contrat sur les CHAMPS est donc mesurée pour de
bon — mais la mesure n'est toujours pas GARDÉE, et pour la raison du cycle 163 :
le seul instrument qui la verrait ne voit pas à travers le chokepoint générique
(`_seq` y est estampillé). Ce qui est soldé est l'angle mort du RELEVÉ, pas le
trou du CLIQUET.

> **Six des neuf « sites non résolus » n'étaient même pas des canaux socket.io.**
> L'instrument les avait ramassés parce qu'il cherchait `.emit(` — un nom de
> méthode que Node et socket.io partagent. Un balayage qui cherche un NOM DE
> MÉTHODE mesure deux bibliothèques à la fois : c'est le cycle 107 (« un idiome,
> pas une propriété ») sous une forme qui ne se voit pas, puisque les deux
> populations ont littéralement la même syntaxe.
