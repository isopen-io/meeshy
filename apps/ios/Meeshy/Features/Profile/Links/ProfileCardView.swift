import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les deux façons de donner ma carte (planche `Carte-Profil`) : le QR, et le sans contact.
nonisolated enum ProfileCardMode: String, Hashable, Identifiable, CaseIterable {
    case qr
    case contactless

    var id: String { rawValue }

    var option: MeeshySegmentedOption<ProfileCardMode> {
        switch self {
        case .qr: return MeeshySegmentedOption(id: self, title: ProfileLinksCopy.qr, systemImage: "qrcode")
        case .contactless:
            return MeeshySegmentedOption(id: self, title: ProfileLinksCopy.contactless, systemImage: "wave.3.right")
        }
    }
}

/// Ma carte de profil en plein écran (#18871, planches `Carte-Profil` et `Sans-Contact`) : sans sélecteur de faces
/// (loi 5). Le QR (K31) suit l'inclinaison du téléphone et pousse la luminosité ; l'adresse se lit dessous en texte,
/// jamais seulement dans le code. Le QR ne montre que ma vitrine publique.
///
/// Le sans contact : un iPhone ne laisse pas deux apps s'échanger un profil par la puce NFC. La planche prévoit ce cas
/// (« Sans la puce ») : on montre son QR, ou on scanne celui de l'autre — le même geste, sans rien donner d'autre que
/// l'adresse publique.
struct ProfileCardView: View {
    let user: MeeshyUser?
    let link: ProfileLink
    let accentColor: String
    @State var mode: ProfileCardMode

    @Environment(\.dismiss) private var dismiss
    @State private var scannerShown = false
    @State private var sent: SharedContentWrapper?
    @State private var exported: ProfileCardExport?

    private var accent: Color { Color(hex: accentColor) }
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: MeeshySpacing.xl) {
                    topBar
                    MeeshySegmented(ProfileLinksCopy.cardModes, selection: $mode,
                                    options: ProfileCardMode.allCases.map(\.option), role: .tabs, tone: .theme)
                    switch mode {
                    case .qr: qrContent
                    case .contactless: contactlessContent
                    }
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.bottom, MeeshySpacing.xxxl)
            }
        }
        .sheet(isPresented: $scannerShown) { ProfileQRScannerSheet(onOpened: { dismiss() }) }
        .sheet(item: $exported) { export in ShareSheet(activityItems: export.items) }
        .modifier(MeeshySendSheet(sent: $sent, onOpenConversation: { dismiss() }))
        .accessibilityIdentifier("profile.card")
    }

    // MARK: - Barre du haut

    private var topBar: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyGlassButton(systemImage: "xmark", label: ProfileLinksCopy.close, size: .s44, action: { dismiss() })
            Text(ProfileLinksCopy.cardTitle)
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .heavy, design: .rounded))
                .foregroundStyle(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
                .frame(maxWidth: .infinity, alignment: .leading)
            MeeshyButton(ProfileLinksCopy.scan, systemImage: "qrcode.viewfinder", kind: .glass, size: .s44,
                         action: { scannerShown = true })
        }
        .padding(.top, MeeshySpacing.md)
    }

    // MARK: - Le QR

    private var qrContent: some View {
        VStack(spacing: MeeshySpacing.lg) {
            codeCard(size: .large)
            MeeshyNote(link.displayText, lead: .systemImage("link"), tint: accent)
            MeeshyNote(ProfileLinksCopy.tiltHint, lead: .systemImage("iphone.radiowaves.left.and.right"))
            actions
            MeeshyNote(ProfileLinksCopy.qrShows, lead: .systemImage("globe"))
        }
    }

    private func codeCard(size: MeeshyCodeCardSize) -> some View {
        MeeshyCodeCard(payload: link.url.absoluteString, label: ProfileLinksCopy.qrLabel, caption: link.displayText,
                       tint: accent, size: size, center: { avatar(32) }, header: { identity })
    }

    private func avatar(_ side: CGFloat) -> some View {
        MeeshyAvatar(name: user?.displayName ?? link.username, context: .custom(side), accentColor: accentColor,
                     avatarURL: user?.avatar, thumbHash: user?.avatarThumbHash, ring: user?.profileDecor?.avatarRing)
            .accessibilityHidden(true)
    }

    private var identity: some View {
        VStack(spacing: 2) {
            Text(user?.displayName ?? link.username)
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold, design: .rounded))
                .foregroundStyle(theme.textPrimary)
            Text("@\(link.username)")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, design: .monospaced))
                .foregroundStyle(theme.textSecondary)
        }
        .accessibilityElement(children: .combine)
    }

    private var actions: some View {
        MeeshyActionGrid(columns: .fixed(4)) {
            MeeshyLabeledAction(title: ProfileLinksCopy.copyAddress, systemImage: "doc.on.doc", tint: accent,
                                hint: link.displayText,
                                action: { LinksClipboard.copy(link.url.absoluteString, message: ProfileLinksCopy.copied) })
            if let user {
                MeeshyLabeledAction(title: ProfileLinksCopy.sendInConversation, systemImage: "paperplane", tint: accent,
                                    action: { sent = SharedContentWrapper(subject: .card(ProfileLinksShare.card(of: user, link: link))) })
            }
            MeeshyLabeledAction(title: ProfileLinksCopy.saveImage, systemImage: "square.and.arrow.down", tint: accent,
                                action: { Task { await saveImage() } })
            MeeshyLabeledAction(title: ProfileLinksCopy.more, systemImage: "ellipsis", tint: accent,
                                action: { exported = ProfileCardExport(items: [link.url]) })
        }
    }

    // MARK: - Sans contact

    /// Le sans contact indisponible (planche `Etat-Erreur` vue 6) : le téléphone le dit en bloc d'état (K38), et « À la
    /// place » montre le QR qui fait le même geste, avec « Montrer mon QR » qui passe au QR plein écran.
    private var contactlessContent: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            MeeshyStateBlock(kind: .denied, title: ProfileLinksCopy.contactlessUnavailable,
                             message: ProfileLinksCopy.qrDoesTheSame, art: .glyph, size: .compact, tint: accent,
                             systemImage: "wave.3.right")
                .accessibilityIdentifier("profile.card.contactless.unavailable")
            MeeshySectionHeader(title: ProfileLinksCopy.instead, form: .overline)
            codeCard(size: .compact)
                .frame(maxWidth: .infinity)
            MeeshyNote(ProfileLinksCopy.anyCamera, lead: .systemImage("camera"))
            MeeshyButton(ProfileLinksCopy.showMyQR, systemImage: "qrcode", kind: .primary, width: .fill, tint: accent,
                         action: { mode = .qr })
                .accessibilityIdentifier("profile.card.contactless.showQR")
            MeeshySectionHeader(title: ProfileLinksCopy.orScan)
            MeeshyButton(ProfileLinksCopy.scan, systemImage: "qrcode.viewfinder", kind: .outline, width: .fill,
                         tint: accent, action: { scannerShown = true })
        }
    }

    // MARK: - Enregistrer l'image

    /// L'image du QR, sur sa plaque claire, droite et sans reflet : ce qu'on imprime ou qu'on montre plus tard.
    private func saveImage() async {
        let renderer = ImageRenderer(content: plate)
        renderer.scale = 3
        guard let image = renderer.uiImage else { return }
        if await PhotoLibraryManager.shared.saveImage(image) {
            FeedbackToastManager.shared.showSuccess(ProfileLinksCopy.imageSaved)
        } else {
            exported = ProfileCardExport(items: [image])
        }
    }

    private var plate: some View {
        MeeshyCodeCard(payload: link.url.absoluteString, label: ProfileLinksCopy.qrLabel, caption: link.displayText,
                       tint: accent, style: .plain, size: .large, tilt: .none, boostsBrightness: false)
            .padding(MeeshySpacing.lg)
    }
}

/// Ce que « Plus » remet à la feuille système : l'adresse, ou l'image quand Photos l'a refusée.
struct ProfileCardExport: Identifiable {
    let id = UUID()
    let items: [Any]
}
