//
//  SupportView.swift
//  Meeshy
//
//  Support and help view
//  Swift 6 compliant
//

import SwiftUI
import MessageUI

struct SupportView: View {
    @State private var showingMailComposer = false
    @State private var showingMailError = false

    var body: some View {
        List {
            Section("Get Help") {
                Button {
                    if let url = URL(string: "https://meeshy.com/help") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    HStack {
                        Label("Help Center", systemImage: "questionmark.circle")
                        Spacer()
                        Image(systemName: "arrow.up.forward")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Button {
                    if let url = URL(string: "https://meeshy.com/faq") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    HStack {
                        Label("FAQs", systemImage: "list.bullet.circle")
                        Spacer()
                        Image(systemName: "arrow.up.forward")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Button {
                    if let url = URL(string: "https://community.meeshy.com") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    HStack {
                        Label("Community Forum", systemImage: "bubble.left.and.bubble.right")
                        Spacer()
                        Image(systemName: "arrow.up.forward")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Contact Us") {
                Button {
                    sendEmail()
                } label: {
                    Label("Email Support", systemImage: "envelope")
                }

                Button {
                    if let url = URL(string: "https://twitter.com/meeshy") {
                        UIApplication.shared.open(url)
                    }
                } label: {
                    HStack {
                        Label("Twitter Support", systemImage: "bird")
                        Spacer()
                        Image(systemName: "arrow.up.forward")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Section("Report Issues") {
                Button {
                    // TODO: Implement bug report
                } label: {
                    Label("Report a Bug", systemImage: "ladybug")
                }

                Button {
                    // TODO: Implement feature request
                } label: {
                    Label("Request a Feature", systemImage: "lightbulb")
                }
            }

            Section("App Information") {
                infoRow(title: "Version", value: "1.0.0")
                infoRow(title: "Build", value: "1")
                infoRow(title: "Platform", value: "iOS \(UIDevice.current.systemVersion)")
            }
        }
        .navigationTitle("Support")
        .alert("Email Not Available", isPresented: $showingMailError) {
            Button("OK") { }
        } message: {
            Text("Please configure an email account in Settings to send support emails.")
        }
    }

    private func infoRow(title: String, value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .foregroundStyle(.secondary)
        }
    }

    private func sendEmail() {
        if MFMailComposeViewController.canSendMail() {
            showingMailComposer = true
        } else {
            showingMailError = true
        }
    }
}

#Preview {
    NavigationStack {
        SupportView()
    }
}
