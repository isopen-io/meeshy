import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + Accessibility

extension StoryCanvasUIView {
    public override var isAccessibilityElement: Bool {
        get { false }
        set {}
    }

    public override var accessibilityElements: [Any]? {
        get { synthesizedAccessibilityElements() }
        set {}
    }

    func synthesizedAccessibilityElements() -> [Any]? {
        switch mode {
        case .edit:
            return editAccessibilityElements()
        case .play:
            return playAccessibilityElements()
        }
    }

    func editAccessibilityElements() -> [UIAccessibilityElement] {
        var elements: [UIAccessibilityElement] = []
        for txt in slide.effects.textObjects {
            elements.append(makeAccessibilityElement(
                label: "Texte : \(txt.text)",
                traits: .staticText,
                id: txt.id,
                allowCustomActions: true
            ))
        }
        for media in slide.effects.mediaObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: media.kind == .video ? "Vidéo" : "Image",
                traits: .image,
                id: media.id,
                allowCustomActions: true
            ))
        }
        for sticker in slide.effects.stickerObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: "Sticker \(sticker.emoji)",
                traits: .image,
                id: sticker.id,
                allowCustomActions: true
            ))
        }
        return elements
    }

    /// Builds VoiceOver elements for `.play` (reader) mode.
    ///
    /// Prisme Linguistique : `StoryTextObject.resolvedText(preferredLanguages:)`
    /// is used so the spoken label matches the language the user sees
    /// (`systemLanguage` > `regionalLanguage` > `customDestinationLanguage`).
    /// Background media is announced explicitly ("Photo de fond" / "Vidéo de fond")
    /// because it covers the full canvas and would otherwise be invisible
    /// to VoiceOver. Custom destructive actions (delete/duplicate/back) are
    /// suppressed in `.play` — they only make sense while composing.
    func playAccessibilityElements() -> [UIAccessibilityElement] {
        let languages = readerContext.preferredLanguages
        var elements: [UIAccessibilityElement] = []
        for media in slide.effects.mediaObjects ?? [] where media.isBackground {
            elements.append(makeAccessibilityElement(
                label: media.kind == .video ? "Vidéo de fond" : "Photo de fond",
                traits: .image,
                id: media.id,
                allowCustomActions: false
            ))
        }
        for txt in slide.effects.textObjects {
            let resolved = txt.resolvedText(preferredLanguages: languages)
            elements.append(makeAccessibilityElement(
                label: resolved,
                traits: .staticText,
                id: txt.id,
                allowCustomActions: false
            ))
        }
        for media in slide.effects.mediaObjects ?? [] where !media.isBackground {
            elements.append(makeAccessibilityElement(
                label: media.kind == .video ? "Vidéo" : "Image",
                traits: .image,
                id: media.id,
                allowCustomActions: false
            ))
        }
        for sticker in slide.effects.stickerObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: stickerAccessibilityLabel(for: sticker),
                traits: .image,
                id: sticker.id,
                allowCustomActions: false
            ))
        }
        return elements
    }

    func makeAccessibilityElement(label: String,
                                          traits: UIAccessibilityTraits,
                                          id: String,
                                          allowCustomActions: Bool) -> UIAccessibilityElement {
        let el = UIAccessibilityElement(accessibilityContainer: self)
        el.accessibilityLabel = label
        el.accessibilityTraits = traits
        el.accessibilityFrameInContainerSpace = accessibilityFrame(forId: id)
        if allowCustomActions {
            el.accessibilityCustomActions = makeCustomActions(forId: id)
        }
        return el
    }

    /// Returns the frame the accessibility element should occupy, in this
    /// view's container space.
    ///
    /// Strategy:
    /// 1. Prefer the live `CALayer` frame on `itemsContainer` (set by the
    ///    renderer during `rebuildLayers()`). This is the most accurate frame
    ///    once layers exist.
    /// 2. Fall back to projecting the design-space position of the item
    ///    through `CanvasGeometry.render(_:)` when no layer is present yet
    ///    (e.g. when VoiceOver queries before the first layout pass).
    /// 3. Default to `.zero` when the item id is unknown.
    func accessibilityFrame(forId id: String) -> CGRect {
        if let layerFrame = itemsContainer.sublayers?.first(where: { $0.name == id })?.frame,
           layerFrame != .zero {
            return layerFrame
        }
        return projectedDesignFrame(forId: id) ?? .zero
    }

    /// Returns a coarse render-space frame computed from the item's normalised
    /// (0–1) position via `CanvasGeometry.render(_:)`. Used as a fallback when
    /// the CALayer hasn't been built yet so VoiceOver focus is still located
    /// roughly where the item will appear.
    func projectedDesignFrame(forId id: String) -> CGRect? {
        let g = geometry
        guard g.renderSize.width > 0 else { return nil }
        if let t = slide.effects.textObjects.first(where: { $0.id == id }) {
            let designSize = CGSize(
                width: CGFloat(t.fontSize) * CGFloat(max(t.scale, 0.1)) * 6,
                height: CGFloat(t.fontSize) * CGFloat(max(t.scale, 0.1)) * 1.4
            )
            return centeredFrame(normalizedX: CGFloat(t.x),
                                 normalizedY: CGFloat(t.y),
                                 designSize: designSize,
                                 geometry: g)
        }
        if let m = slide.effects.mediaObjects?.first(where: { $0.id == id }) {
            if m.isBackground {
                return CGRect(origin: .zero, size: g.renderSize)
            }
            let side: CGFloat = 540
            let designSize = CGSize(width: side * CGFloat(m.scale),
                                    height: side * CGFloat(m.scale) / CGFloat(max(m.aspectRatio, 0.01)))
            return centeredFrame(normalizedX: CGFloat(m.x),
                                 normalizedY: CGFloat(m.y),
                                 designSize: designSize,
                                 geometry: g)
        }
        if let s = slide.effects.stickerObjects?.first(where: { $0.id == id }) {
            let side = CGFloat(s.baseSize) * CGFloat(max(s.scale, 0.1))
            return centeredFrame(normalizedX: CGFloat(s.x),
                                 normalizedY: CGFloat(s.y),
                                 designSize: CGSize(width: side, height: side),
                                 geometry: g)
        }
        return nil
    }

    func centeredFrame(normalizedX nx: CGFloat,
                               normalizedY ny: CGFloat,
                               designSize: CGSize,
                               geometry g: CanvasGeometry) -> CGRect {
        let designCenter = g.designPoint(forNormalized: CGPoint(x: nx, y: ny))
        let designOrigin = CGPoint(x: designCenter.x - designSize.width / 2,
                                   y: designCenter.y - designSize.height / 2)
        let renderOrigin = g.render(designOrigin)
        let renderSize = g.render(designSize)
        return CGRect(origin: renderOrigin, size: renderSize)
    }

    /// Heuristic VoiceOver label for a sticker.
    ///
    /// `StorySticker.emoji` may be either a literal emoji glyph or, for
    /// custom-image stickers, an asset identifier. We use the Unicode
    /// "Name" property to provide a localized name when present (e.g. "🔥"
    /// → "Fire"); otherwise we fall back to "Sticker".
    func stickerAccessibilityLabel(for sticker: StorySticker) -> String {
        let emoji = sticker.emoji
        if !emoji.isEmpty,
           let scalar = emoji.unicodeScalars.first,
           let name = scalar.properties.nameAlias ?? scalar.properties.name,
           !name.isEmpty {
            return "Sticker \(name.capitalized)"
        }
        return "Sticker"
    }

    func makeCustomActions(forId id: String) -> [UIAccessibilityCustomAction] {
        [
            UIAccessibilityCustomAction(name: "Supprimer") { [weak self] _ in
                self?.deleteItem(id: id)
                return true
            },
            UIAccessibilityCustomAction(name: "Dupliquer") { [weak self] _ in
                self?.duplicateItem(id: id)
                return true
            },
            UIAccessibilityCustomAction(name: "Mettre à l'arrière") { [weak self] _ in
                self?.sendToBack(id: id)
                return true
            },
        ]
    }
}
