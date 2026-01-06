//
//  TranslationSettingsView.swift
//  Meeshy
//
//  Translation settings view
//  iOS 16+ compatible
//

import SwiftUI

@MainActor
struct TranslationSettingsView: View {
    @State private var autoTranslateEnabled: Bool = true
    @State private var preferredLanguage: String = "fr"
    @State private var showOriginal: Bool = true
    @State private var showVoiceCloningDemo = false

    var body: some View {
        List {
            Section {
                Toggle(isOn: $autoTranslateEnabled) {
                    Label("Traduction automatique", systemImage: "text.bubble.fill")
                }

                Toggle(isOn: $showOriginal) {
                    Label("Afficher le texte original", systemImage: "eye.fill")
                }
            } header: {
                Text("Traduction")
            } footer: {
                Text("Les messages seront automatiquement traduits dans votre langue")
            }

            Section {
                Picker("Langue preferee", selection: $preferredLanguage) {
                    Text("Francais").tag("fr")
                    Text("English").tag("en")
                    Text("Espanol").tag("es")
                    Text("Deutsch").tag("de")
                    Text("Italiano").tag("it")
                }
            } header: {
                Text("Langue")
            }

            Section {
                NavigationLink {
                    Text("Langues supportees")
                        .navigationTitle("Langues")
                } label: {
                    Label("Langues supportees", systemImage: "globe")
                }
            }

            // Voice Cloning POC Section
            Section {
                Button {
                    showVoiceCloningDemo = true
                } label: {
                    HStack {
                        Label("Clonage Vocal", systemImage: "waveform.circle.fill")
                        Spacer()
                        Text("POC")
                            .font(.caption)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Color.purple.opacity(0.2))
                            .foregroundColor(.purple)
                            .cornerRadius(6)
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .foregroundColor(.primary)
            } header: {
                Text("Fonctionnalites Experimentales")
            } footer: {
                Text("Clonage vocal 100% on-device avec OpenVoice CoreML et Neural Engine")
            }
        }
        .navigationTitle("Traduction")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showVoiceCloningDemo) {
            VoiceCloningDemoView()
        }
    }
}

#Preview {
    NavigationStack {
        TranslationSettingsView()
    }
}
