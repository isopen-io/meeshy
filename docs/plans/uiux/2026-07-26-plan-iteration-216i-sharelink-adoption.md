# Plan — iOS UI/UX Iteration 216i

**Objet** : finir la convergence du partage — adopter `ShareLink` natif sur les
deux sites dont l'URL est connue de façon synchrone.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-216i-sharelink-adoption.md`
**Base** : `main` HEAD `fefe559` · **Branche** : `claude/quirky-curie-vjj2u6`
**Numérotation** : 216i, strictement > 215i (mergée, #2322)

## Étapes

- [x] 215i mergée (#2322, squash `fefe559`) — CI 16/16 verte, `mergeable_state: clean`
- [x] Resync : branche repartie de `origin/main` `fefe559` (l'historique 215i mergé
      n'est plus empilé sur la branche)
- [x] Collision essaim : 11 PR ouvertes, 2 iOS (#2319, #2275) → aucun fichier commun
- [x] `AffiliateView` : `shareTokenButton(_:)` + `shareTokenGlyph`, `ShareLink(item:)`
- [x] `ShareLinkDetailView` : extraction `actionButtonLabel(_:icon:color:)`,
      `shareActionButton` en `ShareLink`, suppression de `presentSheet(_:)`
- [x] Branche indisponible : affordance estompée + `accessibilityHidden` au lieu
      d'un bouton inerte
- [x] Test neuf `NativeShareLinkAdoptionTests` (5 tests / 13 assertions)
- [x] RED prouvé contre `main` (13/13 échouent), GREEN après correctif
- [x] Accolades des 2 fichiers vérifiées au tokenizer
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**`ShareLink` ici, `.sheet(item:)` en 215i — le critère est la synchronicité.**
`ShareLink` exige son item à la construction de la vue. Les 3 sites de 215i
forgeaient le lien par appel gateway → `.sheet(item:)` était obligatoire. Ces 2
sites connaissent leur URL immédiatement → `ShareLink` est plus simple, plus
natif, et supprime davantage de code. Même objectif, deux outils, critère net.

**Extraire le label plutôt que dupliquer le style.** `ShareLink` a besoin du corps
du label seul. Plutôt que recopier le `VStack`/`ZStack`/`Text` de `actionButton`,
son contenu est extrait dans `actionButtonLabel` et `actionButton` délègue —
miroir du couple déjà en place dans `CommunityLinkDetailView`. Un test verrouille
la délégation pour que la rangée de 4 actions ne perde pas son uniformité.

**Corriger le contrôle mort au passage, pas dans une itération séparée.** Le
`guard … else { return }` devenait de toute façon un `if let` pour `ShareLink` :
exprimer l'indisponibilité dans la vue était le chemin naturel, pas un ajout de
périmètre.

**Ne pas élargir le verrou SSOT en balayage repo-wide.** Il reste **un** site
impératif (`StoryViewerView+Content`). Un sweep global échouerait aujourd'hui ; le
test est donc scopé aux 2 fichiers convergés, et l'analyse dit explicitement de
ne l'élargir qu'après le dernier site.

## Suites (217i+)

1. **`StoryViewerView+Content.shareStory()`** — dernier site impératif, reporté
   deux fois (surface story chaude, état à porter dans `StoryViewerView.swift`).
   Une fois soldé : élargir le verrou SSOT en balayage repo-wide.
2. `TrackingLinkDetailView` — partage du **QR code image** ; demande
   `ShareLink(item:preview:)` sur un `Transferable`, pas une URL.
3. `sensoryFeedback` (iOS 17+) : **0 usage** contre 11 `UIImpactFeedbackGenerator`
   — adoption native avec garde de disponibilité.
4. `UniversalComposerBar.toolbarButton` / `ThemedComposerButton` — label a11y de
   composants réutilisables sans call-site (priorité basse).
5. `MeeshyShareExtension` sans `Localizable.xcstrings` propre → 3 chaînes brutes.
