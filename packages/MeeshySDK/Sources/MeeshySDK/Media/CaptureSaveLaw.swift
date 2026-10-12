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
// l'enregistrement. »
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

/// D'où vient une prise ; une prise par la zone cadre a, par construction, un cadre.
/// `frameId == nil` = aucun cadre.
public enum CaptureOrigin: Sendable, Hashable, Decodable {
    case frame(frameId: String)
    case outside(frameId: String?)

    public var zone: CaptureZone {
        switch self {
        case .frame: return .frame
        case .outside: return .outside
        }
    }

    public var frameId: String? {
        switch self {
        case .frame(let frameId): return frameId
        case .outside(let frameId): return frameId
        }
    }

    private enum CodingKeys: String, CodingKey { case zone, frameId }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(CaptureZone.self, forKey: .zone) {
        case .frame: self = .frame(frameId: try container.decode(String.self, forKey: .frameId))
        case .outside: self = .outside(frameId: try container.decodeIfPresent(String.self, forKey: .frameId))
        }
    }
}

/// L'état d'enregistrement d'une prise en retouche : le cadre courant, et les
/// cadres avec lesquels elle est (ou part) en galerie — « aucun cadre » compris.
public struct TakeSaveState: Sendable, Hashable {
    public let currentFrame: String?
    public let savedWith: [String?]

    public init(currentFrame: String?, savedWith: [String?]) {
        self.currentFrame = currentFrame
        self.savedWith = savedWith
    }
}

public enum CaptureSaveLaw {
    /// `savesOriginal` : Réglages › Médias « enregistrer l'original » ; `false` = le défaut.
    public static func destination(for zone: CaptureZone, savesOriginal: Bool = false) -> CaptureDestination {
        switch zone {
        case .frame: return .frame
        case .outside: return savesOriginal ? .frame : .outside
        }
    }

    /// L'état juste après la prise : une prise par le cadre part déjà en galerie (mise à jour optimiste).
    public static func beginTake(_ origin: CaptureOrigin) -> TakeSaveState {
        switch origin {
        case .frame(let frameId): return TakeSaveState(currentFrame: frameId, savedWith: [frameId])
        case .outside(let frameId): return TakeSaveState(currentFrame: frameId, savedWith: [])
        }
    }

    /// « Enregistrer » est visible tant que la prise n'est pas en galerie AVEC le cadre courant.
    public static func saveButtonVisible(_ state: TakeSaveState) -> Bool {
        !state.savedWith.contains(state.currentFrame)
    }

    /// « Enregistrer » touché : la prise part en galerie avec le cadre courant (optimiste).
    public static func applySaved(_ state: TakeSaveState) -> TakeSaveState {
        guard saveButtonVisible(state) else { return state }
        return TakeSaveState(currentFrame: state.currentFrame, savedWith: state.savedWith + [state.currentFrame])
    }

    /// L'écriture en galerie avec `frameId` a échoué : ce cadre redevient à enregistrer.
    public static func applySaveFailed(_ state: TakeSaveState, frameId: String?) -> TakeSaveState {
        TakeSaveState(currentFrame: state.currentFrame, savedWith: state.savedWith.filter { $0 != frameId })
    }

    public static func applyFrameChange(_ state: TakeSaveState, frameId: String?) -> TakeSaveState {
        TakeSaveState(currentFrame: frameId, savedWith: state.savedWith)
    }
}
