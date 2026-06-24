import SwiftUI

// MARK: - Adaptive content-unavailable view

/// `ContentUnavailableView` requires iOS 17. This wrapper renders the real
/// system view on iOS 17+ — so the empty state on current OS versions is
/// unchanged — and a faithful reproduction on iOS 16.
///
/// The API mirrors `ContentUnavailableView(_:systemImage:description:)`.
public struct AdaptiveContentUnavailableView: View {
    private let title: String
    private let systemImage: String
    private let description: Text?

    public init(_ title: String, systemImage: String, description: Text? = nil) {
        self.title = title
        self.systemImage = systemImage
        self.description = description
    }

    public var body: some View {
        if #available(iOS 17.0, *) {
            ContentUnavailableView(title, systemImage: systemImage, description: description)
        } else {
            legacyBody
        }
    }

    private var legacyBody: some View {
        VStack(spacing: 10) {
            Image(systemName: systemImage)
                .font(MeeshyFont.relative(52))
                .foregroundStyle(.secondary)

            Text(title)
                .font(.title3.weight(.semibold))
                .multilineTextAlignment(.center)

            if let description {
                description
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .accessibilityElement(children: .combine)
    }
}
