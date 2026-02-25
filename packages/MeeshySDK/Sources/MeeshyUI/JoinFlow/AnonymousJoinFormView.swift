import SwiftUI
import MeeshySDK

public struct AnonymousJoinFormView: View {
    @ObservedObject var viewModel: JoinFlowViewModel
    let onBack: () -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @FocusState private var focusedField: FormField?

    private var isDark: Bool { theme.mode.isDark }

    enum FormField: Hashable {
        case firstName, lastName, username, email
    }

    public init(viewModel: JoinFlowViewModel, onBack: @escaping () -> Void) {
        self.viewModel = viewModel
        self.onBack = onBack
    }

    public var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 20) {
                formHeader
                requiredFields
                optionalFields
                errorBanner
                submitButton
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 32)
        }
    }

    // MARK: - Header

    private var formHeader: some View {
        VStack(spacing: 8) {
            HStack {
                Button(action: onBack) {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Retour")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundColor(Color(hex: "4ECDC4"))
                }

                Spacer()
            }

            Text("Rejoindre la conversation")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let title = viewModel.linkInfo?.conversation.title {
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    // MARK: - Required Fields

    private var requiredFields: some View {
        VStack(spacing: 14) {
            Text("Informations requises")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)

            formField(
                icon: "person.fill",
                placeholder: "Prenom",
                text: $viewModel.firstName,
                field: .firstName,
                autocapitalization: .words
            )

            formField(
                icon: "person.fill",
                placeholder: "Nom",
                text: $viewModel.lastName,
                field: .lastName,
                autocapitalization: .words
            )

            if viewModel.linkInfo?.requireNickname == true {
                formField(
                    icon: "at",
                    placeholder: "Nom d'utilisateur",
                    text: $viewModel.username,
                    field: .username
                )
            }

            if viewModel.linkInfo?.requireEmail == true {
                formField(
                    icon: "envelope.fill",
                    placeholder: "Adresse email",
                    text: $viewModel.email,
                    field: .email,
                    keyboardType: .emailAddress
                )
            }

            if viewModel.linkInfo?.requireBirthday == true {
                birthdayPicker
            }
        }
    }

    // MARK: - Optional Fields

    @ViewBuilder
    private var optionalFields: some View {
        let hasOptional = viewModel.linkInfo?.requireNickname != true ||
                          viewModel.linkInfo?.requireEmail != true

        if hasOptional {
            VStack(spacing: 14) {
                Text("Optionnel")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if viewModel.linkInfo?.requireNickname != true {
                    formField(
                        icon: "at",
                        placeholder: "Nom d'utilisateur (optionnel)",
                        text: $viewModel.username,
                        field: .username
                    )
                }

                if viewModel.linkInfo?.requireEmail != true {
                    formField(
                        icon: "envelope",
                        placeholder: "Email (optionnel)",
                        text: $viewModel.email,
                        field: .email,
                        keyboardType: .emailAddress
                    )
                }

                languagePicker
            }
        } else {
            languagePicker
        }
    }

    // MARK: - Form Field

    private func formField(
        icon: String,
        placeholder: String,
        text: Binding<String>,
        field: FormField,
        keyboardType: UIKeyboardType = .default,
        autocapitalization: TextInputAutocapitalization = .never
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(focusedField == field ? Color(hex: "4ECDC4") : .secondary)
                .frame(width: 20)

            TextField(placeholder, text: text)
                .focused($focusedField, equals: field)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(autocapitalization)
                .autocorrectionDisabled()
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(
                    focusedField == field ? Color(hex: "4ECDC4").opacity(0.6) : Color.clear,
                    lineWidth: 1
                )
        )
    }

    // MARK: - Birthday Picker

    private var birthdayPicker: some View {
        HStack(spacing: 12) {
            Image(systemName: "gift.fill")
                .foregroundStyle(Color(hex: "9B59B6"))
                .frame(width: 20)

            DatePicker(
                "Date de naissance",
                selection: $viewModel.birthday,
                in: ...Calendar.current.date(byAdding: .year, value: -13, to: Date())!,
                displayedComponents: .date
            )
            .datePickerStyle(.compact)
            .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
        )
    }

    // MARK: - Language Picker

    private var languagePicker: some View {
        HStack(spacing: 12) {
            Image(systemName: "globe")
                .foregroundStyle(Color(hex: "3498DB"))
                .frame(width: 20)

            Text("Langue")
                .font(.system(size: 14))
                .foregroundColor(theme.textSecondary)

            Spacer()

            Picker("Langue", selection: $viewModel.language) {
                Text("Francais").tag("fr")
                Text("English").tag("en")
                Text("Espanol").tag("es")
                Text("Deutsch").tag("de")
                Text("Italiano").tag("it")
                Text("Portugues").tag("pt")
                Text("Nederlands").tag("nl")
                Text("Polski").tag("pl")
                Text("Turkce").tag("tr")
                Text("Русский").tag("ru")
                Text("العربية").tag("ar")
                Text("中文").tag("zh")
                Text("日本語").tag("ja")
                Text("한국어").tag("ko")
            }
            .tint(Color(hex: "4ECDC4"))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04))
        )
    }

    // MARK: - Error Banner

    @ViewBuilder
    private var errorBanner: some View {
        if let error = viewModel.errorMessage {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(Color(hex: "FF6B6B"))
                Text(error)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(hex: "FF6B6B"))
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(hex: "FF6B6B").opacity(isDark ? 0.12 : 0.08))
            )
        }
    }

    // MARK: - Submit Button

    private var submitButton: some View {
        Button {
            Task { await viewModel.submitJoin() }
        } label: {
            HStack(spacing: 10) {
                if viewModel.isSubmitting {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 18))
                    Text("Rejoindre")
                        .font(.system(size: 16, weight: .bold))
                }
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                LinearGradient(
                    colors: viewModel.isFormValid
                        ? [Color(hex: "B24BF3"), Color(hex: "4ECDC4")]
                        : [Color.gray.opacity(0.4), Color.gray.opacity(0.3)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .cornerRadius(16)
            .shadow(
                color: viewModel.isFormValid ? Color(hex: "B24BF3").opacity(0.3) : .clear,
                radius: 12, x: 0, y: 6
            )
        }
        .disabled(!viewModel.isFormValid || viewModel.isSubmitting)
        .padding(.top, 8)
    }
}
