import UIKit
import Contacts
import ContactsUI
import MeeshySDK

/// **« Ajouter aux contacts » depuis une notification** (#8858).
///
/// L'action ouvre l'app sur la conversation, puis pose par-dessus la fiche
/// NATIVE de nouveau contact, pré-remplie avec le nom, le téléphone et l'e-mail
/// de la carte de visite — la même fiche que `ContactCardDetailSheet` ouvre
/// depuis la bulle. L'utilisateur n'a plus qu'à confirmer.
///
/// Le léger délai laisse la navigation vers la conversation se poser d'abord :
/// présenter sur une hiérarchie en cours de transition fait échouer
/// `present(_:animated:)` en silence.
@MainActor
enum NotificationContactPresenter {

    static let presentationDelay: Duration = .milliseconds(700)

    static func present(_ card: NotificationContactCard) {
        Task { @MainActor in
            try? await Task.sleep(for: presentationDelay)
            guard let host = topViewController() else { return }
            let controller = CNContactViewController(forUnknownContact: contact(from: card))
            controller.contactStore = CNContactStore()
            controller.allowsActions = false
            let navigation = UINavigationController(rootViewController: controller)
            controller.navigationItem.leftBarButtonItem = UIBarButtonItem(
                systemItem: .close,
                primaryAction: UIAction { [weak navigation] _ in navigation?.dismiss(animated: true) }
            )
            host.present(navigation, animated: true)
        }
    }

    /// Le contact pré-rempli. Pur : c'est ce que le témoin interroge.
    static func contact(from card: NotificationContactCard) -> CNContact {
        let contact = CNMutableContact()
        let parts = card.name.split(separator: " ", maxSplits: 1).map(String.init)
        contact.givenName = parts.first ?? card.name
        contact.familyName = parts.count > 1 ? parts[1] : ""
        if let phone = card.phone {
            contact.phoneNumbers = [CNLabeledValue(label: CNLabelPhoneNumberMobile, value: CNPhoneNumber(stringValue: phone))]
        }
        if let email = card.email {
            contact.emailAddresses = [CNLabeledValue(label: CNLabelHome, value: email as NSString)]
        }
        return contact
    }

    private static func topViewController() -> UIViewController? {
        let root = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
        guard let root else { return nil }
        return sequence(first: root, next: \.presentedViewController).reduce(root) { _, next in next }
    }
}
