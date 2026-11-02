# Shared Fixtures

Domicile des vecteurs de test partagés (contrat Lentille/Focal, workshop `tasks/lentille-focal-workshop.md` §2.3).
Écrits par L0 (noyau TypeScript, LWS-0/1/2) — `packages/shared/`.
Lus par les 3 plateformes : shared/web (Jest, import direct), iOS (XCTest, ressource de bundle copiée par XcodeGen), Android (JUnit, ressource symlinkée par Gradle).

## `long-message/` (#8147)

- `excerpt.vectors.json` — la loi `longMessageExcerpt` (`utils/long-message.ts`) : `{ _label, input: { text }, expected: { truncated, excerpt } }`, générés en exécutant la loi TS. iOS les rejoue contre son miroir Swift.
- `focal-metrics.json` — le bloc de verre du Focal (`utils/focal-metrics.ts`, `FOCAL_METRICS`) : mêmes clés, mêmes valeurs ; iOS recopie ses constantes et les compare à ce fichier.

## `device-tier-vectors.json` (#11281)

- Le tier média d'un appareil (bas / moyen / haut / pro) sur des entrées NEUTRES `{ memoryGB, cores, maxFps, hwAV1, hwHEVC, lowPower, thermal }` → `tier`. Aucune puce : la détection de puce, côté iOS, ne fait que PRODUIRE ces entrées. iOS le rejoue (`DeviceMediaTierVectorTests`, loi `DeviceMediaTier.classify`) ; Android le rejoue aussi (`DeviceMediaTierVectorsTest` dans `:core:model`, même loi `DeviceMediaTier.classify`, sur JVM nue) ; la jumelle web W10 (`apps/web/src/lib/device/capability-tier.ts`) le rejouera telle quelle.

## `relation-access-cases.json` (#13927)

- La loi d'accès des cercles `resolveRelationAccess` (`utils/relation-access.ts`) : `{ id, matrix, input, expected }`, **écrits à la main** — un oracle indépendant de la loi TS, jamais généré en l'exécutant. Rejoués par `__tests__/relation-access.test.ts`, puis par les miroirs Swift (`RelationAccess.swift`) et Kotlin (`RelationAccess.kt`) dans leurs sous-lots.

## `relation-export-badge.vectors.json` (#13997)

- Le logo de cercle de l'intro d'une story exportée (`utils/relation-export-badge.ts`, `relationExportBadge`) : niveau EFFECTIF servi (brut) → emoji ou `null`. Seuil `minLevel` = Proche. iOS (`MeeshySDK`, `RelationExportBadge.swift`) et Android (`:core:model`) rejouent le fichier par chemin relatif, comme `device-tier-vectors.json`.

## `mentionable-scope.vectors.json` (#14066, #14071)

- Qui peut-on mentionner dans une conversation : `scopes` (type BRUT servi → `interlocutor` / `members` / `directory` / `null`, correspondance exacte comme la passerelle) et `admits` (type + appartenance + membres connus → une mention de `candidateId` a-t-elle un effet ?), **écrits à la main**. Loi : `utils/mention-lookup.ts` (`mentionableScope`, `mentionReachOf`, `isMentionableIn`). Rejoués par `utils/__tests__/mention-lookup.test.ts`, iOS (`MentionSuggestionRuleTests`, `MentionReach`) et Android (`MentionableScopeVectorsTest`, `:core:model`), par chemin relatif.

## `keyframe-scale.vectors.json` (#14316)

- L'échelle d'une image clé MULTIPLIE celle de l'objet : `{ _label, objectScale, startTime, at, keyframes, renderedScale }`, **écrits à la main**, rendu = `objectScale × facteur` interpolé au temps local, un canal sans image clé (ou avant sa première) comptant pour 1. Rejoués par iOS (`StoryKeyframeScaleVectorTests` : `StoryRenderer`, description Core Animation, signature de `StoryRendererCache`), Android (`KeyframeScaleVectorsTest` dans `:core:model`, `StoryKeyframeScaleVectorsTest` dans `:feature:stories`) et le web (`apps/web/src/lib/canvas/pose-keyframe-scale.test.ts`, `objectPose`), par chemin relatif. Règle écrite dans `docs/product/meeshy-reader-modele.md`.
