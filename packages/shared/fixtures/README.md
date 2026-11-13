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

## `libsignal/cross-platform.vectors.json` (#17113)

- Les vecteurs CROISÉS de libsignal : identités, pré-clé signée, pré-clé Kyber et pré-clé unique de Bob (enregistrements sérialisés par libsignal), deux `PreKeySignalMessage` d'Alice (PQXDH), puis deux sessions SÉRIALISÉES qui, rechargées, ouvrent chacune le `SignalMessage` suivant (rétrocompatibilité #9231), avec leurs clairs attendus. **Générés** par la vraie bibliothèque (`node scripts/generate-libsignal-vectors.mjs`, qui vérifie chaque vecteur avant d'écrire) — clés de TEST seulement. Rejoués par la passerelle (`services/gateway/src/services/e2ee/__tests__/libsignal-cross-vectors.test.ts`, jest), le SDK iOS (`LibsignalCrossPlatformVectorTests`, par le chiffreur de production sur la base scellée) et `:core:e2ee` Android (`LibsignalCrossPlatformVectorsTest`, idem sur le coffre transactionnel). Chaque banc rejoue aussi chaque jeu de `libsignal/legacy/` (scellé par une version ANTÉRIEURE, dont `0.105.4.vectors.json`) avec la version courante : une session persistée avant une montée survit à la montée. Chaque banc refuse aussi la même charge altérée d'un octet. La garde `__tests__/ci/libsignal-version-alignment.test.ts` exige que le champ `libsignal` du fichier et les quatre déclarations du dépôt (passerelle, shared, `packages/LibSignalClient/LIBSIGNAL_VERSION`, `libs.versions.toml`) portent la même version exacte : une montée déplace le fichier courant dans `legacy/`, puis le régénère (règle : `decisions/2026-11-09-une-montee-de-libsignal-est-un-seul-lot-sur-les-quatre-plateformes-17113.md`).

## `author-ink.vectors.json` (#17879)

- La règle de lisibilité de la couleur d'auteur (`utils/author-ink.ts`, `legibleTint`) : `ink` (l'encre de chaque schéma), `backgrounds` (les 8 fonds mesurés par schéma : surface, carte, trois arrêts du fil, trois arrêts sous la lueur), `aa` (4,5), `step` (0,04) et `vectors` = `{ scheme, tint, expected }` pour la palette entière × les deux schémas (**78 couples**). **Générés** en exécutant la loi TS sur les fonds du web (`apps/web/src/lib/view/author-ink.ts`). Rejoués par `__tests__/author-ink.test.ts` (et son contrôle de contraste indépendant), par le web (`author-ink.test.ts`, qui rougit si un fond bouge), puis par les miroirs iOS (`AuthorInk`, #17865) et Android (`AuthorInk`, #17876), par chemin relatif.
