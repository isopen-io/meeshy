//
//  TermsOfServiceView.swift
//  Meeshy
//
//  Terms of service view
//  Swift 6 compliant
//

import SwiftUI

struct TermsOfServiceView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Terms of Service")
                    .font(.title)
                    .fontWeight(.bold)

                Text("Last updated: November 24, 2025")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Divider()

                termsSection(
                    title: "1. Acceptance of Terms",
                    content: "By accessing and using Meeshy, you accept and agree to be bound by the terms and provision of this agreement."
                )

                termsSection(
                    title: "2. Use License",
                    content: "Permission is granted to temporarily use Meeshy for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title."
                )

                termsSection(
                    title: "3. User Conduct",
                    content: "You agree not to use Meeshy for any unlawful purpose or in any way that could damage, disable, or impair the service."
                )

                termsSection(
                    title: "4. Content",
                    content: "You retain all rights to any content you submit, post or display on or through the service. By submitting content, you grant us a worldwide, non-exclusive license to use, copy, reproduce, process, adapt, modify, publish, transmit, display and distribute such content."
                )

                termsSection(
                    title: "5. Account Termination",
                    content: "We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms."
                )

                termsSection(
                    title: "6. Disclaimer",
                    content: "The service is provided on an 'AS IS' and 'AS AVAILABLE' basis. The service is provided without warranties of any kind, whether express or implied."
                )

                termsSection(
                    title: "7. Limitation of Liability",
                    content: "In no event shall Meeshy be liable for any indirect, incidental, special, consequential or punitive damages resulting from your use of or inability to use the service."
                )

                termsSection(
                    title: "8. Changes to Terms",
                    content: "We reserve the right to modify or replace these Terms at any time. It is your responsibility to check these Terms periodically for changes."
                )

                termsSection(
                    title: "9. Contact Information",
                    content: "Questions about the Terms of Service should be sent to us at legal@meeshy.me"
                )
            }
            .padding()
        }
        .navigationTitle("Terms of Service")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func termsSection(title: String, content: String) -> some View {
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
        TermsOfServiceView()
    }
}
