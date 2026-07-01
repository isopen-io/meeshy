import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - UIContextMenuInteractionDelegate (long-press / right-click)

extension StoryCanvasUIView: UIContextMenuInteractionDelegate {
    public func contextMenuInteraction(_ interaction: UIContextMenuInteraction,
                                       configurationForMenuAtLocation location: CGPoint)
    -> UIContextMenuConfiguration? {
        guard mode == .edit, let id = hitTestItem(at: location) else { return nil }
        
        let kind: CanvasItemKind = {
            if slide.effects.textObjects.contains(where: { $0.id == id }) { return .text }
            if slide.effects.stickerObjects?.contains(where: { $0.id == id }) == true { return .sticker }
            return .media
        }()

        return UIContextMenuConfiguration(
            identifier: id as NSString,
            previewProvider: nil
        ) { [weak self] _ in
            UIMenu(children: [
                UIAction(title: "Modifier",
                         image: UIImage(systemName: "pencil")) { _ in
                    self?.onItemDoubleTapped?(id, kind)
                },
                UIAction(title: "Dupliquer",
                         image: UIImage(systemName: "doc.on.doc")) { _ in
                    self?.contextDuplicate(id: id)
                },
                UIAction(title: "Mettre au premier plan",
                         image: UIImage(systemName: "square.3.stack.3d.top.filled")) { _ in
                    self?.contextBringForward(id: id)
                },
                UIAction(title: "Mettre à l'arrière",
                         image: UIImage(systemName: "square.2.stack.3d.bottom.filled")) { _ in
                    self?.contextSendBackward(id: id)
                },
                UIAction(title: "Supprimer",
                         image: UIImage(systemName: "trash"),
                         attributes: .destructive) { _ in
                    self?.contextDelete(id: id)
                },
            ])
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
        }
        onItemModified?(slide)
        if let newId = duplicatedNewId, let kind = duplicatedKind {
            onItemDuplicated?(id, newId, kind)
        }
    }

    func contextBringForward(id: String) {
        if var medias = slide.effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == id }),
           idx < medias.count - 1 {
            medias.swapAt(idx, idx + 1)
            slide.effects.mediaObjects = medias
            onItemModified?(slide)
        }
    }

    func contextSendBackward(id: String) {
        if var medias = slide.effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == id }),
           idx > 0 {
            medias.swapAt(idx, idx - 1)
            slide.effects.mediaObjects = medias
            onItemModified?(slide)
        }
    }

    func contextDelete(id: String) {
        slide.effects.mediaObjects?.removeAll { $0.id == id }
        slide.effects.textObjects.removeAll { $0.id == id }
        slide.effects.stickerObjects?.removeAll { $0.id == id }
        onItemModified?(slide)
    }
}
