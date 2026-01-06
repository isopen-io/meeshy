//
//  PrivacySettingsView.swift
//  Meeshy
//
//  Privacy settings view
//  iOS 16+ compatible
//

import SwiftUI

@MainActor
struct PrivacySettingsView: View {
    @State private var showOnlineStatus: Bool = true
    @State private var showLastSeen: Bool = true
    @State private var allowInvites: Bool = true
    @State private var showProfilePhoto: Bool = true

    var body: some View {
        List {
            Section {
                Toggle(isOn: $showOnlineStatus) {
                    Label("Statut en ligne", systemImage: "circle.fill")
                }

                Toggle(isOn: $showLastSeen) {
                    Label("Dernière connexion", systemImage: "clock.fill")
                }

                Toggle(isOn: $showProfilePhoto) {
                    Label("Photo de profil", systemImage: "person.crop.circle.fill")
                }
            } header: {
                Text("Visibilité")
            } footer: {
                Text("Contrôlez qui peut voir vos informations")
            }

            Section {
                Toggle(isOn: $allowInvites) {
                    Label("Autoriser les invitations", systemImage: "person.badge.plus.fill")
                }
            } header: {
                Text("Contact")
            }

            Section {
                NavigationLink {
                    Text("Utilisateurs bloqués")
                        .navigationTitle("Bloqués")
                } label: {
                    Label("Utilisateurs bloqués", systemImage: "hand.raised.fill")
                        .foregroundColor(.red)
                }

                NavigationLink {
                    Text("Données et confidentialité")
                        .navigationTitle("Données")
                } label: {
                    Label("Données et confidentialité", systemImage: "shield.fill")
                }
            } header: {
                Text("Sécurité")
            }
        }
        .navigationTitle("Confidentialité")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        PrivacySettingsView()
    }
}
