//
//  SecuritySettingsView.swift
//  Meeshy
//
//  Security settings view
//  iOS 16+ compatible
//

import SwiftUI

@MainActor
struct SecuritySettingsView: View {
    @State private var twoFactorEnabled: Bool = false
    @State private var biometricEnabled: Bool = false

    var body: some View {
        List {
            Section {
                NavigationLink {
                    ChangePasswordView()
                } label: {
                    Label("Changer le mot de passe", systemImage: "key.fill")
                }

                Toggle(isOn: $twoFactorEnabled) {
                    Label("Authentification à deux facteurs", systemImage: "lock.shield.fill")
                }

                Toggle(isOn: $biometricEnabled) {
                    Label("Déverrouillage biométrique", systemImage: "faceid")
                }
            } header: {
                Text("Sécurité du compte")
            }

            Section {
                NavigationLink {
                    Text("Sessions actives")
                        .navigationTitle("Sessions")
                } label: {
                    Label("Sessions actives", systemImage: "laptopcomputer.and.iphone")
                }

                Button(role: .destructive) {
                    // TODO: Implement logout from all devices
                } label: {
                    Label("Déconnecter tous les appareils", systemImage: "power")
                }
            } header: {
                Text("Sessions")
            }
        }
        .navigationTitle("Sécurité")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        SecuritySettingsView()
    }
}
