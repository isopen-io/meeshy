//
//  TwoFactorView.swift
//  Meeshy
//
//  Two-factor authentication verification screen
//  Minimum iOS 16+, with iOS 17+ SMS code auto-detection
//

import SwiftUI

struct TwoFactorView: View {
    // MARK: - Properties

    @Environment(\.dismiss) private var dismiss: DismissAction
    @StateObject private var viewModel = TwoFactorViewModel()
    @FocusState private var isCodeFieldFocused: Bool

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(spacing: 32) {
                // Header
                headerSection

                // Code Input
                codeInputSection

                // Error Message
                if let errorMessage = viewModel.errorMessage {
                    errorSection(errorMessage)
                }

                // Verify Button
                AuthButton(
                    title: "Verify",
                    isLoading: viewModel.isLoading,
                    isEnabled: viewModel.code.count == 6,
                    style: .primary
                ) {
                    Task {
                        await viewModel.verify()
                    }
                }

                // Resend Code
                resendSection
            }
            .padding(.horizontal, 24)
            .padding(.top, 60)
            .padding(.bottom, 40)
        }
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                Button(action: { dismiss() }) {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 16, weight: .semibold))
                        Text("Back")
                    }
                    .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                }
            }
        }
        .onAppear {
            isCodeFieldFocused = true
        }
        .onChange(of: viewModel.verificationComplete) { completed in
            if completed {
                dismiss()
            }
        }
    }

    // MARK: - View Components

    private var headerSection: some View {
        VStack(spacing: 16) {
            // Icon
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 64))
                .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                .accessibilityHidden(true)

            // Title
            Text("Two-Factor Authentication")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.primary)
                .multilineTextAlignment(.center)

            // Description
            Text("Enter the 6-digit code sent to your device")
                .font(.system(size: 17))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    private var codeInputSection: some View {
        VStack(spacing: 16) {
            // Code Display (Individual Digits)
            HStack(spacing: 12) {
                ForEach(0..<6, id: \.self) { index in
                    codeDigitBox(for: index)
                }
            }

            // Hidden TextField for input
            TextField("", text: $viewModel.code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode) // iOS 16+ SMS auto-detection
                .focused($isCodeFieldFocused)
                .opacity(0)
                .frame(height: 0)
                .onChange(of: viewModel.code) { newValue in
                    // Limit to 6 digits
                    if newValue.count > 6 {
                        viewModel.code = String(newValue.prefix(6))
                    }

                    // Auto-submit when 6 digits entered
                    if newValue.count == 6 {
                        Task {
                            try? await Task.sleep(nanoseconds: 300_000_000) // 0.3s delay
                            await viewModel.verify()
                        }
                    }
                }
        }
        .onTapGesture {
            isCodeFieldFocused = true
        }
    }

    private func codeDigitBox(for index: Int) -> some View {
        let digit = index < viewModel.code.count
            ? String(viewModel.code[viewModel.code.index(viewModel.code.startIndex, offsetBy: index)])
            : ""

        return Text(digit)
            .font(.system(size: 28, weight: .semibold, design: .monospaced))
            .foregroundColor(.primary)
            .frame(width: 48, height: 56)
            .background(Color(UIColor.systemGray6))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(
                        index == viewModel.code.count
                            ? Color(red: 0, green: 122/255, blue: 1)
                            : Color.clear,
                        lineWidth: 2
                    )
            )
            .accessibilityLabel("Digit \(index + 1)")
            .accessibilityValue(digit.isEmpty ? "Empty" : digit)
    }

    private func errorSection(_ message: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 16))

            Text(message)
                .font(.system(size: 15))
                .multilineTextAlignment(.leading)

            Spacer()
        }
        .foregroundColor(Color(red: 1, green: 59/255, blue: 48/255))
        .padding(16)
        .background(
            Color(red: 1, green: 59/255, blue: 48/255).opacity(0.1)
        )
        .cornerRadius(12)
        .transition(.opacity)
    }

    private var resendSection: some View {
        VStack(spacing: 12) {
            if viewModel.canResend {
                Button(action: {
                    Task {
                        await viewModel.resendCode()
                    }
                }) {
                    Text("Resend Code")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                }
                .disabled(viewModel.isLoading)
            } else {
                Text("Resend code in \(viewModel.resendCountdown)s")
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
            }
        }
    }
}

// MARK: - Two Factor View Model

@MainActor
final class TwoFactorViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var code: String = ""
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var verificationComplete: Bool = false
    @Published var resendCountdown: Int = 60
    @Published var canResend: Bool = false

    // MARK: - Private Properties

    private let authManager = AuthenticationManager.shared
    private var timerTask: Task<Void, Never>?

    // MARK: - Initialization

    init() {
        startResendTimer()
    }

    // MARK: - Public Methods

    func verify() async {
        guard code.count == 6 else { return }

        isLoading = true
        errorMessage = nil

        do {
            _ = try await authManager.verify2FA(code: code)

            // Success haptic
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            verificationComplete = true

        } catch {
            handleError(error)

            // Clear code on error
            code = ""

            // Shake animation
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.error)
        }

        isLoading = false
    }

    func resendCode() async {
        isLoading = true
        errorMessage = nil

        // In a real app, you would call an API endpoint to resend the code
        // For now, we'll simulate it
        try? await Task.sleep(nanoseconds: 1_000_000_000) // 1 second

        // Reset countdown
        startResendTimer()

        isLoading = false

        // Success haptic
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
    }

    // MARK: - Private Methods

    private func startResendTimer() {
        timerTask?.cancel()
        resendCountdown = 60
        canResend = false

        timerTask = Task { [weak self] in
            while true {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard let self = self else { return }
                
                if Task.isCancelled { return }

                self.resendCountdown -= 1

                if self.resendCountdown <= 0 {
                    self.canResend = true
                    return
                }
            }
        }
    }

    private func handleError(_ error: Error) {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost:
                errorMessage = "No internet connection. Please check your network."
            case .timedOut:
                errorMessage = "Request timed out. Please try again."
            default:
                errorMessage = "Network error. Please try again."
            }
        } else {
            errorMessage = "Invalid code. Please try again."
        }
    }

    deinit {
        timerTask?.cancel()
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        TwoFactorView()
    }
}
