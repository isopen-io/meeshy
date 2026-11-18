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
/// jamais seulement dans le code. « Ce QR montre » (K47, #19487) choisit sa charge : ma vitrine publique, ou une
/// invitation dont le jeton bref fait partir une demande d'ami au scan. « Mettre en story » sème la carte dans le composer.
///
/// Le sans contact (#19484) : les deux téléphones se trouvent de proche en proche (`ContactlessExchangeSection`),
/// chacun choisit ce qu'il donne, et le jeton bref de la passerelle porte le choix. Sous le parcours, « Sans la puce »
/// garde le QR : on montre le sien, ou on scanne celui de l'autre — le même geste. Un téléphone qui ne peut pas le dit
/// en bloc d'état, et le QR reste.
struct ProfileCardView: View {
    let user: MeeshyUser?
    let link: ProfileLink
    let accentColor: String
    @State var mode: ProfileCardMode
    /// « Mettre en story » : l'image de la carte, remise à l'hôte qui ouvre le composer une fois la carte partie.
    var onStory: (UIImage) -> Void = { _ in }

    @Environment(\.dismiss) private var dismiss
    @StateObject private var qr = ProfileCardQRModel()
    @State private var scannerShown = false
    @State private var sent: SharedContentWrapper?
    @State private var exported: ProfileCardExport?
    @State private var contactlessUnavailable = false

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
        .task(id: qr.state.shows) { await qr.keepInvitationFresh() }
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
            qrShowsChoice
        }
    }

    /// « Ce QR montre » (K47) : la vitrine, ou l'invitation dont la charge porte le jeton bref. Tant que l'invitation
    /// n'est pas servie, le QR garde la vitrine et la note le dit.
    private var qrShowsChoice: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshySectionHeader(title: ProfileLinksCopy.qrShows, form: .overline)
            MeeshyChoiceTiles(label: ProfileLinksCopy.qrShows, items: ProfileCardQRShows.allCases.map { $0.choiceItem },
                              selection: .single(qr.state.shows.rawValue), columns: 1, format: .wide, tint: accent,
                              onSelect: { id in if let shows = ProfileCardQRShows(rawValue: id) { qr.choose(shows) } })
                .accessibilityIdentifier("profile.card.qrShows")
            if let note = invitationNote {
                MeeshyNote(note.text, kind: note.kind, lead: .systemImage("person.badge.plus"), announces: true)
                    .accessibilityIdentifier("profile.card.qrShows.note")
            }
        }
    }

    private var invitationNote: (text: String, kind: MeeshyNoteKind)? {
        if qr.state.isInvitationUnavailable { return (ProfileLinksCopy.invitationUnavailable, .warn) }
        if qr.state.isPreparingInvitation { return (ProfileLinksCopy.invitationPreparing, .neutral) }
        if qr.state.carriesInvitation(for: link) { return (ProfileLinksCopy.invitationLive, .neutral) }
        return nil
    }

    private func codeCard(size: MeeshyCodeCardSize) -> some View {
        MeeshyCodeCard(payload: qr.state.payload(for: link).absoluteString, label: ProfileLinksCopy.qrLabel, caption: link.displayText,
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

    /// Les actions de la planche, dans son ordre. Elles portent l'adresse de ma VITRINE, qui dure : le jeton de
    /// l'invitation ne vit que le temps de la carte et ne part ni dans une image, ni dans une story.
    private var actions: some View {
        MeeshyActionGrid(columns: .adaptive(max: ProfileCardAction.allCases.count)) {
            ForEach(ProfileCardAction.offered(canSend: user != nil), id: \.self) { action in
                labeledAction(action)
            }
        }
    }

    @ViewBuilder
    private func labeledAction(_ action: ProfileCardAction) -> some View {
        switch action {
        case .copy:
            MeeshyLabeledAction(title: ProfileLinksCopy.copyAddress, systemImage: "doc.on.doc", tint: accent,
                                hint: link.displayText,
                                action: { LinksClipboard.copy(link.url.absoluteString, message: ProfileLinksCopy.copied) })
        case .send:
            MeeshyLabeledAction(title: ProfileLinksCopy.sendInConversation, systemImage: "paperplane", tint: accent,
                                action: { sendCard() })
        case .story:
            MeeshyLabeledAction(title: ProfileLinksCopy.putInStory, systemImage: "plus.circle", tint: accent,
                                action: { putInStory() })
        case .save:
            MeeshyLabeledAction(title: ProfileLinksCopy.saveImage, systemImage: "square.and.arrow.down", tint: accent,
                                action: { Task { await saveImage() } })
        case .more:
            MeeshyLabeledAction(title: ProfileLinksCopy.more, systemImage: "ellipsis", tint: accent,
                                action: { exported = ProfileCardExport(items: [link.url]) })
        }
    }

    private func sendCard() {
        guard let user else { return }
        sent = SharedContentWrapper(subject: .card(ProfileLinksShare.card(of: user, link: link)))
    }

    // MARK: - Sans contact

    /// Le parcours (approche, choix, reçu), puis le repli QR. Indisponible (planche `Etat-Erreur` vue 6) : le téléphone
    /// le dit en bloc d'état (K38), et « À la place » montre le QR qui fait le même geste.
    private var contactlessContent: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            ContactlessExchangeSection(me: ContactlessHello(displayName: user?.displayName, username: link.username),
                                       accent: accent, accentColor: accentColor,
                                       isUnavailable: $contactlessUnavailable,
                                       onOpenProfile: { url in openProfile(url) })
            if contactlessUnavailable {
                MeeshyStateBlock(kind: .denied, title: ProfileLinksCopy.contactlessUnavailable,
                                 message: ProfileLinksCopy.qrDoesTheSame, art: .glyph, size: .compact, tint: accent,
                                 systemImage: "wave.3.right")
                    .accessibilityIdentifier("profile.card.contactless.unavailable")
            }
            MeeshySectionHeader(title: contactlessUnavailable ? ProfileLinksCopy.instead : ContactlessCopy.withoutChip,
                                form: .overline)
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

    /// « Voir sa vitrine » : la carte se ferme, et la fiche s'ouvre par le même routeur que les liens universels.
    private func openProfile(_ url: URL) {
        dismiss()
        _ = DeepLinkRouter.shared.handle(url: url)
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

    /// La carte en scène 9:16 : l'hôte la sème dans le composer une fois la carte refermée.
    private func putInStory() {
        let renderer = ImageRenderer(content: storyScene)
        renderer.scale = 3
        guard let image = renderer.uiImage else { return }
        HapticFeedback.light()
        onStory(image)
        dismiss()
    }

    private var storyScene: some View {
        ProfileCardStoryScene(link: link, displayName: user?.displayName, accent: accent)
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
