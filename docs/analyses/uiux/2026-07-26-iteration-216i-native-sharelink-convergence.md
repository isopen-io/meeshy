# iOS UI/UX — Iteration 216i

**Date** : 2026-07-26
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Views/ShareLinkDetailView.swift`
- `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift`
- `apps/ios/Meeshy/Features/Main/Views/TrackingLinkDetailView.swift`

**Axe** : Intégration native / HIG — `ShareLink` first-party, compatibilité iPad
& multitâche, affordance morte
**Base** : `main` HEAD `fefe559` (#2322, 215i mergée)

## Continuité avec 215i

215i a converti les 2 sites de partage dont le lien est **forgé de façon
asynchrone** (`ConversationInfoSheet`, `InviteFriendsSheet`) vers
`.sheet(item:)` + `ShareSheet`, et supprimé un chemin mort. Elle laissait
explicitement en piste 216i les **3 sites dont l'item est connu de façon
synchrone** — ceux pour lesquels la réponse Apple n'est pas une feuille mais
`ShareLink`, qui ne demande ni état, ni representable, ni code de présentation.

## Le défaut (rappel + ce qui restait)

Doctrine du dépôt, écrite dans `CommunityLinkDetailView.swift:67` :

> `// Native share: ShareLink handles the activity sheet, iPad popover anchoring`
> `// and top-VC presentation for free — no manual UIActivityViewController /`
> `// window-hierarchy traversal (doctrine: prefer first-party SwiftUI over UIKit).`

Après 215i, **4 parcours de fenêtres** subsistaient sur 3 fichiers :

| Site | Item | Ancre popover iPad | Scène |
|---|---|---|---|
| `ShareLinkDetailView.actionsBar` (Partager) | `link.joinUrl`, **synchrone** | corrigée à la main (`sourceRect` centré) | `connectedScenes.first` ❌ |
| `AffiliateView.tokenRow` (Partager) | `token.affiliateLink`, **synchrone** | corrigée à la main | `connectedScenes.first` ❌ |
| `TrackingLinkDetailView.generateQRAndShare` | bitmap QR, **rendu au tap** | corrigée à la main | `connectedScenes.first` ❌ |
| `StoryViewerView+Content.shareStory` | — | — | hors périmètre (voir plus bas) |

### A. Scène non déterministe (3/3)

`UIApplication.shared.connectedScenes` est un **`Set` non ordonné**. `.first`
n'est pas « la scène de l'utilisateur » : en multitâche iPad / Stage Manager,
elle peut renvoyer une scène **en arrière-plan** → la feuille de partage est
présentée sur une fenêtre invisible et le tap paraît muet. C'est le même défaut
que 215i, sur les 3 sites restants.

### B. Duplication d'un anti-patron déjà tranché

Les 3 sites portaient chacun leur copie (~15 lignes) du parcours
`connectedScenes → windows.first → rootViewController → while presentedViewController`,
plus la configuration manuelle du popover — soit ~45 lignes de plomberie UIKit
pour un comportement que le système fournit.

### C. Affordance morte (`AffiliateView`)

Sur une ligne de token dont le backend n'a pas encore forgé `affiliateLink`
(`String?`), les boutons **Copier** et **Partager** étaient rendus **actifs** et
`guard … else { return }` faisait un no-op. HIG : un contrôle présenté comme
actionnable doit agir ; sinon il doit être désactivé — VoiceOver annonce alors
« dimmed » au lieu de proposer une action sans effet.

## Correctifs (216i)

### 1. `ShareLinkDetailView` → `ShareLink` natif

`actionButton` était monolithique (Button + label). Le label est extrait en
`actionButtonLabel(_:icon:color:)`, réutilisé tel quel par un nouveau
`shareActionButton` bâti sur `ShareLink` — **strictement le patron du sibling
`TrackingLinkDetailView.shareActionButton`** (déjà migré, même fichier-classe).
`presentSheet(_:)` supprimé (seul appelant). Aucun changement visuel : même
VStack, même icône, même `.frame(maxWidth: .infinity)`, même
`.accessibilityLabel`.

Correction emportée : un `joinUrl` non parsable ne produisait **rien** du tout
(`guard … else { return }`). Le fallback `ShareLink(item: link.joinUrl)` partage
alors la chaîne — encore le patron du sibling.

### 2. `AffiliateView` → `ShareLink` natif + contrôles désactivés

Le bouton de partage devient `shareTokenButton(_:)` : `ShareLink(item: url)`
quand le lien parse, `ShareLink(item: link)` sinon, et un `Button` **désactivé**
quand le backend n'a pas encore forgé le lien. Le glyphe est extrait en
`shareGlyph` (une seule définition pour les 3 branches). `.disabled(token.affiliateLink == nil)`
posé aussi sur le bouton **Copier**, inerte pour la même raison.
`.accessibilityLabel` conservé à l'identique sur les 3 branches.

### 3. `TrackingLinkDetailView` → `.sheet(item:)` pour le QR

Le bitmap QR est **rendu au tap** (`CIQRCodeGenerator` + `CIContext`) : `ShareLink`
exige son item à la construction de la vue, il ne peut donc pas le porter — sauf
à re-rendre le QR à chaque évaluation du `body`. C'est exactement le cas que 215i
a résolu avec `.sheet(item:)`. `generateQRAndShare()` se contente désormais de
poser `qrShareImage = QRShareImage(image:)`, et le `body` présente
`ShareSheet(activityItems: [qr.image])`. `presentVC(_:)` supprimé.

Précédent du dépôt pour le wrapper `Identifiable` autour d'un `UIImage` :
`EditingAttachmentItem` (`FeedView+Attachments.swift:1355`), consommé par un
`.fullScreenCover(item:)`.

## Résultat

Les deux modes de défaillance disparaissent **par construction** sur les 3 sites :
la présentation appartient à SwiftUI, qui ancre le popover et résout la scène
depuis la vue présentatrice. Plus aucun fichier converge-locké ne référence
`connectedScenes`.

**0 clé i18n neuve** (les 4 libellés — `common.share`, `affiliate.action.share`,
`affiliate.action.copy`, `tracking.link.detail.qr` — sont réutilisés verbatim).
**0 changement visuel** : mêmes glyphes, mêmes couleurs, mêmes métriques ; en
largeur compacte la feuille système était déjà une sheet modale. Seule
différence perceptible voulue : les 2 contrôles d'`AffiliateView` s'affichent
estompés quand ils n'ont rien à offrir.

## Hors périmètre (assumé)

- **`StoryViewerView+Content.shareStory()`** — même défaut, mais l'état devrait
  vivre dans `StoryViewerView.swift` (autre fichier) et la surface story reste
  **chaude** (commits story récents dans `main`, dont 3 dans les 10 derniers
  jours). Leçon `tasks/lessons.md` : ne pas ré-attaquer une surface chaude.
  → 217i+.
- **`FeedViewModel`, `StoryExportShareViewModel`, `StoryVideoExportService`,
  `MediaSaveFlowHost`, `ConversationView`, `ConversationMediaViews`** — leurs
  `UIActivityViewController` sont soit des `UIViewControllerRepresentable`
  présentés **dans** une `.sheet` (patron cible), soit des exports story
  (surface chaude). Non touchés.

## Test

`apps/ios/MeeshyTests/Unit/Views/NativeSharePresentationTests.swift` — le fichier
de 215i est **étendu** plutôt que dupliqué (SSOT de la doctrine) : 3 tests neufs
(8 au total) et la liste `convergedFiles` passe de 3 à 6 fichiers, ce qui étend
mécaniquement le verrou SSOT aux 3 nouvelles surfaces.

**RED prouvé** : les 19 assertions neuves (10 de contenu + 9 de verrou) échouent
**19/19** contre `main` HEAD `fefe559`. **GREEN** : 19/19 après correctif.

## Vérification

- Pas de toolchain Swift dans l'environnement d'exécution (Linux) → assertions
  vérifiées déterministement par correspondance de chaînes ; équilibre
  accolades/parenthèses des 3 fichiers de production et du fichier de test
  contrôlé au tokenizer (chaînes et commentaires retirés dans le bon ordre) :
  **0 / 0**. Gate réel = CI `iOS Tests` (Xcode 26.1.1 / Swift 6.2, sim iOS 18.2).
- `ShareLink` : iOS 16+ — plancher du projet = iOS 16.0 (`project.yml:5`), aucune
  garde `@available` nécessaire.
- Collision essaim : `list_pull_requests` (open, 11 PR) → 2 PR iOS seulement
  (#2319 `EmojiPickerSheet`/`VoiceProfileManageView`/`ShareViewController`,
  #2275 `StatusComposerView`) — **aucun fichier commun**. Les 3 cibles sont
  froides (dernier commit les touchant : un passage i18n de masse).
- Aucune édition de `project.pbxproj` : aucun fichier neuf (le test étend un
  fichier existant).

## Bilan

**3 fichiers de production : +82 / −73 lignes** (net +9 — les ajouts sont pour
moitié du commentaire de doctrine ; le code de plomberie, lui, recule).
3 copies du parcours de fenêtres supprimées,
2 helpers `presentSheet`/`presentVC` supprimés, 2 affordances mortes rendues
explicitement désactivées, 1 chemin silencieux (`joinUrl` non parsable) rendu
fonctionnel. 0 clé i18n, 0 couleur, 0 métrique de layout, 0 appel réseau modifié.
