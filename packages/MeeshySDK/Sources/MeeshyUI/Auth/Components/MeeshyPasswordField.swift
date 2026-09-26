import SwiftUI
import UIKit

/// Ce que le champ attend : le mot de passe EXISTANT (AutoFill le pré-remplit
/// depuis le trousseau) ou un NOUVEAU (AutoFill propose un mot de passe fort et
/// met à jour l'entrée du trousseau).
public enum MeeshyPasswordRole: Sendable {
    case current
    case new

    public var textContentType: UITextContentType {
        switch self {
        case .current: return .password
        case .new: return .newPassword
        }
    }
}

/// La loi de la bascule œil (#8054) : masqué par défaut, un geste pour
/// afficher, un geste pour masquer. VoiceOver lit l'ACTION dans le libellé et
/// l'ÉTAT dans la valeur.
public struct MeeshyPasswordReveal: Equatable, Sendable {
    public private(set) var isRevealed = false

    public init() {}

    public mutating func toggle() {
        isRevealed.toggle()
    }

    public var symbolName: String {
        isRevealed ? "eye.slash" : "eye"
    }

    public var toggleLabel: String { toggleLabel(bundle: .module) }

    public var stateValue: String { stateValue(bundle: .module) }

    func toggleLabel(bundle: Bundle) -> String {
        isRevealed
            ? String(localized: "password.reveal.hide", defaultValue: "Masquer le mot de passe", bundle: bundle)
            : String(localized: "password.reveal.show", defaultValue: "Afficher le mot de passe", bundle: bundle)
    }

    func stateValue(bundle: Bundle) -> String {
        isRevealed
            ? String(localized: "password.reveal.state.revealed", defaultValue: "Affiché", bundle: bundle)
            : String(localized: "password.reveal.state.masked", defaultValue: "Masqué", bundle: bundle)
    }

    static let catalogKeys = [
        "password.reveal.hide",
        "password.reveal.show",
        "password.reveal.state.revealed",
        "password.reveal.state.masked",
    ]
}

/// Focus possédé par le champ quand l'hôte n'en déclare pas.
public enum MeeshyPasswordFieldOwnFocus: Hashable {
    case field
}

/// LE champ de mot de passe de l'app (#8054) — seul site autorisé à écrire un
/// `SecureField`. Un bouton œil bascule affiché/masqué sans perdre ni le texte
/// (la même liaison nourrit les deux saisies) ni le focus (rétabli sur la
/// saisie qui remplace l'autre).
///
/// Police, couleur, `submitLabel` et `onSubmit` se posent sur le composant et
/// descendent aux deux saisies ; le libellé VoiceOver du champ passe par
/// `accessibilityLabel:` pour ne pas écraser celui du bouton œil.
public struct MeeshyPasswordField<Field: Hashable>: View {
    private let placeholder: String
    @Binding private var text: String
    private let role: MeeshyPasswordRole
    private let focus: FocusState<Field?>.Binding?
    private let field: Field
    private let fieldAccessibilityLabel: String?
    private let eyeColor: Color

    @State private var reveal = MeeshyPasswordReveal()
    @FocusState private var ownFocus: Field?

    public init(
        _ placeholder: String,
        text: Binding<String>,
        role: MeeshyPasswordRole,
        focus: FocusState<Field?>.Binding,
        equals field: Field,
        accessibilityLabel: String? = nil,
        eyeColor: Color = .secondary
    ) {
        self.placeholder = placeholder
        self._text = text
        self.role = role
        self.focus = focus
        self.field = field
        self.fieldAccessibilityLabel = accessibilityLabel
        self.eyeColor = eyeColor
    }

    public var body: some View {
        HStack(spacing: 8) {
            input
                .textContentType(role.textContentType)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused(focusBinding, equals: field)
                .accessibilityLabel(fieldAccessibilityLabel ?? placeholder)

            eyeButton
        }
    }

    private var focusBinding: FocusState<Field?>.Binding {
        focus ?? $ownFocus
    }

    @ViewBuilder
    private var input: some View {
        if reveal.isRevealed {
            TextField(placeholder, text: $text)
        } else {
            SecureField(placeholder, text: $text)
        }
    }

    private var eyeButton: some View {
        Button(action: toggle) {
            Image(systemName: reveal.symbolName)
                .foregroundStyle(eyeColor)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -12)
        .accessibilityLabel(reveal.toggleLabel)
        .accessibilityValue(reveal.stateValue)
    }

    private func toggle() {
        let binding = focusBinding
        let wasFocused = binding.wrappedValue == field
        reveal.toggle()
        guard wasFocused else { return }
        let target = field
        Task { @MainActor in binding.wrappedValue = target }
    }
}

public extension MeeshyPasswordField where Field == MeeshyPasswordFieldOwnFocus {
    init(
        _ placeholder: String,
        text: Binding<String>,
        role: MeeshyPasswordRole,
        accessibilityLabel: String? = nil,
        eyeColor: Color = .secondary
    ) {
        self.placeholder = placeholder
        self._text = text
        self.role = role
        self.focus = nil
        self.field = .field
        self.fieldAccessibilityLabel = accessibilityLabel
        self.eyeColor = eyeColor
    }
}
