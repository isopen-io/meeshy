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

- La règle de lisibilité de la couleur d'auteur (`utils/author-ink.ts`, `legibleTint`) : `ink` (l'encre de chaque schéma), `backgrounds` (les 8 fonds mesurés par schéma : surface, carte, trois arrêts du fil, trois arrêts sous la lueur), `aa` (4,5), `step` (0,04) et `vectors` = `{ scheme, tint, expected }` pour la palette entière × les deux schémas (**78 couples**). **Générés** en exécutant la loi TS sur les fonds du web (`apps/web/src/lib/view/author-ink.ts`). Rejoués par `__tests__/author-ink.test.ts` (et son contrôle de contraste indépendant), par le web (`author-ink.test.ts`, qui rougit si un fond bouge), puis par les miroirs iOS (`AuthorInkSharedVectorTests`, loi `AuthorInk`, #17865) et Android (`AuthorInkSharedVectorsTest` dans `:sdk-core`, loi `AuthorInk`, #17876), qui lisent ce fichier par chemin relatif : la loi TS ne peut pas bouger sans qu'un des trois miroirs rougisse.

## `e2ee-content/` et `e2ee-signal/` (#18940)

- Ce que libsignal chiffre dans une conversation `e2ee`, à l'octet près : le contenu d'un message (`E2EEContent` v1,
  `content.vectors.json`), les signaux (`E2EESignal` v1, `../e2ee-signal/signal.vectors.json`) et le remplissage par espaces
  (`padding.vectors.json`). Chaque cas donne l'objet, ses octets canoniques (base64 standard avec remplissage) et le clair
  rempli ; des cas de VERDICT (version future, auteur absent ou partiel, JSON tronqué, conversation étrangère…) donnent
  l'issue de l'ouverture. Les `canonicalJson` sont **écrits à la main** d'après ce que l'iPhone écrit
  (`E2EEContent.swift`, `E2EESignal.swift`), jamais générés par la loi TS (`types/e2ee-content.ts`). Rejoués par
  `__tests__/e2ee-content.test.ts` ; iOS et Android les rejouent par chemin relatif (mode d'emploi :
  `e2ee-content/README.md`).

## `e2ee-device-verification/` (#18906, #19153, #19181)

- La confirmation d'un appareil par code court et le registre de confiance de mes appareils, dont chaque entrée est signée par son auteur : `sas-v1.vectors.json` (RFC 5869 A.1/A.3, codes et accusés, propriétés, négatifs, options en carré dont `carre-avec-rejet`), `sas-emoji-v1.json` (table des 64 emoji dérivée de Matrix, Apache-2.0, **modifiée par Meeshy**, texte de licence `LICENSE-sas-emoji.txt`), `trust-ledger-v1.cases.json` (encodage signé, 8 + 12 vecteurs de signature XEdDSA à signatures fixes, ordre total, 85 cas aux attendus **écrits à la main**, dont huit clairs BRUTS à analyser en JSON strict et neuf qui fixent aussi ce qu'un appareil TRANSMET et s'il peut ADMETTRE — ces attendus-là marqués « en revue », #19183) et `upstream/` (la table amont, copie conforme, pour régénérer sans réseau). **Générés** par `node scripts/generate-device-verification-vectors.mjs` (et ses modules `scripts/device-verification-vectors/`) avec `@signalapp/libsignal-client` ; `--check` compare à l'octet (témoin `__tests__/ci/device-verification-vectors-regenerate.test.ts`). Clés de TEST seulement. Rejoués par la référence TS, la passerelle, le SDK iOS, `:core:e2ee` Android et le web, par chemin relatif ; détail et statut de chaque partie dans le README du dossier. Spécification : `docs/superpowers/specs/2026-11-17-e2ee-ajout-appareil-par-code.md`.
