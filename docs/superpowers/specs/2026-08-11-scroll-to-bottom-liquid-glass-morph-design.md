# Bouton scroll-to-bottom : morph cercle→ovale + type "appel"

Date : 2026-08-11
Statut : approuvé (user « Oui »)
Périmètre : `ConversationScrollControlsView` (`packages/MeeshySDK/Sources/MeeshyUI/Conversation/ConversationScrollControlsView.swift`). Composant SDK pur (paramètres opaques, agnostique produit) — reste SDK après cette évolution.

⚠️ Ce fichier existe AUSSI, à l'identique ou en cours de modification, dans 3 worktrees actifs au moment de l'écriture de ce spec (`agent-ac887328413edef97`, `android-ios-parity-routine`, `agent-af37c535fe9774606`). Avant toute implémentation : vérifier l'état du fichier sur `main` au moment du démarrage (pas seulement au moment de ce spec) et être prêt à rebaser le diff si une de ces sessions a mergé entre-temps — pas un risque de conflit sur le PLAN, un risque d'exécution à surveiller.

## Constat : la majeure partie existe déjà

`ConversationScrollControlsView` couvre déjà, en production :
- Liquid Glass (`.adaptiveGlass`, ligne 158-161) avec teinte accent.
- Aperçu riche du dernier message non lu : lecteur audio inline (play/pause tappable), miniature image/vidéo (`ProgressiveCachedImage`), glyphe de type pour fichier/localisation, texte du dernier message, compteur "N messages", indicateur de frappe animé.
- États : hors-ligne, recherche de message cité (pulse), contenu non lu, repos (chevron seul).

Ce qui MANQUE, précisément :
1. **Forme** : le conteneur est un `RoundedRectangle(cornerRadius: 16 ou 20)` (ligne 159) — pas un morph `Circle()` (repos) → `Capsule()`/ovale (contenu riche). Le user veut explicitement "un cercle parfait qui devient oval".
2. **Type "appel"** : `unreadAttachmentSymbol`/`unreadAttachmentTypeLabel` (calculés app-side dans `ConversationView+ScrollIndicators.swift:97-119`) ne couvrent que `.image/.video/.audio/.file/.location` (les types d'`MessageAttachment`). Un appel (en cours, manqué, annulé) n'est PAS un attachment — c'est un message système distinct (cf. `BubbleCallNoticeView`, hors de ce composant). Le bouton scroll-to-bottom ne montre donc rien de spécifique quand le dernier message non lu est une notice d'appel.

## Design cible

### A. Morph de forme (SDK, `ConversationScrollControlsView`)
Remplacer le `RoundedRectangle(cornerRadius: ...)` unique par un morph explicite piloté par le même booléen qui décide déjà du corner radius (`hasUnreadContent || isOffline || isSearchingQuotedMessage`) :
- **Repos** (aucun contenu à montrer, juste le chevron) : `Circle()` — le bouton actuel est déjà proche d'un cercle visuellement (`.padding(12)` sur un glyphe seul) ; le rendre géométriquement exact.
- **Contenu riche** (unread/offline/recherche) : `Capsule()` (ovale parfait, pas un `RoundedRectangle` à coins arrondis fixes — la capsule s'adapte nativement à `frame(maxWidth: 260)`).
- Transition : `.adaptiveGlass(in:)` accepte n'importe quelle `Shape` en paramètre générique (`<S: Shape>`) — donc techniquement un simple `if/else` sur la shape passée à `adaptiveGlass(in:)` suffit SANS morph animé de type "shape interpolation" custom. Si une transition animée fluide entre les deux formes est souhaitée (et pas juste un cross-fade/redraw au changement d'état), évaluer `.matchedGeometryEffect` ou une interpolation de `cornerRadius` continue (0 → largeur/2 → capsule) plutôt qu'un switch discret — décision d'implémentation, à trancher en regardant le rendu réel (les deux lisent différemment).

### B. Détection du type "appel"
Investigation faite : `BubbleCallNoticeView` s'appuie sur `CallSummaryMetadata` (SDK, `Models/CallSummaryMetadata.swift`), un type Codable/Sendable/Equatable porté par `Message.metadata` d'un message-système de FIN d'appel, avec `Outcome: completed | missed | rejected | failed`. C'est un résumé POST-HOC (l'appel est déjà terminé) — il n'existe pas, à ce stade de l'investigation, de message représentant un appel EN COURS (un appel actif relève probablement de l'état `CallManager`/CallKit en direct, pas d'un message dans le fil). **Périmètre confirmé à l'implémentation** : câbler `.missed`/`.rejected`/`.failed` (les issues qui justifient une relance visuelle — `.completed` n'a pas besoin d'un indicateur spécial dans le bouton scroll-to-bottom, un appel réussi n'est pas une action en attente). Si l'implémenteur trouve un mécanisme de "appel en cours" au niveau message pendant le développement, l'ajouter est un bonus sans remettre en cause le reste ; sinon, le documenter comme non applicable plutôt que de forcer un état qui n'existe pas.

Nouveau champ optionnel côté composant, symétrique à `unreadAttachmentSymbol`/`unreadAttachmentTypeLabel` mais pour un message d'appel plutôt qu'un attachment :
```swift
public var unreadCallOutcome: CallSummaryMetadata.Outcome? = nil
```
Icône/teinte : réutiliser le vocabulaire déjà établi par `BubbleCallNoticeView` (`.missed`/`.rejected` → `MeeshyColors.error`, glyphe téléphone approprié — lignes 271+ du fichier) plutôt qu'en inventer un nouveau.

Côté app (`ConversationView+ScrollIndicators.swift`), calculer ce nouvel état à partir de `viewModel.lastUnreadMessage.metadata` (décodé en `CallSummaryMetadata` quand le message est un system-message d'appel — même mécanisme que celui qui alimente `BubbleCallNoticeView` pour ce message) et le passer au composant, symétriquement à `unreadAttachment`.

`unreadAttachmentPreview` (ligne 317-359) gagne une branche supplémentaire pour ce cas, au même niveau que les branches audio/image-vidéo/symbole générique.

## Non-régression (intouchés)
- Tous les autres champs et comportements du composant (frappe, hors-ligne, recherche de message cité, lecteur audio inline, miniatures) : inchangés.
- `hasAttachmentPreview`, `shouldShowAttachmentPreview` : leur logique reste valable pour les attachments ; le nouveau cas "appel" s'ajoute en parallèle (probablement un nouveau `hasCallPreview` ou une extension de la condition existante — à trancher pour ne pas dupliquer la garde `unreadCount > 0`).
- `contentColor` (luminance WCAG), `typingDotsView`, `quotedMessageSearchContent` : non touchés.

## Tests (TDD)
1. Test SDK (`MeeshyUITests`) : la forme rendue est `Circle` en repos et `Capsule` en contenu riche — pattern de test à établir selon ce que le repo utilise déjà pour asserter une `Shape` (introspection de la hiérarchie de vue, ou test du booléen/état qui PILOTE le choix de forme si un test direct sur `Shape` n'est pas pratique en XCTest SwiftUI).
2. Test SDK : `unreadCallState` en cours vs manqué/annulé produit le bon glyphe/couleur dans `unreadAttachmentPreview` — factory function avec les différents états, comme les autres tests du composant.
3. Non-régression : tests existants du composant (audio play/pause, image/vidéo thumbnail, texte, compteur, frappe) restent verts après le changement de shape.
4. Vérification visuelle simulateur : repos = cercle net (pas un rectangle à coins très arrondis qui APPROCHE un cercle sans l'être), contenu riche = capsule/ovale, sur iPhone 16 Pro et iPhone SE 375pt.
