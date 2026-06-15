# PostDetailView — Header auteur révélé au scroll (basé sur CollapsibleHeader)

- **Date** : 2026-06-14
- **Plateforme** : iOS (SwiftUI)
- **Statut** : design validé en brainstorming, en attente de revue utilisateur
- **Écran cible** : `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`

> Note de périmètre : ce design ne concerne **que** `PostDetailView` (la page de détail
> classique d'un post, layout vertical scrollable). Il ne touche **pas** `ReelsPlayerView`
> (viewer plein écran type reel). Les corrections Reels (texte centré/scrollable,
> affichage des réponses aux commentaires, commentaires vocaux) sont des sujets
> **séparés**, traités après cette tâche.

## Objectif

Aujourd'hui, `PostDetailView` affiche :
- un `navBar` opaque en haut (`‹` à gauche, `⋯` à droite) qui **pousse** le contenu (il
  n'est pas flottant et n'a aucun effet transparent) ;
- le bloc auteur (avatar + nom + date + drapeaux de langue) comme **premier élément
  scrollable** du contenu (`textZone`, lignes 649-718), aligné à gauche.

On veut, conformément à la demande :
1. Rendre le header **flottant et translucide** (`.ultraThinMaterial`) pour que le contenu
   défile **derrière** lui — comme la page de conversation principale.
2. Faire apparaître l'auteur **au centre** du header (avatar + nom + **date**) au fur et à
   mesure que le bloc auteur quitte l'écran (comportement « reveal au scroll », style X) :
   header minimal au repos (`‹` … `⋯`), auteur révélé centré au scroll.
3. **Réutiliser `CollapsibleHeader`** (SDK `MeeshyUI`) plutôt que de créer un header maison.

## Décisions issues du brainstorming

| Décision | Choix retenu |
|---|---|
| Comportement au scroll | **Reveal au scroll (style X)** : header minimal au repos, auteur révélé au scroll |
| Contenu du centre révélé | **Avatar + nom + date relative** |
| Composant de base | **Réutiliser `CollapsibleHeader`** (pas de header custom, pas d'extraction de surface) |
| Drapeaux Prisme | **Restent dans le contenu** (`textZone`), non dupliqués dans le header |

## Architecture

### 1. Réutilisation de `CollapsibleHeader`

`CollapsibleHeader` fournit déjà tout le socle nécessaire et est utilisé par FeedView,
SettingsView, ProfileView, LinksHubView :
- la **surface translucide** (`.ultraThinMaterial` + tint dégradé + masque top→clear qui
  laisse défiler le contenu derrière le bas du header) — `headerBackground` ;
- le **collapse au scroll** piloté par `scrollOffset` (`progress = clamp(-scrollOffset/60)`,
  height `lerp(64, 44)`) ;
- les slots `leading` / `titleView` / `trailing` et `showBackButton`/`onBack`.

`PostDetailView` l'instancie avec :
- `showBackButton: true`, `onBack: { router.pop() }` → remplace le `‹` actuel ;
- `trailing:` → le `Menu { … }` `⋯` actuel (Copier le lien / Partager / Modifier / Signaler) ;
- le **slot « centre révélé »** (nouveau, voir §2) → avatar + nom + date de l'auteur ;
- `scrollOffset:` → valeur trackée par `PostDetailView` (voir §3) ;
- `backgroundColor:` → `theme.backgroundPrimary` (tint cohérent avec le fond), `titleColor`
  / `backArrowColor` → `theme.textPrimary`.

### 2. Extension générique de `CollapsibleHeader` : slot « centre révélé »

`CollapsibleHeader` aligne son `titleView` à **gauche** et le garde **toujours visible**
(il ne fait que le scaler). Le comportement « reveal au centre » demande un contenu
**masqué au repos**, **centré**, **révélé au scroll**. On l'ajoute de façon **générique et
rétro-compatible** :

- Nouveau slot optionnel `centerReveal: (() -> CenterContent)?` (4ᵉ `@ViewBuilder`).
- Rendu en **overlay centré** sur la barre, avec `opacity(progress)` (donc invisible au
  repos `progress = 0`, pleinement visible une fois replié `progress = 1`) et une légère
  translation verticale d'entrée (fade + slide).
- **Rétro-compatibilité** : valeur par défaut `EmptyView` ; les inits de convenance
  existants fixent `CenterContent == EmptyView`. Tous les call sites actuels
  (FeedView/Settings/Profile/LinksHub) restent **inchangés** et leur rendu est **identique**
  (l'overlay vide ne dessine rien). Aucune régression.
- Le `progress` reste **calculé en interne** par `CollapsibleHeader` (source unique), ce qui
  évite à `PostDetailView` de dupliquer la courbe de reveal.

Ce slot est générique : n'importe quel écran peut révéler un contenu centré au scroll
(d'où « réutilisable partout »).

### 3. Restructuration de `PostDetailView`

**Avant** : `VStack(spacing: 0) { navBar; ConnectionBanner(); ScrollView{…}; composer }`.

**Après** :
```
VStack(spacing: 0) {
    ConnectionBanner()
    ZStack(alignment: .top) {
        ScrollView { sentinel; LazyVStack { postDetailContent } .padding(.top, headerHeight) }
        CollapsibleHeader(… centerReveal: { authorRevealView } …)   // flottant, translucide
    }
    composer
}
```
- **Tracking du scroll** : un `GeometryReader` sentinel en tête du `ScrollView` publie
  l'offset via `ScrollOffsetPreferenceKey` (déjà public dans `MeeshyUI`, même mécanisme que
  FeedView) → `@State private var headerScrollOffset: CGFloat`. `coordinateSpace` nommé.
- **Padding du contenu** : `.padding(.top, CollapsibleHeaderMetrics.expandedHeight)` pour
  que le contenu démarre sous le header au repos (comme FeedView, `topPadding`).
- **`ScrollViewReader` préservé** : il englobe le `ScrollView` afin de conserver le
  scroll-to-comments existant (`scrollProxy.scrollTo("commentsSection")`).
- **Pas de pull-to-refresh ajouté** (hors périmètre, YAGNI).

### 4. `textZone` inchangé → Prisme Linguistique préservé

Le bloc auteur reste le 1ᵉʳ élément scrollable du contenu, **avec ses drapeaux de langue
cliquables + icône translate** (lignes 681-710). On ne duplique **pas** ces interactions
dans le header. Le contenu (texte, médias, repost, actions, commentaires) est inchangé.
Conséquence : zéro régression Prisme.

### 5. Contenu du centre révélé (`authorRevealView`)

`HStack` compact : `MeeshyAvatar` (taille réduite) + `VStack { nom (semibold) ; date
relative (caption) }`. Tappable → `selectedProfileUser = .from(feedPost: post)` (cohérent
avec le tap-nom existant). Couleurs sur fond translucide : `theme.textPrimary` /
`theme.textMuted`.

## Réutilisation (anti-duplication)

- **Aucun header custom** : on instancie `CollapsibleHeader` directement.
- **Aucune extraction/copie** de la surface floue : elle reste interne à `CollapsibleHeader`.
- **Aucune duplication de la courbe de reveal** : le `progress` est calculé une seule fois,
  dans `CollapsibleHeader`.
- La seule addition SDK est le slot générique « centre révélé », réutilisable par tous les
  écrans.

## Tests

- **Logique pure** : si la courbe de reveal/opacité devient non triviale, l'extraire en
  fonction pure testable (ex. `revealOpacity(progress:)`) avec tests XCTest sur les bornes
  (0 → invisible, 1 → visible, mi-parcours). Le `progress` de `CollapsibleHeader` est déjà
  une fonction pure de `scrollOffset` ; on s'appuie dessus.
- **Rendu visuel** : vérifié au build (`./apps/ios/meeshy.sh build`) puis run simulateur
  (repos = header minimal translucide ; scroll = auteur centré révélé ; contenu visible
  derrière le blur ; Prisme intact dans le contenu).
- **Non-régression** : confirmer que FeedView/Settings/Profile/LinksHub compilent et rendent
  à l'identique (slot `centerReveal` absent = EmptyView).

## Risques & points d'attention

- **Rétro-compatibilité `CollapsibleHeader`** : l'ajout d'un 4ᵉ paramètre générique impose de
  mettre à jour les inits de convenance pour fixer `CenterContent == EmptyView`. Vérifier que
  les 4 call sites existants compilent sans changement.
- **Safe area / status bar** : le header flottant doit étendre son blur sous la status bar
  (`ignoresSafeArea(edges: .top)`, déjà géré par `headerBackground`) tandis que le contenu
  démarre sous le header. Le `ConnectionBanner` reste au-dessus du `ZStack` (il pousse) ;
  il n'est visible qu'en cas de déconnexion. Ajustements de padding fins validés au run.
- **Seuil de reveal** : `progress` atteint 1 à ~60 pt de scroll (constante interne de
  `CollapsibleHeader`). Le bloc auteur (`textZone`, ~60-70 pt) sort de l'écran approximativement
  au même moment → le reveal est naturellement synchronisé. À affiner visuellement si besoin.

## Hors périmètre (sujets Reels — à traiter après)

Tracés ici pour mémoire, **non** couverts par cette spec :
1. Reels : contenu mal centré + texte déplié qui doit être **scrollable** dans un conteneur
   et repliable au toucher (`ReelsPlayerView.swift`, lignes 264-273).
2. Bug threading : la réponse à un commentaire ne s'affiche pas (`FeedCommentsSheet` /
   `ThreadedCommentSection` : `autoPreviewReplies` visible seulement si `!isExpanded`, toggle
   visible seulement si `comment.replies > 2`).
3. Commentaires **vocaux** sur les posts (inexistant : modèles, composer `.comment`, route
   `POST /posts/:id/comments`, `PostCommentService` à étendre).
