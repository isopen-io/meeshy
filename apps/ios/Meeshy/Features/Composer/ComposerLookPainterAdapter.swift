import CoreGraphics
import CoreImage
import Foundation
import MeeshySDK
import MeeshyUI
import os

// MARK: - Le look de la retouche, RÉGLAGE d'un objet de la scène (#13840)

/// **La traduction entre le look de la retouche et le réglage que le SDK porte.**
///
/// Le SDK ne connaît que des identifiants opaques (`StoryMediaLook`) ; l'app
/// seule sait ce qu'est un filtre de l'appel, un cadre du Montage ou un effet de
/// visage. Un identifiant inconnu (client plus récent, cadre retiré du
/// catalogue) se lit « aucun » plutôt que de faire tomber le rendu.
nonisolated enum ComposerMediaLookMapping {

    static func storyLook(_ look: ComposerPhotoLook, framing: ComposerFraming = .identity) -> StoryMediaLook {
        StoryMediaLook(
            filterPreset: look.filter == .natural ? nil : look.filter.rawValue,
            frameId: look.frame == .none ? nil : ComposerLookSceneKey.token(look.frame),
            faceEffect: look.effect == .none ? nil : look.effect.rawValue,
            framing: framing.isIdentity ? nil : StoryMediaFraming(centerX: Double(framing.center.x),
                                                                  centerY: Double(framing.center.y),
                                                                  scale: Double(framing.scale)))
    }

    static func photoLook(_ look: StoryMediaLook?) -> ComposerPhotoLook {
        ComposerPhotoLook(filter: look?.filterPreset.flatMap(VideoFilterPreset.init(rawValue:)) ?? .natural,
                          frame: frame(token: look?.frameId),
                          effect: look?.faceEffect.flatMap(CallFaceEffect.init(rawValue:)) ?? .none)
    }

    static func framing(_ look: StoryMediaLook?) -> ComposerFraming {
        guard let cadrage = look?.framing, !cadrage.isIdentity else { return .identity }
        return ComposerFraming(center: CGPoint(x: cadrage.centerX, y: cadrage.centerY), scale: CGFloat(cadrage.scale))
    }

    /// Le jeton écrit par `ComposerLookSceneKey.token` : `classic:<style>` ou `frame:<id>`.
    static func frame(token: String?) -> ComposerPhotoFrame {
        guard let token, let separateur = token.firstIndex(of: ":") else { return .none }
        let genre = token[..<separateur]
        let valeur = String(token[token.index(after: separateur)...])
        switch genre {
        case "classic": return CallMontageStyle(rawValue: valeur).map { .montage(.classic($0)) } ?? .none
        case "frame": return CallMontageFrameRule.design(id: valeur) == nil ? .none : .montage(.frame(valeur))
        default: return .none
        }
    }

    /// Le look de l'objet change-t-il quelque chose à ses pixels ?
    static func paints(_ look: StoryMediaLook?) -> Bool {
        !photoLook(look).isUntouched || !framing(look).isIdentity
    }
}

/// **LE peintre du look, branché sur le canvas du SDK** (#13840, spec § 3.2).
///
/// Le même graphe que le viseur, la retouche et l'export (`ComposerLookPainter`) :
/// ce que le canvas montre d'un média réglé est ce que la publication cuira
/// (loi 6). Le cadre se pose dans la propre étendue du média — ses proportions ne
/// changent pas —, et sa scène cuite est gardée par taille de toile.
nonisolated final class ComposerLookPainterAdapter: StoryMediaLookPainting {

    static let shared = ComposerLookPainterAdapter()

    /// Les scènes de cadre cuites, par toile — bornées : un média réglé n'en
    /// demande qu'une ou deux, la file vidéo les relit à chaque trame.
    private static let sceneLimit = 8

    private let person = OSAllocatedUnfairLock(
        initialState: ComposerPhotoLookPerson.author(id: nil, displayName: nil, username: nil))
    private let scenes = OSAllocatedUnfairLock(initialState: [String: CallLiveFrameScene]())
    private let stillFaces = ComposerFaceEffects.export()

    /// Pose le peintre au démarrage du processus : avant lui, un look se lit neutre.
    static func install() {
        StoryMediaLookPainterRegistry.painter = shared
    }

    /// L'auteur que les cadres écrivent — relu sur le fil principal, porté au rendu.
    @MainActor
    func refreshAuthor() {
        let moi = AuthManager.shared.currentUser
        let auteur = ComposerPhotoLookPerson.author(id: moi?.id, displayName: moi?.displayName, username: moi?.username)
        person.withLock { $0 = auteur }
    }

    var author: CallFramePerson { person.withLock { $0 } }

    func paint(_ image: CIImage, look: StoryMediaLook, still: Bool) -> CIImage {
        let regard = ComposerMediaLookMapping.photoLook(look)
        let cadrage = ComposerMediaLookMapping.framing(look)
        guard !regard.isUntouched || !cadrage.isIdentity, !image.extent.isInfinite else { return image }
        let origine = image.extent.origin
        let debout = image.transformed(by: CGAffineTransform(translationX: -origine.x, y: -origine.y))
        let toile = CGSize(width: debout.extent.width.rounded(), height: debout.extent.height.rounded())
        guard toile.width >= 1, toile.height >= 1 else { return image }
        let scene = regard.frame == .none ? nil : self.scene(for: regard, canvas: toile)
        let peint = scene == nil && regard.frame != .none ? regard.withoutFrame : regard
        let rendu = ComposerLookPainter.paint(debout, look: peint, framing: cadrage, scene: scene, canvas: toile,
                                              faces: still ? stillFaces : .live, still: still)
        return rendu.cropped(to: CGRect(origin: .zero, size: toile))
            .transformed(by: CGAffineTransform(translationX: origine.x, y: origine.y))
    }

    private func scene(for look: ComposerPhotoLook, canvas: CGSize) -> CallLiveFrameScene? {
        let cle = ComposerLookSceneKey(look: look, canvas: canvas, date: Date(), person: author)
        let nom = cle.cacheKey as String
        if let deja = scenes.withLock({ $0[nom] }) { return deja }
        guard let cuite = ComposerLookPainter.scene(for: cle) else { return nil }
        scenes.withLock { cache in
            if cache.count >= Self.sceneLimit { cache.removeAll(keepingCapacity: true) }
            cache[nom] = cuite
        }
        return cuite
    }
}
