//
//  AuthTextField.swift
//  Meeshy
//
//  Reusable authentication text field with validation
//  Minimum iOS 16+
//

import SwiftUI

/// Styled text field for authentication forms
struct AuthTextField: View {
    // MARK: - Properties

    let title: String
    let placeholder: String
    @Binding var text: String
    let keyboardType: UIKeyboardType
    let textContentType: UITextContentType?
    let isSecure: Bool
    let errorMessage: String?
    let autoFocus: Bool

    @State private var isSecureVisible = false
    @FocusState private var isFocused: Bool

    // MARK: - Initialization

    init(
        title: String,
        placeholder: String,
        text: Binding<String>,
        keyboardType: UIKeyboardType = .default,
        textContentType: UITextContentType? = nil,
        isSecure: Bool = false,
        errorMessage: String? = nil,
        autoFocus: Bool = false
    ) {
        self.title = title
        self.placeholder = placeholder
        self._text = text
        self.keyboardType = keyboardType
        self.textContentType = textContentType
        self.isSecure = isSecure
        self.errorMessage = errorMessage
        self.autoFocus = autoFocus
    }

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Title
            Text(title)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.primary)

            // Text Field Container
            HStack(spacing: 12) {
                Group {
                    if isSecure && !isSecureVisible {
                        SecureField(placeholder, text: $text)
                            .textContentType(textContentType)
                            .focused($isFocused)
                    } else {
                        TextField(placeholder, text: $text)
                            .keyboardType(keyboardType)
                            .textContentType(textContentType)
                            .autocapitalization(keyboardType == .emailAddress ? .none : .sentences)
                            .focused($isFocused)
                    }
                }
                .font(.system(size: 17))

                // Secure visibility toggle
                if isSecure {
                    Button(action: {
                        isSecureVisible.toggle()
                    }) {
                        Image(systemName: isSecureVisible ? "eye.slash.fill" : "eye.fill")
                            .foregroundColor(.secondary)
                            .font(.system(size: 16))
                    }
                    .accessibilityLabel(isSecureVisible ? "Hide password" : "Show password")
                }
            }
            .padding(.horizontal, 16)
            .frame(height: 50)
            .background(Color(UIColor.systemGray6))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(borderColor, lineWidth: 1.5)
            )

            // Error Message
            if let errorMessage = errorMessage, !errorMessage.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 12))
                    Text(errorMessage)
                        .font(.system(size: 13))
                }
                .foregroundColor(Color(red: 1, green: 59/255, blue: 48/255))
                .transition(.opacity)
            }
        }
        .onAppear {
            if autoFocus {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    isFocused = true
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(placeholder)")
        .accessibilityValue(text.isEmpty ? "Empty" : text)
        .accessibilityHint(errorMessage ?? "")
    }

    // MARK: - Computed Properties

    private var borderColor: Color {
        if let errorMessage = errorMessage, !errorMessage.isEmpty {
            return Color(red: 1, green: 59/255, blue: 48/255)
        } else if isFocused {
            return Color(red: 0, green: 122/255, blue: 1)
        } else {
            return Color.clear
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 24) {
        AuthTextField(
            title: "Email",
            placeholder: "Enter your email",
            text: .constant(""),
            keyboardType: .emailAddress,
            textContentType: .emailAddress,
            autoFocus: true
        )

        AuthTextField(
            title: "Password",
            placeholder: "Enter your password",
            text: .constant(""),
            textContentType: .password,
            isSecure: true
        )

        AuthTextField(
            title: "Email",
            placeholder: "Enter your email",
            text: .constant("invalid@"),
            keyboardType: .emailAddress,
            errorMessage: "Please enter a valid email address"
        )
    }
    .padding()
}
