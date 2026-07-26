# Plan — iOS UI/UX Iteration 220i

**Objet** : fermer les deux marqueurs de dette que 214i et 219i ont
délibérément laissés ouverts, désormais payables.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-220i-last-navigationview-and-dead-share.md`
**Base** : `main` HEAD `ffef1339e` · **Branche** : `claude/quirky-curie-x6tws7`
**Numérotation** : 220i, strictement > 219i (mergée #2332)

## Sélection de la cible

Les 5 PR iOS en vol lors de 219i sont **toutes mergées** (#2275, #2319, #2325,
#2330, #2332) — **0 PR ouverte** sur le dépôt. Les deux dettes bloquées par une
détention de fichier tierce deviennent payables **le même jour**, et leurs
marqueurs sont écrits pour rendre leur clôture obligatoire :

| Dette | Posée par | Bloquée par | Débloquée par |
|---|---|---|---|
| Dernier `NavigationView` (`StatusComposerView`) | 214i | #2275 | #2275 mergée |
| Dernière présentation impérative (`shareStory()`) | 215i→219i | surface story chaude + #2325 | PR story mergées |

## Étapes

- [x] Resync : branche recréée depuis `origin/main` (`ffef1339e`) — #2332 mergée
- [x] Collision essaim : **0 PR ouverte**
- [x] Vérifier que `StatusComposerView` est un conteneur mono-colonne pur
      (0 `NavigationLink` / `navigationDestination` / `navigationViewStyle` / `navigationBarItems`)
- [x] `NavigationView {` → `NavigationStack {`
- [x] Vérifier `shareStory()` sans appelant sur `apps/ios/` **et** `packages/MeeshySDK/`
- [x] Supprimer `shareStory()`, laisser un commentaire qui explique l'absence
- [x] `NavigationContainerMigrationTests` : +1 test positif, expectation → ∅
- [x] `StoryExportShareSheetPaletteTests` : inclusion → égalité, +1 test de non-retour
- [x] Rectifier le doc-comment devenu faux de `NativeShareLinkAdoptionTests`
- [x] Rejouer les 4 assertions hors Xcode : 4/4 GREEN worktree, 4/4 RED sur `origin/main`
- [x] Équilibre accolades/parenthèses/crochets au tokenizer sur 5 fichiers (0/0/0)
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Fermer deux dettes plutôt qu'en ouvrir une.** Le jour où l'essaim vide sa file
est précisément celui où les marqueurs bloqués deviennent payables ; les laisser
ouverts une itération de plus, c'est risquer qu'un nouveau `NavigationView` ou un
nouveau pont dupliqué s'installe pendant que la garde reste desserrée.

**Faire tomber l'expectation à ∅ plutôt que supprimer le test.** 214i a écrit un
ensemble épinglé *pour* qu'il échoue à la clôture. Une fois vide, le test ne
disparaît pas : il devient un garde pur qui nomme tout `NavigationView`
réintroduit. Même geste pour l'égalité SSOT de 219i.

**Interdire la forme, pas seulement le nom.** Le test de non-retour de
`shareStory()` assert aussi l'absence de `connectedScenes` dans le fichier :
réécrire la même remontée de fenêtres sous un autre nom serait le vrai risque de
régression, et un garde sur `func shareStory` seul ne l'attraperait pas.

**Rectifier le commentaire faux.** 218i a établi ce précédent. Un doc-comment qui
annonce « le seul site impératif restant est X » alors que X n'existe plus
oriente mal la prochaine itération — c'est un coût réel, pas de la cosmétique.

**Ne pas enchaîner sur l'audit Dark Mode dans la même itération.** Il est la
piste la plus riche et il est désormais libre, mais c'est un chantier
d'exploration : le mêler à une clôture de dette mécanique brouillerait les deux.

## Non fait (et pourquoi)

- **Audit Dark Mode généralisé** : chantier à part entière → 221i.
- **`MeeshyShareExtension` i18n** : câbler un catalogue de chaînes à une cible
  est un chantier distinct, désormais débloqué → 221i+.
- **`VoiceProfileManageView.addSamplesSheet` `.navigationTitle`** : change le
  visuel → itération dédiée (piste 214i).

## Suite (221i+)

1. **Audit Dark Mode généralisé** — avec les deux pièges hérités de 219i :
   beaucoup de `MeeshyColors.indigoNNN` sont posés sur des fonds thématisés et
   sont **corrects** ; toute surface sous `StoryViewerView` doit se brancher sur
   `colorScheme`, **jamais** sur `ThemeManager.mode`.
2. `Localizable.xcstrings` pour `MeeshyShareExtension` (3 chaînes crues).
3. `sensoryFeedback` (iOS 17+) : 0 usage contre 11 `UIImpactFeedbackGenerator`.
4. Convergence des 5 résolutions de key window restantes sur `DeviceLayout.windowSize`.
