import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - LinksHubView

/// « Mes liens » (deep link `https://meeshy.me/links`) : la face Liens de ma fiche, en page poussée (#18871, planche
/// `Moi-Liens`). Le même contenu que la face — mon lien de profil et son QR, mes adresses, mes liens créés par famille —,
/// sous l'en-tête des pages de liens, dont l'action lit un QR.
struct LinksHubView: View {
    @Environment(\.routerCommands) private var router
    @EnvironmentObject private var authManager: AuthManager
    @State private var scannerShown = false

    /// L'accent de ma vitrine, celui que la face Liens prend sur ma fiche : le même contenu garde sa teinte quelle que
    /// soit la porte d'entrée, et l'en-tête s'accorde avec lui.
    private var accentColor: String {
        authManager.currentUser?.profileAccentHex ?? MeeshyColors.purple500Hex
    }

    var body: some View {
        LinksPage(
            title: ProfileLinksCopy.title,
            accent: Color(hex: accentColor),
            action: LinksPageAction(label: ProfileLinksCopy.scan, systemImage: "qrcode.viewfinder",
                                    perform: { scannerShown = true }),
            onBack: { router.pop() }
        ) {
            ProfileLinksFace(user: authManager.currentUser, accentColor: accentColor,
                             showsHeader: false, onOpen: { router.push($0) })
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.sm)
                .padding(.bottom, 40)
        }
        #if DEBUG
        // La vitrine (#9904) : le hub prête son routeur, la scène y ouvre l'affiliation comme le toucher de sa carte.
        .onAppear { VitrineRendu.shared.liensAffiches { router.push($0) } }
        #endif
        .sheet(isPresented: $scannerShown) { ProfileQRScannerSheet() }
    }
}

// MARK: - L'en-tête des pages de liens

/// L'action de l'en-tête d'une page de liens : un disque de verre du kit, à droite.
struct LinksPageAction {
    let label: String
    let systemImage: String
    let perform: () -> Void

    init(label: String, systemImage: String = "plus", perform: @escaping () -> Void) {
        self.label = label
        self.systemImage = systemImage
        self.perform = perform
    }
}

/// L'EN-TÊTE DE PARRAINAGE, pour toutes les pages de liens (#18429).
///
/// Directive porteur (#18429) : chaque page de liens reprend l'en-tête de
/// Parrainage — retour en disque de verre, même hauteur, même réduction au
/// défilement, action en disque de verre du kit. Cette page le porte UNE fois,
/// sur `CollapsibleHeaderPage` : l'écran ne fournit que son titre, sa teinte,
/// son action et son contenu. Une feuille passe `glyph: .close` : son disque
/// ferme au lieu de revenir.
///
/// Le contenu se pose sur le thème (`meeshyGlassTone(.theme)`) : les champs,
/// lignes, puces et boutons du kit y prennent l'encre du thème, pas celle d'un
/// média.
struct LinksPage<Content: View>: View {
    let title: String
    let accent: Color
    let glyph: CollapsibleHeaderBackGlyph
    let action: LinksPageAction?
    let onBack: (() -> Void)?
    let content: () -> Content

    @Environment(\.dismiss) private var dismiss
    @Environment(\.isPresented) private var isPresented
    @Environment(\.meeshyPanelDismiss) private var panelDismiss
    private var theme: ThemeManager { ThemeManager.shared }

    init(
        title: String,
        accent: Color,
        glyph: CollapsibleHeaderBackGlyph = .back,
        action: LinksPageAction? = nil,
        onBack: (() -> Void)? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.title = title
        self.accent = accent
        self.glyph = glyph
        self.action = action
        self.onBack = onBack
        self.content = content
    }

    /// Retour opérant dans les trois contextes de présentation : pile iPhone,
    /// panneau droit iPad, feuille.
    private func back() {
        if let onBack { return onBack() }
        PanelBackAction(isPresented: isPresented, dismiss: dismiss, panelDismiss: panelDismiss)()
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            CollapsibleHeaderPage(
                title: title,
                onBack: back,
                titleColor: theme.textPrimary,
                backArrowColor: accent,
                backgroundColor: theme.backgroundPrimary,
                trailing: { trailing },
                content: { content().meeshyGlassTone(.theme) }
            )
            .backGlyph(glyph)
        }
        .navigationBarHidden(true)
    }

    @ViewBuilder
    private var trailing: some View {
        if let action {
            MeeshyGlassButton(
                systemImage: action.systemImage,
                label: action.label,
                size: .s40,
                glyphTint: accent,
                action: action.perform
            )
        }
    }
}

// MARK: - Copier un lien

/// Copier un lien se DIT (#18311) : le retour haptique ne suffisait pas, rien
/// ne se voyait ni ne s'entendait. Une page qui montre sa propre confirmation
/// (« Lien copié » dans le bouton) passe `.inline` ; une rangée, qui n'a pas la
/// place, laisse le toast la montrer.
enum LinksClipboard {
    enum Confirmation {
        case toast
        case inline
    }

    @MainActor
    static func copy(_ value: String, confirmation: Confirmation = .toast, message: String = ShareLinkDetailCopy.copied) {
        UIPasteboard.general.string = value
        switch confirmation {
        case .toast:
            FeedbackToastManager.shared.showSuccess(message)
        case .inline:
            HapticFeedback.success()
            UIAccessibility.post(notification: .announcement, argument: message)
        }
    }
}

// MARK: - Le champ d'un formulaire de lien

/// Le champ des formulaires de liens : la légende visible au-dessus, le champ du
/// kit dessous (#18429). `MeeshyField` ne dessine pas sa légende — il en fait
/// son nom accessible — donc la légende visible est masquée à VoiceOver : un
/// seul arrêt, qui dit à quoi sert le champ.
struct LinksFormField: View {
    let label: String
    let prompt: String?
    let text: Binding<String>
    var input: MeeshyFieldInput = .sentence
    var caption: String?
    var accessibilityLabel: String?
    var hint: String?

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundStyle(ThemeManager.shared.textSecondary)
                .accessibilityHidden(true)
            MeeshyField(
                accessibilityLabel ?? label,
                text: text.wrappedValue,
                input: input,
                prompt: prompt,
                caption: caption,
                onChange: { text.wrappedValue = $0 }
            )
            .accessibilityHint(hint ?? caption ?? "")
        }
    }
}
