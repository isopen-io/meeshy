# Cycle 107 — le suivi que j'ai porté trois cycles était FAUX, et je l'ai mesuré

**Date** : 2026-08-23
**Branche** : `claude/keen-hamilton-qqnnp5`
**Prédécesseur** : cycle 106 (PR #3372) — la file rejoint le contrat

---

## Le point de départ, et son défaut

Les cycles 104, 105 et 106 ont chacun clos leur journal sur le même suivi, dans
les mêmes termes :

> **Le miroir client→serveur n'est pas gouverné.** `ClientToServerEvents` n'a
> aucun équivalent de `serverEmit.ts`, et `socket.on(...)` reste libre de
> déclarer la forme qu'il veut de ce qu'il REÇOIT — la moitié HOSTILE du contrat.

Le cycle 106 est allé jusqu'à écrire qu'il était « désormais le plus gros
restant ». Ce cycle-ci l'a instruit, et la première mesure l'a démenti.

**Le suivi était FAUX**, et il l'a été trois fois parce que personne — moi — ne
l'a mesuré avant de le recopier.

---

## Ce que la mesure dit

| famille | zod (`validateSocketEvent`) | garde écrite à la main | limiteur de débit |
|---|---|---|---|
| `CallEventsHandler` | 18 | — | 22 |
| `PostReactionHandler` | 5 | — | 5 |
| `MessageHandler` | 4 | — | 13 |
| `CommentReactionHandler` | 3 | — | 3 |
| `ReactionHandler` | 2 | — | 6 |
| `ConversationHandler` | 2 | — | 2 |
| `StatusHandler` | 2 | — | 2 |
| `AuthHandler` | 1 | — | 2 |
| `LocationHandler` | — | `_validateCoordinates` (3) | 4 |
| `AttachmentReactionHandler` | — | `OBJECT_ID.test` (1) | 2 |

**Trente-sept validations zod, deux familles à gardes manuscrites, et un
limiteur de débit sur CHAQUE famille.** La surface entrante est gouvernée. Elle
l'était déjà quand j'ai écrit pour la première fois qu'elle ne l'était pas.

---

## D'où venait l'erreur : typage et VALIDATION ne sont pas la même chose

Le constat de départ était exact — `ClientToServerEvents` n'a effectivement pas
de porte de TYPE comparable à `serverEmit.ts`. La faute est dans ce que j'en ai
conclu.

> **Pour du SORTANT, une porte de type est la seule garde qui existe** : une
> diffusion Socket.IO n'a aucun sérialiseur, donc ce que le compilateur laisse
> passer part sur le fil. C'est ce que les cycles 104 à 106 ont bâti, et le
> raisonnement y était juste.
>
> **Pour de l'ENTRANT, une porte de type ne garde rien du tout.** Le client
> n'est pas compilé par nous : il envoie ce qu'il veut. Un `socket.on` typé
> décrit ce que le serveur *croit* recevoir, jamais ce qu'il *accepte*. La seule
> garde possible est à l'EXÉCUTION — et c'est précisément celle qui existait.

J'ai transposé la conclusion du sortant sur l'entrant par symétrie de nom
(« le miroir »), sans ré-instruire la question. La symétrie était lexicale.

---

## La deuxième erreur : mon propre balayage a rendu SEPT faux positifs

Le premier outil que j'ai écrit pour ce cycle cherchait `validateSocketEvent` et
a rendu sept handlers « à charge NON validée » :

```
HEARTBEAT · REACTION_REQUEST_SYNC · ATTACHMENT_REACTION_ADD
ATTACHMENT_REACTION_REMOVE · LOCATION_LIVE_START/UPDATE/STOP
```

Les sept valident. `LocationHandler` borne ses coordonnées
(`_validateCoordinates`), vérifie l'appartenance (`_resolveParticipantId`),
limite le débit et borne la session dans le temps. `AttachmentReactionHandler`
exige la présence des trois champs puis passe les deux ids à `OBJECT_ID.test`.
`REACTION_REQUEST_SYNC` valide par zod, dans un fichier que mon suivi de
délégation n'atteignait pas.

> **Un balayage qui cherche UN idiome ne mesure pas une propriété, il mesure la
> popularité de cet idiome.** C'est mot pour mot la règle que le dépôt porte
> déjà — « un audit qui liste des `select:` ne liste pas des fuites » (cycle 84)
> — et je l'ai rejouée en croyant auditer.

**Aucun de ces sept n'est entré dans un cliquet.** Le balayage a été jeté, pas
gelé : geler un inventaire faux aurait transformé une erreur de mesure en
vérité de dépôt.

---

## Ce qui reste vrai, et qui est modeste

Deux familles valident à la MAIN plutôt que par l'idiome partagé. Ce n'est pas
un trou de sécurité — les gardes sont réelles et lisibles — mais c'est la forme
que prend une règle appliquée à dix endroits sur douze : rien n'oblige la
onzième famille à valider, et rien ne le signalerait.

C'est un écart de CONSISTANCE, pas de couverture. Le noter comme tel, à sa
taille, est exactement ce que le suivi précédent ne faisait pas.

---

## Une limite de MON cycle 106, trouvée par un lot parallèle

Le cycle 106 bis (PR #3377), instruit en parallèle depuis la même liste de
suivis, a mesuré ceci : **une clé venue d'un SPREAD échappe au contrôle des
propriétés excédentaires**, signature d'index ou pas.

```ts
take({ a: 'x', zzz: 1 });   // TS2353 — attrapé
const built = { a: 'x', zzz: 1 };
take({ ...built });          // SILENCE
```

Cela borne ce que mon cycle 106 a réellement obtenu, et je le note ici plutôt
que de laisser le journal surestimer son lot :

| ce que la file vérifie désormais | statut |
|---|---|
| champs REQUIS présents | **vérifié** — l'assignabilité traverse le spread |
| TYPE de chaque champ | **vérifié** — idem |
| clés EN TROP sur une charge composée par spread | **non vérifié** |

Le journal du cycle 106 écrit « la charge qu'on ENFILE est tenue à la forme que
le contrat associe à l'événement qu'on REJOUERA ». C'est vrai des deux premières
lignes, pas de la troisième. La correction ne retire rien au lot — un champ
requis manquant ou mal typé était le défaut visé — mais elle en dit la portée
exacte.

> Deux cycles instruits en parallèle depuis la même liste, et c'est l'autre qui
> a trouvé la limite du mien. **Un suivi partagé entre deux agents vaut mieux
> qu'un suivi gardé** — c'est le seul dispositif de ce dépôt qui ait attrapé une
> de mes surestimations sans que je la cherche.

---

## Gates

Aucun changement de production. `tsc --noEmit` 0 erreur, suite complète
inchangée — c'est un lot de MESURE et de correction du dossier.

---

## Suivis

- [ ] Les deux familles à gardes manuscrites (`LocationHandler`,
      `AttachmentReactionHandler`) pourraient passer par `validateSocketEvent`.
      **Gain réel mais modeste**, et à instruire comme tel : la question n'est
      pas « sont-elles gardées ? » (elles le sont) mais « la onzième famille le
      sera-t-elle ? ».
- [ ] `_seq` n'est déclaré que sur `NotificationEventData` (cycle 105).
- [ ] `ReactionUpdateEvent` / `ReactionUpdateEventData` : deux exemplaires.
- [ ] `ConversationUpdatedEventData` et sa signature d'index.
- [ ] La LECTURE de la file depuis Redis reste non validée à l'exécution
      (cycle 106) — décision de performance avant d'être une décision de typage.
- [x] ~~Le miroir client→serveur n'est pas gouverné~~ — **RETIRÉ, mesuré faux.**
