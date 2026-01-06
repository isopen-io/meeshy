//
//  AppearanceSettingsView.swift
//  Meeshy
//
//  Appearance settings view
//  iOS 16+ compatible
//

import SwiftUI

@MainActor
struct AppearanceSettingsView: View {
    @State private var colorScheme: String = "system"
    @State private var accentColor: Color = .blue
    @State private var fontSize: Double = 16

    var body: some View {
        List {
            Section {
                Picker("Thème", selection: $colorScheme) {
                    Text("Système").tag("system")
                    Text("Clair").tag("light")
                    Text("Sombre").tag("dark")
                }
            } header: {
                Text("Thème")
            }

            Section {
                ColorPicker("Couleur d'accentuation", selection: $accentColor)
            } header: {
                Text("Couleurs")
            }

            Section {
                HStack {
                    Text("Taille de police")
                    Spacer()
                    Slider(value: $fontSize, in: 12...20, step: 1)
                        .frame(width: 150)
                    Text("\(Int(fontSize))")
                        .frame(width: 30)
                }
            } header: {
                Text("Police")
            } footer: {
                Text("Ajustez la taille du texte dans l'application")
            }
        }
        .navigationTitle("Apparence")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview {
    NavigationStack {
        AppearanceSettingsView()
    }
}
