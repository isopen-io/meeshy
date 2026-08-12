# Déduplication du trigger « … » sur les cartes Reel du Feed + libellé Sauvegarder dédié

**Date** : 2026-08-06
**Statut** : design validé, prêt pour plan d'implémentation
**Périmètre** : `apps/ios/Meeshy/Features/Main/Views/ReelFeedCard.swift`, `ReelsPlayerView.swift`, `FeedPostCard.swift`, `PostDetailView.swift`, `apps/ios/Meeshy/Localizable.xcstrings`.

## Constat de départ (état actuel du code)

Les commits `b1a43f631`/`d403fc4f9`/`38dd2c97b`/`b464ad844` ont unifié le menu « … » (Ouvrir/Copier le texte/Partager/Enregistrer/Épingler/Modifier/Supprimer/Signaler) sur les différents rendus de poste. Dans ce processus, le glyphe historique « logo Reel » en haut à droite de `ReelFeedCard` (`play.rectangle.on.rectangle.fill`) a été recyclé en second déclencheur du même menu « … » plutôt que retiré :

- `reelGlyph` (`ReelFeedCard.swift:235-257`) — trigger « … » haut-droite, appelle `moreOptionsMenuContent`.
- `moreOptionsMenu` (`ReelFeedCard.swift:413-424`) — trigger « … » bas-droite, dans `actionsRow` (ligne 406), appelle le **même** `moreOptionsMenuContent` (lignes 429-489).

Les deux ouvrent un menu strictement identique — redondance pure, sans bénéfice fonctionnel. `FeedPostCard` (poste normal), lui, n'a qu'un seul trigger « … », en haut dans `authorHeader` (lignes 710-782).

Par ailleurs, l'item de menu « Enregistrer » (`Label("Enregistrer", systemImage: "bookmark")`, clé i18n `feed.post.save`) sert aujourd'hui à **deux actions distinctes selon le contexte** :
1. Un toggle bookmark pur (`onBookmark(post.id)`) — bouton dédié de la barre d'action, sur `ReelFeedCard` (ligne 400), `ReelsPlayerView`/`ReelActionRail` (ligne 1062), `FeedPostCard` (ligne 1052).
2. Un téléchargement de média (`requestSaveMedia()` → `MediaSaveCoordinator`) dans le menu « … », sur `ReelFeedCard` (ligne 452), `ReelsPlayerView` (ligne 1111), et en branche conditionnelle du même `Label` dans `FeedPostCard` (ligne 739, `if primaryReelDisplayMedia != nil { requestSaveMedia() } else { onBookmark }`) et `PostDetailView` (ligne 1025, même pattern).

Le même mot « Enregistrer » désigne donc deux actions produit différentes (favoris vs téléchargement sur l'appareil), ce qui est ambigu.

`ReelsPlayerView`/`ReelActionRail` (lecteur plein écran immersif) n'a, lui, jamais eu qu'un seul trigger « … » (`moreOptionsMenu`, lignes 1087-1154) — pas de duplication à corriger sur ce fichier, seul le point i18n ci-dessous s'y applique.

## Changement 1 — Un seul trigger « … » sur `ReelFeedCard`

`reelGlyph` (haut-droite) devient le seul point d'entrée du menu, à l'image de `FeedPostCard`. Dans `actionsRow` (`ReelFeedCard.swift:380-408`) :

```swift
private var actionsRow: some View {
    HStack(spacing: 0) {
        likeButton
        Spacer()
        reelButton(/* comment */) { onComment(post.id) }
        Spacer()
        reelButton(/* repost */) { onRepost(post.id) }
        Spacer()
        reelButton(/* bookmark */) { onBookmark(post.id) }
        // Spacer() + moreOptionsMenu retirés (lignes 403-406)
    }
}
```

**Retirer le `Spacer()` ET `moreOptionsMenu`, pas seulement le bouton** : `HStack(spacing: 0)` avec des `Spacer()` flexibles répartit l'espace entre éléments ; si le `Spacer()` final restait seul en bout de ligne, il continuerait à absorber l'espace à droite et le bouton bookmark ne collerait plus au bord droit — asymétrie visuelle avec `likeButton` qui colle au bord gauche. Après retrait des deux, `reelButton(bookmark)` devient le dernier élément, flush à droite, symétrique.

La propriété `moreOptionsMenu` (`ReelFeedCard.swift:413-424`, le wrapper `Menu{}` au style blanc/`.ultraThinMaterial` du bas) devient alors du code mort — aucun autre appelant — et est supprimée entièrement. `moreOptionsMenuContent` (contenu partagé du menu) reste inchangée, désormais référencée uniquement par `reelGlyph`.

Résultat : `actionsRow` = Like, Comment, Repost, Bookmark (4 boutons). Partager reste accessible uniquement via le menu « … » (`reelGlyph`), comme c'était déjà le cas (commentaire existant ligne 404-405 : « Partager reste disponible dans le menu « … » »).

Aucun changement sur `ReelsPlayerView`/`ReelActionRail` pour ce point — un seul trigger y existe déjà.

## Changement 2 — Libellé « Sauvegarder » pour le téléchargement média (jamais pour le bookmark)

Nouvelle clé i18n **`feed.reel.save_media`**, `defaultValue: "Sauvegarder"`, utilisée uniquement quand l'action déclenchée est un téléchargement de média sur l'appareil :

| Fichier | Ligne | Contexte | Clé / libellé |
|---|---|---|---|
| `ReelFeedCard.swift` | 452 | menu « … », `if media != nil` | `feed.reel.save_media` → « Sauvegarder » |
| `ReelsPlayerView.swift` | 1111 | menu « … » du lecteur, `if reel.primaryReelDisplayMedia != nil` | `feed.reel.save_media` → « Sauvegarder » |
| `FeedPostCard.swift` | 739 | menu « … », branche `primaryReelDisplayMedia != nil` | `feed.reel.save_media` → « Sauvegarder » |
| `PostDetailView.swift` | 1025 | menu « … », branche `primaryReelDisplayMedia != nil` | `feed.reel.save_media` → « Sauvegarder » |

Pour `FeedPostCard.swift:739` et `PostDetailView.swift:1025`, le `Label` est actuellement unique et conditionnel côté **action** (`if … { requestSaveMedia() } else { onBookmark }`) mais pas côté **texte affiché** — les deux branches affichent aujourd'hui « Enregistrer ». Il faut rendre le texte lui-même conditionnel (même prédicat que l'action) :

```swift
let isReelMediaSave = post.primaryReelDisplayMedia != nil
Button {
    if isReelMediaSave { requestSaveMedia() } else { onBookmark?(post.id) }
} label: {
    Label(
        isReelMediaSave
            ? String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)
            : String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main),
        systemImage: "bookmark"
    )
}
```

Restent inchangés en « Enregistrer » (`feed.post.save` / `reels.action.bookmark`, toggle bookmark pur, jamais de branche média) : `ReelFeedCard.swift:400` (bouton `actionsRow`), `ReelsPlayerView.swift:1062` (bouton `ReelActionRail`), `FeedPostCard.swift:1052` (bouton `actionsBar` dédié, sans branche conditionnelle).

Bookmark reste dans tous les cas un bouton dédié de la barre d'action — jamais déplacé dans le menu « … », ni sur `ReelFeedCard` ni sur `ReelsPlayerView`/`ReelActionRail`. Seul l'item média du menu « … » change de libellé.

### Catalogue i18n

`apps/ios/Meeshy/Localizable.xcstrings` (String Catalog, langue source `fr`, 7 locales expédiées : `fr, en, de, es, pt-BR, it, ar`). La nouvelle clé `feed.reel.save_media` doit être ajoutée avec une entrée **`translated`** dans les **6 locales non-`fr`** dès ce changement (pas seulement `fr`+`en`) :

| Locale | Valeur |
|---|---|
| `en` | Save |
| `de` | Speichern |
| `es` | Guardar |
| `pt-BR` | Salvar |
| `it` | Salva |
| `ar` | حفظ |

Raison : `LocalizationConsistencyTests.test_untranslatedKeyBacklogDoesNotGrow` (`apps/ios/MeeshyTests/Unit/LocalizationConsistencyTests.swift`) compte toute clé dont une des 6 locales requises n'est pas `translated`, contre un plafond pinné (`backlogCeiling`) qui ne peut que descendre. Une clé neuve avec seulement `defaultValue:` (sans entrée catalogue) incrémenterait ce compteur d'un cran dont la marge disponible sous le plafond n'est pas mesurée à l'avance ; traduire immédiatement dans les 6 locales neutralise le risque au lieu de parier sur une marge existante.

## Hors scope

- `media.save.title` (pièces jointes de conversation — `ConversationView.swift`, `ConversationMediaGalleryView.swift`, `MessageActionsMenu.swift`, `MediaSaveFlowHost.swift`) : action de téléchargement distincte (message, pas post/reel), pas mentionnée dans la demande, reste « Enregistrer ».
- `story.viewer.action.save` / `story.mine.save` (export de story vers Photos) : feature distincte, inchangée.
- Aucune extraction de composant menu partagé (`PostMoreMenu`) : le menu « … » reste dupliqué dans les 4 fichiers listés, cohérent avec l'approche incrémentale des commits précédents (`b1a43f631` et suivants) qui ont délibérément répliqué le contenu plutôt que factorisé. Une factorisation serait un refactor plus large, non demandé.
- `reels.action.bookmark`, `story.mine.save`, `common.save` : clés déjà absentes du catalogue (dette i18n préexistante documentée, hors scope de ce changement).

## Tests (TDD)

Avant tout changement de production :
1. Un test source-guard qui échoue tant que `ReelFeedCard.actionsRow` référence encore `moreOptionsMenu` — verrouille l'invariant « un seul trigger « … » » sur les cartes Reel du Feed. Vérifier d'abord s'il existe déjà un fichier de garde pour `ReelFeedCard` (ex. proche de `ReelCaptionRichTextGuardTests`) à étendre plutôt qu'un nouveau fichier.
2. Un test qui vérifie le `defaultValue` exact à chacun des 8 sites listés (Changement 2) : « Sauvegarder » aux 4 sites média, « Enregistrer » aux 3 sites bookmark pur — ancré sur le comportement (quelle action est appelée), pas sur une fenêtre de caractères fixe.
3. La suite `LocalizationConsistencyTests` existante (déjà dans le run CI) valide automatiquement que `feed.reel.save_media` est bien référencée dans le code (garde n°2) et complètement traduite (garde n°4, backlog) — aucun test nouveau à écrire pour ce volet, juste s'assurer que le catalogue est mis à jour avant de lancer la suite.

## Risques / points de vigilance pour le plan

- Confirmer en lisant `PostDetailView.swift` autour de la ligne 1025 s'il existe, comme dans `FeedPostCard`, un bouton bookmark dédié séparé (qui doit rester « Enregistrer ») en plus du menu conditionnel — l'exploration ne l'a pas confirmé explicitement pour ce fichier.
- Vérifier qu'aucun test existant n'attend littéralement le texte « Enregistrer » aux 4 sites qui deviennent « Sauvegarder » (recherche `"Enregistrer"` dans `apps/ios/MeeshyTests` avant modification).
