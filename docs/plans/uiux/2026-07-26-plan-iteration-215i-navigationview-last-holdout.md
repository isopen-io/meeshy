# Plan — iOS UI/UX Iteration 215i

**Objet** : migrer le **dernier** `NavigationView` des cibles app iOS et fermer
la garde de balayage ouverte en 214i.

**Base** : `main` HEAD `ffef1339e` · **Branche** : `claude/quirky-curie-a2ves5`
(recréée depuis `origin/main` — la PR #2319 de cette branche est mergée, donc
travail neuf).

## Sélection de la cible

1. **214i mergée** (PR #2319, `26b8ef1d8`) — elle avait épinglé `StatusComposerView`
   comme unique fichier restant.
2. **#2275 mergée** (`131f7939e`) — le blocage qui interdisait de toucher ce
   fichier en 214i a disparu.
3. `list_pull_requests` (open) → **0 PR ouverte**. Aucune collision possible.
4. Numéro **215i** choisi strictement > 214i (plus haut mergé).

## Étapes

| # | Action | Statut |
|---|---|---|
| 1 | Resync : branche recréée depuis `origin/main` après merge de #2319 | ✅ |
| 2 | Confirmer que #2275 est mergée et que `StatusComposerView` est libre | ✅ |
| 3 | Confirmer 0 PR ouverte (essaim vide) | ✅ |
| 4 | Vérifier absence de `NavigationLink` / `navigationDestination` / `navigationViewStyle` / `navigationBarItems` | ✅ |
| 5 | `StatusComposerView` → `NavigationStack` | ✅ |
| 6 | Ajouter `test_statusComposer_usesNavigationStack` | ✅ |
| 7 | Réduire l'attendu du balayage à l'ensemble vide + renommer le test | ✅ |
| 8 | Vérification déterministe hors Xcode | ✅ |
| 9 | Analyse + plan + tracking (dont clôture 214i) | ✅ |
| 10 | Commit + push + PR | ✅ |

## Contraintes respectées

- **Aucun redesign** : substitution de conteneur, corps de vue intact.
- **Aucun changement visuel sur iPhone**.
- **0 clé i18n**, 0 couleur, 0 logique, 0 réseau.
- **Compatibilité** : `NavigationStack` disponible dès iOS 16 = plancher exact.
- **A11y préservée** : les deux `.accessibilityHidden(true)` de 213i intacts.
- **Anti-collision** : essaim vide, vérifié avant de commencer.

## Non fait (et pourquoi)

- `packages/MeeshySDK/**` (5 `NavigationView`) : hors périmètre routine iOS app.
- `.navigationTitle` sur `addSamplesSheet` : changement visuel → itération dédiée.
- i18n de `MeeshyShareExtension` : la cible n'a pas de catalogue de chaînes.

## Suite (216i)

La poche `NavigationView` des cibles app est **close** (0 restant, garde en
place). Pistes 216i+ listées dans l'analyse : piste SDK, catalogue de chaînes de
l'extension de partage, titre du sheet d'échantillons vocaux, et audit des
gardes d'introspection ancrées sur une signature complète (cf. incident
`dismissGroupIntro`).
