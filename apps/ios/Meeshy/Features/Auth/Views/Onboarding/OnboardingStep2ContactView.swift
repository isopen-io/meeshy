//
//  RegistrationStep2ContactView.swift
//  Meeshy
//
//  Step 2: Contact & Security - Phone, Email, Password
//  "Sécurité" with optional OTP verification
//

import SwiftUI

struct RegistrationStep2ContactView: View {
    @ObservedObject var viewModel: RegistrationFlowViewModel

    @State private var headerAppeared = false
    @State private var showCountryPicker = false

    private let accentColor = RegistrationStep.contact.accentColor

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header
                headerSection

                // Form fields
                VStack(spacing: 16) {
                    // Phone Number
                    OnboardingFieldCard(
                        explanation: .phone,
                        accentColor: accentColor,
                        delay: 0.1
                    ) {
                        VStack(spacing: 12) {
                            HStack(spacing: 12) {
                                // Country picker
                                Button(action: {
                                    showCountryPicker = true
                                }) {
                                    HStack(spacing: 6) {
                                        Text(viewModel.selectedCountryForPhone?.flag ?? "🌍")
                                            .font(.system(size: 24))

                                        Text(viewModel.selectedCountryForPhone?.dialCode ?? "+33")
                                            .font(.system(size: 15, weight: .medium))
                                            .foregroundColor(.primary)

                                        Image(systemName: "chevron.down")
                                            .font(.system(size: 12))
                                            .foregroundColor(.secondary)
                                    }
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 10)
                                    .background(
                                        RoundedRectangle(cornerRadius: 10)
                                            .fill(Color(.secondarySystemBackground))
                                    )
                                }

                                // Phone number input
                                OnboardingTextField(
                                    placeholder: "610424242",
                                    text: $viewModel.phoneNumber,
                                    keyboardType: .phonePad,
                                    autocapitalization: .never,
                                    errorMessage: viewModel.phoneError
                                )
                            }

                            // Verification status/button
                            if viewModel.isPhoneVerified {
                                verifiedBadge
                            } else {
                                verifyButton
                            }
                        }
                    }

                    // Email
                    OnboardingFieldCard(
                        explanation: .email,
                        accentColor: accentColor,
                        delay: 0.2
                    ) {
                        OnboardingTextField(
                            placeholder: "tonemail@exemple.com",
                            text: $viewModel.email,
                            keyboardType: .emailAddress,
                            autocapitalization: .never,
                            errorMessage: viewModel.emailError
                        )
                    }

                    // Password
                    OnboardingFieldCard(
                        explanation: .password,
                        accentColor: accentColor,
                        delay: 0.3
                    ) {
                        VStack(spacing: 12) {
                            OnboardingTextField(
                                placeholder: "Minimum 8 caractères",
                                text: $viewModel.password,
                                autocapitalization: .never,
                                isSecure: true,
                                errorMessage: viewModel.passwordError
                            )

                            // Password strength indicator
                            if !viewModel.password.isEmpty {
                                passwordStrengthView
                            }
                        }
                    }
                }

                Spacer(minLength: 100)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
        }
        .sheet(isPresented: $showCountryPicker) {
            OnboardingCountryPickerSheet(
                selectedCountry: $viewModel.selectedCountryForPhone,
                isPresented: $showCountryPicker
            )
        }
        .sheet(isPresented: $viewModel.showOTPSheet) {
            OTPVerificationSheet(viewModel: viewModel)
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.1))
                    .frame(width: 100, height: 100)

                Text("🔐")
                    .font(.system(size: 50))
                    .scaleEffect(headerAppeared ? 1 : 0.5)
            }

            VStack(spacing: 8) {
                Text("Sécurise ton compte")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(.primary)

                Text("Ces infos protègent ton compte Meeshy! On ne va pas te déranger, promis! 🤞")
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .opacity(headerAppeared ? 1 : 0)
            .offset(y: headerAppeared ? 0 : 20)
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                headerAppeared = true
            }
        }
    }

    // MARK: - Verification Views

    private var verifiedBadge: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundColor(.green)

            Text("Numéro vérifié!")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.green)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.green.opacity(0.1))
        )
    }

    private var verifyButton: some View {
        HStack {
            Button(action: {
                Task {
                    await viewModel.sendOTP()
                }
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "shield.checkered")
                    Text("Vérifier maintenant")
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundColor(accentColor)
            }

            Spacer()

            Text("Optionnel")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
    }

    // MARK: - Password Strength

    private var passwordStrengthView: some View {
        HStack(spacing: 12) {
            // Strength bars
            HStack(spacing: 4) {
                ForEach(0..<4) { index in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(
                            index < viewModel.passwordStrength.rawValue
                                ? viewModel.passwordStrength.color
                                : Color.gray.opacity(0.3)
                        )
                        .frame(height: 4)
                }
            }

            // Label with emoji
            HStack(spacing: 4) {
                Text(viewModel.passwordStrength.emoji)
                Text(viewModel.passwordStrength.label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(viewModel.passwordStrength.color)
            }
        }
        .transition(.opacity)
    }
}

// MARK: - Onboarding Country Picker Sheet (renamed to avoid conflict)

struct OnboardingCountryPickerSheet: View {
    @Binding var selectedCountry: Country?
    @Binding var isPresented: Bool

    @State private var searchText = ""

    private var filteredCountries: [Country] {
        if searchText.isEmpty {
            return Country.allCountries
        }
        return Country.search(searchText)
    }

    var body: some View {
        NavigationView {
            List(filteredCountries) { country in
                Button(action: {
                    selectedCountry = country
                    isPresented = false
                    HapticFeedback.selection.trigger()
                }) {
                    HStack(spacing: 12) {
                        Text(country.flag)
                            .font(.system(size: 24))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(country.name)
                                .font(.system(size: 16))
                                .foregroundColor(.primary)

                            Text(country.dialCode)
                                .font(.system(size: 14))
                                .foregroundColor(.secondary)
                        }

                        Spacer()

                        if selectedCountry?.code == country.code {
                            Image(systemName: "checkmark")
                                .foregroundColor(.blue)
                        }
                    }
                    .contentShape(Rectangle())
                }
            }
            .searchable(text: $searchText, prompt: "Rechercher un pays")
            .navigationTitle("Choisir un pays")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") {
                        isPresented = false
                    }
                }
            }
        }
    }
}

// MARK: - OTP Verification Sheet

struct OTPVerificationSheet: View {
    @ObservedObject var viewModel: RegistrationFlowViewModel

    @State private var isVerifying = false
    @FocusState private var isOTPFocused: Bool

    var body: some View {
        VStack(spacing: 24) {
            // Header
            VStack(spacing: 12) {
                Text("📲")
                    .font(.system(size: 50))

                Text("Vérification SMS")
                    .font(.system(size: 22, weight: .bold))

                Text("On t'a envoyé un code à 6 chiffres au \(viewModel.formattedPhoneNumber)")
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .padding(.top, 30)

            // OTP Input
            OTPInputView(code: $viewModel.otpCode)
                .focused($isOTPFocused)
                .padding(.horizontal, 40)

            // Verify button
            ShimmerButton(
                title: "Vérifier",
                icon: "checkmark.shield",
                accentColor: RegistrationStep.contact.accentColor,
                isEnabled: viewModel.otpCode.count == 6,
                isLoading: isVerifying
            ) {
                Task {
                    isVerifying = true
                    _ = await viewModel.verifyOTP()
                    isVerifying = false
                }
            }
            .padding(.horizontal, 40)

            // Resend link
            Button(action: {
                Task {
                    await viewModel.sendOTP()
                }
            }) {
                Text("Renvoyer le code")
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
        .onAppear {
            isOTPFocused = true
        }
    }
}

// MARK: - OTP Input View

struct OTPInputView: View {
    @Binding var code: String

    var body: some View {
        HStack(spacing: 12) {
            ForEach(0..<6, id: \.self) { index in
                OTPDigitBox(
                    digit: getDigit(at: index),
                    isFocused: code.count == index
                )
            }
        }
        .background(
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .opacity(0.01) // Hidden but functional
                .onChange(of: code) { newValue in
                    // Limit to 6 digits
                    if newValue.count > 6 {
                        code = String(newValue.prefix(6))
                    }
                    // Only allow numbers
                    code = newValue.filter { $0.isNumber }
                }
        )
    }

    private func getDigit(at index: Int) -> String {
        guard index < code.count else { return "" }
        return String(code[code.index(code.startIndex, offsetBy: index)])
    }
}

struct OTPDigitBox: View {
    let digit: String
    let isFocused: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.secondarySystemBackground))
                .frame(width: 45, height: 55)

            RoundedRectangle(cornerRadius: 12)
                .stroke(isFocused ? Color.blue : Color.clear, lineWidth: 2)
                .frame(width: 45, height: 55)

            Text(digit)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.primary)
        }
    }
}

// MARK: - Preview

#Preview {
    RegistrationStep2ContactView(viewModel: RegistrationFlowViewModel())
}
