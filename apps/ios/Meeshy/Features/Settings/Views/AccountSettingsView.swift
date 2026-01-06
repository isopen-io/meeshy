import SwiftUI

struct AccountSettingsView: View {
    @StateObject private var settingsManager = SettingsManager.shared
    @State private var showingEmailChange = false
    @State private var showingPhoneChange = false
    @State private var showingPasswordChange = false
    @State private var showingDeactivateAlert = false

    var body: some View {
        List {
            // Email Section
            Section("Email") {
                HStack {
                    Text("Email Address")
                    Spacer()
                    Text(settingsManager.userEmail.isEmpty ? "Not set" : settingsManager.userEmail)
                        .foregroundStyle(.secondary)
                }

                Button {
                    showingEmailChange = true
                } label: {
                    Text("Change Email")
                }
            }

            // Phone Section
            Section("Phone Number") {
                HStack {
                    Text("Phone Number")
                    Spacer()
                    Text(settingsManager.userPhone.isEmpty ? "Not set" : settingsManager.userPhone)
                        .foregroundStyle(.secondary)
                }

                Button {
                    showingPhoneChange = true
                } label: {
                    Text("Change Phone Number")
                }
            }

            // Password Section
            Section("Password") {
                Button {
                    showingPasswordChange = true
                } label: {
                    Text("Change Password")
                }
            }

            // Account Actions
            Section {
                Button(role: .destructive) {
                    showingDeactivateAlert = true
                } label: {
                    Text("Deactivate Account")
                }
            } footer: {
                Text("Deactivating your account will hide your profile and messages from others. You can reactivate anytime by logging in.")
            }
        }
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingEmailChange) {
            ChangeEmailView()
        }
        .sheet(isPresented: $showingPhoneChange) {
            ChangePhoneView()
        }
        .sheet(isPresented: $showingPasswordChange) {
            ChangePasswordView()
        }
        .alert("Deactivate Account?", isPresented: $showingDeactivateAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Deactivate", role: .destructive) {
                // Handle deactivation
            }
        } message: {
            Text("Your account will be hidden from others. You can reactivate by logging in again.")
        }
    }
}

// MARK: - Change Email View (Local version - use ChangeEmailView from Account/ instead)
private struct LocalChangeEmailView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var newEmail = ""
    @State private var password = ""
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("New Email", text: $newEmail)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)

                    SecureField("Current Password", text: $password)
                        .textContentType(.password)
                } footer: {
                    Text("We'll send a verification code to your new email address.")
                }

                Section {
                    Button {
                        changeEmail()
                    } label: {
                        if isLoading {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Continue")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(newEmail.isEmpty || password.isEmpty || isLoading)
                }
            }
            .navigationTitle("Change Email")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }

    private func changeEmail() {
        isLoading = true
        // API call to change email
        Task {
            try? await Task.sleep(for: .seconds(1))
            isLoading = false
            dismiss()
        }
    }
}

// Note: ChangePhoneView is now defined in Account/ChangePhoneView.swift
// with full verification flow similar to ChangeEmailView

// MARK: - Change Password View (Local version - use ChangePasswordView from Account/ instead)
private struct LocalChangePasswordView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false
    @State private var errorMessage = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Current Password", text: $currentPassword)
                        .textContentType(.password)
                }

                Section {
                    SecureField("New Password", text: $newPassword)
                        .textContentType(.newPassword)

                    SecureField("Confirm New Password", text: $confirmPassword)
                        .textContentType(.newPassword)
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Password must be at least 8 characters long and include:")
                        Text("• At least one uppercase letter")
                        Text("• At least one number")
                        Text("• At least one special character")
                    }
                    .font(.caption)
                }

                if !errorMessage.isEmpty {
                    Section {
                        Text(errorMessage)
                            .foregroundStyle(.red)
                            .font(.caption)
                    }
                }

                Section {
                    Button {
                        changePassword()
                    } label: {
                        if isLoading {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Change Password")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(!isValidPassword || isLoading)
                }
            }
            .navigationTitle("Change Password")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
            }
        }
    }

    private var isValidPassword: Bool {
        !currentPassword.isEmpty &&
        newPassword.count >= 8 &&
        newPassword == confirmPassword &&
        newPassword.range(of: "[A-Z]", options: .regularExpression) != nil &&
        newPassword.range(of: "[0-9]", options: .regularExpression) != nil &&
        newPassword.range(of: "[^A-Za-z0-9]", options: .regularExpression) != nil
    }

    private func changePassword() {
        isLoading = true
        errorMessage = ""

        // API call to change password
        Task {
            try? await Task.sleep(for: .seconds(1))
            isLoading = false
            dismiss()
        }
    }
}

// Preview removed due to ambiguous init() - view can be tested via SettingsView navigation