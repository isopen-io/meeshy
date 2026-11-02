import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **Ce qu'« Imager » remet à sa vue** (#14325) : l'œuvre composée telle que
/// « Enregistrer » la rendrait — ses scènes, ses langues, ses médias, son
/// habillage — et les longueurs qu'elle offre (#13871). Une valeur : la vue
/// choisit, le service rend.
struct ImagerWork: Identifiable {
    /// La clé du rendu en vol : celle de la story, du post ou de la scène.
    let id: String
    let slides: [StorySlide]
    let languages: [String]
    let stickerMedia: [FeedMedia]
    let dressing: StoryExportDressing
    /// Une scène fixe et muette sort en image (#13871) : elle n'a pas de longueur.
    let isStill: Bool
    /// Vide sous la minute : la vue n'offre alors aucun choix.
    let choices: [ImagerLengthChoice]

    var total: TimeInterval { ImagerLength.total(of: slides) }

    func slides(for quarter: ImagerQuarter?) -> [StorySlide] {
        ImagerLength.cut(slides, quarter: quarter)
    }
}

/// **La vue « Imager », présentée au-dessus de tout** (#14325) — la même pour
/// une story, un post à scène, un réel et la scène d'une galerie. Comme
/// `MessageCardExportPresenter` : le menu qui demande (en-tête de story, menu
/// d'un réel) est reconstruit à chaque tick, un état de présentation n'y
/// survivrait pas ; et un menu qui se referme ne présente rien — on attend
/// qu'il soit parti.
enum ImagerPresenter {

    private static let maxAttempts = 14
    private static let retryDelay: Duration = .milliseconds(150)

    static func present(_ work: ImagerWork, service: StoryPhotoSaveService) {
        present(work, service: service, attempt: 0)
    }

    static func label(for choice: ImagerLengthChoice) -> String {
        String(format: String(localized: "export.imager.length.option", defaultValue: "%1$lld/4 · %2$@", bundle: .main),
               choice.quarter.rawValue, clock(choice.duration))
    }

    /// Une durée MONTRÉE passe par `MediaFormat.duration` : chiffres de la locale.
    static func clock(_ seconds: TimeInterval) -> String {
        MediaFormat.duration(seconds, style: .clockPromotingHours)
    }

    private static func present(_ work: ImagerWork, service: StoryPhotoSaveService, attempt: Int) {
        switch MessageCardExportPresenter.topMostController() {
        case .busy:
            guard attempt < maxAttempts else { return }
            Task { @MainActor in
                guard await cancellableSleep(for: retryDelay) else { return }
                present(work, service: service, attempt: attempt + 1)
            }
        case .none:
            return
        case .ready(let top):
            let presented = ImagerPresentedHost()
            let host = ImagerHostingController(rootView: ImagerSheet(work: work, service: service) {
                presented.controller?.presentingViewController?.dismiss(animated: true)
            })
            presented.controller = host
            host.modalPresentationStyle = .pageSheet
            host.sheetPresentationController?.detents = [.large()]
            host.sheetPresentationController?.prefersGrabberVisible = true
            top.present(host, animated: true)
        }
    }
}

/// Le contrôleur présenté, tenu FAIBLEMENT : la feuille le ferme sans le retenir.
private final class ImagerPresentedHost {
    weak var controller: UIViewController?
    nonisolated deinit {}
}

private final class ImagerHostingController: UIHostingController<ImagerSheet> {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}
}
