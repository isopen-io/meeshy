import Foundation

// MARK: - Le contrat servi d'un pack d'apparence (#16264, spec § 8)
//
// MIROIR de `AppearancePackContractSchema` (`packages/shared/types/appearance-design.ts`),
// `AvatarRingPackContractSchema` et `BannerFramePackContractSchema` : le `<sha16>.json`
// qu'un pack NON embarqué sert à la place du catalogue embarqué. Ses modèles sont les
// MÊMES types que l'embarqué — ils se peignent donc par les mêmes peintres.
// Fail-closed : un domaine inconnu, une liste vide ou illisible ne se lit pas ; un
// modèle illisible tombe seul ; deux modèles de même clé, le premier fait foi.

public enum ServedAppearanceContract: Sendable, Hashable {
    case wallpaper([AppearanceDesign])
    case banner([AppearanceDesign])
    case avatarRing([AvatarRingDesign])
    case bannerFrame([BannerFrameDesign])

    /// La borne du shared (`APPEARANCE_LIMITS.maxPackDesigns`).
    static let maxDesigns = 32

    public init?(data: Data) {
        guard let decoded = try? JSONDecoder().decode(Wire.self, from: data).contract else { return nil }
        self = decoded
    }

    public var domain: PackDomain {
        switch self {
        case .wallpaper: return .wallpaper
        case .banner: return .banner
        case .avatarRing: return .avatarRing
        case .bannerFrame: return .bannerFrame
        }
    }

    /// Les modèles d'un fond ou d'une bannière ; vide pour un autre domaine.
    public var appearanceDesigns: [AppearanceDesign] {
        switch self {
        case .wallpaper(let designs), .banner(let designs): return designs
        case .avatarRing, .bannerFrame: return []
        }
    }

    public var rings: [AvatarRingDesign] {
        if case .avatarRing(let rings) = self { return rings }
        return []
    }

    public var frames: [BannerFrameDesign] {
        if case .bannerFrame(let frames) = self { return frames }
        return []
    }

    private struct Wire: Decodable {
        let contract: ServedAppearanceContract?

        private enum CodingKeys: String, CodingKey { case domain, designs, rings, frames }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            switch PackDomain(rawValue: try c.decode(String.self, forKey: .domain)) {
            case .wallpaper?:
                contract = Self.nonEmpty(try Self.lossy(c, .designs, as: AppearanceDesign.self)).map(ServedAppearanceContract.wallpaper)
            case .banner?:
                contract = Self.nonEmpty(try Self.lossy(c, .designs, as: AppearanceDesign.self)).map(ServedAppearanceContract.banner)
            case .avatarRing?:
                contract = Self.nonEmpty(try Self.lossy(c, .rings, as: AvatarRingDesign.self)).map(ServedAppearanceContract.avatarRing)
            case .bannerFrame?:
                contract = Self.nonEmpty(try Self.lossy(c, .frames, as: BannerFrameDesign.self)).map(ServedAppearanceContract.bannerFrame)
            default:
                contract = nil
            }
        }

        private static func lossy<Design: Decodable & Identifiable>(
            _ c: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys, as: Design.Type
        ) throws -> [Design] where Design.ID == String {
            let readable = try c.decode([LossyBox<Design>].self, forKey: key).compactMap(\.value)
            var seen = Set<String>()
            return Array(readable.filter { seen.insert($0.id).inserted }.prefix(ServedAppearanceContract.maxDesigns))
        }

        private static func nonEmpty<Design>(_ designs: [Design]) -> [Design]? {
            designs.isEmpty ? nil : designs
        }
    }
}
