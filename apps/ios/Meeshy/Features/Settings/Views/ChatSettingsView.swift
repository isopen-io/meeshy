//
//  ChatSettingsView.swift
//  Meeshy
//
//  Chat settings view
//  iOS 16+ compatible
//

import SwiftUI

@MainActor
struct ChatSettingsView: View {
    @State private var sendOnEnter: Bool = false
    @State private var showReadReceipts: Bool = true
    @State private var showTypingIndicator: Bool = true
    @State private var saveToGallery: Bool = false

    var body: some View {
        List {
            Section {
                Toggle(isOn: $sendOnEnter) {
                    Label("Envoyer avec Entrée", systemImage: "return")
                }

                Toggle(isOn: $showReadReceipts) {
                    Label("Confirmations de lecture", systemImage: "checkmark.circle.fill")
                }

                Toggle(isOn: $showTypingIndicator) {
                    Label("Indicateur de frappe", systemImage: "ellipsis.bubble.fill")
                }
            } header: {
                Text("Comportement")
            }

            Section {
                Toggle(isOn: $saveToGallery) {
                    Label("Enregistrer dans la galerie", systemImage: "photo.fill")
                }
            } header: {
                Text("Médias")
            } footer: {
                Text("Les médias reçus seront automatiquement sauvegardés dans votre galerie")
            }

            Section {
                NavigationLink {
                    Text("Taille de police")
                        .navigationTitle("Police")
                } label: {
                    Label("Taille de police", systemImage: "textformat.size")
                }

                NavigationLink {
                    Text("Thème de chat")
                        .navigationTitle("Thème")
                } label: {
                    Label("Thème de chat", systemImage: "paintbrush.fill")
                }
            } header: {
                Text("Apparence")
            }
        }
        .navigationTitle("Chat")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        ChatSettingsView()
    }
}
