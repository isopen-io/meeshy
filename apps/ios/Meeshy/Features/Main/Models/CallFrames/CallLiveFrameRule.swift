import CoreGraphics
import Foundation
import MeeshySDK

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
    /// Les bandes de l'écran que les contrôles de l'appel couvrent (#9777).
    var reserve: CallFrameChromeReserve = .none
    /// #12683 — les ornements animés se jouent : ils quittent les couches fixes pour Core Animation.
    var animates: Bool = false
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

    /// Un cadre se propose en direct s'il sert un duo et que la loi d'usage lui ouvre l'appel —
    /// c'est-à-dire s'il DÉCLARE `live` (#10195). Un cadre de capture seule ne sert jamais
    /// l'appel, quel que soit son coût (directive porteur 2026-10-11).
    static func isEligible(_ design: CallFrameDesign) -> Bool {
        design.serves(people: people) && FrameUsageLaw.canUseFrame(design.usage, .call)
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

    /// #12683 — un cadre dont seuls les ornements bougent a un état FIXE complet : ses ornements
    /// peints à leur place. Une couche de scène, elle, n'a pas encore d'image fixe de repli.
    static func hasStillState(_ design: CallFrameDesign) -> Bool {
        design.look.scene.isEmpty
    }

    /// Les ornements s'animent-ils à l'écran ? Jamais sous « Réduire les animations », ni quand
    /// l'appareil se protège ; sinon dès que le cadre déclare un mouvement.
    static func playsMotion(_ design: CallFrameDesign, reduceMotion: Bool, isDeviceConstrained: Bool) -> Bool {
        animates(design) && !reduceMotion && !isDeviceConstrained
    }

    /// #9287 — l'interrupteur « Cadre » de la capture : toucher le cadre déjà gardé le retire,
    /// toucher un autre cadre le garde à sa place.
    static func toggledHold(current: String?, tapped: String) -> String? {
        current == tapped ? nil : tapped
    }

    /// L'interrupteur se montre sur un cadre du catalogue servi en direct, en duo vidéo.
    static func mayHold(frameId: String, isOffered: Bool, in catalogue: [CallFrameDesign] = CallFrameCatalogue.all) -> Bool {
        guard isOffered, let design = catalogue.first(where: { $0.id == frameId }) else { return false }
        return isEligible(design)
    }

    /// Le cadre en direct n'existe qu'en vidéo, à deux.
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
    /// sous « Réduire les animations », un cadre qui a un état fixe se montre immobile (#12683),
    /// un cadre dont la scène bouge reste masqué.
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
        if reduceMotion && animates(design) && !hasStillState(design) { return .suspended(design, .reduceMotion) }
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

    /// **Aucun texte du cadre sous un contrôle** (#9777) : en haut la rangée d'en-tête (réduire,
    /// conversation, durée) sous la Dynamic Island, en bas la pilule des commandes. Le cadre se peint
    /// à la taille de l'écran : ces bandes, en points, sont sa part de la toile.
    static let headerRowHeight: CGFloat = 52
    static let controlsPillHeight: CGFloat = 84

    static func chromeReserve(viewHeight: CGFloat, topInset: CGFloat, bottomInset: CGFloat) -> CallFrameChromeReserve {
        .covering(top: topInset + headerRowHeight, bottom: bottomInset + controlsPillHeight, height: viewHeight)
    }

    /// Faut-il repeindre ? Seulement si une entrée a changé.
    static func needsRepaint(current: CallLiveFrameLayerInputs?, next: CallLiveFrameLayerInputs) -> Bool {
        current != next
    }
}
