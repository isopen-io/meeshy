import CoreGraphics
import Foundation

/// Pourquoi un cadre choisi n'est pas montré : l'appareil se protège, ou le cadre bouge
/// alors que l'utilisateur a demandé moins d'animations.
nonisolated enum CallLiveFrameSuspension: Equatable, Sendable {
    case deviceConstrained
    case reduceMotion
}

/// Ce que l'écran d'appel montre autour des deux vidéos.
nonisolated enum CallLiveFrameDisplay: Equatable, Sendable {
    case none
    case frame(CallFrameDesign)
    case suspended(CallFrameDesign, CallLiveFrameSuspension)

    var design: CallFrameDesign? {
        guard case .frame(let design) = self else { return nil }
        return design
    }
}

/// Ce qui oblige à REPEINDRE les couches du cadre (doc frames 06 § 4.1) : le cadre, les
/// personnes (arrivée, départ, nom partagé), les textes (vérifiés une fois par minute) et
/// la taille (rotation, redimensionnement). Rien d'autre — jamais une image vidéo.
nonisolated struct CallLiveFrameLayerInputs: Equatable, Sendable {
    let frameId: String
    let people: [CallFramePerson]
    let texts: CallFrameTexts
    let size: CGSize
}

/// **LE CADRE EN DIRECT D'UN APPEL À DEUX** (#9214, doc frames 06 § 4, étape 3.2) — les
/// règles pures : quels cadres se proposent, quand un cadre choisi s'affiche, à quelle taille
/// ses couches se peignent, et qui s'y nomme.
nonisolated enum CallLiveFrameRule {
    static let people = 2
    static let idMaxLength = 96
    /// Le plus long côté des couches peintes : au-delà, la carte graphique agrandit, le
    /// processeur ne peint pas des millions de pixels de plus pour un trait.
    static let paintLongestSide: CGFloat = 2048
    private static let idAlphabet = Set("abcdefghijklmnopqrstuvwxyz0123456789-")

    /// Un cadre se propose en direct s'il sert un duo et qu'il le déclare — ou, tant que le
    /// catalogue ne déclare pas encore ses surfaces, s'il est léger ou sans coût déclaré.
    static func isEligible(_ design: CallFrameDesign) -> Bool {
        guard design.serves(people: people) else { return false }
        if design.isOffered(on: .live) { return true }
        return design.cost == nil || design.cost == .light
    }

    static func frames(mood: CallFrameMood? = nil, in catalogue: [CallFrameDesign] = CallFrameCatalogue.all) -> [CallFrameDesign] {
        catalogue.filter { isEligible($0) && (mood == nil || $0.mood == mood) }
    }

    /// Les ambiances qui ont au moins un cadre en direct, dans l'ordre canonique.
    static func moods(in catalogue: [CallFrameDesign] = CallFrameCatalogue.all) -> [CallFrameMood] {
        let served = Set(frames(in: catalogue).map(\.mood.rawValue))
        return CallFrameMood.allCases.filter { served.contains($0.rawValue) }
    }

    /// Un cadre bouge s'il porte un ornement animé ou une couche de scène.
    static func animates(_ design: CallFrameDesign) -> Bool {
        design.look.ornaments.contains { $0.motion != .still } || !design.look.scene.isEmpty
    }

    /// L'entrée « Cadre » n'existe qu'en vidéo, à deux.
    static func mayOffer(participants: Int, showsVideo: Bool) -> Bool {
        showsVideo && participants == people
    }

    /// La forme d'un identifiant du catalogue, celle que la passerelle exige.
    static func isFrameId(_ value: String) -> Bool {
        guard !value.isEmpty, value.count <= idMaxLength else { return false }
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard (2...4).contains(parts.count) else { return false }
        return parts.allSatisfy { part in !part.isEmpty && part.allSatisfy { idAlphabet.contains($0) } }
    }

    /// Le cadre choisi devient-il visible ? Duo seulement ; coupé quand l'appareil se protège ;
    /// coupé sous « Réduire les animations » s'il bouge — un cadre statique reste permis.
    static func display(
        frameId: String?,
        participants: Int,
        isDeviceConstrained: Bool,
        reduceMotion: Bool,
        in catalogue: [CallFrameDesign] = CallFrameCatalogue.all
    ) -> CallLiveFrameDisplay {
        guard participants == people, let frameId,
              let design = catalogue.first(where: { $0.id == frameId }), isEligible(design) else { return .none }
        if isDeviceConstrained { return .suspended(design, .deviceConstrained) }
        if reduceMotion && animates(design) { return .suspended(design, .reduceMotion) }
        return .frame(design)
    }

    /// Les personnes du cadre, dans l'ordre des cases : le nom que l'autre a choisi de partager
    /// remplace celui qu'on connaissait de lui ; le mien ne change jamais.
    static func people(_ subjects: [CallFramePerson], remoteSharedName: String?) -> [CallFramePerson] {
        guard let shared = remoteSharedName?.trimmingCharacters(in: .whitespacesAndNewlines), !shared.isEmpty else { return subjects }
        return subjects.map { person in
            person.isSelf ? person : CallFramePerson(id: person.id, name: shared, handle: person.handle, isSelf: false)
        }
    }

    /// La taille à laquelle les couches se peignent : celle de l'écran en pixels, bornée.
    static func paintSize(viewSize: CGSize, scale: CGFloat) -> CGSize {
        guard viewSize.width >= 1, viewSize.height >= 1 else { return .zero }
        let pixels = CGSize(width: viewSize.width * max(scale, 1), height: viewSize.height * max(scale, 1))
        let longest = max(pixels.width, pixels.height)
        let factor = longest > paintLongestSide ? paintLongestSide / longest : 1
        return CGSize(width: (pixels.width * factor).rounded(), height: (pixels.height * factor).rounded())
    }

    /// Faut-il repeindre ? Seulement si une entrée a changé.
    static func needsRepaint(current: CallLiveFrameLayerInputs?, next: CallLiveFrameLayerInputs) -> Bool {
        current != next
    }
}
