//
//  DeleteAccountView.swift
//  Meeshy
//
//  Account deletion view
//  Swift 6 compliant
//

import SwiftUI

struct DeleteAccountView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var confirmationText = ""
    @State private var showingFinalAlert = false
    @State private var isDeleting = false

    private let confirmationPhrase = "DELETE MY ACCOUNT"

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Warning", systemImage: "exclamationmark.triangle.fill")
                        .font(.headline)
                        .foregroundStyle(.red)

                    Text("Deleting your account is permanent and cannot be undone.")
                        .font(.subheadline)

                    Text("All your data will be permanently deleted, including:")
                        .font(.subheadline)
                        .padding(.top, 8)

                    VStack(alignment: .leading, spacing: 4) {
                        bulletPoint("All conversations and messages")
                        bulletPoint("Media files and documents")
                        bulletPoint("Contacts and groups")
                        bulletPoint("Settings and preferences")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Type \"\(confirmationPhrase)\" to confirm")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    TextField("", text: $confirmationText)
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.allCharacters)
                        .disableAutocorrection(true)
                }
            }

            Section {
                Button(role: .destructive) {
                    showingFinalAlert = true
                } label: {
                    HStack {
                        if isDeleting {
                            ProgressView()
                                .padding(.trailing, 8)
                        }
                        Text("Delete My Account")
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
                }
                .disabled(!isConfirmationValid || isDeleting)
            }
        }
        .navigationTitle("Delete Account")
        .alert("Final Confirmation", isPresented: $showingFinalAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Delete Forever", role: .destructive) {
                deleteAccount()
            }
        } message: {
            Text("Are you absolutely sure? This action cannot be undone.")
        }
    }

    private var isConfirmationValid: Bool {
        confirmationText == confirmationPhrase
    }

    private func bulletPoint(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("•")
            Text(text)
        }
    }

    private func deleteAccount() {
        isDeleting = true
        // TODO: Implement actual account deletion
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            isDeleting = false
            dismiss()
        }
    }
}

#Preview {
    NavigationStack {
        DeleteAccountView()
    }
}
