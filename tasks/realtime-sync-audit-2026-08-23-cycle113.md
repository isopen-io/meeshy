# Cycle 113 — l'entrée corrompue ne désordonnait plus les saines : elle les déshabillait de leur gate

> Numéroté 113 et non 112 : une session parallèle a landé son propre cycle 112
> (« Le repli qui couvrait tout, sauf le mode où il était seul », PR #3407,
> mentions en conversation chiffrée) pendant que celui-ci tournait. Les deux
> lots sont disjoints.

Point de départ : le deuxième suivi ouvert du cycle 111 — « **Les champs
d'IDENTITÉ de `QueuedMessagePayload` non validés** (`conversationId`,
`messageId`, `dedupKey`). `conversationId` absent produit un `undefined` dans le
`where` de `_dropEndedMemberships` et dans `conversationIds` — mesurable, non
mesuré ce cycle. »

Le suivi disait vrai, et il sous-estimait ce qu'il nommait de deux crans. Ce
n'est pas « un `undefined` dans un `where` » : c'est **le gate d'autorisation du
rejeu qui s'éteint pour le lot entier**, par un chemin que le `catch` du gate
est conçu pour ne pas distinguer d'une panne.

---

## 1. Le défaut : un id illisible ne se perd pas seul, il AGRÈGE

Les deux gardes posées aux cycles 109 bis et 111 se prononcent sur une entrée en
la lisant **seule** : `drainedEventName` ferme le NOM, `isDeliverableQueuedPayload`
ferme la CHARGE, et une entrée refusée n'emporte qu'elle.

`conversationId` n'a pas cette propriété. Le drain l'**agrège** — un unique
`conversationId: { in: [...] }` porte la totalité du lot — pour deux requêtes qui
décident du sort de tous :

```ts
const conversationIds = [...new Set(drained.map(entry => entry.conversationId))];
const rows = await this.prisma.participant.findMany({
  where: { userId, conversationId: { in: conversationIds }, isActive: true },
  select: { conversationId: true, bannedAt: true },
});
```

Or `conversationId` sort du même `JSON.parse(entry) as QueuedMessagePayload`
(`parseRawEntries`) que les deux champs déjà gardés, sur les mêmes octets vieux
de 48 h au plus (`DELIVERY_QUEUE_TTL_SECONDS`).

### Ce que Prisma en fait, mesuré

Contre le client généré du dépôt, **sans base** (URL pointée sur un port mort,
donc aucune de ces erreurs n'est une erreur de connexion) :

| valeur dans le `in` | verdict |
|---|---|
| `undefined` | `PrismaClientValidationError` (côté CLIENT) |
| `null` | `PrismaClientValidationError` |
| un nombre, un objet | `PrismaClientValidationError` |
| `''`, ou toute chaîne non-ObjectId | `PrismaClientKnownRequestError: Malformed ObjectID` (moteur) |

Les cinq atterrissent dans le même `catch`.

### Et le `catch` échoue OUVERT — par décision, et il a raison

```ts
} catch (error) {
  logger.warn('Membership re-read failed on drain — replaying the backlog unfiltered', …);
  return drained;
}
```

La raison est écrite au-dessus et elle est juste : « une absence de réponse
n'autorise rien à conclure ; jeter l'arriéré parce que la base n'a pas répondu
échangerait une fuite rare contre une perte de données probable, une tempête de
reconnexions étant exactement le moment où la base est sous pression. »

> **Le fail-open ne peut pas distinguer « la base n'a pas répondu » de « nous ne
> lui avons jamais posé de question valide ».** Sur le second cas, il transforme
> une entrée corrompue en **désactivation du gate d'autorisation** : l'arriéré
> des conversations que le lecteur a QUITTÉES, ou dont il a été BANNI, repart en
> entier — jusqu'à 48 h et 500 entrées (`DELIVERY_QUEUE_MAX_PER_USER`).

Aucun `catch` ne peut réparer ça. La seule réponse est de ne pas mettre l'entrée
dans la question.

### La seconde victime, même cause

`_emitDeliveryForDrainedMessages` agrège de la même façon :

```ts
const participantRows = await this.prisma.participant.findMany({
  where: { conversationId: { in: [...convLatest.keys()] }, isActive: true },
  …
});
```

Une entrée illisible y coûtait **tous les accusés de remise du lot** — la remontée
`sent → delivered` des expéditeurs, avalée par le `.catch` du site d'appel.

---

## 2. Le correctif : refuser AVANT le gate, et par entrée

Troisième garde de la frontière de désérialisation, et la première des trois qui
ne protège pas l'entrée d'elle-même — elle protège **les autres** d'elle :

```ts
export function isAddressableConversationId(conversationId: unknown): conversationId is string {
  return typeof conversationId === 'string' && OBJECT_ID.test(conversationId);
}
```

**Le plancher est la forme ObjectId, pas « une chaîne ».** S'arrêter à
`typeof === 'string'` laisserait ouverte la moitié `Malformed ObjectID` du
tableau ci-dessus — et c'est la moitié la plus plausible, le dépôt portant DEUX
façons de nommer une conversation (`normalizeConversationId` traduit un
identifiant lisible en ObjectId ; le chemin d'enfilage le plus chaud,
`broadcastNewMessage`, passe sa liste de participants pré-chargée et ne fait donc
jamais la requête qui aurait validé l'id au passage).

Le refus se branche sur la voie de récupération que le cycle 109 bis a construite
et que le cycle 111 a réutilisée — mais **hissée au-dessus du gate**, parce que
c'est là, et seulement là, que l'entrée fautive est encore nommable une par une :

```ts
const addressable = drained.filter(entry => {
  if (isAddressableConversationId(entry.conversationId)) return true;
  dropEntry(entry, 'conversation-id-not-addressable');
  return false;
});
if (addressable.length === 0) return;

const pending = await this._dropEndedMemberships(userId, isAnonymous, addressable);
```

`delivered`/`undelivered`/`dropEntry` remontent donc avant le gate. Rien d'autre
ne bouge : les deux refus existants (nom, charge) gardent leur place dans la
boucle et leur `reason` propre.

### L'exception qui confirme la règle du cycle 111

Le cycle 111 a établi que `conversationIds` **ne se resserre pas** : une entrée
perdue nomme quand même sa conversation, et c'est ce qui rend la perte
récupérable au lieu de définitive.

Ce lot y pose la seule exception possible, et elle est de nature, pas de degré :
**une entrée refusée POUR son `conversationId` n'a rien à nommer.** Publier son id
enverrait le client invalider une conversation qui n'existe pas — un signal de
récupération qui ne désigne rien vaut moins que le silence.

```ts
const affectedConversationIds = [...new Set(
  [...delivered, ...undelivered].map(e => e.conversationId).filter(isAddressableConversationId)
)];
```

Le journal par entrée reste, lui, la trace de la perte — la seule qu'elle
laissera jamais.

---

## 3. Le harnais mentait sur l'ARGUMENT, pas sur le résultat

C'est ce qui a rendu le défaut invisible, et ça mérite d'être retenu pour
soi-même.

Les fixtures de rejeu portaient `'conv-1'`, `'conv-kept'`, `'conv-left'` — des
chaînes qu'aucun `conversationId` de production ne peut prendre. Le double Prisma
du harnais leur répondait poliment :

```ts
prisma.participant.findMany.mockImplementation(async (args) => {
  const ids = args?.where?.conversationId?.in ?? [];
  return ids.map((conversationId) => ({ conversationId, bannedAt: null }));
});
```

**Toute la suite `_drainPendingMessages` attestait donc un drain dont la requête
d'appartenance aurait levé chez le vrai client**, et onze entrées de fixture
n'avaient même pas de `conversationId` du tout.

> La leçon connue du dépôt — « un double Prisma qui rend `[]` rend tout témoin de
> contenu trivialement vert » — porte sur ce que le double RÉPOND. Celle-ci porte
> sur ce qu'il ACCEPTE, et elle est plus discrète : un double qui répond faux
> finit par se voir, un double qui accepte l'impossible ne se voit jamais, parce
> que le test qu'il sert PASSE.

Corrigé : `convId('kept')` rend 24 hexadécimaux mnémoniques, et
`strictMembership` refuse ce que le vrai client refuse. Les 60 littéraux et les
douze fixtures sans `conversationId` sont passés à la forme de production.

Effet de bord qui vaut d'être noté : **un témoin voisin était devenu inchutable**
au moment où la garde est apparue. `never carries a delivery receipt on drain`
(§ traduction) n'assert que du négatif ; son entrée portait `'conv-tr'`, donc
sous la garde elle était refusée et le témoin passait pour la mauvaise raison. Il
porte un ObjectId maintenant.

---

## 4. Les témoins

Trois, tous prouvés ROUGES en revertant la garde, dans le harnais du manager où
le CLAUDE.md du gateway exige que vivent les gardes de comportement du manager.

| témoin | ce qu'il garde | rouge mesuré |
|---|---|---|
| `une entrée dont la conversation n'est pas interrogeable ne désarme pas le gate des AUTRES` | le gate d'autorisation survit à une entrée illisible | `msg-gone` — la conversation QUITTÉE — diffusé |
| `n'expose AUCUNE des deux lectures du drain à un id que la colonne ne peut pas porter` | l'invariant d'argument, sur les deux requêtes agrégeantes | id demandé : `undefined` |
| `ne NOMME pas la conversation d'une entrée dont l'id n'en désigne aucune` | `count` exclut, `conversationIds` ne publie pas de faux id, aucun accusé | `msg-broken` diffusé, id publié |

Le premier passe par un double qui **refuse ce que le vrai client refuse** : sans
lui, il n'y a rien à prouver — c'est la permissivité du double qui EST le défaut
de mesure.

---

## 5. Ce que le lot n'a PAS fait, et pourquoi

- **`messageId` et `dedupKey` restent des affirmations.** Mesuré : leur rayon
  d'action est d'UNE conversation, pas du lot. `messageId` n'entre que dans
  `markMessagesAsReceived`, appelé sous `Promise.allSettled` par conversation, et
  un `undefined` y est déjà gardé (`if (!latestMessageId) return`). `dedupKey`
  n'est lu qu'à l'enfilage. Le geste juste pour eux est le même lot que la FORME
  des douze charges — pas un lot d'urgence.
- **La FORME des douze charges reste une affirmation** (suivi hérité du cycle
  109 bis, rétréci par le 111). Inchangé.
- **`_dropEndedMemberships` garde son fail-open.** Il est juste pour ce qu'il
  vise ; ce lot lui retire seulement le cas qu'il n'aurait jamais dû avoir à
  arbitrer, et l'écrit en PRÉCONDITION sur sa doc.

---

## 6. Suivis

- [ ] **La FORME des douze charges** (§5) — hérité 109 bis / 111.
- [ ] `messageId` / `dedupKey` (§5), avec leur rayon mesuré.
- [ ] Hérité (107 bis) — la bivariance `strictFunctionTypes: false`.
- [ ] Hérité — `ReactionUpdateEvent` / `ReactionUpdateEventData`, deux
      exemplaires de la même déclaration.
- [ ] Hérité — `LinkMessagePayload` porte encore `readonly [key: string]: unknown`.
- [ ] Hérité (108 ter) — l'en-tête du cliquet de dette, fausse de trois points.
- [ ] **Neuf** — le harnais du manager n'a pas de règle qui EMPÊCHE un futur
      double Prisma d'accepter un argument que la colonne ne peut pas porter. Les
      deux nouveaux témoins gardent le drain ; rien ne garde les autres lectures
      du harnais. Un cliquet est possible (un double partagé qui valide les ids
      d'ObjectId sur tous les `where`), c'est un lot à lui seul.

---

## 7. Leçon de méthode

**Une garde qui protège une entrée d'elle-même ne dit rien de ce qu'une entrée
fait aux autres.** Les deux gardes précédentes de cette frontière sont
per-entrée par nature — un nom, une charge — et il était naturel de lire la
troisième famille (les identités) comme « la même chose, sur trois champs de
plus ». Elle ne l'est pas : `conversationId` est le seul champ de l'entrée que le
drain **agrège**, et l'agrégation est exactement ce qui transforme un défaut
individuel en défaut de lot.

Le test à faire passer à chaque champ d'une frontière de désérialisation n'est
donc pas « que vaut-il quand il est faux ? » mais :

> **ce champ est-il lu SEUL, ou est-il mis en commun avec ceux des autres
> entrées ?** — parce que la seconde forme n'a pas de correctif local.

Et le corollaire sur le fail-open, qui vaut au-delà de ce site :

> **Un `catch` qui échoue ouvert sur « la dépendance n'a pas répondu » couvre
> aussi, sans le savoir, « nous lui avons posé une question invalide ».** La
> première est une panne subie et le fail-open est juste ; la seconde est un
> défaut à nous, et le fail-open y devient l'amplificateur. Les deux ne se
> distinguent pas depuis le `catch` — donc la garde va AVANT l'appel, jamais
> dedans.
