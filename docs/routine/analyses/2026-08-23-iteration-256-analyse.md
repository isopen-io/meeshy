# Analyse — Itération 256 : la borne STRICTE `endMs > startMs` était triplée, jumeau connu de la brique `time-range`

## Protocole (démarrage)

`main` @ `0656f14a` (dernier commit : `Merge PR #3405 — cycle 111 : le rejeu hors
ligne ne peut plus diffuser une charge informe…`). Branche
`claude/brave-archimedes-vxm94w` alignée sur `origin/main` (0 avance / 0 retard au
départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), puis `npx prisma generate --generator client` + `bun run build`
dans `packages/shared`. Baselines vertes au départ : shared `time-range` (4 tests),
gateway `playback-trace` + `playback-segments` + `messages-schemas` (115 tests).

**Audit anti-doublon** (4 PRs ouvertes au départ) : #3406 (Android story
keyframe), #3404 (web transformers langue), #3395 (iOS a11y), #3392 (gateway
`participant-resolver` mort). **Aucune ne touche `packages/shared/utils/time-range.ts`,
ni `services/gateway/src/utils/playback-{trace,segments}.ts`, ni
`validation/messages-schemas.ts`** — zéro chevauchement de fichier.

## Sélection : **Priorité 2 — feature modernisée dont une brique SSOT n'était consommée qu'à moitié**

L'itération 238 a extrait `isMsRangeOrdered` (`>=`) dans
`packages/shared/utils/time-range.ts` comme source unique de l'invariant temporel
`(startMs, endMs)`, et a rebranché `transcriptionSegmentSchema` (shared) et
`socketTranscriptionSegmentSchema` (gateway) dessus. La brique porte une
docstring qui **nomme explicitement** le régime STRICT (`endMs > startMs`,
itération 237) comme délibérément « hors de cette brique » — mais elle laissait
ce régime sans brique du tout, donc **triplé à la main** sur trois sites.

## Current state (avant correctif)

Le prédicat STRICT `endMs > startMs` vivait, recopié, sur trois sites voisins,
tous du domaine de la LECTURE MÉDIA (« une écoute réellement CONTINUE ne peut pas
durer zéro milliseconde ») :

| site | forme | rôle |
|---|---|---|
| `validation/messages-schemas.ts:37` | `.refine((s) => s.endMs > s.startMs, …)` | gate de wire du rapport `playbackStretch` (→ `400`) |
| `utils/playback-trace.ts:78` | `endMs > startMs` dans `isUsable` (type guard) | jette une entrée corrompue à la persistance |
| `utils/playback-segments.ts:47` | `segment.endMs > segment.startMs` dans `isUsable` | jette un segment corrompu à la fusion de couverture |

Le lien entre ces trois n'était tenu QUE par des commentaires : celui de la refine
de `messages-schemas.ts` se décrivait lui-même comme un « **miroir explicite** du
filtre `isUsable` dans playback-trace.ts:78 ».

## Problems identified

1. **Un invariant SSOT consommé à moitié.** La brique `time-range.ts` existe
   précisément pour qu'un tel couple ne soit pas recopié — c'est la dette
   refermée pour le régime `>=` à l'itération 238. Le régime STRICT, pourtant
   nommé dans la même docstring, restait hors brique.
2. **Un « jumeau » tenu par la vigilance, pas par le compilateur.** C'est
   exactement le patron que le harnais du gateway passe son temps à réduire
   (« Cette entité a-t-elle une JUMELLE ? », `services/gateway/CLAUDE.md`) : trois
   copies d'une même règle, synchronisées par des commentaires qui se citent
   mutuellement. La première qui dérive (un `>` transformé en `>=`) casse la
   sémantique « écoute continue » sans qu'aucune autre ne le sache.

## Root causes

L'itération 237 a posé la borne stricte site par site, à mesure que le besoin
apparaissait (gate de wire puis filtres de persistance). L'itération 238 a
mutualisé le seul régime `>=` alors connu et a **documenté** l'existence du régime
strict sans lui donner de brique — le laissant triplé. Même schéma d'omission que
234 → 236 pour `>=`, un cran plus loin.

## Business impact

**Nul en runtime** — le comportement est rigoureusement inchangé (même prédicat,
mêmes verdicts). Le gain est de **cohérence et de prévention de dérive** : trois
sites qui doivent rester d'accord partagent désormais une définition unique,
gelée par test, au lieu de trois copies gardées à la main.

## Technical impact

- **Ajout PUREMENT additif côté shared** : une nouvelle export
  `isMsRangeStrictlyOrdered` dans `time-range.ts`, jumelle stricte de
  `isMsRangeOrdered`, avec docstring qui distingue les deux régimes (`>=` pour un
  intervalle qui peut être ponctuel ; `>` pour une écoute qui doit avoir duré).
- **Refactor sans changement de comportement côté gateway** : les trois sites
  appellent la brique. `messages-schemas.ts` conserve son message de wire
  `STRETCH_END_MUST_EXCEED_START` (contrat client inchangé) et son `path: ['endMs']`.
- **Aucun export mort introduit** : `isMsRangeStrictlyOrdered` a trois
  consommateurs dès le premier commit. Pas de `MS_RANGE_STRICT_REFINEMENT`
  ajouté — le seul site Zod porte un message de domaine, un objet de refinement
  partagé serait resté inutilisé.
- **`tsc --noEmit` (gateway) : exit 0.** Types inchangés.

## Risk assessment

- **Négligeable.** Le prédicat est un `>` strict, identique aux trois expressions
  qu'il remplace. Les 115 tests des trois suites concernées restent verts
  (comportement prouvé inchangé) ; la régression élargie (read-status + playback +
  schemas, 390 tests) reste verte.
- **Rollback :** retirer l'export et les 4 tests, réinliner `endMs > startMs` aux
  trois sites.

## Proposed improvements

1. **RED** : 4 tests dans `packages/shared/__tests__/utils/time-range.test.ts`
   pour `isMsRangeStrictlyOrdered` (ordonné → true ; durée nulle → **false** ;
   inversé → false ; témoin de contraste explicite avec `isMsRangeOrdered` sur la
   borne de durée nulle).
2. **GREEN** : `isMsRangeStrictlyOrdered` dans `time-range.ts` + docstring des
   deux régimes.
3. **Rebranchement** des trois consommateurs sur la brique, commentaires alignés.

## Expected benefits

- Régime strict `endMs > startMs` déclaré UNE fois, comme sa jumelle non stricte.
- Trois « miroirs explicites » convertis en un import unique — la dérive
  silencieuse d'un `>` en `>=` devient impossible sans faire tomber un test.
- La docstring de `time-range.ts` cesse de décrire un régime qu'elle n'héberge
  pas.

## Implementation complexity

- **Faible.** 1 fichier shared (+1 export, docstring), 3 fichiers gateway
  (+1 import chacun, 1 ligne réécrite chacun), +4 tests.

## Validation criteria

- [x] RED prouvé : 4 tests neufs tombent avant l'ajout de la fonction.
- [x] GREEN : shared `time-range` 8/8.
- [x] Suite shared complète : **2553/2553** (aucune régression).
- [x] Gateway `playback-trace` + `playback-segments` + `messages-schemas` :
      **115/115** (comportement inchangé).
- [x] Régression élargie `(playback|MessageReadStatus|messages-schemas|media-views|ReadStatus)` :
      **390/390**.
- [x] `bun run tsc --noEmit` (gateway) : exit 0.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)

- **Parité client du régime strict.** Les producteurs de `playbackStretch` côté
  web (`apps/web/utils/playback-stretch-tracker.ts`) et iOS
  (`PlaybackStretchTracker.swift`) fabriquent la charge : ils devraient déjà ne
  jamais émettre une durée nulle, mais aucun test ne le gèle côté client — à
  auditer une fois les targets accessibles.
- **CanvasV3 `TimingSchema`/`bounds`** (itération 237) exprime l'invariant `>=`
  sous d'autres noms de champ (`start`/`end`, en secondes) ; une brique
  généralisée par nom de champ dépasse le périmètre et n'est pas justifiée tant
  qu'un troisième jeu de noms n'apparaît pas.
