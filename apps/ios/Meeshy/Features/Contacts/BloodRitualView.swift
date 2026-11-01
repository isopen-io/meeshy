import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le rituel du Sang (#13938) : des consentements explicites d'abord, puis les DEUX tiennent l'écran en même temps ;
/// l'anneau pulse tant qu'on attend l'autre, se remplit quand les deux sont synchronisés, et le scellement part tout
/// seul. Lâcher est calme : rien n'est enregistré.
struct BloodRitualView: View {
    @StateObject private var viewModel: BloodRitualViewModel
    let onFinished: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false
    private var theme: ThemeManager { ThemeManager.shared }

    init(target: CircleRitualTarget, onFinished: @escaping () -> Void) {
        _viewModel = StateObject(wrappedValue: BloodRitualViewModel(userId: target.userId, displayName: target.name))
        self.onFinished = onFinished
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: MeeshySpacing.xl) {
                content
                Spacer(minLength: 0)
            }
            .padding(MeeshySpacing.xl)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(theme.backgroundPrimary.ignoresSafeArea())
            .navigationTitle(String(localized: "circles.ritual.title", defaultValue: "Le rituel du Sang", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "circles.sheet.close", defaultValue: "Fermer", bundle: .main)) { finish() }
                }
            }
        }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }

    private func finish() {
        onFinished()
        dismiss()
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.stage {
        case .consent: consentStep
        case .ready, .opening: readyStep
        case .waiting, .synchronised, .awaitingOther: holdStep
        case .completed: outcome(icon: "drop.fill", tint: MeeshyColors.error, text: named(String(localized: "circles.ritual.completed", defaultValue: "Sang scellé avec %@", bundle: .main)), retry: false)
        case .lapsed: outcome(icon: "hand.raised.fill", tint: theme.textMuted, text: String(localized: "circles.ritual.lapsed", defaultValue: "L'autre a lâché. Rien n'est enregistré, rien n'a changé.", bundle: .main), retry: true)
        case .unavailable: outcome(icon: "nosign", tint: theme.textMuted, text: unavailableText, retry: false)
        }
    }

    // MARK: - Consentements

    private var consentStep: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            Text(named(String(localized: "circles.ritual.consent.intro", defaultValue: "Avant de sceller, choisis ce que tu partages avec %@. Chaque partage est refusable, et tu pourras y revenir.", bundle: .main)))
                .font(.subheadline)
                .foregroundStyle(theme.textSecondary)
            ForEach(RelationRitualConsentKey.allCases, id: \.self) { key in
                consentRow(key)
            }
            Button {
                viewModel.proceedFromConsents()
            } label: {
                Text(String(localized: "circles.ritual.consent.continue", defaultValue: "Continuer", bundle: .main))
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
            }
            .buttonStyle(.borderedProminent)
            .tint(MeeshyColors.indigo500)
        }
    }

    private func consentRow(_ key: RelationRitualConsentKey) -> some View {
        let binding = Binding<Bool>(
            get: { viewModel.consents.isGranted(key) },
            set: { viewModel.setConsent(key, to: $0) }
        )
        return VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            Toggle(consentTitle(key), isOn: binding)
                .frame(minHeight: MeeshyControlSize.tapTarget)
            Text(consentDetail(key))
                .font(.footnote)
                .foregroundStyle(theme.textMuted)
        }
        .accessibilityElement(children: .combine)
    }

    private func consentTitle(_ key: RelationRitualConsentKey) -> String {
        switch key {
        case .listeningTitle: return String(localized: "circles.ritual.consent.listeningTitle", defaultValue: "Titre de ce que j'écoute", bundle: .main)
        case .locationLive: return String(localized: "circles.ritual.consent.locationLive", defaultValue: "Ma position en direct", bundle: .main)
        case .locationHistory: return String(localized: "circles.ritual.consent.locationHistory", defaultValue: "L'historique de ma position (30 jours)", bundle: .main)
        case .locationProximity: return String(localized: "circles.ritual.consent.locationProximity", defaultValue: "L'alerte de proximité", bundle: .main)
        }
    }

    private func consentDetail(_ key: RelationRitualConsentKey) -> String {
        switch key {
        case .listeningTitle: return String(localized: "circles.ritual.consent.listeningTitle.detail", defaultValue: "Il voit le titre et la source, en direct, tant que le partage est actif.", bundle: .main)
        case .locationLive: return String(localized: "circles.ritual.consent.locationLive.detail", defaultValue: "Il voit où je suis, en continu, tant que le partage est actif.", bundle: .main)
        case .locationHistory: return String(localized: "circles.ritual.consent.locationHistory.detail", defaultValue: "Il peut revoir mes déplacements des 30 derniers jours ; je peux les effacer quand je veux.", bundle: .main)
        case .locationProximity: return String(localized: "circles.ritual.consent.locationProximity.detail", defaultValue: "Nous sommes prévenus tous les deux, au plus une fois toutes les 2 heures, quand nous sommes proches.", bundle: .main)
        }
    }

    // MARK: - Ouvrir

    private var readyStep: some View {
        VStack(spacing: MeeshySpacing.lg) {
            if viewModel.otherIsWaiting {
                Text(named(String(localized: "circles.ritual.otherWaiting", defaultValue: "%@ t'attend", bundle: .main)))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(theme.textPrimary)
            }
            Button {
                Task { await viewModel.open() }
            } label: {
                Text(String(localized: "circles.requests.ritual", defaultValue: "Ouvrir le rituel", bundle: .main))
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
            }
            .buttonStyle(.borderedProminent)
            .tint(MeeshyColors.error)
            .disabled(viewModel.stage == .opening)
        }
    }

    // MARK: - Tenir l'écran

    private var holdStep: some View {
        VStack(spacing: MeeshySpacing.xl) {
            ring
            Text(holdCaption)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.textPrimary)
                .multilineTextAlignment(.center)
            if viewModel.stage == .waiting {
                Text(String(localized: "circles.ritual.hold.hint", defaultValue: "Vous devez tous les deux maintenir l'écran en même temps.", bundle: .main))
                    .font(.footnote)
                    .foregroundStyle(theme.textMuted)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private var holdCaption: String {
        switch viewModel.stage {
        case .synchronised: return String(localized: "circles.ritual.synchronised", defaultValue: "Synchronisés", bundle: .main)
        case .awaitingOther: return named(String(localized: "circles.ritual.awaiting", defaultValue: "Tu as confirmé. En attente de %@…", bundle: .main))
        default: return viewModel.isHolding
                ? named(String(localized: "circles.ritual.waiting.other", defaultValue: "En attente de %@…", bundle: .main))
                : String(localized: "circles.ritual.hold", defaultValue: "Maintiens pour sceller", bundle: .main)
        }
    }

    /// L'anneau : il pulse tant qu'on attend l'autre, se remplit quand les deux tiennent. Sans animation si le
    /// mouvement réduit est demandé.
    private var ring: some View {
        let synchronised = viewModel.stage == .synchronised || viewModel.stage == .awaitingOther
        return ZStack {
            Circle()
                .stroke(MeeshyColors.error.opacity(MeeshyOpacity.light), lineWidth: 8)
            Circle()
                .trim(from: 0, to: synchronised ? 1 : (viewModel.otherIsHolding ? 0.5 : 0.15))
                .stroke(MeeshyColors.error, style: StrokeStyle(lineWidth: 8, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Image(systemName: "drop.fill")
                .font(.largeTitle)
                .foregroundStyle(MeeshyColors.error)
        }
        .frame(width: 180, height: 180)
        .scaleEffect(viewModel.isHolding ? 1.0 : (pulse && !reduceMotion ? 1.06 : 1.0))
        .animation(reduceMotion ? nil : .easeInOut(duration: 1).repeatForever(autoreverses: true), value: pulse)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.35), value: synchronised)
        .onAppear { pulse = true }
        .contentShape(Circle())
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in Task { await viewModel.holdBegan() } }
                .onEnded { _ in viewModel.holdEnded() }
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "circles.ritual.hold", defaultValue: "Maintiens pour sceller", bundle: .main))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: String(localized: "circles.ritual.a11y.hold", defaultValue: "Tenir l'écran", bundle: .main)) {
            Task { await viewModel.holdBegan() }
        }
        .accessibilityAction(named: String(localized: "circles.ritual.a11y.release", defaultValue: "Lâcher", bundle: .main)) {
            viewModel.holdEnded()
        }
    }

    // MARK: - Issues

    private func outcome(icon: String, tint: Color, text: String, retry: Bool) -> some View {
        VStack(spacing: MeeshySpacing.lg) {
            Image(systemName: icon)
                .font(.largeTitle)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            Text(text)
                .font(.body)
                .foregroundStyle(theme.textPrimary)
                .multilineTextAlignment(.center)
            if retry {
                Button(String(localized: "circles.ritual.retry", defaultValue: "Recommencer", bundle: .main)) { viewModel.retry() }
                    .buttonStyle(.borderedProminent)
                    .tint(MeeshyColors.indigo500)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
            } else {
                Button(String(localized: "circles.sheet.close", defaultValue: "Fermer", bundle: .main)) { finish() }
                    .frame(minHeight: MeeshyControlSize.tapTarget)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var unavailableText: String {
        viewModel.isOfflineUnavailable
            ? String(localized: "circles.ritual.unavailable.offline", defaultValue: "Le rituel est indisponible hors ligne.", bundle: .main)
            : String(localized: "circles.ritual.unavailable.generic", defaultValue: "Le rituel n'est plus possible : la demande n'est plus en attente ou le lien a changé.", bundle: .main)
    }

    private func named(_ template: String) -> String {
        String(format: template, viewModel.displayName)
    }
}
