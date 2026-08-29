# Itération 281 — `LocationHandler` valide sa frontière socket par Zod (la douzième famille)

Issue : #4245 (arc de consistance des frontières socket) · suite directe des
itérations 279/280 · réponse à la question ouverte du cycle 107 :
« la douzième famille le sera-t-elle ? ».

## État actuel

Les douze familles d'événements socket entrants du gateway partagent un
contrat de frontière : valider la charge ENTRANTE (non fiable, venue du fil)
par un schéma Zod via `validateSocketEvent` avant tout travail. Après
l'itération 280, **onze familles sur douze** le font. La douzième —
`LocationHandler` (`location:live-start` / `…-update` / `…-stop`) — validait
encore à la main :

```ts
// handleLiveLocationStart
if (!this._validateCoordinates(data.latitude, data.longitude)) { … 'Invalid coordinates' }
if (!data.durationMinutes || data.durationMinutes <= 0 || data.durationMinutes > 480) { … 'Invalid duration…' }
// handleLiveLocationUpdate
if (!this._validateCoordinates(data.latitude, data.longitude)) return;
```

`_validateCoordinates` réimplémente `typeof === 'number'` + bornes de plage ;
la garde de durée réécrit une plage à la main.

## Problèmes identifiés

1. **Écart de CONSISTANCE de frontière.** Une famille sur douze garde sa charge
   à la main. C'est le dernier écart de l'arc 279→280→281 : une règle de
   frontière retapée localement est une règle qu'un site finit par appliquer
   différemment (les messages divergeaient déjà — `'Invalid coordinates'` /
   `'Invalid duration…'` vs le `'Validation failed: …'` des onze jumelles).

2. **`location:live-stop` ne validait RIEN.** Son `conversationId` partait droit
   à `normalizeConversationId` sans borne ; une charge forgée sans
   `conversationId` (ou d'un type faux) n'était refusée par aucune garde de
   frontière, seulement par l'absence de participant en aval.

3. **Type-faux toléré par coercition sur `durationMinutes`.** La garde
   `!data.durationMinutes || … <= 0 || … > 480` laisse passer une CHAÎNE
   numérique (`"30"`), qui ne « marchait » qu'ensuite par coercition dans
   `new Date(now + data.durationMinutes * 60_000)`. Défense de frontière absente
   sur le type.

## Causes racines

`LocationHandler` est le seul handler socket dont la charge porte une STRUCTURE
riche (deux coordonnées bornées, une durée bornée, des champs optionnels de
télémétrie) plutôt qu'un simple `{ …Id, emoji }`. Sa validation a donc été
écrite à la main dès l'origine et n'a jamais adopté la frontière Zod que les
familles à charge plate partagent — `z.number().min().max()` exprime pourtant
EXACTEMENT les mêmes bornes, et `validateSocketEvent` remonte le premier message
d'issue, donc le détail sémantique (`'Invalid coordinates'`,
`'Invalid duration (must be 1-480 minutes)'`) se préserve sous le préfixe unifié.

## Impact métier / technique

Un client émettant `location:live-*` avec une charge malformée recevait un
message d'erreur DIFFÉRENT des onze autres familles (incohérence d'API), et une
`durationMinutes` de type faux traversait la frontière par coercition. Classe
« cette famille a-t-elle une jumelle ? on la prend en entier » du `CLAUDE.md`,
appliquée au dernier membre de la classe.

## Évaluation du risque

Faible. Le correctif ALIGNE exactement sur les onze jumelles testées ; il
n'ajoute que trois schémas dans `socket-event-schemas.ts` et déplace la
validation en tête des trois verbes. Les bornes sont préservées au réel
(`lat ∈ [-90,90]`, `lng ∈ [-180,180]`, `0 < durée ≤ 480` via `.gt(0).max(480)`
— la plage exacte de la garde manuscrite, y compris l'acceptation d'une durée
non entière). Net effet client : messages d'erreur convergés (préfixe unifié,
détail préservé), et une charge de type faux désormais refusée AVANT tout travail.

## Améliorations proposées (implémentées)

- `SocketLocationLiveStartSchema` (`conversationId: string().min(1).max(255)`,
  `latitude`/`longitude` bornées avec `invalid_type_error` = message métier,
  `durationMinutes: number().gt(0).max(480)` message métier).
- `SocketLocationLiveUpdateSchema` (coordonnées bornées + télémétrie optionnelle
  `altitude`/`accuracy`/`speed`/`heading`).
- `SocketLocationLiveStopSchema` (`conversationId` borné — la première garde de
  frontière que ce verbe reçoit).
- Les trois verbes valident en tête via `validateSocketEvent(schema, data)`,
  puis lisent `validated.*`. Retrait de `_validateCoordinates` et de la garde de
  durée manuscrite.

## Bénéfices attendus

Une source de vérité de frontière par famille socket, sur les DOUZE ; refus
cohérent (`'Validation failed: …'`) sur toutes ; `location:live-stop` gardé
pour la première fois ; une durée de type faux refusée AVANT tout aller-retour.

## Complexité

Faible : trois schémas, trois frontières de handler, deux fichiers de tests mis
à jour, un helper privé retiré.

## Critères de validation (atteints)

- Témoins exerçant le VRAI schéma (aucun mock de `validateSocketEvent`) : RED
  prouvé (les témoins de coordonnées/durée asserttent le message unifié et
  tombent contre la production actuelle), GREEN après câblage.
- Nouveau témoin « `location:live-stop` sans `conversationId` refusé à la
  frontière » (la garde que ce verbe n'avait pas).
- Suite gateway complète verte.
- `tsc --noEmit` du gateway : exit 0.

## Suivi

L'arc des frontières socket est SOLDÉ : les douze familles valident par Zod.
`_validateCoordinates` n'a plus d'appelant et est retiré ; aucun piège armé
laissé ouvert.
