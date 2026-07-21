import SwiftUI
import Combine
import MeeshySDK

public struct AuthTextField: View {
    let title: String
    let icon: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .never
    var validation: ((String) -> String?)? = nil

    @State private var isShowingPassword = false
    @State private var validationError: String?
    @FocusState private var isFocused: Bool
    // Leaf field — do not observe the ThemeManager singleton. `colorScheme`
    // keeps theme-flip reactivity; `theme` is accessed non-observingly for its
    // derived input colors.
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }

    public init(title: String, icon: String, text: Binding<String>,
                isSecure: Bool = false, keyboardType: UIKeyboardType = .default,
                autocapitalization: TextInputAutocapitalization = .never,
                validation: ((String) -> String?)? = nil) {
        self.title = title
        self.icon = icon
        self._text = text
        self.isSecure = isSecure
        self.keyboardType = keyboardType
        self.autocapitalization = autocapitalization
        self.validation = validation
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .foregroundStyle(isFocused ? MeeshyColors.brandPrimary : theme.textMuted)
                    .frame(width: 20)

                if isSecure && !isShowingPassword {
                    SecureField(title, text: $text)
                        .focused($isFocused)
                        .textInputAutocapitalization(autocapitalization)
                } else {
                    TextField(title, text: $text)
                        .focused($isFocused)
                        .keyboardType(keyboardType)
                        .textInputAutocapitalization(autocapitalization)
                        .autocorrectionDisabled()
                }

                if isSecure {
                    Button {
                        isShowingPassword.toggle()
                    } label: {
                        Image(systemName: isShowingPassword ? "eye.slash" : "eye")
                            .foregroundStyle(theme.textMuted)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.inputBackground)
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .strokeBorder(
                        isFocused ? MeeshyColors.brandPrimary.opacity(0.6) :
                            validationError != nil ? Color.red.opacity(0.5) :
                            theme.inputBorder.opacity(0.3),
                        lineWidth: 1
                    )
            )

            if let error = validationError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red.opacity(0.8))
                    .padding(.leading, 4)
            }
        }
        .adaptiveOnChange(of: text) { _, newValue in
            if let validation {
                validationError = validation(newValue)
            }
        }
    }
}
