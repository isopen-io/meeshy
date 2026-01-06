//
//  BackendSelectorView.swift
//  Meeshy
//
//  Backend URL selector overlay for development and testing
//  iOS 16+
//

import SwiftUI

struct BackendSelectorView: View {
    @ObservedObject var config: EnvironmentConfig
    @Environment(\.dismiss) private var dismiss
    @State private var customURL: String = ""
    @State private var showCustomInput = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Current: \(config.activeURL)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                } header: {
                    Text("Active Backend")
                }

                Section {
                    // Primary URL (Production)
                    Button {
                        config.selectedURL = EnvironmentConfig.productionURL
                        dismiss()
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Production")
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                Text(EnvironmentConfig.productionURL)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            if config.activeURL == EnvironmentConfig.productionURL {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                            }
                        }
                    }

                    // Fallback URL (Local Dev)
                    Button {
                        config.selectedURL = EnvironmentConfig.localURL
                        dismiss()
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Local Dev")
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                Text(EnvironmentConfig.localURL)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            if config.activeURL == EnvironmentConfig.localURL {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                            }
                        }
                    }
                } header: {
                    Text("Presets")
                }

                Section {
                    if showCustomInput {
                        HStack {
                            TextField("https://", text: $customURL)
                                .autocapitalization(.none)
                                .autocorrectionDisabled()
                                .keyboardType(.URL)

                            Button {
                                if !customURL.isEmpty {
                                    config.selectedURL = customURL
                                    showCustomInput = false
                                    customURL = ""
                                    dismiss()
                                }
                            } label: {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(customURL.isEmpty ? .gray : .green)
                            }
                            .disabled(customURL.isEmpty)
                        }
                    } else {
                        Button {
                            showCustomInput = true
                        } label: {
                            Label("Use Custom URL", systemImage: "plus.circle")
                        }
                    }

                    // Show custom URL if it's active and not a preset
                    if !config.selectedURL.isEmpty &&
                       config.selectedURL != EnvironmentConfig.productionURL &&
                       config.selectedURL != EnvironmentConfig.localURL {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Custom")
                                    .font(.headline)
                                    .foregroundColor(.primary)
                                Text(config.selectedURL)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .lineLimit(2)
                            }
                            Spacer()
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                        }
                    }
                } header: {
                    Text("Custom")
                } footer: {
                    Text("Enter a custom backend URL for testing. Must include protocol (https://).")
                }

                Section {
                    Button(role: .destructive) {
                        config.selectedURL = ""
                        dismiss()
                    } label: {
                        HStack {
                            Image(systemName: "arrow.counterclockwise")
                            Text("Reset to Default")
                        }
                    }
                } footer: {
                    Text("Resets to production server (\(EnvironmentConfig.productionURL))")
                }
            }
            .navigationTitle("Backend Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}

#Preview {
    BackendSelectorView(config: EnvironmentConfig.shared)
}
