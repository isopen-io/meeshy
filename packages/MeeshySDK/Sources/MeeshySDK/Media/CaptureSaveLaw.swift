import Foundation

// MARK: - La loi d'enregistrement d'une prise (#10284)
//
// MIROIR de `packages/shared/utils/capture/capture-save.ts` — le cadre EST le
// déclencheur. Directive porteur 2026-10-12 : « photo ou vidéo à partir du
// cadre, on sauvegarde dans la galerie et on passe à l'édition, et en filmant
// sans passer par la zone cadre, on passe à l'edition aussi mais on preserve
// juste l'image dans l'application uniquement, de toute façon le bouton
// enregistré de l'ecran d'apres disparait si on a déjà enregistré sinon reste
// visible, disparait tant qu'on ne change pas de cadre pour refaire
// l'enregistrement. » « Déjà enregistré » se lit par VERSION, la paire (cadre,
// format) : changer de format fait réapparaître « Enregistrer » (#10296).
//
// La directive fixe des DÉFAUTS ; le réglage de l'utilisateur prime (correction
// porteur 2026-10-12 : « il faut respecter la consigne et reglage utilisateur.
// Je n'exprimais que le comportement par défaut »). Réglages › Médias
// « enregistrer l'original » (`CaptureSavePolicy.savesOriginal`, #9684) activé,
// l'original d'une prise hors cadre part en galerie ; par défaut, il reste dans
// l'app. Une prise par le cadre part en galerie : c'est le défaut, aucun réglage
// ne le contredit. `packages/shared/decisions/2026-10-12-une-prise-par-le-cadre-part-en-galerie-une-prise-hors-cadre-reste-dans-l-app-10284.md`.
// Les vecteurs `packages/shared/fixtures/capture-save/capture-save.vectors.json`
// sont rejoués par `CaptureSaveLawVectorTests` : sur divergence, le TS a raison.

/// `frame` : la case du cadre choisi (toucher = photo, appui long = vidéo).
/// `outside` : la scène, ou le déclencheur rond quand AUCUN cadre n'est choisi.
public enum CaptureZone: String, CaseIterable, Codable, Sendable, Hashable {
    case frame
    case outside
}

/// Où part une prise : `keptInApp` = elle ne vit QUE dans l'application. Hors
/// cadre avec le réglage, c'est l'ORIGINAL qui part en galerie.
public struct CaptureDestination: Codable, Sendable, Hashable {
    public enum Next: String, Codable, Sendable, Hashable { case edit }

    public let gallery: Bool
    public let then: Next
    public let keptInApp: Bool

    public static let frame = CaptureDestination(gallery: true, then: .edit, keptInApp: false)
    public static let outside = CaptureDestination(gallery: false, then: .edit, keptInApp: true)
}

/// Une VERSION de la prise : la paire (cadre, format). Changer l'un ou l'autre
/// produit une autre image, donc une autre version à enregistrer (#10296).
/// `frameId == nil` = aucun cadre ; `format` est opaque pour la loi (`story`, `square`, une proportion…).
public struct SavedVersion: Sendable, Hashable, Decodable {
    public let frameId: String?
    public let format: String

    public init(frameId: String?, format: String) {
        self.frameId = frameId
        self.format = format
    }
}

/// D'où vient une prise ; une prise par la zone cadre a, par construction, un cadre.
/// `frameId == nil` = aucun cadre.
public enum CaptureOrigin: Sendable, Hashable, Decodable {
    case frame(frameId: String, format: String)
    case outside(frameId: String?, format: String)

    public var zone: CaptureZone {
        switch self {
        case .frame: return .frame
        case .outside: return .outside
        }
    }

    public var frameId: String? {
        switch self {
        case .frame(let frameId, _): return frameId
        case .outside(let frameId, _): return frameId
        }
    }

    public var format: String {
        switch self {
        case .frame(_, let format), .outside(_, let format): return format
        }
    }

    private enum CodingKeys: String, CodingKey { case zone, frameId, format }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let format = try container.decode(String.self, forKey: .format)
        switch try container.decode(CaptureZone.self, forKey: .zone) {
        case .frame: self = .frame(frameId: try container.decode(String.self, forKey: .frameId), format: format)
        case .outside: self = .outside(frameId: try container.decodeIfPresent(String.self, forKey: .frameId), format: format)
        }
    }
}

/// L'état d'enregistrement d'une prise en retouche : la version courante (cadre,
/// format), et les versions déjà (ou en train d'être) en galerie — « aucun cadre » compris.
public struct TakeSaveState: Sendable, Hashable {
    public let currentFrame: String?
    public let currentFormat: String
    public let savedWith: [SavedVersion]

    public init(currentFrame: String?, currentFormat: String, savedWith: [SavedVersion]) {
        self.currentFrame = currentFrame
        self.currentFormat = currentFormat
        self.savedWith = savedWith
    }

    public var currentVersion: SavedVersion { SavedVersion(frameId: currentFrame, format: currentFormat) }
}

public enum CaptureSaveLaw {
    /// `savesOriginal` : Réglages › Médias « enregistrer l'original » ; `false` = le défaut.
    public static func destination(for zone: CaptureZone, savesOriginal: Bool = false) -> CaptureDestination {
        switch zone {
        case .frame: return .frame
        case .outside: return savesOriginal ? .frame : .outside
        }
    }

    /// L'état juste après la prise : une prise par le cadre part déjà en galerie, au format de la prise (mise à jour optimiste).
    public static func beginTake(_ origin: CaptureOrigin) -> TakeSaveState {
        let version = SavedVersion(frameId: origin.frameId, format: origin.format)
        return TakeSaveState(currentFrame: origin.frameId, currentFormat: origin.format,
                             savedWith: origin.zone == .frame ? [version] : [])
    }

    /// « Enregistrer » est visible tant que la prise n'est pas en galerie dans la version courante (cadre, format).
    public static func saveButtonVisible(_ state: TakeSaveState) -> Bool {
        !state.savedWith.contains(state.currentVersion)
    }

    /// « Enregistrer » touché : la version courante part en galerie (optimiste).
    public static func applySaved(_ state: TakeSaveState) -> TakeSaveState {
        guard saveButtonVisible(state) else { return state }
        return TakeSaveState(currentFrame: state.currentFrame, currentFormat: state.currentFormat,
                             savedWith: state.savedWith + [state.currentVersion])
    }

    /// L'écriture en galerie de `version` a échoué : CETTE version redevient à enregistrer, qui peut ne plus être la courante.
    public static func applySaveFailed(_ state: TakeSaveState, version: SavedVersion) -> TakeSaveState {
        TakeSaveState(currentFrame: state.currentFrame, currentFormat: state.currentFormat,
                      savedWith: state.savedWith.filter { $0 != version })
    }

    public static func applyFrameChange(_ state: TakeSaveState, frameId: String?) -> TakeSaveState {
        TakeSaveState(currentFrame: frameId, currentFormat: state.currentFormat, savedWith: state.savedWith)
    }

    public static func applyFormatChange(_ state: TakeSaveState, format: String) -> TakeSaveState {
        TakeSaveState(currentFrame: state.currentFrame, currentFormat: format, savedWith: state.savedWith)
    }
}
