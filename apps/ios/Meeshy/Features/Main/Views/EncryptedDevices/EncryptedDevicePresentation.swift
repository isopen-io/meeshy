import Foundation
import MeeshyE2EE
import SwiftUI
import MeeshyUI

/// Ce que l'écran DIT d'un de mes appareils chiffrés (#13009) : son nom, son
/// symbole, son état et sa date, et la phrase que VoiceOver lit pour la ligne.
/// Le nom vient du modèle annoncé à l'inscription (« iPhone », « iPad »,
/// « Mac ») — jamais du nom donné à l'appareil.
struct EncryptedDevicePresentation: Equatable {
    let title: String
    let systemImage: String
    let status: String
    let detail: String?
    let trust: EndToEndOwnDevice.Trust

    init(_ device: EndToEndOwnDevice) {
        trust = device.trust
        title = Self.title(of: device)
        systemImage = Self.systemImage(of: device)
        status = Self.status(of: device.trust)
        detail = device.enrolledAt.map {
            String(
                format: String(localized: "e2ee.devices.enrolledOn", defaultValue: "Inscrit le %@", bundle: .main),
                $0.formatted(date: .abbreviated, time: .omitted)
            )
        }
    }

    var accessibilityLabel: String {
        [title, status, detail].compactMap { $0 }.joined(separator: ", ")
    }

    var tint: Color {
        switch trust {
        case .thisDevice: MeeshyColors.success
        case .approved: MeeshyColors.indigo400
        case .pending: MeeshyColors.warning
        }
    }

    static func title(of device: EndToEndOwnDevice) -> String {
        if let label = device.label?.trimmingCharacters(in: .whitespacesAndNewlines), !label.isEmpty { return label }
        switch device.platform {
        case .ios: return String(localized: "e2ee.devices.platform.ios", defaultValue: "Appareil iOS", bundle: .main)
        case .macos: return String(localized: "e2ee.devices.platform.macos", defaultValue: "Mac", bundle: .main)
        case .android: return String(localized: "e2ee.devices.platform.android", defaultValue: "Appareil Android", bundle: .main)
        case .web: return String(localized: "e2ee.devices.platform.web", defaultValue: "Navigateur", bundle: .main)
        case nil:
            return String(format: String(localized: "e2ee.devices.numbered", defaultValue: "Appareil n° %d", bundle: .main), Int(device.deviceId))
        }
    }

    static func status(of trust: EndToEndOwnDevice.Trust) -> String {
        switch trust {
        case .thisDevice: String(localized: "e2ee.devices.status.thisDevice", defaultValue: "Cet appareil", bundle: .main)
        case .approved: String(localized: "e2ee.devices.status.approved", defaultValue: "Approuvé", bundle: .main)
        case .pending: String(localized: "e2ee.devices.status.pending", defaultValue: "En attente d’approbation", bundle: .main)
        }
    }

    private static func systemImage(of device: EndToEndOwnDevice) -> String {
        let label = device.label ?? ""
        if label.hasPrefix("iPad") { return "ipad" }
        if device.platform == .macos || label.hasPrefix("Mac") { return "laptopcomputer" }
        if device.platform == .web { return "globe" }
        return "iphone"
    }
}
