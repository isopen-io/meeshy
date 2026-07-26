# Plan — iOS UI/UX Iteration 218i

**Objet** : migrer le **dernier** `NavigationView` de l'application
(`StatusComposerView`) vers `NavigationStack`, et convertir le balayage de 214i
d'une liste de dette tolérée en **invariant absolu**.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-218i-navigationview-debt-closed.md`
**Base** : `main` HEAD `ffef133` · **Branche** : `claude/quirky-curie-6kr79r`
**Numérotation** : 218i, strictement > 217i (mergée #2326) — **0 PR ouverte**

## Sélection de la cible

L'essaim s'est entièrement vidé (#2326, #2325, #2319, #2275 toutes mergées), donc
les trois pistes de 217i étaient débloquées. Deux ne tenaient plus :

- **(a) couple `maxPreviewHeight`** — **périmée** : `MessageOverlayMenu` porte
  désormais une constante `320` (plus de couplage), et `MessageListView` a été
  migré vers un helper SSOT neuf `DeviceLayout.windowSize` par un autre agent.
  Rien à faire.
- **(c) i18n `MeeshyShareExtension`** — câbler un catalogue de chaînes à une
  cible qui n'en a aucun est un chantier, pas une itération.
- **(b) `StatusComposerView`** — prenable, et c'est le **dernier**
  `NavigationView` de l'app, avec un dispositif laissé exprès par 214i.

## Étapes

- [x] Resync : branche recréée depuis `origin/main` (217i mergée → travail neuf)
- [x] Collision essaim : `list_pull_requests` → **0 PR ouverte**
- [x] Requalifier les 3 pistes héritées ; 2 périmées, 1 retenue
- [x] Prouver le défaut concret : 3 sites d'appel en `.sheet` (form sheet iPad =
      largeur *regular*) + les 2 seuls contrôles sont des `ToolbarItem`
- [x] Prouver la migration sans effet de bord : 0 `NavigationLink` /
      `navigationDestination` / `navigationViewStyle` / `navigationBarItems`
- [x] `NavigationView {` → `NavigationStack {`
- [x] Test par fichier `test_statusComposer_usesNavigationStack`
- [x] Balayage : `test_noUnexpectedNavigationViewRemains` →
      `test_noNavigationViewRemains`, attendu réduit à `[]`
- [x] Vérifier 0 occurrence restante (2 variantes d'espacement) sur les 3 cibles
- [x] Équilibre accolades/parenthèses/crochets au tokenizer (0/0/0)
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Honorer le contrat de 214i plutôt que le contourner.** 214i avait écrit noir
sur blanc que son balayage échouerait dès la migration du dernier fichier, « ce
qui est l'effet recherché ». La tentation aurait été de simplement retirer
l'entrée. Le geste correct est de changer la **nature** de l'assertion : ce
n'est plus une dette avec une entrée, c'est un invariant à zéro.

**Garder une comparaison d'ensembles, pas un `isEmpty`.** `XCTAssertTrue(set.isEmpty)`
dirait seulement « il reste un fautif ». La comparaison à `[]` fait apparaître
**le nom du fichier** dans le diff d'échec. Le coût est nul, l'information
diagnostique ne l'est pas.

**Ne pas élargir le balayage au SDK.** `MeeshyUI` porte encore 5
`NavigationView`, mais cette routine est *iOS app only*. Les inclure ferait
échouer le test sur du code hors périmètre, et transformerait un invariant net
en dette rouge permanente.

**Ne pas en profiter pour poser un `navigationTitle` ailleurs.** 214i avait
identifié `VoiceProfileManageView.addSamplesSheet` comme candidat, en notant que
cela **change le visuel** → itération dédiée. Cette contrainte reste valable ;
218i ne la contourne pas.

## Non fait (et pourquoi)

- SDK `MeeshyUI` (5 `NavigationView`) : hors périmètre routine.
- `.navigationTitle` sur `addSamplesSheet` : changement visuel → itération dédiée.
- i18n `MeeshyShareExtension` : chantier à part entière.
- Reste des `UIScreen.main` : voir « Piste 219i+ » de l'analyse, avec le tri déjà
  fait entre défauts réels, choix délibérés et non-défauts.

## Suite (219i+)

1. `AudioFullscreenView:163`, `ReelFeedCard:157`, `ConversationListView:437-438`
   → converger sur `DeviceLayout.windowSize` (helper SSOT désormais disponible).
2. `.navigationTitle` sur `VoiceProfileManageView.addSamplesSheet`.
3. i18n de `MeeshyShareExtension`.
