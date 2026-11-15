import UIKit

/// Ce que le lien demande à un champ : ses deux vues d'entrée et son rechargement. `UITextView` et
/// `UITextField` y répondent déjà.
protocol MeeshyKeyboardDockField: AnyObject {
    var inputView: UIView? { get set }
    var inputAccessoryView: UIView? { get set }
    var isFirstResponder: Bool { get }
    var window: UIWindow? { get }
    func reloadInputViews()
}

extension UITextView: MeeshyKeyboardDockField {}
extension UITextField: MeeshyKeyboardDockField {}

/// **Le lien entre le dock et le champ en place** (K17) : pose la barre en `inputAccessoryView` et, quand un
/// panneau est ouvert, le panneau en `inputView`. Le champ reste premier répondant tout du long : son
/// curseur reste visible, la scène ne bouge pas, et le système suit seul un clavier flottant ou matériel.
///
/// Un objet de RÉFÉRENCE : l'échange part de l'hôte dès qu'il écrit, sans attendre qu'une mise à jour
/// SwiftUI redescende. Il ne tient le champ que faiblement, et ne laisse rien accroché après `detach`.
@MainActor
public final class MeeshyKeyboardDockLink {

    nonisolated deinit {}

    public init() {}

    /// Le champ a été touché : l'hôte l'appelle par `fieldTouched()`, le dock rend alors le clavier.
    public var onFieldTouched: (() -> Void)?

    private weak var field: (any MeeshyKeyboardDockField)?
    private var accessory: UIView?
    private var input: UIView?

    /// Le champ en place, une fois attaché.
    public func attach(to field: UITextView) {
        adopt(field)
    }

    public func attach(to field: UITextField) {
        adopt(field)
    }

    /// Prend le champ qui a le focus. Rend faux si aucun champ de texte ne l'a.
    @discardableResult
    public func attachToFirstResponder() -> Bool {
        if let view = MeeshyKeyboardDockFirstResponder.current() as? UITextView {
            adopt(view)
            return true
        }
        if let line = MeeshyKeyboardDockFirstResponder.current() as? UITextField {
            adopt(line)
            return true
        }
        return false
    }

    /// Rien ne reste accroché au champ.
    public func detach() {
        guard let field else { return }
        write(on: field, accessory: nil, input: nil)
        self.field = nil
        accessory = nil
        input = nil
    }

    /// L'hôte a vu le champ touché : le dock rend le clavier s'il l'avait remplacé.
    public func fieldTouched() {
        onFieldTouched?()
    }

    var windowFrame: CGRect? { field?.window?.frame }

    /// Pose les deux vues d'entrée ; le champ ne se recharge que si elles changent.
    func install(accessory: UIView?, input: UIView?) {
        self.accessory = accessory
        self.input = input
        guard let field else { return }
        write(on: field, accessory: accessory, input: input)
    }

    private func adopt(_ newField: any MeeshyKeyboardDockField) {
        if let current = field, current !== newField { write(on: current, accessory: nil, input: nil) }
        field = newField
        write(on: newField, accessory: accessory, input: input)
    }

    private func write(on field: any MeeshyKeyboardDockField, accessory: UIView?, input: UIView?) {
        guard field.inputAccessoryView !== accessory || field.inputView !== input else { return }
        field.inputAccessoryView = accessory
        field.inputView = input
        if field.isFirstResponder { field.reloadInputViews() }
    }
}
