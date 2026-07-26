# iOS UI/UX — Iteration 215i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`
- `apps/ios/Meeshy/Features/Main/Components/InviteFriendsSheet.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift`

**Axe** : Intégration native / HIG — présentation de la feuille de partage système,
compatibilité iPad & multitâche, dé-duplication (SSOT)
**Base** : `main` HEAD `208daa5`

## Pourquoi cette itération (état de l'audit)

Les classes de défauts habituelles de la série sont **épuisées** sur les cibles
faciles. Balayages exécutés sur `apps/ios/Meeshy` avant de choisir :

| Classe auditée | Résultat |
|---|---|
| Boutons icône-seule sans `.accessibilityLabel` | **1 seul** reste (`UniversalComposerBar.toolbarButton`, composant réutilisable **sans call-site**) — déjà noté « priorité basse » au pointeur 214i |
| Chaînes utilisateur non localisées (`Text("littéral")`) | 11 occurrences, **toutes légitimes** : 4 sont des `LocalizedStringKey` dont les clés existent bien dans le catalogue (`notifications.story.expired.*`, vérifié en/fr/de/es/it/pt-BR/ar), le reste = nom de marque « Meeshy » + une bulle de démo d'onboarding |
| `NavigationView` déprécié | **revendiqué** par la PR #2319 (214i) — exclu |
| `.font(.system(size:))` figé (Dynamic Type) | 229 occurrences vs 1221 `MeeshyFont.relative` — doctrine du dépôt : glyphes décoratifs en cadre rigide **volontairement** figés (gelé 211i) |

L'audit a en revanche fait apparaître une classe **non traitée** : la façon dont
l'app présente `UIActivityViewController`.

## Le défaut

Le dépôt a **déjà tranché la doctrine**, écrite noir sur blanc dans
`CommunityLinkDetailView.swift:67` :

> `// Native share: ShareLink handles the activity sheet, iPad popover anchoring`
> `// and top-VC presentation for free — no manual UIActivityViewController /`
> `// window-hierarchy traversal (doctrine: prefer first-party SwiftUI over UIKit).`

Elle n'était appliquée qu'à une partie de l'app. **7 sites** parcouraient encore
la hiérarchie de fenêtres à la main pour pousser la feuille sur le view controller
le plus haut, avec un préambule copié-collé quasi à l'octet :

```swift
if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
   let rootVC = windowScene.windows.first?.rootViewController {
    var topVC = rootVC
    while let presented = topVC.presentedViewController { topVC = presented }
    …
}
```

Deux défauts réels s'y cachent.

### A. Popover iPad mal ancré (4 sites sur 7)

`UIActivityViewController` est routé **en popover** à largeur régulière (iPad, et
la feuille de partage en form sheet). Trois sites configurent l'ancre complètement
(`sourceRect` centré + `permittedArrowDirections = []`) :
`ShareLinkDetailView`, `AffiliateView`, `TrackingLinkDetailView`.

Les **quatre autres** posaient uniquement `sourceView` et laissaient `sourceRect`
à son défaut `CGRect.zero` → la feuille s'ancre **au coin supérieur gauche** de la
fenêtre, flèche pointant dans le coin. Même classe de défaut, à moitié corrigée —
la correction manuelle n'avait jamais été propagée.

### B. Scène non déterministe (7 sites sur 7)

`UIApplication.shared.connectedScenes` est un **`Set` non ordonné**. `.first`
n'est donc pas « la scène de l'utilisateur » : en multitâche iPad / Stage Manager
(ou toute configuration multi-fenêtre) elle peut renvoyer une scène **en arrière-plan**
→ la feuille est présentée sur une fenêtre que l'utilisateur ne voit pas, et le
partage paraît muet.

### C. Chemin mort dans `ConversationListView`

`shareConversationLink(for:)` (~35 lignes) portait une **troisième copie** du
parcours de fenêtres. Vérification exhaustive sur `apps/ios` + `packages/MeeshySDK` :
**zéro appelant**. L'affordance vivante est `onCreateShareLink` → `inviteSheetConversation`
→ `InviteFriendsSheet` (une vraie feuille, avec options de lien éditables). La
fonction était un résidu du flux antérieur — et transportait au passage **deux
chaînes françaises en dur** jamais localisées (`"Rejoins la conversation \"…\""`,
`"Rejoins moi pour échanger sans filtre ni barrière..."`).

### D. État mort dans `ConversationInfoSheet`

`createdShareLinkId` (écrit une fois, **jamais lu**) et `showShareSheet`
(**jamais lu ni écrit**) : deux `@State` fantômes, vestiges du même flux.

## Correctifs (215i)

Convergence sur le patron **déjà en place** dans `PostDetailView` — le seul du
dépôt qui traite correctement un lien **forgé de façon asynchrone** (le cas des
liens de partage, impossible à servir avec `ShareLink` qui exige l'item d'avance) :

```swift
@State private var shareableLink: ShareableLink?          // modèle Identifiable existant
…
.sheet(item: $shareableLink) { link in
    ShareSheet(activityItems: [link.url])                 // representable partagé existant
}
```

SwiftUI possède alors la présentation : il ancre le popover et route la feuille
contre la scène de la vue présentatrice. **Les deux modes de défaillance disparaissent
par construction**, sans helper maison à maintenir.

| Site | Avant | Après |
|---|---|---|
| `ConversationInfoSheet.createShareLink()` | parcours fenêtres + `sourceView` seul | `.sheet(item:)` + `ShareSheet` ; les 2 `@State` morts remplacés par le seul vivant |
| `InviteFriendsSheet.shareAction()` | helper `presentShareSheet(url:)` (supprimé) | `.sheet(item:)` + `ShareSheet` |
| `ConversationListView.shareConversationLink(for:)` | ~35 lignes sans appelant | **supprimé** (+ 2 chaînes en dur) |

Bonus de correction : les deux sites vivants partagent désormais une **`URL`** et non
une `String`. Messages / Mail / Safari reconnaissent un lien (aperçu enrichi,
actions « Ouvrir dans… ») là où une chaîne nue part en texte brut — c'est aussi ce
que garantit le modèle `ShareableLink` en typant `url: URL`.

**0 clé i18n neuve** (le cas `URL(string:)` nil réutilise le toast d'erreur existant
`conversation.info.share.error`). **0 changement visuel sur iPhone** : en largeur
compacte la feuille système était déjà présentée en sheet modale ; la configuration
popover y est ignorée.

## Hors périmètre (assumé)

- **`StoryViewerView+Content.shareStory()`** — même défaut (A + B), mais l'état
  devrait vivre dans `StoryViewerView.swift` (autre fichier) et la surface story
  est **très chaude** (essaim actif, 2 commits story dans les 10 derniers jours).
  Leçon `tasks/lessons.md` : ne pas ré-attaquer une surface chaude. → 216i.
- **`ShareLinkDetailView`, `AffiliateView`, `TrackingLinkDetailView`** — parcours
  de fenêtres dupliqué mais ancre **correcte** : dette de duplication, pas de bug.
  Leur item est connu de façon synchrone → candidats à `ShareLink` natif (le cas
  le plus simple, celui de `CommunityLinkDetailView`). → 216i+.
- Les `UIActivityViewController` restants (`ShareSheet`, `ActivityView`,
  `MediaShareSheet`) sont des `UIViewControllerRepresentable` présentés **dans**
  une `.sheet` SwiftUI : c'est exactement le patron cible, rien à corriger.

## Test

`apps/ios/MeeshyTests/Unit/Views/NativeSharePresentationTests.swift` (neuf,
idiome source-introspection du dépôt — assertions vérifiables au grep hors Xcode,
cf. `ConversationInfoSheetAccessibilityTests`).

5 tests / 19 assertions :
1. `ConversationInfoSheet` présente via SwiftUI (état + `.sheet(item:)` + `ShareSheet`).
2. `InviteFriendsSheet` idem, et `presentShareSheet` a bien disparu.
3. Les deux sites partagent une `URL` (`ShareableLink(url:)`), pas une `String`.
4. `shareConversationLink` reste supprimée **et** l'affordance vivante reste câblée
   (garde de non-régression).
5. **Verrou SSOT** : aucun des 3 fichiers ne réintroduit `UIActivityViewController(`,
   `popoverPresentationController` ni `connectedScenes.first as? UIWindowScene`
   (lignes de commentaire exclues, pour ne pas faire échouer le test sur la
   documentation du défaut).

**RED prouvé** : 18 des 19 assertions échouent contre `main` HEAD `208daa5`
(la 19ᵉ est la garde de non-régression, verte des deux côtés). **GREEN** : 19/19
après correctif.

## Vérification

- Pas de toolchain Swift dans l'environnement d'exécution (Linux) → assertions
  vérifiées **déterministement** par correspondance de chaînes, équilibre des
  accolades des 3 fichiers contrôlé par tokenizer (chaînes/commentaires retirés
  dans le bon ordre) : **0**. Gate réel = CI `iOS Tests` (Xcode 26.1.1 / Swift 6.2,
  sim iOS 18.2), qui exécute `xcodegen generate` → le fichier de test neuf est
  enregistré automatiquement (sources par dossier), **aucune édition de `project.pbxproj`**.
- Collision essaim vérifiée : les 2 PR iOS ouvertes (#2319 `EmojiPickerSheet` /
  `VoiceProfileManageView` / `ShareViewController`, #2275 `StatusComposerView`)
  ne touchent **aucun** des 3 fichiers. Les 3 cibles sont froides (1 seul commit
  i18n de masse en 10 jours).

## Bilan

**3 fichiers de production : +33 / −64 lignes** (net −31). 0 clé i18n, 0 couleur,
0 layout, 0 changement visuel iPhone, 0 appel réseau modifié. 3 copies du parcours
de fenêtres supprimées, 2 `@State` morts supprimés, 1 fonction morte supprimée,
2 chaînes en dur supprimées.
