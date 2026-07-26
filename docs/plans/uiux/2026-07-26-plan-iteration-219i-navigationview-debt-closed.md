# Plan — iOS UI/UX Iteration 219i

**Objet** : migrer le **dernier** `NavigationView` des cibles app
(`StatusComposerView`) vers `NavigationStack`, et faire tomber à l'ensemble vide
l'attendu du balayage que 214i avait conçu pour échouer ce jour-là.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-219i-navigationview-debt-closed.md`
**Base** : `main` HEAD `ffef1339e` · **Branche** : `claude/quirky-curie-mlmono`
**Numérotation** : 219i, strictement > 218i (mergée #2330, la plus haute)

## Sélection de la cible

L'essaim s'est **entièrement vidé** (`list_pull_requests` open = **0 PR**), ce
qui débloque les pistes 218i qui étaient détenues par des PR en vol. Parmi
elles, `StatusComposerView` est retenue parce qu'elle **solde une dette
entière** au lieu d'en grignoter une, et parce que 214i avait laissé un test qui
échoue tant que la clôture n'est pas actée.

## Étapes

- [x] Resync : branche recréée depuis `origin/main` (218i mergée → « PR mergée = travail neuf »)
- [x] Vérifier que 218i a bien atterri dans `main` (`DeviceLayout.windowSize` + `BubbleWindowMetricsTests`)
- [x] Collision essaim : 0 PR ouverte
- [x] Confirmer que `StatusComposerView` est le **seul** `NavigationView` restant des 3 cibles app
- [x] Qualifier le défaut : 3 sites d'appel, tous en `.sheet` → form sheet iPad = largeur regular
- [x] Prouver la migration sans effet de bord (0 `NavigationLink` / `navigationDestination` / `navigationViewStyle` / `navigationBarItems`)
- [x] `NavigationView {` → `NavigationStack {`
- [x] Test : assertion par fichier pour le dernier migré + attendu du balayage → `[]` + renommage du test (il change de rôle)
- [x] RED prouvé contre `main` (3/3), GREEN après correctif
- [x] Balayage rejoué hors Xcode sur l'arbre courant (0) et sur `main` (`{StatusComposerView.swift}`)
- [x] Équilibre accolades/parenthèses au tokenizer (0/0)
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Solder la dette plutôt que la réduire.** Le choix de cible ne vient pas d'un
balayage neuf mais d'un test existant : 214i avait écrit noir sur blanc que son
attendu « drops to the empty set and the test fails until it is updated — which
is the intent ». Honorer cette intention est plus utile qu'ouvrir un front de
plus.

**Le test change de rôle, donc de nom.** Tant qu'il restait un arriéré,
`test_noUnexpectedNavigationViewRemains` suivait un ensemble qui rétrécit. À
vide, il devient un **cliquet** contre la réintroduction du conteneur déprécié :
`test_noNavigationViewRemains`. Garder l'ancien nom aurait laissé croire qu'une
dette subsiste.

**Étendre le fichier de test, pas en créer un.** La règle est unique, son verrou
doit l'être — même doctrine que l'extension de `NativeSharePresentationTests` en
216i.

**Ne pas toucher au SDK.** Les 5 `NavigationView` de `MeeshyUI` sont hors
périmètre de cette routine (iOS app only) et hors du balayage du test. Les
migrer ici mélangerait deux pistes et deux régimes de revue.

**Ne pas ajouter `.navigationTitle` à `addSamplesSheet`** (noté par 214i) : cela
**change le visuel**, ce qui mérite son itération.

## Non fait (et pourquoi)

- `packages/MeeshySDK/**` : hors périmètre routine iOS.
- i18n de `MeeshyShareExtension` : chantier de cible (câbler un catalogue de
  chaînes), pas une itération UI/UX.
- Convergence des key windows (piste 218i (a)) : `StoryViewerView` reste chaud ;
  itération dédiée.

## Suite (220i+)

1. Convergence des 5 résolutions de key window sur `DeviceLayout.windowSize`
   (SSOT posé en 218i), non-story d'abord.
2. `sensoryFeedback` (iOS 17+) : 0 usage contre 11 `UIImpactFeedbackGenerator`.
3. `Localizable.xcstrings` pour `MeeshyShareExtension`.
4. `.navigationTitle` de `VoiceProfileManageView.addSamplesSheet`.
