import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct DeleteAccountView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var confirmationText = ""
    /// Le mot de passe COURANT. Sans lui, un jeton volé ouvrait la suppression
    /// du compte : la route l'exige désormais (#4183).
    @State private var currentPassword = ""
    @State private var showFinalAlert = false
    @State private var isDeleting = false
    @State private var errorMessage: String?
    @State private var showEmailConfirmation = false

    /// Référence stable, jamais observée par la racine : seul l'en-tête se
    /// re-rend au fil du défilement (même dispositif que Réglages).
    @State private var scrollRelay = ScrollOffsetRelay()

    private let requiredPhrase = "SUPPRIMER MON COMPTE"

    var body: some View {
        ZStack(alignment: .top) {
            theme.backgroundGradient.ignoresSafeArea()

            // L'en-tête partagé est monté À LA MAIN plutôt que par
            // `CollapsibleHeaderPage` : l'écran bascule vers la confirmation par
            // e-mail, qui ne défile pas. Le retour en verre (#6481) reste présent
            // dans les deux états — la confirmation en était privée.
            if showEmailConfirmation {
                emailConfirmationView
            } else {
                scrollContent
            }

            header
        }
        .alert(String(localized: "account.delete.final.title", defaultValue: "Confirmation finale", bundle: .main), isPresented: $showFinalAlert) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { }
            Button(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), role: .destructive) {
                performDeletion()
            }
        } message: {
            Text(String(localized: "account.delete.final.message", defaultValue: "Êtes-vous absolument certain ? Cette action est irréversible.", bundle: .main))
        }
    }

    // MARK: - Header

    private var header: some View {
        ScrollOffsetReader(relay: scrollRelay) { offset in
            CollapsibleHeader(
                title: String(localized: "account.delete.title", defaultValue: "Supprimer le compte", bundle: .main),
                scrollOffset: offset,
                onBack: { dismiss() },
                titleColor: MeeshyColors.error,
                backArrowColor: MeeshyColors.error,
                backgroundColor: theme.backgroundPrimary
            )
        }
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            GeometryReader { geo in
                Color.clear.preference(
                    key: ScrollOffsetPreferenceKey.self,
                    value: geo.frame(in: .named("scroll")).minY
                )
            }
            .frame(height: 0)

            Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

            VStack(spacing: MeeshySpacing.xl) {
                warningCard
                confirmationSection
                deleteButton

                if let errorMessage {
                    Text(errorMessage)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.horizontal, MeeshySpacing.lg)
                }

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.lg)
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollRelay.offset = -$0 }                               // iOS 18+
    }

    // MARK: - Warning Card

    private var warningCard: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack(spacing: MeeshySpacing.smPlus) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(MeeshyFont.relative(24))
                    .foregroundColor(MeeshyColors.error)

                Text(String(localized: "account.delete.warning.title", defaultValue: "Action irréversible", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                    .foregroundColor(MeeshyColors.error)
            }

            Text(String(localized: "account.delete.warning.intro", defaultValue: "La suppression de votre compte entraînera la perte définitive de :", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .lineSpacing(2)

            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                warningBullet(String(localized: "account.delete.warning.conversations", defaultValue: "Toutes vos conversations", bundle: .main))
                warningBullet(String(localized: "account.delete.warning.messages", defaultValue: "Tous vos messages", bundle: .main))
                warningBullet(String(localized: "account.delete.warning.media", defaultValue: "Tous vos médias partagés", bundle: .main))
                warningBullet(String(localized: "account.delete.warning.contacts", defaultValue: "Votre liste de contacts", bundle: .main))
                warningBullet(String(localized: "account.delete.warning.preferences", defaultValue: "Vos préférences et paramètres", bundle: .main))
            }
        }
        .padding(MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(MeeshyColors.error.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .stroke(MeeshyColors.error.opacity(0.3), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .combine)
    }

    private func warningBullet(_ text: String) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: "xmark.circle.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.sm))
                .foregroundColor(MeeshyColors.error.opacity(0.7))

            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(theme.textSecondary)
        }
    }

    // MARK: - Confirmation Section

    private var confirmationSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "account.delete.section.confirmation", defaultValue: "Confirmation", bundle: .main), icon: "checkmark.shield.fill", color: MeeshyColors.amber500Hex)

            VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
                confirmationPrompt
                    .foregroundColor(theme.textPrimary)

                HStack(spacing: MeeshySpacing.smPlus) {
                    TextField(requiredPhrase, text: $confirmationText)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold, design: .monospaced))
                        .foregroundColor(theme.textPrimary)
                        .textInputAutocapitalization(.characters)
                        .disableAutocorrection(true)
                        .accessibilityLabel(String(localized: "account.delete.confirmation.label", defaultValue: "Phrase de confirmation", bundle: .main))
                        // Announce the match state so VoiceOver users get the same
                        // feedback the sighted checkmark conveys — otherwise the
                        // transition from invalid to valid (which unlocks the
                        // destructive button) is silent to them.
                        .accessibilityValue(confirmationPhraseAccessibilityValue)

                    if confirmationText == requiredPhrase {
                        Image(systemName: "checkmark.circle.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.xl))
                            .foregroundColor(MeeshyColors.success)
                            .transition(.scale.combined(with: .opacity))
                            // Decorative confirmation: its meaning is carried by the
                            // field's accessibilityValue, so hide it to avoid a
                            // dangling unlabeled element for VoiceOver.
                            .accessibilityHidden(true)
                    }
                }
                .padding(MeeshySpacing.md)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .fill(theme.surfaceGradient(tint: MeeshyColors.amber500Hex))
                )
                .overlay(
                    Group {
                        if confirmationText == requiredPhrase {
                            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                                .stroke(MeeshyColors.success.opacity(0.5), lineWidth: 1)
                        } else {
                            RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                                .stroke(theme.border(tint: MeeshyColors.amber500Hex), lineWidth: 1)
                        }
                    }
                )
                .animation(.spring(response: 0.3, dampingFraction: 0.8), value: confirmationText == requiredPhrase)

                // La preuve de PRÉSENCE, distincte de la phrase de confirmation :
                // celle-ci prouve qu'on a compris, celui-là qu'on est bien là.
                Text(String(localized: "account.delete.password.prompt", defaultValue: "Saisissez votre mot de passe pour confirmer votre identité", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(theme.textSecondary)
                    .padding(.top, MeeshySpacing.xsPlus)

                MeeshyPasswordField(
                    String(localized: "account.delete.password.placeholder", defaultValue: "Mot de passe actuel", bundle: .main),
                    text: $currentPassword,
                    role: .current,
                    accessibilityLabel: String(localized: "account.delete.password.label", defaultValue: "Mot de passe actuel", bundle: .main),
                    eyeColor: theme.textMuted
                )
                .font(MeeshyFont.relative(MeeshyFont.labelSize))
                .foregroundColor(theme.textPrimary)
                .padding(MeeshySpacing.md)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .fill(theme.surfaceGradient(tint: MeeshyColors.amber500Hex))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .stroke(theme.border(tint: MeeshyColors.amber500Hex), lineWidth: 1)
                )
            }
            .padding(MeeshySpacing.mdPlus)
            .background(sectionBackground(tint: MeeshyColors.amber500Hex))
        }
    }

    // MARK: - Delete Button

    private var deleteButton: some View {
        Button {
            HapticFeedback.heavy()
            showFinalAlert = true
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                if isDeleting {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(.white)
                }
                Image(systemName: "trash.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                Text(String(localized: "account.delete.button", defaultValue: "Supprimer définitivement mon compte", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.mdPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(
                        confirmationText == requiredPhrase && !currentPassword.isEmpty && !isDeleting
                            ? MeeshyColors.error
                            : MeeshyColors.error.opacity(0.3)
                    )
            )
        }
        .disabled(confirmationText != requiredPhrase || currentPassword.isEmpty || isDeleting)
        .accessibilityLabel(String(localized: "account.delete.button", defaultValue: "Supprimer définitivement mon compte", bundle: .main))
        .accessibilityHint(confirmationText == requiredPhrase
            ? String(localized: "account.delete.button.hint.ready", defaultValue: "Appuyez pour confirmer la suppression", bundle: .main)
            : String(localized: "account.delete.button.hint.type_phrase", defaultValue: "Tapez la phrase de confirmation d'abord", bundle: .main))
    }

    // MARK: - Actions

    private func performDeletion() {
        isDeleting = true
        errorMessage = nil
        Task {
            do {
                _ = try await AccountService.shared.openDeletionRequest(confirmationPhrase: requiredPhrase, currentPassword: currentPassword)
                HapticFeedback.success()
                // La confirmation ne défile pas : l'en-tête s'y montre déplié,
                // quel que soit le repli laissé par le formulaire quitté.
                scrollRelay.offset = 0
                withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                    showEmailConfirmation = true
                }
                isDeleting = false
            } catch {
                HapticFeedback.error()
                errorMessage = String(localized: "account.delete.error", defaultValue: "Erreur lors de la suppression du compte. Veuillez réessayer.", bundle: .main)
                isDeleting = false
            }
        }
    }

    // MARK: - Email Confirmation View

    private var emailConfirmationView: some View {
        VStack(spacing: MeeshySpacing.xxl) {
            Spacer()

            VStack(spacing: MeeshySpacing.lg) {
                // Héros décoratif ≥40pt : diamètre fixe, exclu du Dynamic Type (doctrine 84i/87i).
                Image(systemName: "envelope.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(
                        MeeshyColors.brandGradient
                    )
                    .accessibilityHidden(true)

                Text(String(localized: "account.delete.email.title", defaultValue: "Un email de confirmation vous a été envoyé", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                    .multilineTextAlignment(.center)

                Text(String(localized: "account.delete.email.body", defaultValue: "Vérifiez votre boîte de réception pour confirmer la suppression de votre compte.", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(2)
            }
            .accessibilityElement(children: .combine)
            .padding(MeeshySpacing.xxl)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                            .stroke(MeeshyColors.indigo500.opacity(0.2), lineWidth: 1)
                    )
            )
            .padding(.horizontal, MeeshySpacing.xxl)

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Text(String(localized: "account.delete.email.ok", defaultValue: "Compris", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, MeeshySpacing.mdPlus)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .fill(MeeshyColors.brandGradient)
                    )
            }
            .padding(.horizontal, MeeshySpacing.xxl)
            .accessibilityLabel(String(localized: "account.delete.email.ok", defaultValue: "Compris", bundle: .main))

            Spacer()
        }
        .transition(.opacity.combined(with: .scale(scale: 0.95)))
    }

    // MARK: - Helpers

    // The confirmation phrase is a server-side literal contract
    // (`z.literal('SUPPRIMER MON COMPTE')`, delete-account-schemas.ts): it must be
    // typed verbatim in every locale. So `requiredPhrase` is injected literally into a
    // word-order-safe `%@` format string and emphasized deterministically — never
    // embedded as translatable text (which could drift from the server literal) nor as
    // raw markdown (which `Text(String)` renders with visible asterisks).
    private var confirmationPrompt: Text {
        let format = String(localized: "account.delete.confirmation.prompt", defaultValue: "Tapez %@ pour confirmer", bundle: .main)
        var attributed = AttributedString(String(format: format, requiredPhrase))
        attributed.font = MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium)
        if let range = attributed.range(of: requiredPhrase) {
            attributed[range].font = MeeshyFont.relative(MeeshyFont.labelSize, weight: .bold, design: .monospaced)
        }
        return Text(attributed)
    }

    private var confirmationPhraseAccessibilityValue: String {
        confirmationText == requiredPhrase
            ? String(localized: "account.delete.confirmation.value.matched", defaultValue: "Phrase correcte", bundle: .main)
            : String(localized: "account.delete.confirmation.value.pending", defaultValue: "Phrase incomplète", bundle: .main)
    }

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, MeeshySpacing.xs)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }
}
