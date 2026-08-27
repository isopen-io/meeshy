# Plan — Itération 277 : vecteurs d'APPLICATION de la réduction de langue au Prisme

## Objectifs

Fermer l'« amélioration future » n°2 du plan de l'itération 276 : attester, par
le contrat de vecteurs cross-plateforme, que les trois miroirs du résolveur
d'aperçu APPLIQUENT la réduction de langue (ISO 639-3 → 639-1, alias 639-1
dépréciés, séparateur underscore, tag de script) au point de comparaison — pas
seulement qu'ils partagent les tables.

## Modules affectés

- `packages/shared/fixtures/reading-modes/prism-preview.vectors.json` (seul
  fichier modifié — +8 vecteurs).
- Consommateurs (inchangés, chargent le JSON) :
  - `packages/shared/__tests__/vectors/prism-preview.vectors.test.ts` (TS) ;
  - `PrismPreviewVectorTests.swift` (iOS) ;
  - `PrismPreviewVectorParityTest.kt` (Android).

## Phases

1. **Instruction** — confirmer que `normalizeLanguageForDedup` (TS),
   `MeeshyUser.normalizeLanguageCode` (Swift) et
   `LanguageCodeNormalizer.normalizeForDedup` (Kotlin) partagent le même
   algorithme sur le chemin DÉFINI, et que chaque entrée choisie y reste. ✅
2. **Vérification empirique** — exécuter le SSOT TS sur les 8 entrées, relever
   les sorties attendues. ✅
3. **Encodage** — ajouter les 8 vecteurs. ✅
4. **Validation** — suite `prism-preview` verte, suite `shared` complète verte,
   contre-épreuve ROUGE prouvée. ✅

## Dépendances

- `language-normalize-mirror-parity.test.ts` (itération 266) garde déjà
  l'égalité des tables sur les trois plateformes — prérequis de la sûreté des
  nouveaux vecteurs.

## Risques estimés

- **Surfacer une divergence client réelle** → écarté : les 8 entrées atteignent
  toutes le chemin défini de `normalizeLanguageCode`, algorithmiquement identique
  sur les trois plateformes ; le repli (où Swift diverge) n'est jamais approché.

## Stratégie de rollback

Retirer les 8 vecteurs du JSON ; aucun code de production n'est touché.

## Critères de validation

- 30/30 vecteurs TS verts ; 113 fichiers / 2699 tests `shared` verts.
- Contre-épreuve : mutation TS « repliage sans réduction » ⇒ 6/8 nouveaux
  vecteurs rouges (prouvé).

## Statut de complétion

**LIVRÉ.** Vecteurs ajoutés, validés, contre-épreuve prouvée.

## Suivi / améliorations futures

- **Divergence de REPLI sur les codes IRRÉDUCTIBLES tagués région.** Le repli
  de `normalizeLanguageForDedup` (TS) et `normalizeForDedup` (Kotlin) rend le
  SOUS-TAG PRIMAIRE (`yue-HK` → `yue`), tandis que le `canon` Swift
  (`resolvedLastMessagePreview`) rend la CHAÎNE ENTIÈRE lowercased
  (`yue-HK` → `yue-hk`). Pour un code hors catalogue tagué région, les trois
  miroirs divergeraient. À instruire en issue AVANT tout vecteur : c'est
  potentiellement un correctif de client (aligner le repli Swift sur le sous-tag
  primaire), non validable dans le conteneur TS courant — donc hors périmètre de
  cette itération, qui n'encode que des entrées à chemin défini.
- **`resolveUserTranslationLanguages` (Kotlin) référence un jumeau TS inexistant.**
  Son doc-comment cite « `conversation-helpers.ts → resolveUserTranslationLanguages` »,
  fonction absente du SSOT TS (le concept « cibles d'auto-traduction =
  systemLanguage + regionalLanguage » n'a pas de jumeau TS/Swift). Dérive de
  documentation à trancher en issue : soit le concept est Android-only et le
  doc-comment doit cesser de promettre un miroir, soit un SSOT TS doit être créé.
