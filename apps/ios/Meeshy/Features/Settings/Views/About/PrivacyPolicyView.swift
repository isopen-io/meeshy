//
//  PrivacyPolicyView.swift
//  Meeshy
//
//  Privacy policy view
//  Swift 6 compliant
//

import SwiftUI

struct PrivacyPolicyView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Privacy Policy")
                    .font(.title)
                    .fontWeight(.bold)

                Text("Last updated: November 24, 2025")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Divider()

                policySection(
                    title: "1. Information We Collect",
                    content: "We collect information you provide directly to us, including your name, email address, profile information, and the content of messages you send through our service."
                )

                policySection(
                    title: "2. How We Use Your Information",
                    content: "We use the information we collect to provide, maintain, and improve our services, to communicate with you, and to protect the security of our platform."
                )

                policySection(
                    title: "3. Data Security",
                    content: "We implement end-to-end encryption for all messages and use industry-standard security measures to protect your personal information."
                )

                policySection(
                    title: "4. Data Retention",
                    content: "We retain your information only for as long as necessary to provide our services and fulfill the purposes outlined in this policy."
                )

                policySection(
                    title: "5. Your Rights",
                    content: "You have the right to access, update, or delete your personal information at any time through your account settings."
                )

                policySection(
                    title: "6. Changes to This Policy",
                    content: "We may update this privacy policy from time to time. We will notify you of any changes by posting the new policy on this page."
                )

                policySection(
                    title: "7. Contact Us",
                    content: "If you have any questions about this privacy policy, please contact us at privacy@meeshy.me"
                )
            }
            .padding()
        }
        .navigationTitle("Privacy Policy")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func policySection(title: String, content: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            Text(content)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }
}

#Preview {
    NavigationStack {
        PrivacyPolicyView()
    }
}
