//
//  AboutView.swift
//  Meeshy
//
//  About app view
//  Swift 6 compliant
//

import SwiftUI

struct AboutView: View {
    var body: some View {
        List {
            Section {
                VStack(spacing: 16) {
                    Image(systemName: "message.circle.fill")
                        .resizable()
                        .frame(width: 80, height: 80)
                        .foregroundStyle(.blue)

                    Text("Meeshy")
                        .font(.title)
                        .fontWeight(.bold)

                    Text("Version 1.0.0 (Build 1)")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
            }

            Section("About") {
                infoRow(title: "Platform", value: "iOS")
                infoRow(title: "SDK Version", value: ProcessInfo.processInfo.operatingSystemVersionString)
                infoRow(title: "Bundle ID", value: Bundle.main.bundleIdentifier ?? "Unknown")
            }

            Section("Description") {
                Text("Meeshy is a modern, secure messaging platform designed for seamless communication. Built with privacy and user experience in mind.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section("Features") {
                featureRow(icon: "lock.shield", title: "End-to-End Encryption")
                featureRow(icon: "globe", title: "Real-time Translation")
                featureRow(icon: "bolt.fill", title: "Fast & Reliable")
                featureRow(icon: "paintbrush", title: "Customizable Themes")
                featureRow(icon: "icloud", title: "Cloud Sync")
            }

            Section("Links") {
                Link(destination: URL(string: "https://meeshy.com")!) {
                    HStack {
                        Label("Website", systemImage: "safari")
                        Spacer()
                        Image(systemName: "arrow.up.forward")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Link(destination: URL(string: "https://twitter.com/meeshy")!) {
                    HStack {
                        Label("Twitter", systemImage: "bird")
                        Spacer()
                        Image(systemName: "arrow.up.forward")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Link(destination: URL(string: "https://github.com/meeshy")!) {
                    HStack {
                        Label("GitHub", systemImage: "chevron.left.forwardslash.chevron.right")
                        Spacer()
                        Image(systemName: "arrow.up.forward")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section {
                Text("© 2024 Meeshy. All rights reserved.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
        .navigationTitle("About")
    }

    private func infoRow(title: String, value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
        }
    }

    private func featureRow(icon: String, title: String) -> some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(.blue)
                .frame(width: 30)
            Text(title)
        }
    }
}

#Preview {
    NavigationStack {
        AboutView()
    }
}
