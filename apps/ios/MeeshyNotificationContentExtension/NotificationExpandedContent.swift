import CoreGraphics
import Foundation
import UniformTypeIdentifiers
import MeeshySDK

/// **Ce que la notification DÉPLOYÉE montre** (#8859, sous-lot iOS de #8856).
///
/// Un appui long sur une notification ne donnait que son texte : un vocal ne
/// s'écoutait pas sans ouvrir l'app, une position ne s'explorait pas. L'extension
/// de contenu rend désormais un lecteur, une carte ou une fiche — et RIEN pour un
/// message protégé.
///
/// Toute la décision vit ici, pure : l'extension de contenu n'a pas d'hôte de
/// test, et `xcrun simctl push` ne l'exerce qu'à la main. Le fichier est compilé
/// dans l'extension ET dans l'app (`project.yml`), comme
/// `NotificationDetailPolicy`, ce qui le met à portée de `MeeshyTests`.
///
/// Les gardes sont celles de la bannière, pas des copies :
/// - le **détail** (position, carte de visite) passe par
///   `NotificationDetailPolicy.detail`, qui pose le second verrou de protection ;
/// - la **piste** d'un vocal passe par `NotificationDetailPolicy.audioTravels`,
///   la même lecture qui a choisi la catégorie `MEESHY_AUDIO`.
///
/// La transcription n'est PAS relue ici : c'est le CORPS de la notification,
/// que la passerelle a déjà composé depuis la transcription servie par le Prisme
/// (`servedBannerBody`) et que le système affiche sous la vue de l'extension.
/// Une seconde copie sous le lecteur répéterait le même texte deux fois.
nonisolated enum NotificationExpandedContent: Equatable, Sendable {
    case audio(NotificationAudioDetail)
    case location(NotificationLocationDetail)
    case contact(NotificationContactCard)

    /// Les catégories que l'extension DÉCLARE dans son `Info.plist`
    /// (`UNNotificationExtensionCategory`) — une par cas ci-dessus.
    static let categoryIdentifiers: [String] = [
        NotificationDetailPolicy.audioCategory, "MEESHY_LOCATION", "MEESHY_CONTACT",
    ]

    /// `resolveURL` résout l'adresse de la piste contre l'origine API de
    /// confiance (`NotificationPayloadHelpers.resolveRemoteMediaURL`) et rend
    /// `nil` pour tout schéma qui ne se suit pas.
    static func resolve(
        userInfo: [AnyHashable: Any],
        resolveURL: (String) -> URL?
    ) -> NotificationExpandedContent? {
        switch NotificationDetailPolicy.detail(userInfo: userInfo) {
        case .location(let place): return .location(place)
        case .contact(let card): return .contact(card)
        case .invite, .link: return nil
        case nil: break
        }
        guard NotificationDetailPolicy.audioTravels(userInfo: userInfo),
              let raw = userInfo["attachmentUrl"] as? String,
              let remote = resolveURL(raw) else { return nil }
        return .audio(NotificationAudioDetail(
            remoteURL: remote,
            durationMs: NSEAttachmentPolicy.declaredDurationMs(userInfo["attachmentDurationMs"])
                .flatMap { $0 > 0 ? $0 : nil }
        ))
    }

    /// Le fichier à jouer : celui que l'extension de service a déjà ATTACHÉ
    /// (sur disque, sans réseau), sinon la piste distante — la même, élue par
    /// le Prisme côté serveur.
    static func playableURL(attachmentURLs: [URL], remote: URL) -> URL {
        attachmentURLs.first { url in
            UTType(filenameExtension: url.pathExtension)?.conforms(to: .audio) == true
        } ?? remote
    }
}

nonisolated struct NotificationAudioDetail: Equatable, Sendable {
    let remoteURL: URL
    let durationMs: Int?
}

/// **La géométrie du lecteur** : une rangée, un axe. La pastille de lecture, la
/// ligne de progression et la pastille de vitesse sont centrées sur le MÊME axe
/// horizontal ; les deux pastilles ont le même gabarit. Le bouton natif
/// (`mediaPlayPauseButtonType`) est dessiné par le système au cadre qu'on lui
/// donne : ce cadre est calculé ici, au centre de la pastille, pour que la vue
/// et le système ne puissent pas se désaligner.
nonisolated struct NotificationPlayerGeometry: Equatable, Sendable {
    let height: CGFloat
    let inset: CGFloat
    let pillSide: CGFloat
    let glyphSide: CGFloat

    static let standard = NotificationPlayerGeometry(height: 72, inset: 16, pillSide: 44, glyphSide: 20)

    var axisY: CGFloat { height / 2 }

    var nativeButtonFrame: CGRect {
        let centerX = inset + pillSide / 2
        return CGRect(x: centerX - glyphSide / 2, y: axisY - glyphSide / 2, width: glyphSide, height: glyphSide)
    }

    /// La part de la piste sous le doigt, bornée à [0, 1].
    static func seekFraction(x: CGFloat, trackWidth: CGFloat) -> Double {
        guard trackWidth > 0 else { return 0 }
        return Double(min(1, max(0, x / trackWidth)))
    }
}

/// Les petites lois du lecteur : vitesse, horloge, progression.
nonisolated enum NotificationPlaybackRate {

    static let steps: [Float] = [1, 1.5, 2]

    /// 1× → 1,5× → 2× → 1×. Une vitesse hors de l'échelle repart de 1×.
    static func next(after rate: Float) -> Float {
        guard let index = steps.firstIndex(of: rate) else { return steps[0] }
        return steps[(index + 1) % steps.count]
    }

    /// « 1× », « 1,5× » — le séparateur décimal suit la langue.
    static func label(for rate: Float, locale: Locale = .current) -> String {
        Double(rate).formatted(.number.precision(.fractionLength(0...1)).locale(locale)) + "×"
    }

    /// « 0:07 », « 1:05 ». Une valeur négative ou non finie vaut zéro.
    static func clock(seconds: Double) -> String {
        let total = seconds.isFinite ? max(0, Int(seconds)) : 0
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    /// La part écoulée, bornée à [0, 1] ; zéro tant que la durée est inconnue.
    static func progress(elapsed: Double, duration: Double) -> Double {
        guard duration.isFinite, duration > 0, elapsed.isFinite else { return 0 }
        return min(1, max(0, elapsed / duration))
    }
}
