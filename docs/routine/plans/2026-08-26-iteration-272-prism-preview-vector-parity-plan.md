# Itération 272 — Plan : contrat machine cross-plateforme du Prisme sur l'aperçu de liste

## Objectifs

Remplacer la parité affirmée en prose (« one-for-one mirror ») des trois miroirs
de `resolveLastMessagePreview` par un fichier de vecteurs partagé, rejoué par les
trois plateformes contre leur API réelle de production.

## Modules affectés

- `packages/shared/fixtures/reading-modes/` — nouveau contrat (donnée).
- `packages/shared/__tests__/vectors/` — rejeu TS.
- `apps/android/core/model/src/test/kotlin/me/meeshy/sdk/lang/` — rejeu Android.
- `apps/ios/MeeshyTests/Unit/Lentille/` — rejeu iOS.

Aucun code de production n'est modifié.

## Phases d'implémentation

1. **Contrat** — `prism-preview.vectors.json` (forme `{ $format, vectors }`), 22
   cas dérivés de l'INTERSECTION vérifiée des trois suites existantes + règles
   documentées de CLAUDE.md. `$format` documente la règle, la provenance et
   l'exclusion (cartes à double clé canonique). **FAIT.**
2. **Rejeu TS** — `prism-preview.vectors.test.ts` via `runVectors` → adaptateur
   `resolveLastMessagePreview`. **FAIT, validé** (22/22 ; suite shared complète
   verte).
3. **Rejeu Android** — `PrismPreviewVectorParityTest.kt`, walk-up de
   l'arborescence pour trouver le JSON (idiome `AccentVectorParityTest`), décodage
   `kotlinx.serialization`, appel `resolveLastMessagePreview`. **FAIT** (validation
   par `android.yml`).
4. **Rejeu iOS** — `PrismPreviewVectorTests.swift`, chargement bundle
   `fixtures/reading-modes/` (folder reference déjà câblée), construction
   `MeeshyConversation` (fabrique app-target éprouvée), appel
   `resolvedLastMessagePreview`. **FAIT** (validation par `ios.yml`).

## Dépendances

- Harnais de vecteurs TS existant (`__tests__/vectors/harness.ts`).
- Folder reference iOS `../../packages/shared/fixtures` (`project.yml`,
  `type: folder`) — déjà en place, aucune modif.
- `kotlinx.serialization.json` (`api` dep de `core/model`) + `truth` (testImpl) —
  déjà en place.

## Risques estimés

- **iOS/Android non compilables dans ce conteneur** (toolchains absentes) : les
  deux rejeux sont validés par leurs CI GitHub, déclenchées par les chemins du PR.
  Mitigation : chaque rejeu copie fidèlement un motif déjà compilant du même
  module/target (chargement JSON + appel du résolveur réel), et n'invente aucune
  API. Sur rouge, corriger le miroir.
- **Faux positif de divergence** : écarté en amont — l'espace de cas est
  l'intersection vérifiée des trois suites, et l'unique écart connu (double clé
  canonique) est explicitement exclu du contrat.

## Stratégie de rollback

Suppression des quatre fichiers ajoutés (un JSON + trois tests). Aucun code de
production touché ⇒ rollback sans impact fonctionnel.

## Critères de validation

- TS vert (**FAIT**).
- `android.yml` vert sur `PrismPreviewVectorParityTest`.
- `ios.yml` vert sur `PrismPreviewVectorTests`.

## Statut d'achèvement

- Phases 1-2 : **FAIT et validé localement**.
- Phases 3-4 : **FAIT**, validation déléguée aux CI mobiles.

## Suivi des progrès

Itération 272 livre le contrat machine pour la famille APERÇU DE LISTE. Les autres
familles de résolveurs du Prisme (AUDIO, POSTS/COMMENTAIRES) restent sur des
suites à la main par plateforme.

## Améliorations futures

1. Étendre le motif « contrat machine » aux familles AUDIO et POSTS/COMMENTAIRES
   du Prisme (CLAUDE.md § *Prisme Linguistique*, tableau des familles).
2. Envisager un test méta TS qui énumère `fixtures/reading-modes/*.vectors.json`
   et exige, pour chacun, au moins un rejeu déclaré côté TS — garde contre un
   contrat orphelin ajouté sans témoin.
