import Foundation
import os
import MeeshySDK

/// Un emballage de marque qui échoue : quel chemin d'export, quelle slide,
/// quelle erreur. Ne porte aucun contenu de la story.
nonisolated public struct StoryExportBrandingFailure: Sendable, Equatable {
    public enum Path: String, Sendable {
        /// Partage et enregistrement dans Photos (`StoryVideoExportService`).
        case shareOrSave = "share-or-save"
        /// Aperçu exporté depuis la timeline du compositeur.
        case timeline
    }

    public let path: Path
    public let slideId: String
    public let errorDomain: String
    public let errorCode: Int
    public let reason: String

    public init(path: Path, slideId: String, error: Error) {
        let cause = Self.cause(of: error)
        self.path = path
        self.slideId = slideId
        self.errorDomain = cause.domain
        self.errorCode = cause.code
        self.reason = cause.localizedDescription
    }

    private static func cause(of error: Error) -> NSError {
        if case StoryExportBranding.BrandingError.encodingFailed(let underlying?) = error {
            return underlying as NSError
        }
        return error as NSError
    }
}

/// **Un export dont l'emballage de marque échoue part nu, et cela se voit**
/// (#14488).
///
/// La story part sans interlude, sans carte de fin ni jingle, mais entière :
/// ni l'export n'échoue, ni l'emballage n'est rejoué. L'œuvre de l'auteur est
/// intacte ; ce qui manque est la marque de Meeshy, et le défaut est le nôtre.
/// Refuser l'export, ou doubler l'attente d'un ré-encodage qui échoue en
/// général pour une cause déterministe, ferait payer ce défaut à
/// l'utilisateur. Seul un décodage refusé, qui n'est pas déterministe, est
/// relancé une fois avant d'arriver ici
/// (`StoryExportBranding.exportRetryingDecodeFailure`). Android fait le même choix (`StoryExportBrandAssembler` : la
/// story part seule si ses cartes ne se peignent pas).
///
/// Ce que ce site ajoute : l'échec n'est plus une ligne d'avertissement
/// muette. Il part en erreur dans le journal et chez `reporter`, que l'hôte
/// branche sur sa télémétrie. C'est ce qui manquait pour voir, dès le premier
/// export, la régression corrigée par 9bb9b12f1f : chaque export marqué
/// partait nu, et rien ne le comptait.
public enum StoryExportBrandingFallback {

    public enum Outcome: Equatable, Sendable {
        case branded(URL)
        case bare(URL)

        public var url: URL {
            switch self {
            case .branded(let url), .bare(let url): return url
            }
        }
    }

    /// Branché par l'hôte sur sa télémétrie. Appelé une fois par échec.
    public static var reporter: ((StoryExportBrandingFailure) -> Void)?

    private static let logger = MeeshyLog.logger(.storyExportShare, subsystem: .sdk)

    /// Rend la story emballée par `wrap`, ou `bareStory` si l'emballage lève.
    /// Une annulation n'est pas un échec de la marque : elle n'est pas signalée.
    public static func deliver(
        bareStory: URL,
        path: StoryExportBrandingFailure.Path,
        slideId: String,
        wrap: @MainActor () async throws -> URL
    ) async -> Outcome {
        do {
            return .branded(try await wrap())
        } catch is CancellationError {
            return .bare(bareStory)
        } catch {
            report(StoryExportBrandingFailure(path: path, slideId: slideId, error: error))
            return .bare(bareStory)
        }
    }

    static func report(_ failure: StoryExportBrandingFailure) {
        logger.error("emballage de marque ÉCHOUÉ, story livrée nue — chemin \(failure.path.rawValue, privacy: .public), slide \(failure.slideId, privacy: .public), \(failure.errorDomain, privacy: .public) \(failure.errorCode, privacy: .public) : \(failure.reason, privacy: .public)")
        reporter?(failure)
    }
}
