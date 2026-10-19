import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - ConversationDashboardProfilesSection

struct ConversationDashboardProfilesSection: View {
    let profiles: [ParticipantProfile]
    let accent: Color

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ConversationDashboardSectionCard(accent: accent) {
            ConversationDashboardSectionHeader(icon: "brain.fill", title: String(localized: "dashboard.section.participant-profiles", defaultValue: "Profils des participants", bundle: .main), accent: accent)

            ForEach(profiles) { profile in
                VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
                    HStack(spacing: MeeshySpacing.sm) {
                        Circle()
                            .fill(Color(hex: DynamicColorGenerator.colorForName(profile.displayName ?? profile.username ?? profile.userId)))
                            .frame(width: 10, height: 10)

                        Text(profile.displayName ?? profile.username ?? "?")
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold))
                            .foregroundColor(theme.textPrimary)

                        Spacer()

                        if profile.confidence > 0 {
                            Text("\(Int(profile.confidence * 100))%")
                                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold, design: .rounded))
                                .foregroundColor(theme.textMuted)
                                .padding(.horizontal, MeeshySpacing.sm)
                                .padding(.vertical, MeeshySpacing.xxs)
                                .background(
                                    Capsule().fill(accent.opacity(MeeshyOpacity.subtle))
                                )
                        }
                    }

                    if !profile.personaSummary.isEmpty {
                        Text(profile.personaSummary)
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular, design: .serif))
                            .italic()
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(3)
                    }

                    HStack(spacing: MeeshySpacing.sm) {
                        if !profile.tone.isEmpty {
                            profileTag(icon: "waveform.path", text: profile.tone)
                        }
                        if !profile.vocabularyLevel.isEmpty {
                            profileTag(icon: "textformat.size", text: profile.vocabularyLevel)
                        }
                    }

                    if let traits = profile.traits {
                        traitBarsView(traits)
                    }

                    if !profile.catchphrases.isEmpty {
                        HStack(alignment: .top, spacing: MeeshySpacing.xsPlus) {
                            Image(systemName: "quote.opening")
                                .font(MeeshyFont.relative(9))
                                .foregroundColor(accent.opacity(MeeshyOpacity.strong))
                                .offset(y: 2)
                            Text(profile.catchphrases.prefix(3).joined(separator: " \u{00B7} "))
                                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium, design: .serif))
                                .italic()
                                .foregroundColor(theme.textMuted)
                                .lineLimit(2)
                        }
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .padding(.vertical, MeeshySpacing.xsPlus)
                        .background(
                            RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                                .fill(accent.opacity(isDark ? 0.04 : 0.02))
                        )
                    }

                    if !profile.topicsOfExpertise.isEmpty || !profile.commonEmojis.isEmpty {
                        HStack(spacing: MeeshySpacing.sm) {
                            ForEach(profile.topicsOfExpertise.prefix(3), id: \.self) { topic in
                                Text(topic)
                                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                                    .foregroundColor(theme.textMuted)
                                    .padding(.horizontal, MeeshySpacing.xsPlus)
                                    .padding(.vertical, MeeshySpacing.xxs)
                                    .background(
                                        Capsule().fill(theme.textMuted.opacity(MeeshyOpacity.subtle))
                                    )
                            }
                            if !profile.commonEmojis.isEmpty {
                                Text(profile.commonEmojis.prefix(6).joined(separator: ""))
                                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                            }
                        }
                    }
                }
                .padding(MeeshySpacing.md)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .fill(isDark ? Color.white.opacity(0.02) : Color.black.opacity(0.01))
                )
                .overlay(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(hex: DynamicColorGenerator.colorForName(profile.displayName ?? profile.username ?? profile.userId)))
                        .frame(width: 4)
                        .padding(.vertical, MeeshySpacing.xsPlus)
                }
            }
        }
    }

    private func profileTag(icon: String, text: String) -> some View {
        HStack(spacing: MeeshySpacing.xxs) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(9, weight: .semibold))
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
        }
        .foregroundColor(theme.textSecondary)
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, MeeshySpacing.xs)
        .background(
            Capsule().fill(accent.opacity(isDark ? 0.08 : 0.05))
        )
    }

    // MARK: - Trait Bars

    private func traitBarsView(_ traits: ParticipantTraits) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if let comm = traits.communication {
                let scores = extractTraitScores(from: comm)
                if !scores.isEmpty {
                    traitBarCategory(String(localized: "dashboard.trait.communication", defaultValue: "Communication", bundle: .main), traits: scores)
                }
            }
            if let pers = traits.personality {
                let scores = extractTraitScores(from: pers)
                if !scores.isEmpty {
                    traitBarCategory(String(localized: "dashboard.trait.personality", defaultValue: "Personnalité", bundle: .main), traits: scores)
                }
            }
            if let inter = traits.interpersonal {
                let scores = extractTraitScores(from: inter)
                if !scores.isEmpty {
                    traitBarCategory(String(localized: "dashboard.trait.interpersonal", defaultValue: "Interpersonnel", bundle: .main), traits: scores)
                }
            }
            if let emot = traits.emotional {
                let scores = extractTraitScores(from: emot)
                if !scores.isEmpty {
                    traitBarCategory(String(localized: "dashboard.trait.emotional", defaultValue: "Émotionnel", bundle: .main), traits: scores)
                }
            }
        }
    }

    private func traitBarCategory(_ category: String, traits: [TraitScore]) -> some View {
        let sorted = traits.sorted { $0.score > $1.score }
        return VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(category.uppercased())
                .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .bold))
                .foregroundColor(theme.textMuted)
                .tracking(0.8)

            ForEach(sorted.prefix(4), id: \.label) { trait in
                HStack(spacing: MeeshySpacing.sm) {
                    Text(trait.label)
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                        .frame(width: 80, alignment: .leading)
                        .lineLimit(1)

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(accent.opacity(MeeshyOpacity.subtle))
                                .frame(height: 4)

                            RoundedRectangle(cornerRadius: 2)
                                .fill(accent.opacity(MeeshyOpacity.heavy))
                                .frame(
                                    width: geo.size.width * CGFloat(trait.score) / 100.0,
                                    height: 4
                                )
                        }
                    }
                    .frame(height: 4)

                    Text("\(trait.score)")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold, design: .rounded))
                        .foregroundColor(traitScoreColor(trait.score))
                        .frame(width: 24, alignment: .trailing)
                }
            }
        }
    }

    private func extractTraitScores<T: Codable>(from traits: T) -> [TraitScore] {
        let mirror = Mirror(reflecting: traits)
        return mirror.children.compactMap { child -> TraitScore? in
            guard let score = child.value as? TraitScore? else { return nil }
            return score
        }
    }

    private func traitScoreColor(_ score: Int) -> Color {
        if score >= 70 { return MeeshyColors.success }
        if score >= 40 { return accent }
        return theme.textMuted
    }
}
