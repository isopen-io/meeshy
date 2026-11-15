# Itération 281 — `LocationHandler` valide sa frontière socket par Zod, et borne la télémétrie diffusée

Issue : #4263 · douzième et dernière famille de handlers Socket.IO à rejoindre la
frontière Zod (suivi explicite du cycle 107) · jumelle des quatre familles de
réaction alignées jusqu'à l'itération 280.

## État actuel

Les onze autres familles de handlers Socket.IO valident leur charge ENTRANTE par
un schéma Zod via `validateSocketEvent`. `LocationHandler` — le partage de
position en direct (`location:live-start / -update / -stop`) — validait à la
MAIN :

```ts
private _validateCoordinates(latitude, longitude): boolean {
  return typeof latitude === 'number' && typeof longitude === 'number'
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}
// + !data.durationMinutes || data.durationMinutes <= 0 || data.durationMinutes > 480
```

Cet écart de consistance était nommé au cycle 107 (`services/gateway/CLAUDE.md`
§ « Ce qui reste, à sa taille ») : « Deux familles sur douze valident à la main.
[…] La question utile […] est : la douzième famille le sera-t-elle ? »
L'itération 280 a converti `AttachmentReactionHandler` ; restait
`LocationHandler`.

## Problèmes identifiés

1. **Défaut concret — télémétrie diffusée SANS garde.** `handleLiveLocationUpdate`
   ne validait QUE `latitude`/`longitude`. Les quatre champs optionnels de
   `LocationLiveUpdateData` — `altitude`, `accuracy`, `speed`, `heading` —
   traversaient la frontière sans aucune vérification et étaient diffusés
   VERBATIM à tous les pairs de la conversation :

   ```ts
   const eventData = { …, altitude: data.altitude, accuracy: data.accuracy,
                       speed: data.speed, heading: data.heading, … };
   socket.to(ROOMS.conversation(id)).emit(LOCATION_LIVE_UPDATED, eventData);
   ```

   Une charge forgée portant `NaN`, `±Infinity` ou une valeur non numérique
   dans l'un de ces champs était relayée telle quelle sur la carte de chaque
   participant. C'est exactement la classe « qu'est-ce qui part À CÔTÉ du champ
   gardé ? » (leçon 275) et le miroir de la borne d'emoji manquante de
   l'itération 280 : un champ optionnel non borné franchissant la frontière
   avant toute défense en profondeur.

2. **Écart de CONSISTANCE de frontière.** Une famille sur douze gardait sa charge
   à la main. Une règle de frontière retapée à chaque site est une règle qu'un
   site finira par appliquer différemment.

## Causes racines

`LocationHandler` a été écrit avant que `validateSocketEvent` ne devienne le
patron partagé, et sa garde manuscrite s'est arrêtée aux deux coordonnées
« évidentes ». La télémétrie, ajoutée au type `LocationLiveUpdateData` comme
quatre `number` optionnels, n'a jamais reçu de garde : elle n'apparaissait dans
aucun `if`, seulement dans l'objet diffusé — invisible à une relecture qui
cherche « qu'est-ce qui est validé ? » plutôt que « qu'est-ce qui est SERVI ? ».

## Impact métier / technique

Un client émettant `location:live-update` avec une télémétrie forgée voyait
cette valeur diffusée à chaque pair. Selon le rendu client, `NaN`/`Infinity`
dans `speed`/`heading`/`altitude`/`accuracy` peut corrompre l'affichage de la
carte (vitesse/cap absurdes, halo de précision infini), voire faire échouer un
décodeur strict. Aucune borne de frontière ne s'y opposait — la garde ne
regardait que lat/long.

## Évaluation du risque

Faible. Le correctif ALIGNE exactement sur les onze familles gardées par Zod ; il
touche `LocationHandler.ts` (frontière) et ajoute trois schémas dans
`socket-event-schemas.ts`. Zod v4 rejetant nativement `NaN`/`Infinity`
(`invalid_type`), `z.number()` reproduit et DÉPASSE `_validateCoordinates` (qui
rejetait `NaN` par accident — toute comparaison avec `NaN` est fausse — mais ne
regardait pas la télémétrie). Les coordonnées et la durée gardent leurs bornes
et leurs messages informatifs, servis sous le préfixe unifié `Validation
failed:`. Net effet client sur le chemin nominal : inchangé.

## Améliorations proposées (implémentées)

- `SocketLocationLiveStartSchema` (`conversationId` non vide ≤ 255, `latitude`
  ∈ [-90;90], `longitude` ∈ [-180;180], `durationMinutes` ∈ ]0;480]),
  `SocketLocationLiveUpdateSchema` (coordonnées + télémétrie `.number()`
  optionnelle finie), `SocketLocationLiveStopSchema` (`conversationId`).
- Les trois handlers valident en tête de `try` via `validateSocketEvent`, puis
  lisent `validated.*` partout — comme les onze familles. `start` rend l'erreur
  par callback ; `update`/`stop` retournent en silence (pas de callback), comme
  la garde manuscrite qu'ils remplacent.
- Retrait de `_validateCoordinates`, désormais subsumé par le schéma.
- Messages préservés : `Invalid coordinates`, `Invalid duration (must be 1-480
  minutes)`, portés par `{ error: … }` sur le type/min/max Zod v4.

## Bénéfices attendus

Une source de vérité de frontière pour les DOUZE familles de handlers ; la
télémétrie GPS forgée refusée AVANT diffusion ; refus cohérent (`Validation
failed: …`) sur toute la surface Socket.IO ; `_validateCoordinates` supprimé.

## Complexité

Faible : trois schémas, trois frontières de handler, deux fichiers de tests mis
à jour (six pins d'erreur convergés), sept témoins ajoutés.

## Critères de validation (atteints)

- Témoin RED prouvé : avant l'implémentation, quatre témoins de télémétrie forgée
  (`speed: Infinity`, `altitude: NaN`, `accuracy: -Infinity`, `heading: 'north'`)
  tombent — la charge est diffusée. Le témoin « latitude NaN » passe DÉJÀ
  (lat/long étaient gardés), ce qui isole le défaut à la télémétrie.
- GREEN après : cinq suites Location vertes (93 tests).
- `tsc --noEmit` du gateway : exit 0.
- Suite gateway complète : verte (voir plan pour le compte).

## Suivi

- La douzième famille est SOLDÉE : les douze handlers Socket.IO valident
  désormais leur frontière par Zod. La question du cycle 107 est close.
- Aucune borne produit universelle n'existe pour altitude/accuracy/speed/heading
  au-delà de la finitude ; si un besoin apparaît (cap ∈ [0;360[, vitesse ≥ 0),
  ce sera une issue dédiée — jamais une borne posée sans motif produit.
