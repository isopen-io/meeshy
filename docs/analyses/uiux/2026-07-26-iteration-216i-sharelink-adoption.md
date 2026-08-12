# iOS UI/UX — Iteration 216i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ShareLinkDetailView.swift`

**Axe** : Intégration native / HIG — adoption de `ShareLink`, compatibilité iPad
& multitâche, suppression d'un contrôle mort
**Base** : `main` HEAD `fefe559` (= 215i mergée, PR #2322)

## Contexte

215i a converti les **trois** sites de partage qui forgent leur lien de façon
**asynchrone** (`ConversationInfoSheet`, `InviteFriendsSheet`, + suppression du
chemin mort de `ConversationListView`) vers `.sheet(item:)` + `ShareSheet`.

Restaient **deux** sites impératifs dont l'URL est connue de façon
**synchrone**. Pour eux la bonne réponse n'est pas `.sheet(item:)` mais le
composant natif direct : **`ShareLink`** — exactement ce que
`CommunityLinkDetailView` fait déjà, et ce que la doctrine écrite dans ce même
fichier (l.67) réclame.

## Le défaut

Ces deux sites ancraient **correctement** le popover iPad (`sourceRect` centré +
`permittedArrowDirections = []`) — ce n'était donc pas le défaut A de 215i. Deux
autres problèmes subsistaient.

### A. Scène non déterministe (défaut B de 215i, non soldé ici)

Les deux résolvaient leur présentateur via
`UIApplication.shared.connectedScenes.first`. `connectedScenes` est un **`Set`
non ordonné** : en multitâche iPad / Stage Manager, `.first` peut renvoyer une
scène **en arrière-plan** → feuille présentée sur une fenêtre invisible, le
partage paraît muet. Ancrer le popover correctement ne sauve rien si la fenêtre
choisie n'est pas la bonne.

### B. Contrôle mort quand l'URL est invalide

```swift
Button {
    guard let link = token.affiliateLink, let url = URL(string: link) else { return }
    …
} label: { Image(systemName: "square.and.arrow.up") … }
.accessibilityLabel("Partager le lien de parrainage")
```

Si l'URL ne parse pas, le bouton reste **visible, activé, et annoncé par
VoiceOver** — puis ne fait rien. C'est un contrôle qui promet une action et n'en
tient aucune (WCAG : une affordance perceptible doit être opérable). Le `guard`
cachait l'indisponibilité dans l'action au lieu de l'exprimer dans la vue.

Même schéma dans `ShareLinkDetailView` (`guard let url = URL(string: link.joinUrl)
else { return }`).

## Correctifs (216i)

Adoption de `ShareLink`, patron `CommunityLinkDetailView` :

```swift
if let url = URL(string: link.joinUrl) {
    ShareLink(item: url) { actionButtonLabel(shareLabel, …) }
        .frame(maxWidth: .infinity)
        .accessibilityLabel(shareLabel)
} else {
    actionButtonLabel(shareLabel, …)
        .frame(maxWidth: .infinity)
        .opacity(0.4)
        .accessibilityHidden(true)
}
```

- **Le parcours de fenêtres disparaît** : SwiftUI ancre et route la feuille contre
  la scène de la vue présentatrice. Le helper `presentSheet(_:)` de
  `ShareLinkDetailView` (dont c'était le **seul** appelant) est supprimé.
- **L'indisponibilité devient un état de la vue** : affordance estompée et
  **retirée de VoiceOver** au lieu d'un bouton menteur.
- **`ShareLink` porte `.isButton` nativement** → pas de
  `.accessibilityAddTraits(.isButton)`, contrairement à ses trois voisins
  `actionButton` qui restent des `Button`.

### Extraction de label (dé-duplication)

`ShareLink` a besoin du **corps du label** seul. Le contenu de
`actionButton(_:icon:color:action:)` a donc été extrait dans
`actionButtonLabel(_:icon:color:)`, `actionButton` déléguant désormais à
l'extrait. Miroir exact du couple
`communityActionButton` / `communityActionButtonLabel` de
`CommunityLinkDetailView`. Les trois actions voisines (copier,
activer/désactiver, supprimer) passent toujours par `actionButton` → **rangée
visuellement inchangée**, ce qu'un test verrouille explicitement.

Dans `AffiliateView`, le bouton inline est remplacé par un builder
`shareTokenButton(_:)` + un glyphe partagé `shareTokenGlyph`.

**0 clé i18n neuve** (`affiliate.action.share` et `common.share` réutilisées
telles quelles). **0 couleur, 0 changement de layout** — mêmes glyphes, mêmes
cadres, même `frame(maxWidth: .infinity)`.

### Changement visuel assumé (cas limite)

Quand l'URL est invalide, l'affordance passe de « pleine opacité, tappable,
inerte » à « estompée à 0.4, non annoncée ». C'est le comportement du patron de
référence, et un cas limite (lien absent / malformé côté gateway).

## Hors périmètre

- **`StoryViewerView+Content.shareStory()`** — **dernier** site impératif de
  l'app. Reporté une seconde fois : l'état devrait vivre dans
  `StoryViewerView.swift` et la surface story reste **chaude** (essaim actif).
  Le test SSOT de 216i est délibérément limité aux 2 fichiers convergés et **ne
  doit pas** être élargi en balayage repo-wide avant que ce site soit traité.
- **`TrackingLinkDetailView`** — utilise **déjà** `ShareLink` pour ses deux URL
  (l.120/124) ; son chemin impératif restant partage le **QR code en image**
  (`UIImage`), ce qui demande un `Transferable` (`ShareLink(item:preview:)`) et
  non une URL. Cas distinct, itération dédiée.

## Test

`apps/ios/MeeshyTests/Unit/Views/NativeShareLinkAdoptionTests.swift` (neuf,
idiome source-introspection). 5 tests / 13 assertions :

1. `AffiliateView` partage via `ShareLink` et délègue à `shareTokenButton`.
2. `ShareLinkDetailView` partage via `ShareLink` ; `presentSheet` a disparu
   (assertion sur la source **sans commentaires** — le doc-comment nomme
   volontairement le helper supprimé pour expliquer son défaut).
3. **Cas indisponible** : `.opacity(0.4)` **et** `.accessibilityHidden(true)`
   présents dans la fenêtre de 900 caractères qui suit le `ShareLink`.
   Assertion **ancrée** : ces deux modificateurs existent ailleurs dans les deux
   fichiers, un `contains` global aurait été vert même sans la branche `else`.
4. **Non-régression de l'extraction** : `actionButton` **et** `actionButtonLabel`
   existent, `actionButton` rend bien l'extrait (assertion sur la chaîne
   multi-ligne exacte), et le `ShareLink` réutilise le même builder.
5. **Verrou SSOT** : ni `UIActivityViewController(`, ni
   `popoverPresentationController`, ni `connectedScenes` dans les 2 fichiers
   (lignes de commentaire exclues).

**RED prouvé** : 13 assertions échouent contre `main` `fefe559`. **GREEN** :
13/13 après correctif. Deux pièges rencontrés et corrigés **avant** de pousser —
l'assertion `presentSheet` lisait la source brute (le doc-comment la faisait
échouer), et la fenêtre d'ancrage de 600 caractères tombait 3 caractères trop
court sur `ShareLinkDetailView` (repli à 603/633).

## Vérification

- Pas de toolchain Swift (Linux) → assertions vérifiées **déterministement** par
  correspondance de chaînes ; équilibre des accolades des 2 fichiers contrôlé au
  tokenizer (chaînes retirées **avant** les commentaires) : **0**. Gate réel =
  CI `iOS Tests`, qui exécute `xcodegen generate` → test neuf enregistré
  automatiquement, **0 édition de `project.pbxproj`**.
- Collision essaim : 11 PR ouvertes, dont **2 iOS** (#2319, #2275) — aucune ne
  touche `AffiliateView.swift` ni `ShareLinkDetailView.swift`.

## Bilan

**2 fichiers de production : +80 / −54 lignes.** 2 copies du parcours de fenêtres
supprimées (il n'en reste **1** dans toute l'app), 1 helper mort supprimé,
2 contrôles morts rendus honnêtes, 1 label dé-dupliqué. 0 clé i18n, 0 couleur,
0 layout.
