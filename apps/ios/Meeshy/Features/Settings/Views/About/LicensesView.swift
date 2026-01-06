//
//  LicensesView.swift
//  Meeshy
//
//  Open source licenses view
//  Swift 6 compliant
//

import SwiftUI

struct LicensesView: View {
    private let licenses: [License] = [
        License(
            name: "SwiftUI",
            author: "Apple Inc.",
            license: "MIT License",
            url: "https://developer.apple.com/xcode/swiftui/"
        ),
        License(
            name: "Combine",
            author: "Apple Inc.",
            license: "MIT License",
            url: "https://developer.apple.com/documentation/combine"
        ),
        License(
            name: "CoreData",
            author: "Apple Inc.",
            license: "MIT License",
            url: "https://developer.apple.com/documentation/coredata"
        )
    ]

    var body: some View {
        List(licenses) { license in
            VStack(alignment: .leading, spacing: 8) {
                Text(license.name)
                    .font(.headline)

                Text("by \(license.author)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                Text(license.license)
                    .font(.caption)
                    .foregroundStyle(.blue)

                if let url = URL(string: license.url) {
                    Link("View License", destination: url)
                        .font(.caption)
                }
            }
            .padding(.vertical, 4)
        }
        .navigationTitle("Open Source Licenses")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct License: Identifiable {
    let id = UUID()
    let name: String
    let author: String
    let license: String
    let url: String
}

#Preview {
    NavigationStack {
        LicensesView()
    }
}
