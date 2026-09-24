import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les cinq cartes et le récapitulatif. Chacune lit le modèle et ne décide de
/// rien : ce qu'elle propose, ce qu'elle a produit et ce qui vient ensuite sont
/// tranchés par `OnboardingViewModel`.
struct OnboardingCardView: View {
    @ObservedObject var model: OnboardingViewModel
    let isDark: Bool
    let onOpenStory: () -> Void
    let onExplore: () -> Void

    var body: some View {
        switch model.card {
        case .step(.languages): languages
        case .step(.global): global
        case .step(.story): story
        case .step(.friends): friends
        case .step(.notifications): notifications
        case .recap: recap
        case .none: EmptyView()
        }
    }

    private var later: OnboardingAction {
        OnboardingAction(title: String(localized: "onboarding.later", bundle: .main),
                         identifier: "onboarding.later") { Task { await model.later() } }
    }

    private var proceed: OnboardingAction {
        OnboardingAction(title: String(localized: "onboarding.continue", bundle: .main),
                         identifier: "onboarding.continue") { Task { await model.advance() } }
    }


    // MARK: 1 — langues

    private var languages: some View {
        OnboardingCardLayout(
            title: String(localized: "onboarding.languages.title", bundle: .main),
            message: String(localized: "onboarding.languages.body", bundle: .main),
            isDark: isDark,
            primary: OnboardingAction(title: String(localized: "onboarding.languages.confirm", bundle: .main),
                                      identifier: "onboarding.languages.confirm") {
                Task { await model.confirmLanguages() }
            },
            secondary: later,
            illustration: { OnboardingPrismIllustration(isDark: isDark) },
            content: {
                VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                    primaryLanguagePicker
                    secondaryLanguageChips
                    OnboardingLevelGauge(points: model.sessionPoints, threshold: OnboardingRewards.firstLevel, isDark: isDark)
                }
            }
        )
    }

    private var primaryLanguagePicker: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionLabel(String(localized: "onboarding.languages.primary", bundle: .main))
            Menu {
                ForEach(LanguageData.allLanguagesCommonFirst, id: \.code) { language in
                    Button {
                        model.selectPrimaryLanguage(language.code)
                    } label: {
                        Text(verbatim: "\(LanguageFlagChip.flag(for: language.code))  \(language.nativeName)")
                    }
                }
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    Text(verbatim: LanguageFlagChip.flag(for: model.primaryLanguage))
                        .font(MeeshyFont.relative(MeeshyFont.titleSize))
                    Text(LanguageFlagChip.spokenName(for: model.primaryLanguage))
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold, design: .rounded))
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                    Spacer(minLength: MeeshySpacing.sm)
                    Text(String(localized: "onboarding.languages.change", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundStyle(MeeshyColors.indigo500)
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(minHeight: 54)
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(isDark ? Color.white.opacity(0.07) : Color.white))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(MeeshyColors.indigo300.opacity(0.6), lineWidth: 1.5))
            }
            .accessibilityIdentifier("onboarding.languages.primary")
            .accessibilityLabel(String.localizedStringWithFormat(
                String(localized: "onboarding.languages.primary.a11y", bundle: .main),
                LanguageFlagChip.spokenName(for: model.primaryLanguage)))
        }
    }

    private var secondaryLanguageChips: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionLabel(String(localized: "onboarding.languages.secondary", bundle: .main))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.sm) {
                    ForEach(LanguageData.quickTranslationCodes.filter { $0 != model.primaryLanguage }, id: \.self) { code in
                        OnboardingChip(
                            title: "\(LanguageFlagChip.flag(for: code)) \(LanguageFlagChip.spokenName(for: code))",
                            isSelected: model.secondaryLanguage == code,
                            isDark: isDark
                        ) { model.toggleSecondaryLanguage(code) }
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    // MARK: 2 — salut dans Meeshy Global

    private var global: some View {
        let sent = model.greetingState == .sent
        return OnboardingCardLayout(
            title: String(localized: "onboarding.global.title", bundle: .main),
            message: String(localized: "onboarding.global.body", bundle: .main),
            isDark: isDark,
            primary: sent ? proceed : OnboardingAction(
                title: model.greetingState == .failed
                    ? String(localized: "onboarding.global.retry", bundle: .main)
                    : String(localized: "onboarding.global.send", bundle: .main),
                identifier: "onboarding.global.send",
                isEnabled: !model.greetingDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                isBusy: model.greetingState == .sending
            ) { Task { await model.sendGreeting() } },
            secondary: sent ? nil : later,
            illustration: { OnboardingGlobalIllustration(isDark: isDark) },
            content: {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    if sent {
                        outcomeBanner(
                            text: String(localized: "onboarding.global.sent", bundle: .main),
                            reward: String.localizedStringWithFormat(String(localized: "onboarding.global.reward", bundle: .main), OnboardingRewards.greeting)
                        )
                    } else {
                        greetingEditor
                        if model.greetingState == .failed {
                            Text(String(localized: "onboarding.global.failed", bundle: .main))
                                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                                .foregroundStyle(MeeshyColors.error)
                        }
                    }
                    OnboardingLevelGauge(points: model.sessionPoints, threshold: OnboardingRewards.firstLevel, isDark: isDark)
                }
            }
        )
    }

    private var greetingEditor: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            TextField(String(localized: "onboarding.global.placeholder", bundle: .main), text: $model.greetingDraft, axis: .vertical)
                .lineLimit(2...5)
                .font(MeeshyFont.relative(MeeshyFont.bodySize + 1))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .padding(MeeshySpacing.md)
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(isDark ? Color.white.opacity(0.07) : Color.white))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(MeeshyColors.indigo300.opacity(0.6), lineWidth: 1.5))
                .accessibilityLabel(String(localized: "onboarding.global.editor.a11y", bundle: .main))
                .accessibilityIdentifier("onboarding.global.editor")
            Label(String(localized: "onboarding.global.hint", bundle: .main), systemImage: "pencil")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
        }
    }

    // MARK: 3 — première story

    private var story: some View {
        let published = model.storyPublished
        return OnboardingCardLayout(
            title: String(localized: "onboarding.story.title", bundle: .main),
            message: String(localized: "onboarding.story.body", bundle: .main),
            isDark: isDark,
            primary: published ? proceed : OnboardingAction(
                title: String(localized: "onboarding.story.create", bundle: .main),
                identifier: "onboarding.story.create", perform: onOpenStory
            ),
            secondary: published ? nil : later,
            illustration: { OnboardingStoryIllustration(name: model.userDisplayName, isDark: isDark) },
            content: {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    if published {
                        outcomeBanner(
                            text: String(localized: "onboarding.story.published", bundle: .main),
                            reward: String.localizedStringWithFormat(String(localized: "onboarding.story.reward", bundle: .main), OnboardingRewards.story)
                        )
                    } else {
                        Label(
                            model.storyDefaultVisibility == .friends
                                ? String(localized: "onboarding.story.audience.friends", bundle: .main)
                                : String(localized: "onboarding.story.audience.public", bundle: .main),
                            systemImage: model.storyDefaultVisibility == .friends ? "person.2.fill" : "globe"
                        )
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                        .frame(maxWidth: .infinity)
                    }
                    OnboardingLevelGauge(points: model.sessionPoints, threshold: OnboardingRewards.firstLevel, isDark: isDark)
                }
            }
        )
    }

    // MARK: 4 — trouve ta bande

    private var friends: some View {
        OnboardingCardLayout(
            title: String(localized: "onboarding.friends.title", bundle: .main),
            message: String.localizedStringWithFormat(String(localized: "onboarding.friends.body", bundle: .main), OnboardingRewards.friendship),
            isDark: isDark,
            primary: OnboardingAction(
                title: String(localized: "onboarding.continue", bundle: .main),
                identifier: "onboarding.friends.continue",
                isEnabled: !model.requestedProfileIds.isEmpty
            ) { Task { await model.continueFromFriends() } },
            secondary: model.requestedProfileIds.isEmpty
                ? OnboardingAction(title: String(localized: "onboarding.later", bundle: .main),
                                   identifier: "onboarding.later") { Task { await model.continueFromFriends() } }
                : nil,
            illustration: { OnboardingFriendsIllustration(names: model.suggestions.map(\.displayName), isDark: isDark) },
            content: {
                VStack(spacing: MeeshySpacing.sm) {
                    ForEach(model.suggestions) { suggestion in
                        OnboardingSuggestionRow(
                            suggestion: suggestion,
                            isRequested: model.requestedProfileIds.contains(suggestion.id),
                            didFail: model.failedProfileId == suggestion.id,
                            isDark: isDark
                        ) { Task { await model.addFriend(id: suggestion.id) } }
                    }
                    Label(String.localizedStringWithFormat(String(localized: "onboarding.friends.pending", bundle: .main), OnboardingRewards.friendship),
                          systemImage: "hourglass")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                        .padding(.top, MeeshySpacing.xs)
                }
            }
        )
    }

    // MARK: 5 — notifications

    private var notifications: some View {
        OnboardingCardLayout(
            title: String(localized: "onboarding.notifications.title", bundle: .main),
            message: String(localized: "onboarding.notifications.body", bundle: .main),
            isDark: isDark,
            primary: OnboardingAction(title: String(localized: "onboarding.notifications.yes", bundle: .main),
                                      identifier: "onboarding.notifications.yes") {
                Task { await model.acceptNotifications() }
            },
            secondary: OnboardingAction(title: String(localized: "onboarding.notifications.no", bundle: .main),
                                        identifier: "onboarding.notifications.no") {
                Task { await model.later() }
            },
            illustration: { OnboardingNotificationIllustration(isDark: isDark) },
            content: { EmptyView() }
        )
    }

    // MARK: Récapitulatif

    private var recap: some View {
        OnboardingCardLayout(
            title: String(localized: "onboarding.recap.title", bundle: .main),
            message: recapMessage,
            isDark: isDark,
            primary: OnboardingAction(title: String(localized: "onboarding.recap.explore", bundle: .main),
                                      identifier: "onboarding.recap.explore", perform: onExplore),
            secondary: OnboardingAction(title: String(localized: "onboarding.recap.done", bundle: .main),
                                        identifier: "onboarding.recap.done") {
                Task { await model.finish() }
            },
            illustration: { OnboardingTrophyIllustration() },
            content: {
                if let recap = model.recap {
                    OnboardingRecapStats(recap: recap, isDark: isDark)
                } else {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 80)
                }
            }
        )
    }

    private var recapMessage: String {
        guard let recap = model.recap, recap.points > 0 else {
            return String(localized: "onboarding.recap.empty", bundle: .main)
        }
        guard let streak = recap.streakDays, streak > 0 else {
            return String(localized: "onboarding.recap.body", bundle: .main)
        }
        return String.localizedStringWithFormat(String(localized: "onboarding.recap.tomorrow", bundle: .main), streak + 1)
    }

    // MARK: Pièces communes

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
    }

    private func outcomeBanner(text: String, reward: String) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "checkmark.circle.fill")
                .font(MeeshyFont.relative(MeeshyFont.titleSize))
                .foregroundStyle(MeeshyColors.success)
            VStack(alignment: .leading, spacing: 2) {
                Text(text)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                    .fixedSize(horizontal: false, vertical: true)
                Text(reward)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold, design: .rounded))
                    .foregroundStyle(MeeshyColors.indigo500)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(MeeshyColors.success.opacity(0.12)))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Une suggestion de profil

struct OnboardingSuggestionRow: View {
    let suggestion: APIOnboardingSuggestion
    let isRequested: Bool
    let didFail: Bool
    let isDark: Bool
    let onAdd: () -> Void

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(name: suggestion.displayName, context: .postAuthor, avatarURL: suggestion.avatarUrl, isDark: isDark)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(suggestion.displayName)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                    .lineLimit(1)
                HStack(spacing: 4) {
                    Text(verbatim: "@\(suggestion.username)")
                    Text(verbatim: suggestion.languages.map(LanguageFlagChip.flag(for:)).joined(separator: " "))
                }
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                .foregroundStyle(didFail ? MeeshyColors.error : MeeshyColors.textMuted(isDark: isDark))
                .lineLimit(1)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilitySummary)
            Spacer(minLength: MeeshySpacing.sm)
            Button(action: onAdd) {
                Label(
                    isRequested
                        ? String(localized: "onboarding.friends.added", bundle: .main)
                        : String(localized: "onboarding.friends.add", bundle: .main),
                    systemImage: isRequested ? "checkmark" : "person.badge.plus"
                )
                .labelStyle(.titleAndIcon)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold, design: .rounded))
                .foregroundStyle(isRequested ? MeeshyColors.success : Color.white)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(minHeight: 44)
                .background(Capsule().fill(isRequested
                                           ? AnyShapeStyle(MeeshyColors.success.opacity(0.14))
                                           : AnyShapeStyle(MeeshyColors.brandGradient)))
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(isRequested)
            .accessibilityLabel(String.localizedStringWithFormat(
                isRequested
                    ? String(localized: "onboarding.friends.added.a11y", bundle: .main)
                    : String(localized: "onboarding.friends.add.a11y", bundle: .main),
                suggestion.displayName))
            .accessibilityIdentifier("onboarding.friends.add.\(suggestion.id)")
        }
        .padding(MeeshySpacing.sm)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous)
            .fill(isDark ? Color.white.opacity(0.05) : Color.white.opacity(0.8)))
    }

    private var accessibilitySummary: String {
        let names = suggestion.languages.map(LanguageFlagChip.spokenName(for:))
        let languages = ListFormatter.localizedString(byJoining: names)
        let base = String.localizedStringWithFormat(String(localized: "onboarding.friends.row.a11y", bundle: .main),
                                                    suggestion.displayName, languages)
        return didFail ? base + ". " + String(localized: "onboarding.friends.failed", bundle: .main) : base
    }
}

// MARK: - Les chiffres du récapitulatif

struct OnboardingRecapStats: View {
    let recap: OnboardingRecap
    let isDark: Bool

    var body: some View {
        let tiles: [(icon: String, value: String, label: String)] = [
            ("sparkles", OnboardingGreeting.localizedNumber(recap.points), String(localized: "onboarding.recap.points", bundle: .main)),
            ("star.circle.fill", OnboardingGreeting.localizedNumber(recap.level), String(localized: "onboarding.recap.level", bundle: .main)),
        ] + (recap.streakDays.map { [("flame.fill", OnboardingGreeting.localizedNumber($0), String(localized: "onboarding.recap.streak", bundle: .main))] } ?? [])
          + (recap.badges.map { [("rosette", OnboardingGreeting.localizedNumber($0), String(localized: "onboarding.recap.badges", bundle: .main))] } ?? [])

        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: MeeshySpacing.sm)], spacing: MeeshySpacing.sm) {
            ForEach(Array(tiles.enumerated()), id: \.offset) { _, tile in
                VStack(spacing: 4) {
                    Image(systemName: tile.icon)
                        .foregroundStyle(tile.icon == "flame.fill" ? AnyShapeStyle(MeeshyColors.warning) : AnyShapeStyle(MeeshyColors.brandGradient))
                        .font(MeeshyFont.relative(MeeshyFont.titleSize))
                    Text(verbatim: tile.value)
                        .font(MeeshyFont.relative(MeeshyFont.titleSize + 4, weight: .heavy, design: .rounded))
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                        .monospacedDigit()
                    Text(tile.label)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, minHeight: 96)
                .padding(.vertical, MeeshySpacing.sm)
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(isDark ? Color.white.opacity(0.06) : MeeshyColors.indigo50))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(verbatim: "\(tile.label) \(tile.value)"))
            }
        }
    }
}
