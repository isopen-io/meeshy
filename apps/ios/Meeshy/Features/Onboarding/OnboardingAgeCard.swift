import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Carte « âge » (#9929)

/// La carte « âge » lit le modèle et ne décide de rien. Elle recueille une
/// date — la passerelle en déduit ce qui s'ouvre — et se passe d'un geste :
/// un âge inconnu ne restreint rien. Sous 13 ans, elle devient l'écran de
/// refus, dont la seule sortie ferme la session.
struct OnboardingAgeCard: View {
    @ObservedObject var model: OnboardingViewModel
    let isDark: Bool

    var body: some View {
        if model.ageState == .refused {
            refusal
        } else {
            question
        }
    }

    // MARK: La question

    private var question: some View {
        OnboardingCardLayout(
            title: String(localized: "onboarding.age.title", bundle: .main),
            message: String(localized: "onboarding.age.body", bundle: .main),
            isDark: isDark,
            primary: OnboardingAction(
                title: String(localized: "onboarding.age.confirm", bundle: .main),
                identifier: "onboarding.age.confirm",
                isEnabled: model.ageDatePicked,
                isBusy: model.ageState == .sending
            ) {
                Task { await model.declareBirthDate() }
            },
            secondary: OnboardingAction(
                title: String(localized: "onboarding.age.skip", bundle: .main),
                identifier: "onboarding.age.skip"
            ) {
                Task { await model.later() }
            },
            illustration: { OnboardingAgeIllustration(symbol: "birthday.cake.fill") },
            content: {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    picker
                    if let notice {
                        Label(notice, systemImage: "exclamationmark.circle.fill")
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                            .foregroundStyle(MeeshyColors.error)
                            .accessibilityElement(children: .combine)
                    }
                }
            }
        )
    }

    /// La roue suit la taille de texte et se lit au VoiceOver comme un réglage
    /// à trois colonnes (jour, mois, année) : aucun champ libre à taper.
    private var picker: some View {
        DatePicker(
            String(localized: "onboarding.age.picker", bundle: .main),
            selection: Binding(get: { model.ageBirthDate }, set: { model.pickBirthDate($0) }),
            in: OnboardingAgeRules.range(now: Date()),
            displayedComponents: .date
        )
        .datePickerStyle(.wheel)
        .labelsHidden()
        .frame(maxWidth: .infinity)
        .tint(MeeshyColors.indigo500)
        .accessibilityLabel(String(localized: "onboarding.age.picker", bundle: .main))
        .accessibilityHint(String(localized: "onboarding.age.picker.hint", bundle: .main))
        .accessibilityIdentifier("onboarding.age.picker")
    }

    private var notice: String? {
        switch model.ageState {
        case .invalid: return String(localized: "onboarding.age.invalid", bundle: .main)
        case .failed: return String(localized: "onboarding.age.failed", bundle: .main)
        case .idle, .sending, .refused: return nil
        }
    }

    // MARK: Le refus (moins de 13 ans)

    private var refusal: some View {
        OnboardingCardLayout(
            title: String(localized: "onboarding.age.refused.title", bundle: .main),
            message: String(localized: "onboarding.age.refused.body", bundle: .main),
            isDark: isDark,
            primary: OnboardingAction(
                title: String(localized: "onboarding.age.refused.signOut", bundle: .main),
                identifier: "onboarding.age.refused.signOut"
            ) {
                Task { await model.acknowledgeAgeRefusal() }
            },
            secondary: nil,
            illustration: { OnboardingAgeIllustration(symbol: "hand.raised.fill") },
            content: { EmptyView() }
        )
    }
}

/// Un symbole au dégradé de la marque, comme l'enveloppe de la carte courriel.
private struct OnboardingAgeIllustration: View {
    let symbol: String

    @ScaledMetric(relativeTo: .largeTitle) private var size: CGFloat = 72

    var body: some View {
        Image(systemName: symbol)
            .resizable()
            .scaledToFit()
            .frame(width: min(size, 110), height: min(size, 110))
            .foregroundStyle(MeeshyColors.brandGradient)
            .accessibilityHidden(true)
    }
}
