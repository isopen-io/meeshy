import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

/// Les entrées du menu long-press d'un élément du canvas, dans leur ordre
/// d'affichage. Le même inventaire alimente les actions VoiceOver
/// (`makeCustomActions`) : une seule règle décide de ce qu'un élément offre.
///
/// `nonisolated` sur le TYPE : le package pose `.defaultIsolation(MainActor
/// .self)` (SE-0466), qui isolerait cet énuméré et le rendrait illisible
/// depuis un contexte non isolé.
/// **Public depuis #4063** : le rail *trailing* est une vue de l'APP, et il
/// porte exactement ces actions — même règle, autre géographie. Les recopier
/// côté app aurait fait deux inventaires d'un même geste, dont la divergence
/// n'aurait rougi nulle part.
///
/// `Hashable` pour la même raison : l'hôte déclare en `Set` ce dont il possède
/// la primitive, et la vue les énumère par `id: \.self`.
public nonisolated enum StoryCanvasContextAction: CaseIterable, Sendable, Equatable, Hashable {
    case edit
    case duplicate
    case bringForward
    case sendBackward
    /// **Le média quitte la scène et redevient une slide du post (#4046).**
    ///
    /// D'une autre NATURE que les deux au-dessus : l'empilement écrit le `z`
    /// d'un `MeeshyObject` — son ordre DANS son plan — quand celle-ci écrit son
    /// `plane`. Les confondre ferait passer un objet devant un fond au lieu de
    /// le sortir.
    case leaveScene
    case delete

    /// **Ce qu'un objet offre VRAIMENT (#4046) — loi 4, sans exception : une
    /// action absente, jamais grisée.**
    ///
    /// Elle rendait `allCases` pour tout objet non verrouillé, et deux de ces
    /// cinq entrées n'avaient alors AUCUN effet :
    ///
    /// - **l'empilement sur un objet SEUL de son plan.** « Mettre au premier
    ///   plan » un objet qui y est déjà, faute de frère, ne déplace rien : le
    ///   menu proposait un geste dont le résultat était l'écran d'avant. Un
    ///   objet de FOND non plus n'empile pas — il n'est pas dans le plan.
    /// - **« Modifier » sans éditeur.** L'entrée délègue à `onItemDoubleTapped`,
    ///   une closure que l'HÔTE fournit. La scène incrustée de l'écran document
    ///   ne la transmet pas : le menu y peignait « Modifier » au-dessus d'un
    ///   `nil`. Mesuré, pas supposé.
    ///
    /// Un élément verrouillé — le badge d'attribution d'une republication, seul
    /// porteur de `StoryTextObject.isLocked` — n'offre ni édition, ni
    /// duplication, ni suppression : les trois retirent ou dénaturent
    /// l'attribution. L'empilement lui reste, s'il a un effet : il ne touche pas
    /// au contenu.
    /// - Parameter canLeaveScene: l'hôte SAIT-il recevoir un objet qui sort ?
    ///   Le SDK ne connaît ni « Story » ni « Post » — ce sont des notions de
    ///   l'app. Il ne demande donc pas le PROFIL mais l'EFFET : même frontière
    ///   que `hasEditor`, qui ne demande pas s'il existe un éditeur mais si
    ///   l'hôte en a câblé un. **Le défaut FERME** : un appelant qui ne se
    ///   prononce pas n'offre pas la sortie.
    public static func offered(
        isLocked: Bool,
        isBackground: Bool,
        sharesPlaneWithAnother: Bool,
        hasEditor: Bool,
        canLeaveScene: Bool = false
    ) -> [StoryCanvasContextAction] {
        let empile = !isBackground && sharesPlaneWithAnother
        var servies: [StoryCanvasContextAction] = []
        if !isLocked, hasEditor { servies.append(.edit) }
        if !isLocked { servies.append(.duplicate) }
        if empile { servies.append(contentsOf: [.bringForward, .sendBackward]) }
        // Un FOND se sort aussi — c'est même le cas nominal en Post. La sortie
        // ne dépend donc pas du plan, contrairement à l'empilement. Le VERROU,
        // lui, la refuse : sortir le badge d'attribution d'une republication
        // retirerait l'attribution, ce que le verrou existe pour empêcher.
        if !isLocked, canLeaveScene { servies.append(.leaveScene) }
        if !isLocked { servies.append(.delete) }
        return servies
    }

    /// **Six littéraux français vécurent ici** (#4431). Ils alimentaient un menu
    /// d'appui long — une surface qu'on ouvre rarement, qu'aucun cliquet de
    /// localisation ne balaie : le cliquet français surveille les
    /// `defaultValue:` du catalogue de l'app, et ces chaînes n'y étaient pas.
    /// Elles n'étaient pas des `defaultValue`, elles ÉTAIENT la valeur.
    ///
    /// Le rail *trailing* (#4063) les a rendues permanentes dès qu'un objet est
    /// sélectionné, sur l'écran de composition le plus utilisé : un simulateur
    /// en anglais rendait alors le rail de gauche en anglais et celui de droite
    /// en français, à quelques points de distance.
    ///
    /// > **Une chaîne écrite en dur ne se signale que quand la surface qui la
    /// > porte devient visible.** Le défaut n'est pas né avec le rail — le rail
    /// > en a fait un spectacle.
    ///
    /// `bundle: .module` — ce sont des mots du SDK, servis depuis son
    /// catalogue, comme leurs voisins `story.drawEdit.tool.*`.
    ///
    /// **`@MainActor` malgré le type `nonisolated`**, et c'est le motif que le
    /// dépôt a déjà posé pour ce cas exact (`TextEditTool.accessibilityLabel`) :
    /// `Bundle.module`, généré par SPM sans annotation, tombe sous l'isolation
    /// par défaut du package. Seules des VUES lisent ce titre — le rail des
    /// contrôleurs et le menu d'appui long ; les règles pures qui décident
    /// QUELLES actions offrir (`offered`) n'en ont pas besoin et restent
    /// nonisolated, ce qui est la seule chose qui compte pour les tests et pour
    /// la politique app-side.
    @MainActor
    public var title: String {
        switch self {
        case .edit:
            return String(localized: "story.canvas.action.edit",
                          defaultValue: "Modifier", bundle: .module)
        case .duplicate:
            return String(localized: "story.canvas.action.duplicate",
                          defaultValue: "Dupliquer", bundle: .module)
        case .bringForward:
            return String(localized: "story.canvas.action.bringForward",
                          defaultValue: "Mettre au premier plan", bundle: .module)
        case .sendBackward:
            return String(localized: "story.canvas.action.sendBackward",
                          defaultValue: "Mettre à l'arrière", bundle: .module)
        case .leaveScene:
            return String(localized: "story.canvas.action.leaveScene",
                          defaultValue: "Sortir de la scène", bundle: .module)
        case .delete:
            return String(localized: "story.canvas.action.delete",
                          defaultValue: "Supprimer", bundle: .module)
        }
    }

    public var systemImage: String {
        switch self {
        case .edit:         return "pencil"
        case .duplicate:    return "doc.on.doc"
        case .bringForward: return "square.3.stack.3d.top.filled"
        case .sendBackward: return "square.2.stack.3d.bottom.filled"
        case .leaveScene:   return "rectangle.portrait.and.arrow.right"
        case .delete:       return "trash"
        }
    }
}

// MARK: - UIContextMenuInteractionDelegate (long-press / right-click)

extension StoryCanvasUIView: UIContextMenuInteractionDelegate {
    public func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
                                       configurationForMenuAtLocation location: CGPoint)
    -> UIContextMenuConfiguration? {
        guard mode == .edit, let id = hitTestItem(at: location) else { return nil }
        
        let kind: CanvasItemKind = {
            if slide.effects.textObjects.contains(where: { $0.id == id }) { return .text }
            if slide.effects.stickerObjects?.contains(where: { $0.id == id }) == true { return .sticker }
            if slide.locationObjects.contains(where: { $0.id == id }) { return .location }
            return .media
        }()

        return UIContextMenuConfiguration(
            identifier: id as NSString,
            previewProvider: nil
        ) { [weak self] _ in
            self?.contextMenu(for: id, kind: kind)
        }
    }

    /// Construit le menu de l'élément `id`. Séparé de la configuration UIKit,
    /// qui n'expose pas son `actionProvider` : c'est ici qu'un test lit ce
    /// que le menu offre.
    func contextMenu(for id: String, kind: CanvasItemKind) -> UIMenu {
        let children = StoryCanvasContextAction
            .offered(
                isLocked: isLockedItem(id: id),
                isBackground: isBackgroundItem(id: id),
                sharesPlaneWithAnother: foregroundSiblingExists(besides: id),
                hasEditor: onItemDoubleTapped != nil,
                canLeaveScene: canLeaveScene
            )
            .map { action in
                UIAction(title: action.title,
                         image: UIImage(systemName: action.systemImage),
                         attributes: action == .delete ? .destructive : []) { [weak self] _ in
                    self?.performContextAction(action, on: id, kind: kind)
                }
            }
        return UIMenu(children: children)
    }

    /// Le FOND n'est pas dans le plan : l'empiler ne veut rien dire. Lu sur
    /// l'objet lui-même plutôt que sur `hitTestItem`, qui l'exclut déjà — la
    /// règle doit rester vraie même si un appelant futur vise un fond.
    /// « Sortir de la scène » a-t-elle quelqu'un derrière elle ? Même
    /// prédicat que `hasEditor` pour « Modifier » : une action sans relais
    /// n'a aucun effet, donc n'est pas offerte (loi 4).
    var canLeaveScene: Bool { onItemLeftScene != nil }

    /// Projection de `StorySceneObjectPredicates` — la règle a été EXTRAITE
    /// pour que le rail *trailing* (#4063) pose la même question sans en
    /// recopier la réponse. Deux implémentations d'une même règle divergent
    /// sans qu'aucun témoin ne le voie : chaque copie reste cohérente avec
    /// elle-même, et le menu finit par offrir ce que le rail refuse.
    func isBackgroundItem(id: String) -> Bool {
        StorySceneObjectPredicates.isBackground(slide: slide, id: id)
    }

    /// **Un FRÈRE de plan, tous types confondus.** L'empilement raisonne sur les
    /// `zIndex` de TOUS les éléments (c'est ce que `bringForward` fait, et ce
    /// que le rendu trie) : compter les seuls médias dirait « seul » d'un objet
    /// posé sous un texte, et retirerait une action qui a bel et bien un effet.
    func foregroundSiblingExists(besides id: String) -> Bool {
        StorySceneObjectPredicates.sharesPlaneWithAnother(slide: slide, besides: id)
    }

    /// Point de passage UNIQUE entre une entrée du menu et la primitive qui
    /// l'exécute — c'est lui que les tests exercent, la configuration UIKit
    /// ne laissant pas déclencher ses `UIAction`.
    ///
    /// Les deux actions d'empilement échangeaient deux positions dans le
    /// TABLEAU `mediaObjects` alors que le rendu trie par `zIndex`
    /// (`StoryRenderer.render`) : le geste ne se voyait jamais, et ignorait
    /// textes, stickers et pastilles. `bringForward` / `sendBackward`
    /// raisonnent sur les `zIndex` de tous les types d'éléments et propagent
    /// elles-mêmes la slide.
    func performContextAction(_ action: StoryCanvasContextAction, on id: String, kind: CanvasItemKind) {
        switch action {
        case .edit:         onItemDoubleTapped?(id, kind)
        case .duplicate:    contextDuplicate(id: id)
        case .bringForward: bringForward(id: id)
        case .sendBackward: sendBackward(id: id)
        // DÉLÉGUÉE : le SDK ne sait pas ce qu'est « redevenir une slide du
        // post ». Il rend l'objet à l'hôte, qui décide de son sort.
        case .leaveScene:   onItemLeftScene?(id, kind)
        case .delete:       contextDelete(id: id)
        }
    }

    /// Provide a targeted preview so the system only lifts the specific
    /// element layer instead of the entire canvas view.
    public func contextMenuInteraction(
        _ interaction: UIContextMenuInteraction,
        previewForHighlightingMenuWithConfiguration configuration: UIContextMenuConfiguration
    ) -> UITargetedPreview? {
        return targetedPreview(for: configuration)
    }

    public func contextMenuInteraction(
        _ interaction: UIContextMenuInteraction,
        previewForDismissingMenuWithConfiguration configuration: UIContextMenuConfiguration
    ) -> UITargetedPreview? {
        return targetedPreview(for: configuration)
    }

    func targetedPreview(for configuration: UIContextMenuConfiguration) -> UITargetedPreview? {
        guard let id = configuration.identifier as? String,
              let layer = itemsContainer.sublayers?.first(where: { $0.name == id }) else { return nil }

        // Aperçu de lift transparent. `UITargetedPreview` applique un flou
        // système sur les aperçus adossés à une image, ce qui « fantômait »
        // le média pendant le long-press ; une `UIView` claire garde
        // l'élément net derrière le menu. Aucune bordure : le média porte
        // déjà son propre cadre blanc — un liseré d'aperçu en doublon était
        // superflu et a été retiré (le cadre apparaissait « à la sélection »).
        let overlay = UIView(frame: layer.frame)
        overlay.backgroundColor = .clear
        overlay.isUserInteractionEnabled = false
        addSubview(overlay)

        let params = UIPreviewParameters()
        params.backgroundColor = .clear
        let preview = UITargetedPreview(view: overlay, parameters: params)

        // Remove the temporary overlay after the menu's lift animation.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            overlay.removeFromSuperview()
        }
        return preview
    }

    // MARK: - Context menu actions

    /// These mutate the slide and re-fire onItemModified so the binding
    /// propagates back to the SwiftUI composer layer.
    /// Réordonne un élément foreground pour le placer en tête de la liste
    /// `mediaObjects` / `textObjects` / `stickerObjects`. Appelé au touch
    /// (`handlePan.began`, `handlePinch.began`, `handleRotation.began`) pour
    /// que l'élément manipulé soit immédiatement le plus en avant. No-op pour
    /// le background media (les bg restent toujours derrière les fg via le
    /// filtre de `StoryRenderer.collectItems`).
    /// Ramène l'élément touché au premier plan visuel.
    ///
    /// **Important** : le rendu canvas (`StoryRenderer.render`) trie les
    /// éléments par `zIndex` (pas par leur ordre dans les arrays).
    /// Réordonner uniquement les tableaux (`remove + append`) ne suffisait
    /// donc pas — le visuel ne bougeait pas alors que les listes de
    /// l'inspecteur (qui lisent l'ordre du tableau) reflétaient bien le
    /// mouvement. On assigne maintenant `nextTopZ()` à l'élément pour piloter
    /// le z-order de rendu, et on réordonne aussi le tableau pour rester
    /// cohérent avec l'inspecteur.
    ///
    /// **Perf** : chaque mutation passe par une copie locale puis UNE
    /// réassignation au `slide`. Mutations directes via subscript (`.foo[i]
    /// = ...`) ou `remove/append` sur la propriété déclencheraient
    /// `slide.didSet` plusieurs fois — donc `rebuildLayers()` plusieurs
    /// fois par tap — visible jitter sur les devices lents.
    ///
    /// `internal` plutôt que `private` pour symétrie avec `sendToBack(id:)`
    /// et pour permettre les tests sans simuler un tap UIKit.
    internal func bringForegroundToFront(id: String) {
        let topZ = nextTopZ()

        // Texte
        if let idx = slide.effects.textObjects.firstIndex(where: { $0.id == id }) {
            var texts = slide.effects.textObjects
            // Skip only when BOTH the z-index AND the array position
            // already reflect the "front" state — `||` would always
            // continue because `nextTopZ()` returns `currentMax + 1`,
            // so `zIndex < topZ` is always true.
            guard texts[idx].zIndex < topZ - 1
                  || idx != texts.count - 1 else { return }
            texts[idx].zIndex = topZ
            let item = texts.remove(at: idx)
            texts.append(item)
            slide.effects.textObjects = texts
            onItemModified?(slide)
            return
        }
        // Media foreground (skip si bg)
        if var medias = slide.effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == id }),
           medias[idx].isBackground == false {
            // Same `< topZ - 1` rationale as in the texts branch above.
            guard medias[idx].zIndex < topZ - 1
                  || idx != medias.count - 1 else { return }
            medias[idx].zIndex = topZ
            let item = medias.remove(at: idx)
            medias.append(item)
            slide.effects.mediaObjects = medias
            onItemModified?(slide)
            return
        }
        // Sticker
        if var stickers = slide.effects.stickerObjects,
           let idx = stickers.firstIndex(where: { $0.id == id }) {
            // Same `< topZ - 1` rationale as in the texts branch above.
            guard stickers[idx].zIndex < topZ - 1
                  || idx != stickers.count - 1 else { return }
            stickers[idx].zIndex = topZ
            let item = stickers.remove(at: idx)
            stickers.append(item)
            slide.effects.stickerObjects = stickers
            onItemModified?(slide)
            return
        }
    }

    func contextDuplicate(id: String) {
        guard !isLockedItem(id: id) else { return }
        var duplicatedNewId: String?
        var duplicatedKind: CanvasItemKind?
        // Branche media : `guard var` au lieu de `mediaObjects![idx]` — même si
        // l'optional est non-nil au moment du firstIndex (single-thread
        // MainActor), le force unwrap restait fragile face à un refacto futur.
        if var medias = slide.effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == id }) {
            var copy = medias[idx]
            let newId = UUID().uuidString
            copy.id = newId
            copy.x += 0.05
            copy.y += 0.05
            copy.isBackground = false
            copy.zIndex = nextTopZ()
            medias.append(copy)
            slide.effects.mediaObjects = medias
            duplicatedNewId = newId
            duplicatedKind = .media
        } else if let idx = slide.effects.textObjects.firstIndex(where: { $0.id == id }) {
            var copy = slide.effects.textObjects[idx]
            let newId = UUID().uuidString
            copy.id = newId
            copy.x += 0.05
            copy.y += 0.05
            copy.zIndex = nextTopZ()
            slide.effects.textObjects.append(copy)
            duplicatedNewId = newId
            duplicatedKind = .text
        } else if var stickers = slide.effects.stickerObjects,
                  let idx = stickers.firstIndex(where: { $0.id == id }) {
            // Parité avec `duplicateItem` (ligne 2706) — la branche sticker
            // manquait dans le context menu : tap "Dupliquer" sur un sticker
            // restait un no-op silencieux.
            var copy = stickers[idx]
            let newId = UUID().uuidString
            copy.id = newId
            copy.x += 0.05
            copy.y += 0.05
            copy.zIndex = nextTopZ()
            stickers.append(copy)
            slide.effects.stickerObjects = stickers
            duplicatedNewId = newId
            duplicatedKind = .sticker
        } else if let idx = slide.locationObjects.firstIndex(where: { $0.id == id }) {
            var copy = slide.locationObjects[idx]
            let newId = UUID().uuidString
            copy.id = newId
            copy.x += 0.05
            copy.y += 0.05
            copy.zIndex = nextTopZ()
            slide.locationObjects.append(copy)
            duplicatedNewId = newId
            duplicatedKind = .location
        }
        onItemModified?(slide)
        if let newId = duplicatedNewId, let kind = duplicatedKind {
            onItemDuplicated?(id, newId, kind)
        }
    }

    func contextDelete(id: String) {
        guard !isLockedItem(id: id) else { return }
        slide.effects.mediaObjects?.removeAll { $0.id == id }
        slide.effects.textObjects.removeAll { $0.id == id }
        slide.effects.stickerObjects?.removeAll { $0.id == id }
        slide.locationObjects.removeAll { $0.id == id }
        onItemModified?(slide)
    }
}
