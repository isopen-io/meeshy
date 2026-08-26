# Cycle 106 bis — retirer la carte ouverte ne ferme rien : c'est le SPREAD qui fait taire le compilateur

**Date** : 2026-08-23
**Branche** : `claude/keen-hamilton-dnabek`
**Prédécesseur** : cycle 105 (PR #3370) — un cast est une porte, et `_seq` n'était
déclaré nulle part
**Homonyme** : un lot « cycle 106 » a atterri sur main pendant celui-ci
(PR #3372, « la file rejoint le contrat »). Les deux ont été instruits en
parallèle depuis la MÊME liste de suivis du cycle 105 — celui-là a pris
`QueuedMessagePayload`, celui-ci `ConversationUpdatedEventData`. Aucun
chevauchement de code ; d'où le renommage en « bis », comme aux cycles 104 et
105.

---

## Le point de départ, et pourquoi il était faux

Le cycle 105 laissait ce suivi, hérité de plusieurs cycles :

> `ConversationUpdatedEventData` porte une signature d'index ;
> `lastMessagePreview` y voyage sans contrat.

La suite prescrite se lisait toute seule : fermer la carte ouverte, et le
compilateur verra enfin les champs qui passaient dessous. **Ce lot commence par
exécuter cette prescription et par mesurer ce qu'elle produit.**

```
retrait de `readonly [key: string]: unknown`
→ packages/shared  : 0 erreur
→ services/gateway : 0 erreur
```

Zéro. La prescription était **inerte**, et il a fallu comprendre pourquoi avant
de pouvoir faire le vrai lot.

---

## D1 — une clé venue d'un SPREAD est invisible au contrôle des propriétés excédentaires

Mesuré sous `--strict`, isolément :

```ts
type Target = { readonly a: string; readonly b?: number };
declare function take(t: Target): void;

take({ a: 'x', zzz: 1 });          // TS2353 — attrapé
const built = { a: 'x', zzz: 1 };
take({ ...built });                // SILENCE
take({ ...built, www: 2 });        // TS2353 sur `www` SEULEMENT
take(built);                       // SILENCE
```

Or les **quatre** émetteurs de `conversation:updated` composent tous leur charge
dans une variable — `updatePayload`, `basePayload`, `changedFields` — avant de la
répandre dans l'appel à `emit`. Le contrôle des propriétés excédentaires n'avait
donc jamais lieu sur aucun d'eux, avec ou sans signature d'index.

> **La signature d'index ne supprimait qu'un contrôle que le spread supprimait
> déjà.** Elle avait l'air d'être la cause parce qu'elle est la seule des deux
> qui soit ÉCRITE. Le spread, lui, est la forme normale du code.

### Ce qui SURVIT au spread, en revanche

Même protocole, et c'est la moitié qui décide du lot :

```ts
const partial = { b: 1 };
take({ ...partial });     // TS2345 — champ requis ABSENT : attrapé
const wrongType = { a: 42 };
take({ ...wrongType });   // TS2345 — champ DÉCLARÉ de type faux : attrapé
```

Le spread ne désarme QUE l'excédent. Le contrôle d'un champ **déclaré** passe à
travers.

> **Le levier n'est donc pas de fermer la carte, c'est de DÉCLARER les champs.**
> Les deux gestes se ressemblent, portent sur la même interface, et ne font pas
> le même travail. Le premier est cosmétique ; le second est le seul qui vérifie
> quoi que ce soit.

---

## D2 — le contrat déclarait 7 champs ; les clients en lisent 17

Relevé mécaniquement, pas de mémoire.

| | champs |
|---|---|
| **déclarés** (avant) | `conversationId`, `updatedBy`, `updatedAt`, `lastMessageTranslations`, `lastMessageOriginalLanguage`, `location`, `previewRecalculated` |
| **groupe d'aperçu, non déclarés** | `lastMessageId`, `lastMessageAt`, `lastMessagePreview`, `senderId` |
| **groupe métadonnées, non déclarés** | `title`, `description`, `avatar`, `banner`, `defaultWriteRole`, `isAnnouncementChannel`, `slowModeSeconds`, `autoTranslateEnabled` |

Les douze non déclarés voyagent depuis toujours et **iOS les décode tous les
douze** (`ConversationUpdatedEvent`, `Sockets/MessageSocketManager.swift`). Le
suivi hérité n'en nommait qu'un.

Les quatre du groupe d'aperçu sont les champs **PORTEURS** : l'identité du
message, son horodatage, son texte, son auteur. Les trois qui étaient déclarés
sont ceux qui les DÉCORENT. Le contrat déclarait la décoration et taisait le
sujet.

---

## D3 — `lastMessageAt` était le seul horodatage dont le type était décidé par l'ENCODEUR

Les trois émetteurs d'aperçu passaient l'objet `Date` de Prisma, quand
`updatedAt` — son jumeau, dans le même payload, à deux lignes — est une chaîne
ISO depuis toujours.

Sur le fil la différence ne se voit pas : la passerelle n'installe aucun parseur
socket.io personnalisé (vérifié — aucun `createAdapter`, aucun `parser:`), donc
l'encodeur par défaut est `JSON.stringify`, qui rend exactement `toISOString()`.
**Ce n'est pas une panne, et ce lot ne la présente pas comme telle.**

Ce que ça coûtait est ailleurs : un champ dont le type n'est énoncé nulle part
est un champ dont le type est décidé par la couche de transport — et **tout
témoin en cours de route atteste alors une forme que personne ne reçoit.** Il y
en avait un, et il est tombé au premier typage :

```
- expect(toA.payload.lastMessageAt).toEqual(new Date('2026-07-09T09:00:00Z'));
+ expect(toA.payload.lastMessageAt).toBe('2026-07-09T09:00:00.000Z');
```

Le repli va dans `toIsoOrNull` (`utils/lastMessagePreviewPrism.ts`), à côté du
résolveur de Prisme — pas trois fois à la main, ce qui rouvrirait l'écart que le
lot ferme.

---

## D4 — `senderId` est servi dans DEUX espaces d'ids, et le cycle 104 bis s'est trompé sur ses lecteurs

Le suivi hérité disait : *« Piège ARMÉ, pas panne : aucun client ne le lit —
mesuré sur les trois. »* La première moitié tient, la seconde est fausse :

- **le web LE LIT** — `neutralLastMessage` (`use-socket-cache-sync.ts:251`) le
  recopie dans le `Message.senderId` de sa ligne neutre ;
- **iOS LE DÉCODE** — `ConversationUpdatedEvent.senderId: String?`.

Ce qui sauve le cas, c'est l'étage d'APRÈS : le web n'a aucun lecteur pour ce
`senderId` (une seule assertion de test le nomme), et `mapConversationUpdated`
ne le transmet pas au store iOS — le champ « décodé et non mappé » que le code
iOS nomme lui-même deux lignes plus haut à propos de `location`.

> **« Personne ne le lit » et « personne n'en tire de rendu » ne sont pas la même
> mesure**, et seule la seconde était vraie. La conclusion ne change pas ; la
> qualité de la preuve, si. Un piège armé se documente par ce qu'on a
> effectivement mesuré, sinon le cycle suivant hérite d'une affirmation au lieu
> d'un fait.

L'espace canonique est le `Participant.id` — `schema.prisma` :
`sender Participant @relation("MessageSender", fields: [senderId], references: [id])`.
Le chemin socket sert un `User.id`. **Unifier est un changement de SÉMANTIQUE sur
le chemin le plus chaud du service, et les deux espaces sont délibérément
exploités ailleurs** (l'exclusion d'expéditeur du rejeu hors ligne les passe tous
les deux, précisément parce qu'ils ne se télescopent jamais). Ce lot le DÉCLARE
et écrit l'avertissement dans le contrat ; il ne le change pas. Suivi ouvert.

---

## Le cliquet : ce que le typage ne peut pas tenir

Déclarer les douze champs arme les contrôles qui survivent au spread (requis
absent, type faux). Reste le trou qui a produit le défaut d'origine : **un champ
NOUVEAU, ajouté à un émetteur et à aucun contrat, redevient invisible au premier
spread.** C'est exactement ce qui était arrivé à `location` (#3122), omise par le
seul chemin REST/ZMQ pendant que les deux autres la portaient.

Le cliquet est donc un balayage, pas un type —
`socketio/__tests__/conversation-updated-declared-fields.ts` : il lit le jeu de
champs DÉCLARÉS **à la source du contrat** (jamais une seconde liste écrite dans
le témoin, qui dériverait) et le confronte aux clés que les émetteurs émettent
RÉELLEMENT, sur les trois.

**ROUGE prouvé, et la démonstration est le résultat du lot** : en injectant
`probeUndeclaredField: 'x'` dans le payload de `MessageHandler`,

```
npx tsc --noEmit  → 0 erreur          ← le compilateur ne voit rien
jest              → ROUGE, en nommant `transport: "socket"` et `probeUndeclaredField`
```

Les deux mesures côte à côte sont l'argument entier de ce cycle.

Le détecteur de signature d'index a d'ailleurs commencé par se lire lui-même : le
commentaire qui EXPLIQUE pourquoi la signature n'est plus là en cite la forme.
Dépouillement des commentaires, même précaution que `server-emit-door-sweep.ts`
— *« les commentaires citent la forme fautive pour l'expliquer, c'est leur
rôle »*.

---

## Ce que le lot ne fait pas

- **Il n'unifie pas `senderId`** (D4) — changement de sémantique, son propre lot.
- **Il ne touche à aucun client.** Les douze champs déclarés sont déclarés TELS
  QU'ILS SONT SERVIS ; c'est la règle du cycle 94 (gouverner une charge jusque-là
  libre ne doit rien y décider d'autre), sans quoi la mesure « rien n'a été
  perdu » cesse d'être vérifiable.
- **`lastMessageAt` ne change pas d'octet sur le fil.** `JSON.stringify(Date)` et
  `toISOString()` rendent la même chaîne.

---

## Gates

| gate | résultat |
|---|---|
| `tsc --noEmit` passerelle | **0 erreur** |
| `packages/shared` build | vert |
| suite passerelle complète | **836/836 suites, 19258/19258 tests** (+5) |
| `packages/shared` | **103/103 fichiers, 2467/2467 tests** |
| `apps/web` `tsc` | **1241 avant, 1241 après** — mesuré des DEUX côtés (`git stash`), inchangé |

---

## Suivis

- [ ] **`senderId` : deux espaces d'ids sous un seul nom** (D4). Le déclarer ne
      l'unifie pas. L'espace canonique est `Participant.id` ; le chemin socket
      sert un `User.id`. Aucun client n'en tire de rendu aujourd'hui — mesuré,
      cette fois.
- [ ] **Les trois autres contrats à signature d'index** — `LinkMessagePayload`
      en porte une, `SocketIOMessage` est à vérifier. Le balayage de ce lot est
      écrit POUR `conversation:updated` ; le généraliser demande de relever
      d'abord les émetteurs de chacun.
- [x] Suivi hérité — la charge REJOUÉE est AFFIRMÉE, pas PROUVÉE
      (`QueuedMessagePayload.payload`). **CLOS par le lot homonyme** (cycle 106,
      PR #3372), instruit en parallèle depuis la même liste de suivis. Même
      famille que celui-ci : une carte ouverte dans un contrat est une absence
      de déclaration — deux lots du même jour, sur deux cartes différentes.
- [ ] Suivi hérité — `_seq` n'est déclaré que sur `NotificationEventData`.
- [ ] Suivi hérité — `ReactionUpdateEvent` / `ReactionUpdateEventData`, deux
      exemplaires de la même déclaration.
- [ ] Suivi hérité — le miroir client→serveur n'est pas gouverné.

---

## La leçon, pour le cycle suivant

> **Un suivi hérité est une PRESCRIPTION, et une prescription se vérifie avant de
> s'exécuter.** Celui-ci nommait le bon endroit et le mauvais geste. L'exécuter
> tel quel aurait produit un lot vert, propre, et sans effet — la signature
> d'index retirée, le mécanisme intact, et le suivi rayé de la liste. Le seul
> moyen de s'en apercevoir était de MESURER ce que le geste prescrit produit
> (0 erreur), au lieu de le tenir pour acquis parce qu'un cycle précédent l'avait
> écrit.
