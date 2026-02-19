import SwiftUI
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
                    .foregroundStyle(isFocused ? Color(hex: "4ECDC4") : .secondary)
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
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color(hex: "2D2D40").opacity(0.6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(
                        isFocused ? Color(hex: "4ECDC4").opacity(0.6) :
                            validationError != nil ? Color.red.opacity(0.5) :
                            Color.white.opacity(0.08),
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
        .onChange(of: text) { newValue in
            if let validation {
                validationError = validation(newValue)
            }
        }
    }
}
