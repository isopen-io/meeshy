import CoreGraphics
import Foundation

/// Ce qui se peint : un montage classique, ou un cadre du catalogue (#8742).
nonisolated enum CallCaptureLook: Equatable, Sendable {
    case classic(CallMontageStyle)
    case frame(CallFrameDesign)
}

/// Les mêmes visages, sous les deux formes que les deux peintres lisent. Une caméra coupée
/// garde sa case (`image == nil` ⇒ l'initiale), et rien n'est jamais mis en miroir ici :
/// l'orientation est celle du grabber, la même pour un classique et pour un cadre.
nonisolated struct CallCaptureFaces: @unchecked Sendable {
    let montage: [CallMontagePortrait]
    let frame: [CallFramePortrait]

    var isEmpty: Bool { montage.isEmpty }
}

/// Un tour de l'aperçu : ce qui est choisi, et les vignettes de la fenêtre visible.
nonisolated struct CallCaptureLiveRequest: Sendable {
    let look: CallCaptureLook
    let classics: [CallMontageStyle]
    let frames: [CallFrameDesign]
}

nonisolated struct CallCaptureLivePreviews: @unchecked Sendable {
    let thumbnails: [CallMontageStyle: CGImage]
    let frameThumbnails: [String: CGImage]
    let preview: CGImage?

    static let empty = CallCaptureLivePreviews(thumbnails: [:], frameThumbnails: [:], preview: nil)
}

/// #8742 · #8743 — les cadres dans le mode Montage : quel peintre, quels visages, quelles
/// vignettes. Ce qui MUTE le contrôleur reste dans `CallCaptureController.swift`.
extension CallCaptureController {
    /// Le cadre choisi, ou le classique. Un identifiant inconnu du catalogue retombe sur le classique.
    func captureLook(for choice: CallMontageChoice) -> CallCaptureLook {
        switch choice {
        case .classic(let classic):
            return .classic(classic)
        case .frame(let id):
            return CallMontageFrameRule.design(id: id).map { CallCaptureLook.frame($0) } ?? .classic(style)
        }
    }

    func portraitSet(from snapshot: CallFrameSnapshot) -> CallCaptureFaces {
        CallCaptureFaces(montage: portraits(from: snapshot), frame: framePortraits(from: snapshot))
    }

    /// Chaque personne de l'appel, moi compris et marqué, avec son @pseudo quand il est connu.
    func framePortraits(from snapshot: CallFrameSnapshot) -> [CallFramePortrait] {
        subjects.map { subject in
            CallFramePortrait(
                id: subject.id,
                name: subject.name,
                handle: subject.handle,
                isSelf: subject.isSelf,
                image: subject.showsVideo ? snapshot.images[subject.id] : nil
            )
        }
    }

    /// La vignette d'un cadre pour le nombre de personnes de l'appel, si elle est prête.
    func frameThumbnail(_ id: String) -> CGImage? {
        frameThumbnails.image(frameId: id, people: subjects.count, size: Self.thumbnailCanvas)
    }

    /// Ce que la scène montre au moment du choix, en attendant son rendu : sa vignette.
    func placeholder(for choice: CallMontageChoice) -> CGImage? {
        switch choice {
        case .classic(let classic): return thumbnails[classic]
        case .frame(let id): return frameThumbnail(id)
        }
    }

    /// Les vignettes du carrousel affiché sont-elles toutes là ?
    func hasThumbnails(for choice: CallMontageChoice) -> Bool {
        switch choice {
        case .classic:
            return !thumbnails.isEmpty
        case .frame:
            let window = frameWindow(for: choice)
            return !window.isEmpty && window.allSatisfy { frameThumbnail($0.id) != nil }
        }
    }

    /// Les classiques ne se refont que quand leur carrousel est affiché.
    func classicWindow(for choice: CallMontageChoice) -> [CallMontageStyle] {
        guard case .classic(let classic) = choice else { return [] }
        return Self.thumbnailWindow(selected: classic, in: CallMontageStyle.allCases, radius: Self.thumbnailRadius)
    }

    /// Les cadres de l'ambiance choisie pour `n`, à `thumbnailRadius` du cadre choisi — jamais tout le catalogue.
    func frameWindow(for choice: CallMontageChoice) -> [CallFrameDesign] {
        guard case .frame(let id) = choice, case .mood(let mood) = CallMontageFrameRule.chip(of: choice) else { return [] }
        let frames = CallFrameCatalogue.frames(forPeople: subjects.count, mood: mood)
        let ids = Self.thumbnailWindow(around: id, in: frames.map(\.id), radius: Self.thumbnailRadius)
        return frames.filter { ids.contains($0.id) }
    }

    // MARK: - Peindre, hors du thread principal

    nonisolated static func render(_ look: CallCaptureLook, faces: CallCaptureFaces, caption: CallMontageCaption, texts: CallFrameTexts, size: CGSize) -> CGImage? {
        switch look {
        case .classic(let classic):
            return CallMontageRenderer.render(style: classic, portraits: faces.montage, canvas: size, caption: caption)
        case .frame(let design):
            return CallFrameRenderer.render(frame: design, portraits: faces.frame, texts: texts, size: size)
        }
    }

    nonisolated static func renderLive(_ request: CallCaptureLiveRequest, faces: CallCaptureFaces, caption: CallMontageCaption, texts: CallFrameTexts) -> CallCaptureLivePreviews {
        guard !faces.isEmpty else { return .empty }
        let classics = request.classics.reduce(into: [CallMontageStyle: CGImage]()) { result, classic in
            result[classic] = CallMontageRenderer.render(style: classic, portraits: faces.montage, canvas: thumbnailCanvas, caption: caption)
        }
        let frames = request.frames.reduce(into: [String: CGImage]()) { result, design in
            result[design.id] = CallFrameRenderer.render(frame: design, portraits: faces.frame, texts: texts, size: thumbnailCanvas)
        }
        let preview = render(request.look, faces: faces, caption: caption, texts: texts, size: previewCanvas)
        return CallCaptureLivePreviews(thumbnails: classics, frameThumbnails: frames, preview: preview)
    }
}
