//
//  UsernameTextField.swift
//  Meeshy
//
//  Username text field with real-time availability checking
//  Minimum iOS 16+
//

import SwiftUI
import Combine

/// Username field with real-time availability checking
struct UsernameTextField: View {
    // MARK: - Properties

    @Binding var username: String
    @Binding var isAvailable: Bool?
    @Binding var isChecking: Bool
    let errorMessage: String?
    let onAvailabilityCheck: (String) async -> Bool

    @State private var checkTask: Task<Void, Never>?
    @FocusState private var isFocused: Bool

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Title
            Text("Username")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.primary)

            // Text Field Container
            HStack(spacing: 12) {
                TextField("Choose a username", text: $username)
                    .font(.system(size: 17))
                    .textContentType(.username)
                    .autocapitalization(.none)
                    .autocorrectionDisabled(true)
                    .focused($isFocused)
                    .onChange(of: username) { newValue in
                        handleUsernameChange(newValue)
                    }

                // Status indicator
                if isChecking {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle())
                        .scaleEffect(0.8)
                } else if let isAvailable = isAvailable {
                    Image(systemName: isAvailable ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(isAvailable ?
                            Color(red: 52/255, green: 199/255, blue: 89/255) :
                            Color(red: 1, green: 59/255, blue: 48/255))
                        .animation(.easeInOut(duration: 0.2), value: isAvailable)
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

            // Helper text or error
            if let errorMessage = errorMessage, !errorMessage.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 12))
                    Text(errorMessage)
                        .font(.system(size: 13))
                }
                .foregroundColor(Color(red: 1, green: 59/255, blue: 48/255))
                .transition(.opacity)
            } else if let isAvailable = isAvailable {
                HStack(spacing: 6) {
                    Image(systemName: isAvailable ? "checkmark.circle.fill" : "info.circle.fill")
                        .font(.system(size: 12))
                    Text(isAvailable ?
                        "Username is available" :
                        "Username is already taken")
                        .font(.system(size: 13))
                }
                .foregroundColor(isAvailable ?
                    Color(red: 52/255, green: 199/255, blue: 89/255) :
                    Color(red: 1, green: 149/255, blue: 0))
                .transition(.opacity)
                .animation(.easeInOut(duration: 0.2), value: isAvailable)
            } else if !username.isEmpty {
                // Validation hints
                Text("4+ characters, letters, numbers, dashes, and underscores only")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Username")
        .accessibilityValue(username.isEmpty ? "Empty" : username)
        .accessibilityHint(availabilityHint)
    }

    // MARK: - Computed Properties

    private var borderColor: Color {
        if let errorMessage = errorMessage, !errorMessage.isEmpty {
            return Color(red: 1, green: 59/255, blue: 48/255)
        } else if isFocused {
            return Color(red: 0, green: 122/255, blue: 1)
        } else if let isAvailable = isAvailable {
            return isAvailable ?
                Color(red: 52/255, green: 199/255, blue: 89/255) :
                Color(red: 1, green: 149/255, blue: 0)
        } else {
            return Color.clear
        }
    }

    private var availabilityHint: String {
        if isChecking {
            return "Checking availability"
        } else if let isAvailable = isAvailable {
            return isAvailable ? "Username is available" : "Username is taken"
        } else {
            return ""
        }
    }

    // MARK: - Helper Methods

    private func handleUsernameChange(_ newValue: String) {
        // Cancel any existing check
        checkTask?.cancel()

        // Reset availability if username is empty or invalid
        if newValue.isEmpty || !isValidUsername(newValue) {
            isAvailable = nil
            isChecking = false
            return
        }

        // Debounce the check (wait 500ms after user stops typing)
        checkTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000) // 0.5 seconds

            guard !Task.isCancelled else { return }

            await MainActor.run {
                isChecking = true
                isAvailable = nil
            }

            let available = await onAvailabilityCheck(newValue)

            guard !Task.isCancelled else { return }

            await MainActor.run {
                isChecking = false
                isAvailable = available
            }
        }
    }

    private func isValidUsername(_ username: String) -> Bool {
        // Username must be 4+ characters and contain only letters, numbers, dashes, underscores
        guard username.count >= 4 else { return false }
        let usernameRegex = "^[a-zA-Z0-9_-]+$"
        let usernamePredicate = NSPredicate(format: "SELF MATCHES %@", usernameRegex)
        return usernamePredicate.evaluate(with: username)
    }
}

// MARK: - Preview Helper

struct UsernameTextField_Previews: PreviewProvider {
    struct PreviewWrapper: View {
        @State private var username = ""
        @State private var isAvailable: Bool? = nil
        @State private var isChecking = false

        var body: some View {
            VStack(spacing: 24) {
                UsernameTextField(
                    username: $username,
                    isAvailable: $isAvailable,
                    isChecking: $isChecking,
                    errorMessage: nil,
                    onAvailabilityCheck: { username in
                        // Simulate API call
                        try? await Task.sleep(nanoseconds: 1_000_000_000)
                        return !["john", "admin", "user"].contains(username.lowercased())
                    }
                )

                UsernameTextField(
                    username: .constant("john_doe"),
                    isAvailable: .constant(true),
                    isChecking: .constant(false),
                    errorMessage: nil,
                    onAvailabilityCheck: { _ in true }
                )

                UsernameTextField(
                    username: .constant("admin"),
                    isAvailable: .constant(false),
                    isChecking: .constant(false),
                    errorMessage: nil,
                    onAvailabilityCheck: { _ in false }
                )

                UsernameTextField(
                    username: .constant("checking"),
                    isAvailable: .constant(nil),
                    isChecking: .constant(true),
                    errorMessage: nil,
                    onAvailabilityCheck: { _ in true }
                )

                UsernameTextField(
                    username: .constant("bad"),
                    isAvailable: .constant(nil),
                    isChecking: .constant(false),
                    errorMessage: "Username must be at least 4 characters",
                    onAvailabilityCheck: { _ in false }
                )
            }
            .padding()
        }
    }

    static var previews: some View {
        PreviewWrapper()
    }
}