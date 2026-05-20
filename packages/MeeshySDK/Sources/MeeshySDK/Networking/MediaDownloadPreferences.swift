import Foundation

/// Politique d'auto-téléchargement pour un type de média selon l'état réseau.
public enum AutoDownloadPolicy: String, Codable, CaseIterable, Equatable, Sendable {
    case always
    case wifiAndGoodCellular
    case wifiOnly
    case never

    public var shortLabel: String {
        switch self {
        case .always:
            return String(localized: "media.policy.always.short", defaultValue: "Toujours", bundle: .module)
        case .wifiAndGoodCellular:
            return String(localized: "media.policy.wifiGood.short", defaultValue: "Wi-Fi + bon cellulaire", bundle: .module)
        case .wifiOnly:
            return String(localized: "media.policy.wifi.short", defaultValue: "Wi-Fi uniquement", bundle: .module)
        case .never:
            return String(localized: "media.policy.never.short", defaultValue: "Jamais", bundle: .module)
        }
    }
}

/// Type de média auquel s'applique une `AutoDownloadPolicy`.
public enum MediaKind: String, Equatable, Sendable, Codable {
    case image
    case audio
    case audioTranslation
    case video
}

/// Préférences utilisateur de téléchargement automatique des médias.
/// Une `AutoDownloadPolicy` par type. Sérialisable en JSON pour persistance
/// dans UserDefaults.
public struct MediaDownloadPreferences: Codable, Equatable, Sendable {
    public var image: AutoDownloadPolicy
    public var audio: AutoDownloadPolicy
    public var audioTranslation: AutoDownloadPolicy
    public var video: AutoDownloadPolicy

    public init(
        image: AutoDownloadPolicy = .wifiAndGoodCellular,
        audio: AutoDownloadPolicy = .wifiAndGoodCellular,
        audioTranslation: AutoDownloadPolicy = .wifiOnly,
        video: AutoDownloadPolicy = .wifiOnly
    ) {
        self.image = image
        self.audio = audio
        self.audioTranslation = audioTranslation
        self.video = video
    }

    public static let defaults = MediaDownloadPreferences()

    public func policy(for kind: MediaKind) -> AutoDownloadPolicy {
        switch kind {
        case .image:            return image
        case .audio:            return audio
        case .audioTranslation: return audioTranslation
        case .video:            return video
        }
    }
}
