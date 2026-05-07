# Brief — Visual UI Tests pour iOS (future session dédiée)

**Date** : 2026-05-07
**Status** : Brief en attente de session dédiée
**Précédent** : Phase I de `2026-05-07-story-notifications-ux-design.md` a choisi **option B** (tests d'intégration XCTest) faute de target XCUITests existant. Cette dette est ici tracée.

## Pourquoi ce brief ?

Aujourd'hui, le projet n'a aucun target XCUITests (audit du 2026-05-07 confirme : zéro match "MeeshyUITests" dans `project.pbxproj`, un seul scheme partagé `Meeshy.xcscheme`). La couverture visuelle réelle (rendu pixel, animations, accessibilité) repose donc uniquement sur :

- des tests d'intégration en `MeeshyTests` qui simulent les seams logiques (Phase I de la feature stories notifications),
- un test à la main sur device par le développeur après chaque change majeur.

Plusieurs surfaces gagneraient à être couvertes par des tests visuels automatisés :

- **Story notification flows** (Phase I option B couvre les seams ; le rendu effectif n'est pas vérifié).
- **Reply banner persistence** (test d'intégration valide la state ; pas la disparition visuelle).
- **Story canvas reader sheets** (commentaires + viewers — geste de présentation, animations).
- **Theme switching** (light/dark, accent colors par conversation).
- **Accessibility / VoiceOver** (passes WCAG, label conformance).
- **Onboarding flow**, **composer states**, **story expired screen** (rendu, contraste, font scaling).

## Estimations vs valeur

### Option 1 — Vrai target XCUITests + scénarios scriptés

**Coût initial** : 3-5h pour le setup (mutations `project.pbxproj`, scheme, instrumentation app, accessibility identifiers).

**Coût par scénario** : 30-60 min (boilerplate + flakyness à apprivoiser).

**Maintenance** : élevée. Animations, races, simulateur lent, échecs intermittents. Demande discipline du test author (waitForExistence vs sleep, no implicit timing).

**Valeur** : niveau utilisateur final, couvre les scénarios end-to-end. Idéal pour QA pipeline et tests d'acceptation.

### Option 2 — Snapshot testing (`pointfreeco/swift-snapshot-testing`)

**Coût initial** : ~2h (ajout SwiftPM dépendance, helper de configuration, capture initial des snapshots de référence).

**Coût par scénario** : 5-15 min (juste une fonction `assertSnapshot(of: view, as: .image)`).

**Maintenance** : faible si on isole les sources de variabilité (date stub, locale stub, thème fixé). Diff visuel automatique en cas de régression.

**Valeur** : couvre le rendu PNG de chaque vue, détecte régressions visuelles (couleurs, espacements, fonts). Limité aux états statiques (pas d'animations).

### Option 3 — Hybride (recommandé pour la future session)

- **Snapshot testing pour le rendu** (Option 2). Ajouté progressivement, par feature.
- **XCUITests pour les flows critiques** (Option 1). Très ciblé : login, onboarding, premier message envoyé. Pas pour tout.
- **Tests d'intégration XCTest** (déjà en place) restent la couverture des seams logiques.

## Ce qu'il faudra décider en session dédiée

1. **Snapshot testing en priorité ?** Ou XCUITests ?
2. **Scope initial** : combien de surfaces couvrir au launch (5 ? 20 ?). Critère : valeur utilisateur × stabilité du rendu.
3. **Stratégie d'isolation** des sources de variabilité (Date.now stub, locale fixée, thème forcé, taille de simulateur fixe, fontes fixes).
4. **CI integration** : où s'exécutent les tests (par PR ? nightly ? release-only ?). Coût CI vs ROI.
5. **Failure policy** : un test qui flunk bloque-t-il le PR ? `XCTSkip` éphémère ?
6. **Update workflow** : qui valide une nouvelle référence de snapshot quand on change le rendu intentionnellement ? UI gate dans la PR ?

## Surfaces candidates au launch (priorisation préliminaire)

| Surface | Tier | Justification |
|---------|------|---------------|
| `StoryExpiredContent` (4 variantes : reaction/comment × light/dark) | T1 | Nouveau, contraste foreground/background calculé runtime — risque de régression élevé |
| `StoryNotificationLoadingView` | T1 | Skeleton ; doit toujours être lisible |
| `StoryNotificationTargetScreen` (states `.loading`, `.expired`) | T1 | Switch sur LoadState — protection contre régression |
| `MessageBubble` (text/audio/attachments) | T1 | Critique du flow chat |
| `ConversationView` reply banner | T1 | Bug récemment corrigé — protection contre récidive |
| `StoryComposerView` selected backgrounds | T2 | Visual identity, rare régression |
| `OnboardingFlow` | T2 | Funnel acquisition |
| `Theme accent` par conversation | T3 | Nice-to-have visuel |

## Coûts estimés pour le launch (Option 3 hybride)

| Phase | Effort | Output |
|-------|--------|--------|
| Setup snapshot testing (SwiftPM dépendance + helper de config) | 2h | Infra prête |
| Snapshots T1 (8 scénarios × 2 thèmes) | 3h | 16 références |
| Setup XCUITests target | 4h | Target opérationnel |
| 3 scénarios XCUITests acceptance critiques | 3h | login + send + story-tap |
| Documentation contrib (qui valide quoi) | 1h | Guide contributeurs |
| **Total session dédiée** | **~13h** | Couverture T1 visuelle + 3 acceptance |

## Pré-requis avant la session

1. **Stabiliser les surfaces T1** — ne pas démarrer si on prévoit refonte UI imminente.
2. **Identifier un mainteneur** (interne) du baseline visuel.
3. **Décider de l'inclusion CI** dès le départ (pour pas subir le coût après coup).
4. **Aligner sur la grille de tests** : un test par variante d'état, ou tableau de variantes ?

## Risques connus

- **Snapshot drift** : changements légers de SDK iOS provoquent des diffs minimes (1px) → bruit. Mitigation : `precision: 0.99` dans assertSnapshot.
- **XCUITest flaky** : timing simulator. Mitigation stricte : éviter `sleep`, utiliser `waitForExistence` partout, désactiver animations dans launch arguments.
- **Localisation** : tests en FR (locale primaire) ; vérifier qu'ils passent en EN aussi (langue secondaire CI).
- **Coût simulator** : XCUITest lance simulateur dédié, ~2-5GB RAM. Eviter en parallèle avec d'autres jobs.

## Action items pour la session dédiée

1. [ ] Brainstormer Option 1 vs 2 vs 3 (réutiliser ce brief comme entrée).
2. [ ] Décider stratégie d'isolation (date/locale/thème/fonts).
3. [ ] Setup `swift-snapshot-testing` (si Option 2 ou 3).
4. [ ] Setup `MeeshyUITests` target (si Option 1 ou 3).
5. [ ] Scoper la liste T1 finale (≤ 10 surfaces).
6. [ ] Décider CI integration policy.
7. [ ] Capturer les premiers snapshots de référence (si Option 2 ou 3).
8. [ ] Premier scénario XCUITest acceptance critique (si Option 1 ou 3).
9. [ ] Documentation contributeur.

## Liens

- Spec parent : `docs/superpowers/specs/2026-05-07-story-notifications-ux-design.md` (Phase I option B)
- Plan parent : `docs/superpowers/plans/2026-05-07-story-notifications-ux.md` (Phase I tasks)
- swift-snapshot-testing : https://github.com/pointfreeco/swift-snapshot-testing
- XCUITest docs : https://developer.apple.com/documentation/xctest/user_interface_tests
