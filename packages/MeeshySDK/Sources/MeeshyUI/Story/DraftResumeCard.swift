import SwiftUI

/// U4 — carte de reprise d'un brouillon de story : cover composite,
/// métadonnées (slides, fraîcheur) et actions Reprendre / Recommencer.
///
/// Building block PUR (SDK purity) : paramètres opaques, aucune décision
/// produit — le composer app-side décide QUAND la présenter et fournit le
/// cover (rendu composite) et les callbacks. `cover == nil` dégrade en
/// carte sans image (le brouillon reste repérable et actionnable).
public struct DraftResumeCard: View {
    let cover: UIImage?
    let slideCount: Int
    let updatedAt: Date?
    let onResume: () -> Void
    let onDiscard: () -> Void

    public init(cover: UIImage?,
                slideCount: Int,
                updatedAt: Date?,
                onResume: @escaping () -> Void,
                onDiscard: @escaping () -> Void) {
        self.cover = cover
        self.slideCount = slideCount
        self.updatedAt = updatedAt
        self.onResume = onResume
        self.onDiscard = onDiscard
    }

    /// Libellé de fraîcheur PUR (testable) : « à l'instant », « il y a Xmin »,
    /// « il y a Xh », « il y a Xj ». `nil` quand la date est inconnue.
    public static func freshnessLabel(from updatedAt: Date?, now: Date = Date()) -> String? {
        guard let updatedAt else { return nil }
        let seconds = max(0, Int(now.timeIntervalSince(updatedAt)))
        if seconds < 60 {
            return String(localized: "story.draft.freshness.now",
                          defaultValue: "modifié à l'instant", bundle: .module)
        }
        if seconds < 3600 {
            return String(localized: "story.draft.freshness.minutes",
                          defaultValue: "modifié il y a \(seconds / 60) min", bundle: .module)
        }
        if seconds < 86_400 {
            return String(localized: "story.draft.freshness.hours",
                          defaultValue: "modifié il y a \(seconds / 3600) h", bundle: .module)
        }
        return String(localized: "story.draft.freshness.days",
                      defaultValue: "modifié il y a \(seconds / 86_400) j", bundle: .module)
    }

    public var body: some View {
        VStack(spacing: 14) {
            if let cover {
                Image(uiImage: cover)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 108, height: 192)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(MeeshyColors.indigo400.opacity(0.6), lineWidth: 1)
                    )
                    .accessibilityHidden(true)
            }

            VStack(spacing: 4) {
                Text(String(localized: "story.draft.resume.title",
                            defaultValue: "Reprendre votre story ?", bundle: .module))
                    .font(.headline)
                    .foregroundStyle(.white)
                HStack(spacing: 6) {
                    Text(String(localized: "story.draft.resume.slides",
                                defaultValue: "\(slideCount) slide(s)", bundle: .module))
                    if let freshness = Self.freshnessLabel(from: updatedAt) {
                        Text("·").accessibilityHidden(true)
                        Text(freshness)
                    }
                }
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))
            }

            HStack(spacing: 10) {
                Button(action: onDiscard) {
                    Text(String(localized: "story.draft.resume.discard",
                                defaultValue: "Recommencer", bundle: .module))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white.opacity(0.85))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                        .background(Capsule().stroke(Color.white.opacity(0.35), lineWidth: 1))
                }
                Button(action: onResume) {
                    Text(String(localized: "story.draft.resume.resume",
                                defaultValue: "Reprendre", bundle: .module))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 10)
                        .background(Capsule().fill(MeeshyColors.brandGradient))
                }
            }
        }
        .padding(20)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.draft.resume.a11y",
                                   defaultValue: "Brouillon de story, \(slideCount) slide(s)",
                                   bundle: .module))
    }
}
