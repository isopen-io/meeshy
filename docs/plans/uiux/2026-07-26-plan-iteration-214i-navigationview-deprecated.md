# Plan — iOS UI/UX Iteration 214i

**Objet** : sortir les cibles app iOS du conteneur de navigation déprécié
`NavigationView` (iOS 16+) au profit de `NavigationStack`.

**Base** : `main` HEAD `b41c95b` · **Branche** : `claude/quirky-curie-a2ves5`

## Sélection de la cible

1. `list_pull_requests` (open) → **1 seule PR iOS en vol** : #2275 (213i,
   `StatusComposerView`). Numéro **214i** choisi strictement > 213i.
2. Piste héritée de #2275 : « migration `NavigationView` → `NavigationStack` de
   `StatusComposerView` ». Le balayage montre que le défaut couvre **4 fichiers**,
   pas un.
3. `StatusComposerView.swift` est détenu par #2275 → **exclu** (collision).
   Les 3 autres sites app sont absents de toute PR ouverte → 0 collision.
4. Les 5 `NavigationView` du SDK sont **hors périmètre** (routine iOS app only).

## Étapes

| # | Action | Statut |
|---|---|---|
| 1 | Resync : branche recréée depuis `origin/main` (l'ancien commit portait #2318, déjà mergé) | ✅ |
| 2 | Balayage `NavigationView` sur les 3 cibles app + SDK ; qualification du défaut iPad | ✅ |
| 3 | Vérifier plancher iOS 16.0 → pas de garde `@available` | ✅ |
| 4 | Vérifier absence de `NavigationLink` / `navigationDestination` / `navigationViewStyle` dans les 3 cibles (migration sans effet de bord) | ✅ |
| 5 | `EmojiPickerSheet.swift` → `NavigationStack` | ✅ |
| 6 | `VoiceProfileManageView.addSamplesSheet` → `NavigationStack` | ✅ |
| 7 | `MeeshyShareExtension/ShareViewController.swift` → `NavigationStack` | ✅ |
| 8 | Test de balayage + par-fichier (`NavigationContainerMigrationTests`) | ✅ |
| 9 | Vérification déterministe hors Xcode des assertions | ✅ |
| 10 | Analyse + plan + tracking | ✅ |
| 11 | Commit + push + PR | ✅ |

## Contraintes respectées

- **Aucun redesign** : substitution de conteneur, corps de vue intact.
- **Aucun changement visuel sur iPhone** (largeur compacte : rendu identique).
- **0 clé i18n**, 0 couleur, 0 logique, 0 réseau.
- **Compatibilité** : `NavigationStack` disponible dès iOS 16, égal au plancher —
  aucune régression sur les versions supportées, aucune duplication de logique.
- **Anti-collision** : le seul fichier en vol dans l'essaim est écarté.

## Non fait (et pourquoi)

- `StatusComposerView` : fichier en vol dans #2275.
- `packages/MeeshySDK/**` : hors périmètre de la routine iOS.
- `.navigationTitle` sur `addSamplesSheet` : changement visuel → itération dédiée.
- i18n de `MeeshyShareExtension` : la cible n'a pas de catalogue de chaînes,
  chantier à part entière.

## Suite (215i)

Migrer `StatusComposerView` dès #2275 résolue, puis réduire l'attendu du
balayage à l'ensemble vide — le test échouera tant que ce n'est pas fait, ce qui
est l'effet recherché.
