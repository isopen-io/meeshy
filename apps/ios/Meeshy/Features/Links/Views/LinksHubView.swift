import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - LinksHubView

/// Vue hub synthétisant toutes les formes de liens de la plateforme.
/// Deep link : https://meeshy.me/links
struct LinksHubView: View {
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.routerCommands) private var router
    @Environment(\.meeshyConversationList) private var conversationListViewModel

    // Sheets de création rapide
    @State private var showCreateShareLink = false
    @State private var showCreateTrackingLink = false
    @State private var showCreateAffiliate = false

    var body: some View {
        LinksPage(
            title: String(localized: "links.hub.title", defaultValue: "Mes liens", bundle: .main),
            accent: MeeshyColors.communityAccent,
            onBack: { router.pop() }
        ) {
            linkCategoryCards
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.sm)
                .padding(.bottom, 40)
        }
        #if DEBUG
        // La vitrine (#9904) : le hub prête son routeur, la scène y ouvre l'affiliation comme le toucher de sa carte.
        .onAppear { VitrineRendu.shared.liensAffiches { router.push($0) } }
        #endif
        // Sheets de création rapide
        .sheet(isPresented: $showCreateShareLink) {
            CreateShareLinkView { _ in }
                .conversationListObject(conversationListViewModel)
        }
        .sheet(isPresented: $showCreateTrackingLink) {
            CreateTrackingLinkView { _ in }
        }
        .sheet(isPresented: $showCreateAffiliate) {
            AffiliateCreateView { _ in }
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Category Cards

    private var linkCategoryCards: some View {
        VStack(spacing: MeeshySpacing.md + 2) {
            linkCard(
                icon: "link",
                title: String(localized: "links.hub.share.title", defaultValue: "Liens de partage", bundle: .main),
                description: String(localized: "links.hub.share.description", defaultValue: "Invitez des contacts à rejoindre vos conversations", bundle: .main),
                accentHex: MeeshyColors.shareAccentHex,
                route: .shareLinks,
                createLabel: String(localized: "links.hub.share.create.a11y", defaultValue: "Créer un lien de partage", bundle: .main),
                onCreate: { showCreateShareLink = true }
            )

            linkCard(
                icon: "chart.line.uptrend.xyaxis",
                title: String(localized: "links.hub.tracking.title", defaultValue: "Liens de suivi", bundle: .main),
                description: String(localized: "links.hub.tracking.description", defaultValue: "Suivez les performances de vos liens de référence", bundle: .main),
                accentHex: MeeshyColors.trackingAccentHex,
                route: .trackingLinks,
                createLabel: String(localized: "links.hub.tracking.create.a11y", defaultValue: "Créer un lien de suivi", bundle: .main),
                onCreate: { showCreateTrackingLink = true }
            )

            linkCard(
                icon: "person.3.fill",
                title: String(localized: "links.hub.community.title", defaultValue: "Liens communauté", bundle: .main),
                description: String(localized: "links.hub.community.description", defaultValue: "Gérez les liens d'invitation vers vos communautés", bundle: .main),
                accentHex: MeeshyColors.communityAccentHex,
                route: .communityLinks,
                onCreate: nil
            )

            linkCard(
                icon: "dollarsign.circle.fill",
                title: String(localized: "links.hub.affiliate.title", defaultValue: "Parrainage", bundle: .main),
                description: String(localized: "links.hub.affiliate.description", defaultValue: "Invitez et suivez qui s'inscrit par vos liens", bundle: .main),
                accentHex: MeeshyColors.successHex,
                route: .affiliate,
                createLabel: String(localized: "links.hub.affiliate.create.a11y", defaultValue: "Créer un lien de parrainage", bundle: .main),
                onCreate: { showCreateAffiliate = true }
            )
        }
    }

    // MARK: - Link Card

    private func linkCard(
        icon: String,
        title: String,
        description: String,
        accentHex: String,
        route: Route,
        createLabel: String? = nil,
        onCreate: (() -> Void)?
    ) -> some View {
        let accent = Color(hex: accentHex)

        return Button {
            HapticFeedback.light()
            router.push(route)
        } label: {
            HStack(spacing: MeeshySpacing.mdPlus) {
                // Icône
                ZStack {
                    Circle()
                        .fill(accent.opacity(0.15))
                        .frame(width: 48, height: 48)
                    Image(systemName: icon)
                        .font(.title3.weight(.semibold))
                        .foregroundColor(accent)
                        .accessibilityHidden(true)
                }
                .accessibilityHidden(true)

                // Texte
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(theme.textPrimary)
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(2)
                }

                Spacer()

                // Actions: bouton créer + chevron
                HStack(spacing: MeeshySpacing.sm) {
                    if let onCreate {
                        MeeshyGlassButton(
                            systemImage: "plus",
                            label: createLabel ?? title,
                            size: .s36,
                            glyphTint: accent,
                            action: onCreate
                        )
                        // Re-exposé via l'action rotor « Créer… » de la carte (idiome 183i) :
                        // ce Button secondaire imbriqué dans le Button de navigation est
                        // masqué à VoiceOver pour éviter un élément interactif ambigu.
                        .accessibilityHidden(true)
                    }

                    Image(systemName: "chevron.forward")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(theme.textMuted)
                        .accessibilityHidden(true)
                }
            }
            .padding(MeeshySpacing.mdPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.surfaceGradient(tint: accentHex))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(theme.border(tint: accentHex), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .modifier(LinkCardCreateAction(label: createLabel, onCreate: onCreate))
    }
}

// MARK: - Accessibility helpers

/// Ré-expose l'action « Créer… » d'une carte de liens comme action VoiceOver
/// nommée (rotor Actions), le `Button` secondaire visible étant masqué à
/// VoiceOver pour éviter un élément interactif imbriqué ambigu (idiome 183i).
/// Aucune action ajoutée pour les cartes sans création (ex. communauté).
private struct LinkCardCreateAction: ViewModifier {
    let label: String?
    let onCreate: (() -> Void)?

    func body(content: Content) -> some View {
        if let label, let onCreate {
            content.accessibilityAction(named: Text(verbatim: label)) { onCreate() }
        } else {
            content
        }
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
