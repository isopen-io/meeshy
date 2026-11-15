# Cycle 163 — la porte était juste, et c'est l'argument qui la neutralisait

*2026-11-15. Branche `claude/exciting-planck-hg95mt`, repartie de la tête de
`dev` (`1348485794`).*

**Livré** : #18649 — le quatrième discriminant de la porte d'émission, et les
deux sites qui la contournaient par leurs arguments.

---

## Ce que le cycle a cherché d'abord, et pourquoi il l'a abandonné

Le relevé d'ouverture visait la direction que les six cliquets du contrat socket
ne gardent pas : **l'ÉMETTEUR contre le CONTRAT**. Les gardes de forme (#18070,
cycles 156–158) confrontent toutes le contrat au DÉCODEUR d'un miroir ; aucune
ne demande si la passerelle POSE ce qu'elle promet. Et le dépôt nomme lui-même
le trou restant :

> **Et le trou que le typage ne peut pas boucher** : un champ NOUVEAU, ajouté à
> un émetteur et à aucun contrat, redevient invisible au premier spread. Ce
> trou-là se ferme par un BALAYAGE, jamais par un type.

Un seul événement est gardé ainsi — `conversation-updated-declared-fields.ts`,
UN sur 176. La généralisation avait l'air d'être le lot.

**Mesure, par l'API du compilateur** (programme réel du gateway, 1 573 fichiers,
177 canaux déclarés résolus avec leurs propriétés) : 793 appels `.emit(`, dont
**531 sont le chokepoint générique de `serverEmit.ts`** — 3 × 177 par
construction, l'effacement que le dépôt a nommé et borné une fois. Restent
**262 sites réels, et ZÉRO champ non déclaré.**

Puis la question qui a tué la piste : *ce balayage aurait-il attrapé le cas
historique de sa propre classe ?* `_seq` — le curseur que trois clients lisent
et qu'aucun contrat ne déclarait (cycle 108) — a été retiré du contrat pour
voir. **Le balayage est resté vert** : `_seq` est estampillé par `emitWithSeq`,
donc à l'intérieur du chokepoint, précisément là où l'instrument ne voit rien.

> **Un cliquet qui ne peut pas attraper l'instance canonique de la classe qu'il
> annonce ne vaut pas mieux que pas de cliquet** — « une porte annoncée plus
> stricte qu'elle n'est vaut moins que pas de porte », et personne n'ira
> vérifier derrière. Le balayage a été JETÉ, pas gelé : c'est la décision du
> cycle 107, reprise pour la même raison.

Et une première rédaction, en expressions régulières, avait rendu **trois faux
positifs** sur `LocationHandler` avant d'être confrontée au fichier : elle
résolvait le PREMIER `const eventData` du fichier pour tous les sites, alors
qu'il y en a cinq, chacun ANNOTÉ — donc chacun déjà vérifié par le compilateur.
L'instrument a été refait sur l'API du compilateur avant toute conclusion.

## Ce que ce détour a mis sous les yeux

Parmi les 9 appels dont le NOM d'événement n'est pas un littéral, un seul ne
ressemblait à rien de connu :

```
src/services/together/togetherRelay.ts:89 | OTHER | never | arg=event as never
```

Un cast vers `never`. En ouvrant, la forme complète :

```ts
const emitTo = (io: TogetherIo | undefined, userIds: readonly string[], event: string, data: unknown): void => {
  io?.to(ROOMS.user(userId)).emit(event as never, data as never);
};
```

Et sa jumelle, trouvée par le même relevé :

```ts
// event is always SERVER_EVENTS.TYPING_STOP — cast bypasses union exhaustiveness check
emitter.emit(event as keyof ServerToClientEvents, data as any);
```

## Pourquoi aucun cliquet ne pouvait les voir

Les cycles 104, 105 et 108 ont fermé trois façons de contourner la porte
d'émission. **Les trois discriminants portent sur le RECEVEUR de `.emit(`** :

| forme fermée | ce que le balayage cherche | sur quoi |
|---|---|---|
| une interface qui RÉÉCRIT la signature | `emit(ev: string` / `emit: (ev: string` | le porteur |
| un CAST du porteur vers un type nu | idem | le porteur |
| le `Server` NU de socket.io | `import type { Server }` + `.emit(` | le porteur |

Les deux sites ci-dessus importent la **BONNE** porte — `ServerEmitIO`, dérivée
de `ServerToClientEvents`. `server-emit-door-sweep` était **vert**.

`as never` est assignable à tout : le couple `(événement, charge)` n'est
confronté ni sur le NOM ni sur la FORME. C'est exactement la liberté du `Server`
nu du cycle 108 — obtenue autrement, donc invisible. Les quatre émissions
d'« Ensemble » (`together:invited`, `together:started`, `together:synced`,
`together:ended`) voyageaient hors de tout contrat, **sur un canal qui n'a aucun
sérialiseur** pour rattraper un écart.

> La règle du cycle 105 — « chercher une forme fautive par son NOM de
> déclaration, c'est manquer tous les sites qui l'obtiennent autrement » —
> s'appliquait au porteur. Elle vaut identiquement de l'ARGUMENT. **Un cliquet
> qui garde un receveur ne dit rien de ce qu'on lui remet.**

## Le commentaire qui annulait sa propre contrainte

Le second site ÉNONÇAIT en prose ce que son cast empêchait de vérifier :
« event is always SERVER_EVENTS.TYPING_STOP ». C'est une AFFIRMATION, et le
dépôt exige qu'elle se mesure (cycle 94). Mesurée : **vraie** — `broadcastFn`
n'est appelé qu'une fois, avec `SERVER_EVENTS.TYPING_STOP` et un `typingEvent`
déjà annoté `TypingEvent`.

Une contrainte vraie n'a donc aucune raison de rester en prose : elle est
devenue le TYPE du paramètre, et le cast a disparu.

## Le discriminant, et le premier qu'il a fallu narrower

Premier relevé, sur « un `as` au premier niveau d'un argument de `.emit(` » :
**44 sites**, dont **40** de la forme `{ code, message } as CallError` — un
littéral casté vers le type que le canal DÉCLARE. Celui-là ne décorrèle rien :
`as` exige la comparabilité, et la porte vérifie le couple ensuite.

Les compter aurait mesuré la **popularité d'un idiome** au lieu d'une propriété.
Le discriminant ne retient donc que les cibles qui EFFACENT, ancrées en fin
d'argument de premier niveau :

| forme | compté ? | pourquoi |
|---|---|---|
| `event as never` / `data as any` | **oui** | plus aucune confrontation |
| `event as keyof ServerToClientEvents` | **oui** | corrélation effondrée (cycle 104) |
| `{ … } as CallError` | non | cast vers le type DÉCLARÉ |
| `{ id: id as any }` | non | cast de CHAMP, autre question |
| `as any` sur le 3e argument | non | ni canal ni charge |

**44 → 4** : deux sites, leurs deux arguments chacun.

## La réparation : narrower, jamais déplacer le cast

- `emitTo` prend `<E extends ServerEventName>(…, event: E, data: ServerEventPayload<E>)`
  et passe par `emitServerEvent` — la corrélation se vérifie au site d'appel, sur
  un nom CONCRET, et l'unique effacement sanctionné reste où le dépôt l'a borné.
- `broadcastFn` déclare `typeof SERVER_EVENTS.TYPING_STOP` et `TypingEvent`.

## Ce que la mesure dit, et ce qu'elle ne dit pas

**Les quatre charges d'« Ensemble » étaient JUSTES** contre leurs types déclarés :
`tsc --noEmit` rend `EXIT=0` une fois les casts retirés. La discipline tenait.

Ce lot ne répare donc **aucune panne** — et il faut le dire ainsi plutôt que de
laisser entendre une fuite : il rend VÉRIFIABLE ce qui ne l'était pas, et rien
n'aurait rougi le jour de la première divergence. C'est la famille
`conversation:join-error` (huit sites d'émission, deux consommateurs, jamais au
contrat), prise avant le défaut plutôt qu'après.

## Preuves

| preuve | résultat |
|---|---|
| `tsc --noEmit` gateway, casts retirés | **EXIT=0** |
| ROUGE 1 — champ inconnu dans la charge | `TS2561 … 'endedAtt' does not exist in type 'TogetherEndedEventData'` |
| ROUGE 2 — couple DÉCORRÉLÉ (`ended` sous `invited`) | `TS2353 … 'reason' does not exist in type 'TogetherInvitedEventData'` |
| ROUGE 3 — autre canal via le rappel narrowé | `TS2345 … '"typing:start"' is not assignable to '"typing:stop"'` |
| ROUGE 4 — cast réintroduit en production | le cliquet tombe en NOMMANT `services/together/togetherRelay.ts` |
| `server-emit-door-sweep.test.ts` | **9/9** (6 avant) |
| suites touchées (`together`, `status`, manager, `serverEmit`, `typing`) | **51 suites, 1 189 témoins** |

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18499 | les 5 canaux montants sourds + les 3 noms hors contrat | inventoriés ; verdict de produit à rendre |
| #18342 | la jumelle descendante (6 événements qu'aucun client ne déclare) | ouverte |
| #18115 | les trois champs morts de `AttachmentUpdatedEvent` | ouverte |
| #18456 | le consommateur iOS de `AttachmentReactionUpdateEvent.userId` | ouverte — demande Xcode |

**Mesuré MÛR ce cycle, et c'est un résultat** : la direction émetteur → contrat
sur les CHAMPS. 262 sites réels, zéro champ non déclaré. Elle n'est pas pour
autant GARDÉE — le seul instrument qui la verrait ne voit pas à travers le
chokepoint, et aucun cliquet n'a été posé pour cette raison. Y revenir
demanderait de gouverner `emitWithSeq` et `emitServerEvent` eux-mêmes, ce qui
est un lot distinct.
