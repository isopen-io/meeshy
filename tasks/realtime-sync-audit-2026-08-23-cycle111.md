# Cycle 111 — le rejeu hors ligne : ce que la charge DOIT être, et l'entrée qui désordonne les autres

> Numéroté 111 et non 110 : une session parallèle a ouvert la PR #3401 sous
> l'étiquette « cycle 110 » pendant que celle-ci démarrait. Les deux lots sont
> disjoints (§7).

Point de départ : le premier suivi ouvert du cycle 109 bis — « **Neuf — le reste
de la charge n'est toujours pas vérifié.** Ce lot ferme le NOM de l'événement […]
La FORME de `entry.payload` reste une affirmation. »

Le suivi disait vrai. Il ne disait pas que le trou avait un **jumeau une couche
plus bas**, ni que le premier était visible depuis dix lignes du code qui le
portait.

---

## 1. Le défaut : la valeur DÉRIVÉE était gardée, la valeur SOURCE ne l'était pas

`linkMessageEmissions` inspecte à l'exécution le message qu'il déplie, et écrit
pourquoi :

```ts
// Un tableau est un `object` : sans ce refus, une enveloppe dérivée
// enverrait une liste là où le client attend un message.
if (message && typeof message === 'object' && !Array.isArray(message)) {
```

L'enveloppe **dont ce message est extrait**, elle, partait sans aucun contrôle —
et les onze autres familles d'`eventType` avec elle :

```ts
return [{ event, payload: entry.payload } as SocketEmission];   // ← rien
```

Or `entry.payload` sort de `JSON.parse(entry) as QueuedMessagePayload`
(`parseRawEntries`), qui ne vérifie **aucun champ**, sur des octets vieux de 48 h
au plus (`DELIVERY_QUEUE_TTL_SECONDS`) — largement de quoi enjamber un
déploiement progressif où deux versions se partagent la même file Redis.

> **La garde existait, à dix lignes, sur la valeur dérivée de celle qui n'en avait
> pas.** C'est ce qui l'a rendue invisible : on lit le fichier, on voit un
> `typeof` / `Array.isArray`, et on conclut que la frontière est tenue.

### Ce que ça coûtait

Une charge informe ne LÈVE nulle part. Socket.io l'encode sans broncher, elle
part sous un nom d'événement **parfaitement valide**, et chaque décodeur client
la jette en silence. Le drain étant DESTRUCTIF — `drain()` a retiré l'entrée de
Redis ET de la file mémoire avant la première émission — le message est perdu
sans recours et sans trace.

C'est mot pour mot le coût d'un nom absent avant le cycle 109 bis, par un autre
chemin.

**Et la seconde moitié est pire que la première.** Mesuré au témoin : l'auteur
voyait sa coche passer au **double tic** pour un message que le destinataire
n'a jamais pu décoder (`count: 2` au lieu de `1`). Un accusé de remise AFFIRME
« ce message est arrivé chez son destinataire » — la règle que
`_drainPendingMessages` énonce déjà pour la garde d'appartenance (« l'affirmer
d'un message qu'on vient de refuser de livrer mentirait à son auteur ») ne
couvrait pas la charge qu'on n'a pas su mettre en forme.

---

## 2. Le correctif : un plancher, et il s'arrête au plancher

```ts
export function isDeliverableQueuedPayload(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload);
}
```

Les douze événements de `DRAINED_EVENT` portent tous un objet, et **c'est la
seule chose que les douze aient en commun**. Valider chacune des douze FORMES
serait un autre lot, avec ses douze schémas et sa dette de synchronisation ;
refuser ce qui ne peut être aucune des douze ne coûte qu'un `typeof`.

Le refus n'a demandé **aucune machinerie neuve** : le cycle 109 bis a construit
exactement la voie de récupération qu'il faut, et le lot s'y branche.

```ts
if (!isDeliverableQueuedPayload(entry.payload)) {
  dropEntry(entry, 'payload-not-an-object');
  continue;
}
```

Les deux moitiés du couple sont refusées **séparément**, et c'est délibéré : le
journal par entrée est la seule trace qu'une perte de rejeu laissera jamais, et
« le nom » et « la charge » n'envoient pas chercher au même endroit.

L'entrée perdue est alors, par la machinerie existante : journalisée avec son
identité, exclue de `count`, exclue des accusés de réception — **et sa
conversation est NOMMÉE dans `conversationIds`**, ce qui envoie le client la
relire. La perte redevient récupérable au lieu d'être définitive.

---

## 3. Le jumeau une couche plus bas : une entrée qui en désordonne d'AUTRES

Cherché en vérifiant ce que le `JSON.parse` non validé laisse passer d'autre que
`payload`. `enqueuedAt` est du même bois — stampé à l'enfilage, donc toujours
présent pour ce qu'on ÉCRIT ; rien pour ce qu'on RELIT.

```ts
return new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime();
```

`new Date(undefined).getTime()` rend `NaN`, et la spec (SortCompare) mappe un
comparateur qui rend `NaN` sur **`+0`** : l'entrée se déclare **ÉGALE à toutes
les autres**.

Un comparateur non transitif ne désordonne pas seulement l'entrée fautive — il
rend le tri **indéfini pour les entrées SAINES**. Mesuré, cinq entrées :

```
attendu : a, b, c, d   (+ BAD quelque part)
obtenu  : a, c, BAD, b, d      ← `c` rejoué AVANT `b`
```

Deux entrées parfaitement datées inversées par la présence d'une troisième qui
ne l'est pas.

> **C'est l'isolation que la couche du dessous PROMET, et elle s'arrêtait au
> `JSON.parse`.** « so one corrupt entry can never poison a whole drain/peek »
> est écrit trois fonctions plus haut, sur `parseRawEntries`. Une entrée corrompue
> qui **parse** franchissait le filtre et empoisonnait le lot par le comparateur.

Ce que l'ordre FIFO garantit est écrit sur `byEnqueuedAt` lui-même : qu'une
édition ne rejoue pas AVANT le `message:new` qu'elle vise — « the recipient's
client drops an edit for a message it hasn't received yet ». Le drain étant
destructif, l'édition ainsi jetée est perdue.

Correctif : `Number.isFinite` rend le comparateur **TOTAL**. Une entrée sans
instant lisible n'en a pas, et se range à la fin — déterministe, sans opinion sur
l'ordre de celles qui en ont un. Le cas `Infinity - Infinity` (deux entrées non
datées) est traité explicitement, faute de quoi le `NaN` reviendrait entre elles.

**Rangée, pas JETÉE** : son message est toujours en base, et le drain est la
seule occasion de le rejouer.

---

## 4. Les témoins

Trois, tous prouvés ROUGES avant correction — et les deux premiers dans le
harnais du manager, là où le CLAUDE.md du gateway exige que vivent les gardes de
comportement du manager.

| témoin | ce qu'il garde | rouge mesuré |
|---|---|---|
| `ne diffuse RIEN dont la charge ne soit pas un objet routable` | aucune charge diffusée n'est une chaîne, un tableau ou `null` | `Received: "not-an-object"` |
| `n'accuse pas la remise d'une charge informe, mais nomme sa conversation` | `count` se resserre, `conversationIds` ne se resserre pas | `count: 2` au lieu de `1` |
| `une entrée sans enqueuedAt lisible ne déplace pas les entrées SAINES` | le tri reste défini pour les entrées datées | `a, c, b, d` |

Le troisième passe par le **vrai chemin de production** (`queue.drain()` sur un
faux Redis rendant du JSON), pas par le comparateur isolé : c'est la différence
entre attester une fonction et attester ce que la file rend.

---

## 5. Ce que le lot n'a PAS fait, et pourquoi

- **La FORME des douze charges reste une affirmation.** Le plancher refuse ce qui
  ne peut être aucune des douze ; il ne vérifie pas qu'une charge de
  `reaction-added` en soit une. La gravité est réelle mais moindre — une charge
  fausse mais objet est rejetée bruyamment par les décodeurs clients, une charge
  informe l'est en silence — et le geste juste (douze schémas dérivés de
  `QueuedPayloadFor`) est un lot à lui seul.
- **`linkMessageEmissions` n'a pas reçu de garde propre.** Son autre appelant
  (`broadcastLinkMessage`) compose sa charge en processus, sous typage. La
  vérification appartient à la frontière de DÉSÉRIALISATION, et il n'y en a
  qu'une.
- **Les autres champs non validés de `QueuedMessagePayload`** (`conversationId`,
  `messageId`, `dedupKey`) restent des affirmations. `conversationId` absent
  produit un `undefined` dans le `where` de `_dropEndedMemberships` et dans
  `conversationIds` — mesurable, non mesuré ce cycle.

---

## 6. Suivis

- [ ] **La FORME des douze charges** (§5) — le suivi du cycle 109 bis, rétréci à
      ce qu'il reste après ce lot.
- [ ] Les champs d'IDENTITÉ de `QueuedMessagePayload` non validés (§5).
- [ ] Hérité (107 bis) — la bivariance `strictFunctionTypes: false`.
- [ ] Hérité — `ReactionUpdateEvent` / `ReactionUpdateEventData`, deux exemplaires
      de la même déclaration, aujourd'hui d'accord champ pour champ.
- [ ] Hérité — `LinkMessagePayload` porte encore `readonly [key: string]: unknown`.
      Conclusion inchangée depuis le cycle 106 : le levier est de DÉCLARER les
      champs, pas de fermer la carte.
- [ ] Hérité (108 ter) — l'en-tête du cliquet de dette, fausse de trois points.

---

## 7. Leçon de méthode

**Un suivi qui nomme un trou peut en cacher un second, à la couche qui le
nourrit.** Le suivi du cycle 109 bis pointait `entry.payload` et disait vrai. Ce
qui ne s'y lisait pas, c'est que la question « qu'est-ce que ce `JSON.parse` non
validé laisse passer d'autre ? » a une seconde réponse — `enqueuedAt` — dont le
défaut est **structurellement pire** : le premier perd l'entrée fautive, le second
désordonne les entrées SAINES.

Corollaire : **devant une frontière de désérialisation, énumérer les CHAMPS, pas
le champ que le suivi nomme.**

Et la forme de la première moitié mérite d'être retenue pour elle-même :

> **Une garde posée sur une valeur DÉRIVÉE se lit comme une garde sur la
> frontière.** `linkMessageEmissions` inspectait `payload.message` avec le bon
> `typeof`, la bonne exclusion des tableaux, et le bon commentaire. À dix lignes,
> `payload` lui-même passait entier. Le regard s'arrête sur la garde qui existe.
