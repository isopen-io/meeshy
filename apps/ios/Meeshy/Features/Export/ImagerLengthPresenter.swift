import UIKit
import MeeshySDK
import MeeshyUI

/// **La longueur qu'« Imager » rend, choisie AVANT le rendu** (#13871) : au-delà
/// d'une minute, 1/4 · 2/4 · 3/4 · 4/4 depuis le début, chacun avec sa durée.
///
/// Présenté au-dessus de tout, comme `ContentRemovalPresenter` : le menu qui
/// demande (en-tête de story, menu d'un réel) est reconstruit à chaque tick, un
/// état de présentation n'y survivrait pas. Renoncer ne rend rien.
enum ImagerLengthPresenter {

    private static let maxAttempts = 14
    private static let retryDelay: Duration = .milliseconds(150)

    static func present(_ choices: [ImagerLengthChoice], choose: @escaping @MainActor (ImagerQuarter) -> Void) {
        present(choices, choose: choose, attempt: 0)
    }

    static func label(for choice: ImagerLengthChoice) -> String {
        String(format: String(localized: "export.imager.length.option", defaultValue: "%1$lld/4 · %2$@", bundle: .main),
               choice.quarter.rawValue, clock(choice.duration))
    }

    static func clock(_ seconds: TimeInterval) -> String {
        let whole = Int(max(seconds, 0).rounded(.down))
        let hours = whole / 3600
        let minutes = whole % 3600 / 60
        let rest = whole % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, rest)
            : String(format: "%d:%02d", minutes, rest)
    }

    private static func present(_ choices: [ImagerLengthChoice],
                                choose: @escaping @MainActor (ImagerQuarter) -> Void,
                                attempt: Int) {
        switch MessageCardExportPresenter.topMostController() {
        case .busy:
            guard attempt < maxAttempts else { return }
            Task { @MainActor in
                guard await cancellableSleep(for: retryDelay) else { return }
                present(choices, choose: choose, attempt: attempt + 1)
            }
        case .none:
            return
        case .ready(let top):
            top.present(sheet(choices, choose: choose, over: top), animated: true)
        }
    }

    private static func sheet(_ choices: [ImagerLengthChoice],
                              choose: @escaping @MainActor (ImagerQuarter) -> Void,
                              over top: UIViewController) -> UIAlertController {
        let sheet = ImagerLengthSheetController(
            title: String(localized: "export.imager.length.title", defaultValue: "Quelle durée imager ?", bundle: .main),
            message: String(localized: "export.imager.length.subtitle", defaultValue: "Depuis le début", bundle: .main),
            preferredStyle: .actionSheet)
        choices.forEach { choice in
            sheet.addAction(UIAlertAction(title: label(for: choice), style: .default) { _ in choose(choice.quarter) })
        }
        sheet.addAction(UIAlertAction(title: String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main),
                                      style: .cancel))
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = top.view
            popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        return sheet
    }
}

private final class ImagerLengthSheetController: UIAlertController {
    nonisolated deinit {}
}
