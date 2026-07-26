# Plan — iOS UI/UX Iteration 216i

**Objet** : achever la convergence du partage système sur les composants
first-party — `ShareLink` quand l'item est synchrone, `.sheet(item:)` quand il
est forgé au tap — et supprimer les 3 derniers parcours manuels de la hiérarchie
de fenêtres hors surface story.

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-216i-native-sharelink-convergence.md`
**Base** : `main` HEAD `fefe559` · **Branche** : `claude/quirky-curie-gxwr9m`
**Numérotation** : 216i, strictement > 215i (mergée #2322) et > 214i (#2319, en vol)

## Étapes

- [x] Resync : branche assignée recréée depuis `origin/main` (son commit
      précédent portait 215i, déjà mergée via #2322 → « PR mergée = travail neuf »)
- [x] Collision essaim : `list_pull_requests` (open, 11 PR) → 2 PR iOS, aucun
      fichier commun avec les 3 cibles
- [x] `ShareLinkDetailView` : `actionButtonLabel` extrait, `shareActionButton`
      sur `ShareLink`, `presentSheet(_:)` supprimé
- [x] `AffiliateView` : `shareTokenButton(_:)` sur `ShareLink` + branche
      désactivée quand le lien n'est pas encore forgé, `shareGlyph` extrait,
      `.disabled` posé aussi sur Copier
- [x] `TrackingLinkDetailView` : `QRShareImage` + `.sheet(item:)` + `ShareSheet`,
      `presentVC(_:)` supprimé
- [x] Test : `NativeSharePresentationTests` **étendu** (3 tests neufs,
      `convergedFiles` 3 → 6 fichiers = verrou SSOT étendu)
- [x] RED prouvé contre `main` (19/19 assertions neuves rouges), GREEN après correctif
- [x] Équilibre accolades/parenthèses des 4 fichiers vérifié au tokenizer
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**`ShareLink` pour les 2 items synchrones, `.sheet(item:)` pour le QR.** Ce n'est
pas une hésitation : `ShareLink` exige son item à la construction de la vue. Le
lien de partage et le lien de parrainage sont de simples propriétés du modèle →
`ShareLink`, zéro état. Le QR est un bitmap rendu au tap (`CIQRCodeGenerator`) :
le porter dans `ShareLink` reviendrait à le re-rendre à chaque évaluation du
`body` → `.sheet(item:)`, le patron que 215i a établi pour les items différés.

**Ne pas factoriser un helper de partage.** Même raisonnement qu'en 215i :
extraire les parcours de fenêtres dans un `ActivitySheetPresenter` commun aurait
pérennisé l'anti-patron que le dépôt rejette explicitement. Les composants
Apple suppriment le code au lieu de le centraliser.

**Désactiver plutôt que masquer les contrôles sans lien.** Sur un token dont
`affiliateLink` est `nil`, Copier et Partager étaient actifs et sans effet.
Les masquer ferait sauter la ligne quand le lien arrive ; `.disabled` garde la
métrique de la ligne stable, estompe le contrôle et fait annoncer « dimmed » par
VoiceOver — la sémantique native d'une action indisponible.

**Étendre le fichier de test de 215i, pas en créer un.** La doctrine est une
seule règle ; son verrou doit être un seul fichier. `convergedFiles` devient la
liste des surfaces soldées : l'ajout d'une entrée est le geste par lequel une
itération enregistre qu'une surface est convergée.

## Suites (217i+)

1. `StoryViewerView+Content.shareStory()` — dernier parcours de fenêtres de
   l'app, à traiter quand la surface story refroidit (l'état doit être porté
   dans `StoryViewerView.swift`).
2. `UniversalComposerBar.toolbarButton` / `ThemedComposerButton` — label a11y de
   composants réutilisables sans call-site actuel (priorité basse, hérité de 214i).
3. `MeeshyShareExtension` sans `Localizable.xcstrings` propre → 3 chaînes brutes
   (`"Cancel"`, `"Send"`, `"Share to Meeshy"`), noté par #2319.
