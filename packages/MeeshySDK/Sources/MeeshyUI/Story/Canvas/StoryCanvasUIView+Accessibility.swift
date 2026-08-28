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
                label: "\(textAccessibilityPrefix) : \(txt.text)",
                traits: .staticText,
                id: txt.id,
                editableKind: .text
            ))
        }
        for media in slide.effects.mediaObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: mediaAccessibilityLabel(kind: media.kind),
                traits: .image,
                id: media.id,
                editableKind: .media
            ))
        }
        for sticker in slide.effects.stickerObjects ?? [] {
            elements.append(makeAccessibilityElement(
                // Même helper de résolution du nom Unicode qu'en `.play` —
                // la concaténation brute de l'emoji faisait épeler "feu-de-
                // camp-glyphe-inconnu" à VoiceOver en édition au lieu de
                // "Sticker Fire".
                label: stickerAccessibilityLabel(for: sticker),
                traits: .image,
                id: sticker.id,
                editableKind: .sticker
            ))
        }
        for location in slide.locationObjects {
            elements.append(makeAccessibilityElement(
                label: locationAccessibilityLabel(for: location),
                traits: .staticText,
                id: location.id,
                editableKind: .location
            ))
        }
        // Un container UIKit qui expose des enfants via `accessibilityElements`
        // ne peut PAS aussi porter son propre label (`isAccessibilityElement`
        // reste `false` sur la vue) — la synthèse "Story, N objets : …" est
        // donc un élément de LISTE supplémentaire, prépendu, jamais une
        // propriété du container. Rien à résumer sur un slide vide : la
        // surface `blankCanvasStarters` (SwiftUI, ses propres libellés/actions
        // déjà annotés) se superpose au canvas UIKit dans cet état — un résumé
        // fantôme ici ferait doublon.
        guard !elements.isEmpty else { return elements }
        let summaryLabels = elements.compactMap(\.accessibilityLabel)
        return [compositionSummaryElement(objectLabels: summaryLabels)] + elements
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
                label: media.kind == .video
                    ? String(localized: "story.canvas.a11y.backgroundVideo", defaultValue: "Vidéo de fond", bundle: .module)
                    : String(localized: "story.canvas.a11y.backgroundPhoto", defaultValue: "Photo de fond", bundle: .module),
                traits: .image,
                id: media.id,
                editableKind: nil
            ))
        }
        for txt in slide.effects.textObjects {
            let resolved = txt.resolvedText(preferredLanguages: languages)
            elements.append(makeAccessibilityElement(
                label: resolved,
                traits: .staticText,
                id: txt.id,
                editableKind: nil
            ))
        }
        for media in slide.effects.mediaObjects ?? [] where !media.isBackground {
            elements.append(makeAccessibilityElement(
                label: mediaAccessibilityLabel(kind: media.kind),
                traits: .image,
                id: media.id,
                editableKind: nil
            ))
        }
        for sticker in slide.effects.stickerObjects ?? [] {
            elements.append(makeAccessibilityElement(
                label: stickerAccessibilityLabel(for: sticker),
                traits: .image,
                id: sticker.id,
                editableKind: nil
            ))
        }
        return elements
    }

    /// `editableKind` collapses what used to be a `Bool` (allow custom
    /// actions?) plus an implicit "which kind is this?" carried elsewhere —
    /// a redundant bool+context pair. `nil` means read-only (`.play`);
    /// non-nil both turns custom actions on AND tells `makeCustomActions`
    /// which ones apply (only `.text`/`.media` get "Modifier").
    func makeAccessibilityElement(label: String,
                                          traits: UIAccessibilityTraits,
                                          id: String,
                                          editableKind: CanvasItemKind?) -> UIAccessibilityElement {
        let el = UIAccessibilityElement(accessibilityContainer: self)
        el.accessibilityLabel = label
        el.accessibilityTraits = traits
        el.accessibilityFrameInContainerSpace = accessibilityFrame(forId: id)
        if let editableKind {
            el.accessibilityCustomActions = makeCustomActions(forId: id, kind: editableKind)
        }
        return el
    }

    /// Synthesized VoiceOver overview of the whole slide, prepended ahead of
    /// the per-object elements — the first swipe stop on a non-empty canvas
    /// is now "Story, 3 objets : Texte «Bonjour», Image, Sticker Fire"
    /// instead of an arbitrary first object with no sense of the whole.
    /// Read-only (no custom actions) — it doesn't represent a manipulable
    /// item, just a summary.
    func compositionSummaryElement(objectLabels: [String]) -> UIAccessibilityElement {
        let count = objectLabels.count
        let countLabel = count == 1
            ? String(localized: "story.composer.a11y.compositionCount.one", defaultValue: "1 objet", bundle: .module)
            : String(localized: "story.composer.a11y.compositionCount.many", defaultValue: "\(count) objets", bundle: .module)
        let joined = objectLabels.joined(separator: ", ")
        let el = UIAccessibilityElement(accessibilityContainer: self)
        el.accessibilityLabel = String(localized: "story.composer.a11y.composition",
                                       defaultValue: "Story, \(countLabel) : \(joined)",
                                       bundle: .module)
        el.accessibilityTraits = .staticText
        el.accessibilityFrameInContainerSpace = bounds
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
            return "\(stickerAccessibilityWord) \(name.capitalized)"
        }
        return stickerAccessibilityWord
    }

    var stickerAccessibilityWord: String {
        String(localized: "story.canvas.a11y.sticker", defaultValue: "Sticker", bundle: .module)
    }

    /// Mirror of `stickerAccessibilityLabel(for:)` for location pins — "Lieu"
    /// alone, or "Lieu : {name}" when the reverse-geocoded POI has a name.
    func locationAccessibilityLabel(for location: StoryLocationObject) -> String {
        guard let name = location.place.name, !name.isEmpty else { return locationAccessibilityWord }
        return "\(locationAccessibilityWord) : \(name)"
    }

    var locationAccessibilityWord: String {
        String(localized: "story.canvas.a11y.location", defaultValue: "Lieu", bundle: .module)
    }

    var textAccessibilityPrefix: String {
        String(localized: "story.canvas.a11y.textPrefix", defaultValue: "Texte", bundle: .module)
    }

    func mediaAccessibilityLabel(kind: StoryMediaKind?) -> String {
        kind == .video
            ? String(localized: "story.media.video", defaultValue: "Vidéo", bundle: .module)
            : String(localized: "story.media.image", defaultValue: "Image", bundle: .module)
    }

    /// "Modifier" is added ONLY for `.text`/`.media` — the two kinds that
    /// actually open an editor on double-tap (`onItemDoubleTapped`, wired by
    /// the composer to `enterTextEditingMode`/`openMediaEditor`). `.sticker`
    /// and `.location` route the same callback to a `break` (nothing to
    /// edit — they move/resize by touch and are removed via the menu), so
    /// advertising "Modifier" for them would be a VoiceOver dead end (D4).
    ///
    /// Note: the long-press context menu (`StoryCanvasUIView+ContextMenu`)
    /// already offers "Modifier" unconditionally for every kind, including
    /// sticker/location — the SAME dead end exists there today for sighted
    /// users, pre-existing and out of this pass's scope. Not replicating it
    /// here for VoiceOver avoids adding a NEW instance of the same gap.
    ///
    /// Un élément verrouillé (badge d'attribution d'une republication) n'offre
    /// ni « Modifier », ni « Supprimer », ni « Dupliquer » — la règle est
    /// celle du menu long-press (`StoryCanvasContextAction.offered`) : les
    /// annoncer sur un élément qui les refuse serait le même cul-de-sac.
    func makeCustomActions(forId id: String, kind: CanvasItemKind) -> [UIAccessibilityCustomAction] {
        // **La MÊME règle que le menu long-press (#4046)** — annoncer à
        // VoiceOver une action que le menu visuel ne sert pas rouvrirait le
        // cul-de-sac par l'autre porte : « Mettre au premier plan » sur un objet
        // seul de son plan ne déplace rien, et l'annoncer serait pire que de
        // l'omettre, puisque rien ne le dit à l'oreille.
        let offered = StoryCanvasContextAction.offered(
            isLocked: isLockedItem(id: id),
            isBackground: isBackgroundItem(id: id),
            sharesPlaneWithAnother: foregroundSiblingExists(besides: id),
            hasEditor: onItemDoubleTapped != nil
        )
        var actions: [UIAccessibilityCustomAction] = []
        if offered.contains(.edit), kind == .text || kind == .media {
            actions.append(UIAccessibilityCustomAction(
                name: String(localized: "story.composer.editSlide", defaultValue: "Modifier", bundle: .module)
            ) { [weak self] _ in
                // Réutilise EXACTEMENT le canal du double-tap / menu
                // contextuel — le SDK ne décide pas QUOI faire à l'édition
                // (SDK Purity), il rejoue le callback déjà câblé par l'app.
                self?.onItemDoubleTapped?(id, kind)
                return true
            })
        }
        if offered.contains(.delete) {
            actions.append(UIAccessibilityCustomAction(
                name: String(localized: "story.composer.deleteSlide", defaultValue: "Supprimer", bundle: .module)
            ) { [weak self] _ in
                self?.deleteItem(id: id)
                return true
            })
        }
        if offered.contains(.duplicate) {
            actions.append(UIAccessibilityCustomAction(
                name: String(localized: "story.composer.duplicateSlide", defaultValue: "Dupliquer", bundle: .module)
            ) { [weak self] _ in
                self?.duplicateItem(id: id)
                return true
            })
        }
        actions.append(UIAccessibilityCustomAction(
            name: String(localized: "story.canvas.a11y.sendToBack", defaultValue: "Mettre à l'arrière", bundle: .module)
        ) { [weak self] _ in
            self?.sendToBack(id: id)
            return true
        })
        return actions
    }
}
