# Plan — Iteration-250i : quand la cible tactile EST le dessin

**Date** : 2026-08-29 · **Piste** : iOS (`i`) · **Base** : `origin/main` `ce9ebfc6`
**Branche** : `claude/intelligent-noether-6zxsbz` (repartie du main d'après 249i)
**Analyse** : `docs/analyses/uiux/2026-08-29-iteration-250i-bare-shape-tap-targets.md`

---

## 1. Périmètre

| # | fichier | action |
|---|---|---|
| 1 | `Meeshy/Features/Auth/Onboarding/OnboardingAnimations.swift` | `InteractiveProgressBar` — rangée de 44 pt, `rowHeight` nommée et internal |
| 2 | `Meeshy/Features/Auth/Onboarding/OnboardingFlowView.swift` | les marges qui entouraient la barre passent DANS la cible |
| 3 | `Meeshy/Features/Main/Components/BackgroundColorPalette.swift` | **neuf** — la bande de couleurs, une fois pour deux surfaces |
| 4 | `Meeshy/Features/Main/Composer/ComposerSceneBand.swift` | `palette` → le composant |
| 5 | `Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift` | `backgroundStrip` → le composant |
| 6 | `Meeshy/Localizable.xcstrings` | `a11y.color.position`, 7 locales (3406 → 3407) |
| 7 | `MeeshyTests/Unit/Guards/BareShapeTapTargetGuardTests.swift` | **neuf** — la règle de forme + sa borne + les 2 valeurs |
| 8 | `MeeshyTests/Unit/Components/BackgroundColorPaletteTests.swift` | **neuf** — le nom positionnel, 5 locales + l'arabe |

Hors périmètre par règle de piste : `packages/MeeshySDK` (`StoryBackgroundPalette`
reste la source des couleurs, inchangée), Android, web, gateway.

## 2. Ordre d'exécution

1. Chercher la FORME avant le site : balayer les labels de bouton qui commencent
   par une forme nue, sur tout `apps/ios/Meeshy`. Le suivi 249i n'en nommait
   qu'un ; il y en a trois.
2. Corriger la barre d'étapes, puis mesurer le coût en hauteur chez son hôte
   avant de décider s'il faut absorber les marges (il le fallait : 36 pt sinon,
   12 pt ainsi).
3. Extraire la bande de couleurs, convertir les deux copies.
4. **Relire les gardes qui LISENT la source des fichiers touchés** — une
   extraction de vue déplace du texte que des tests cherchent par
   `contains(_:)`.
5. Ajouter la clé au catalogue par édition TEXTUELLE, relire par parse.
6. Rejouer les cinq compteurs (la règle neuve, les trois de 249i, les deux
   cliquets i18n) sur les deux arbres.
7. Committer avec `run tests` dans le SUJET.

## 3. Décisions prises, et pourquoi

| décision | alternative écartée | raison |
|---|---|---|
| rangée de 44 pt autour d'un trait de 5 pt | agrandir le trait | le trait EST le langage d'une barre de progression ; `UIPageControl` fait exactement cela |
| absorber les marges de l'hôte | poser la rangée par-dessus les marges | +36 pt sur un écran d'inscription, dont 36 pt de vide ; absorbées, +12 pt |
| pas de `padding` négatif | élargir sans coûter de place | la barre est à 8 pt du bouton « Retour » — la zone déborderait sur lui |
| `contentShape(Rectangle())` sur les pastilles | `Circle()` | la HIG mesure une AIRE de 44 × 44 ; l'espacement de 10 pt exclut tout chevauchement |
| nom positionnel | nom de la couleur | aucune couleur du dépôt n'a de nom court ; la position est ce que le lecteur cherche (précédent 242i) |
| garde de FORME + valeurs en tests unitaires | une garde qui lit aussi les valeurs | elle rougirait sur le disque de 52 pt du bouton « lire », qui est une cible valide |

## 4. Critère de fin

- Compteur « le dessin fait la cible » à **0** (3 sur `main`).
- Les trois compteurs de 249i restent à 0 ; catalogue reparsé, 0 orpheline,
  backlog non traduit inchangé.
- CI `iOS Tests` verte, **job `Build app + tests unitaires`** — nom relu avant
  couleur.

## 5. Risques

| risque | parade |
|---|---|
| une garde qui lit la source de `ComposerDocumentSurface.swift` casse à l'extraction | les trois `contains` de `ComposerSceneActivationTests` vérifiés à la main : `StoryBackgroundPalette.colors`, `onPickBackground?(`, `private var backgroundStrip` survivent |
| +12 pt sur l'entête d'inscription en Dynamic Type XXL | la rangée est un `minHeight`, elle grandit avec le contenu ; le `TabView` sous elle absorbe |
| deux doutes de compile | publiés au § 4.1 de l'analyse, à solder au retour de CI |
