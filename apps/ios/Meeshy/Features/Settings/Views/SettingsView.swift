import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// **Les Réglages, composés depuis leur loi** (#18589) : `SettingsLayout`
/// ordonne les blocs et leurs rangées, cet écran tient l'état qu'elles écrivent
/// — la feuille présentée, le pli des annexes, la langue de l'interface, les
/// trois interrupteurs d'interface, la déconnexion en cours.
struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.routerCommands) private var router
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var authManager: AuthManager
    @ObservedObject private var prefs: UserPreferencesManager
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    @State private var showLogoutConfirm = false
    /// Choix explicite de langue d'interface — `nil` = suit la langue
    /// principale du compte. Lu une fois au montage depuis `UILanguageOverride`.
    @State private var interfaceLanguageChoice: String? = UILanguageOverride.explicitChoice
    @State private var showInterfaceLanguageRestartHint = false
    /// Vrai pendant `await authManager.logout()` : le voile le montre, et les
    /// boutons du pied se désactivent contre le double toucher.
    @State private var isLoggingOut = false
    /// UNE feuille à la fois : deux rangées touchées vite ne superposent rien.
    @State private var presentedSheet: SettingsSheet?
    /// Replié à chaque montage : une annexe s'ouvre quand on la cherche.
    @State private var isAnnexUnfolded = false
    @State private var openNoteID: String?
    @State private var packsRequest: PackShopLauncher.Request?
    @ObservedObject private var packShopLauncher: PackShopLauncher
    init(prefs: UserPreferencesManager = .shared, packShopLauncher: PackShopLauncher = .shared) {
        self.prefs = prefs
        self.packShopLauncher = packShopLauncher
    }
    @State private var scrollRelay = ScrollOffsetRelay()
    /// Le réglage qu'une invite a désigné (#16339) — défilé et allumé.
    @State private var focusedSetting: SettingsFocus?
    /// Miroirs des trois interrupteurs d'interface (#6482), lus UNE fois au
    /// montage comme `interfaceLanguageChoice` : chaque bascule écrit le miroir
    /// ET `LentilleFeatureFlag.setEnabled` — le drapeau reste la seule source.
    @State private var lentilleListEnabled: Bool = LentilleFeatureFlag.isLentilleListEnabled
    @State private var readingModesEnabled: Bool = LentilleFeatureFlag.isReadingModesEnabled
    @State private var riviereModeEnabled: Bool = LentilleFeatureFlag.isRiviereModeEnabled

    private let accentColor = MeeshyColors.brandPrimaryHex

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    var body: some View {
        ZStack {
            presentations

            theme.backgroundGradient.ignoresSafeArea()

            scrollContent

            VStack(spacing: 0) {
                header
                Spacer()
            }
        }
        .overlay { SettingsLogoutVeil(isVisible: isLoggingOut) }
        .task { await prefs.fetchFromBackend() }
    }

    // MARK: - Presentations

    /// Les feuilles, alertes et relais de l'écran, posés sur une ancre vide plutôt que sur
    /// la racine. Chaque modificateur enveloppe la valeur de la vue qu'il modifie, et un
    /// build Debug réserve chaque enveloppe sur la pile : posés sur la racine, qui porte
    /// tout l'écran, ils faisaient descendre le premier rendu au-delà du Mio de pile du
    /// fil principal d'un iPhone (SIGSEGV à l'ouverture des réglages).
    private var presentations: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            // iOS ne relit `AppleLanguages` qu'au démarrage : l'écran courant reste
            // dans l'ancienne langue, et le taire ferait passer un réglage qui
            // marche pour un réglage mort — c'est précisément le reproche qui avait
            // fait retirer ce contrôle.
            .alert(String(localized: "settings.interface_language.restart.title",
                          defaultValue: "Langue enregistrée", bundle: .main),
                   isPresented: $showInterfaceLanguageRestartHint) {
                Button(String(localized: "common.ok", defaultValue: "OK", bundle: .main), role: .cancel) { }
            } message: {
                Text(String(localized: "settings.interface_language.restart.message",
                            defaultValue: "L'interface passera dans cette langue au prochain démarrage de Meeshy.",
                            bundle: .main))
            }
            .alert(String(localized: "settings.logout.title", bundle: .main), isPresented: $showLogoutConfirm) {
                Button(String(localized: "common.cancel", bundle: .main), role: .cancel) { }
                Button(String(localized: "settings.logout.title", bundle: .main), role: .destructive, action: logout)
            } message: {
                Text(String(localized: "settings.logout.message", bundle: .main))
            }
            .sheet(item: $presentedSheet) { SettingsSheetContent(sheet: $0, authManager: authManager) }
            .sheet(item: $packsRequest) { PacksSettingsView(initialDomain: $0.domain, focusedPack: $0.pack, initialPage: $0.page) }
            .onReceive(SettingsFocusRequest.shared.$pending.compactMap { $0 }, perform: receiveFocus)
            .onReceive(packShopLauncher.$pending.compactMap { $0 }) { _ in
                packsRequest = packShopLauncher.consume()
            }
    }

    /// `logout()` désactive les sockets, remet les services du SDK à zéro et
    /// vide le trousseau. La session et les données locales partent, le compte
    /// RESTE listé : y revenir redemande le mot de passe (#8286).
    private func logout() {
        isLoggingOut = true
        Task {
            await authManager.logout(forgettingAccount: false)
            isLoggingOut = false
        }
    }

    // MARK: - Header

    private var header: some View {
        // Seul ce reader se re-rend au fil du scroll — la racine écrit
        // `scrollRelay.offset` sans s'y abonner (P1-1).
        ScrollOffsetReader(relay: scrollRelay) { offset in
        CollapsibleHeader(
            title: String(localized: "settings.title", bundle: .main),
            scrollOffset: offset,
            onBack: { router.pop() },
            titleColor: theme.textPrimary,
            backArrowColor: Color(hex: accentColor),
            backgroundColor: theme.backgroundPrimary
        )
        }
    }

    // MARK: - Focus

    /// #16339 — le réglage désigné par une invite ; le master PIN vit dans
    /// Sécurité, qui consomme la demande à son tour.
    private func receiveFocus(_ focus: SettingsFocus) {
        if !focus.opensSecurity { _ = SettingsFocusRequest.shared.consume() }
        focusedSetting = focus
        if let sheet = focus.opensSheet {
            Task { await DelayedUI.perform(after: .milliseconds(500)) { present(sheet) } }
        }
        guard focus.opensSecurity else { return }
        Task { await DelayedUI.perform(after: .milliseconds(900)) { presentedSheet = .security } }
    }

    /// #16418 — la configuration de la voix s'ouvre d'elle-même, une fois la
    /// poussée des Réglages achevée.
    private func present(_ sheet: SettingsFocus.Sheet) {
        switch sheet {
        case .voiceProfileManage: presentedSheet = .voiceProfileManage(opensWizardWhenEmpty: true)
        case .voiceProfileWizard: presentedSheet = .voiceProfileWizard
        }
    }

    /// Un réglage d'annexe déplie d'abord le pli : l'ancre visée n'est montée
    /// qu'une fois dépliée, et le défilement attend la poussée de l'écran.
    private func scroll(to focus: SettingsFocus?, with proxy: ScrollViewProxy) {
        guard let focus, let anchor = focus.settingsAnchor else { return }
        isAnnexUnfolded = SettingsLayout.annexUnfolded(current: isAnnexUnfolded, reaching: focus.destination)
        let reduce = reduceMotion
        Task { await DelayedUI.perform(after: .milliseconds(350)) {
            meeshyWithAnimation(MeeshyAnimation.springDefault, reduceMotion: reduce) { proxy.scrollTo(anchor, anchor: .center) }
        } }
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollViewReader { proxy in
        ScrollView(showsIndicators: false) {
            GeometryReader { geo in
                Color.clear.preference(
                    key: ScrollOffsetPreferenceKey.self,
                    value: geo.frame(in: .named("scroll")).minY
                )
            }
            .frame(height: 0)

            Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

            SettingsDeferredContent {
                VStack(spacing: MeeshySpacing.xl) {
                    profileCard
                    ForEach(SettingsLayout.blocks(in: .life)) { blockView($0) }
                    SettingsAnnexFold(isUnfolded: $isAnnexUnfolded, summary: SettingsLayout.annexSummary) {
                        ForEach(SettingsLayout.blocks(in: .annex)) { blockView($0) }
                    }
                    ForEach(SettingsLayout.blocks(in: .footer)) { blockView($0) }

                    Spacer().frame(height: 40)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.sm)
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollRelay.offset = -$0 }                               // iOS 18+ (preference path is dead there)
        .adaptiveOnChange(of: focusedSetting, initial: true) { _, focus in scroll(to: focus, with: proxy) }
        }
    }

    private func blockView(_ block: SettingsBlock) -> some View {
        SettingsBlockView(block: block) { row(for: $0) }
            .id(block.id.anchor)
            .modifier(SettingsFocusHighlight(isActive: focusedSetting?.settingsAnchor == block.id.anchor))
    }

    // MARK: - Rows

    @ViewBuilder
    private func row(for destination: SettingsDestination) -> some View {
        switch destination {
        case .theme: themeRow
        case .interfaceLanguage: interfaceLanguageRow
        case .shop: shopRow
        case .transcriptionMine: transcriptionMineRow
        case .transcriptionAuto: transcriptionAutoRow
        case .lentilleList: lentilleListRow
        case .readingModes: readingModesRow
        case .riviereMode: riviereModeRow
        case .switchAccount: SettingsSwitchAccountButton(isDisabled: isLoggingOut) { open(.switchAccount) }
        case .logout: SettingsLogoutButton(isDisabled: isLoggingOut) { open(.logout) }
        case .deleteAccount: SettingsDeleteAccountButton(isDisabled: isLoggingOut) { open(.deleteAccount) }
        case .privacy, .security, .blockedUsers, .notifications, .voiceProfile, .mediaDownload,
             .storage, .exportData, .helpCenter, .about, .terms, .privacyPolicy, .licenses:
            navigationRow(destination)
        }
    }

    @ViewBuilder
    private func navigationRow(_ destination: SettingsDestination) -> some View {
        if let content = SettingsRowContent.of(destination, voice: .current(prefs)) {
            SettingsNavigationRow(content: content) { open(destination) }
        }
    }

    /// Le toucher d'une rangée exécute la présentation que la loi lui déclare :
    /// l'écran n'en recopie aucune à côté d'elle.
    private func open(_ destination: SettingsDestination) {
        switch destination.presentation {
        case .sheet(let sheet): presentedSheet = sheet
        case .voiceSetup: presentedSheet = SettingsRowContent.voiceProfile(.current(prefs)).sheet
        case .shop: packsRequest = PackShopLauncher.Request(domain: nil, pack: nil)
        case .logoutConfirmation: showLogoutConfirm = true
        case .control: return
        }
    }

    // MARK: - Profile Card

    private var profileCard: some View {
        Button {
            HapticFeedback.light()
            router.push(.profile)
        } label: {
            HStack(spacing: MeeshySpacing.md + 2) {
                MeeshyAvatar(
                    name: authManager.currentUser?.displayName ?? "?",
                    context: .conversationList,
                    avatarURL: authManager.currentUser?.avatar,
                    ring: authManager.currentUser?.profileDecor?.avatarRing
                )

                VStack(alignment: .leading, spacing: MeeshySpacing.xs - 1) {
                    Text(authManager.currentUser?.displayName ?? String(localized: "settings.my_profile", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                        .foregroundStyle(theme.textPrimary)
                    Text("@\(authManager.currentUser?.username ?? "")")
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                        .foregroundStyle(theme.textSecondary)
                }

                Spacer()

                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                    .foregroundStyle(theme.textMuted)
            }
            .padding(MeeshySpacing.lg)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.inputBackground)
            )
        }
        .accessibilityLabel(String(localized: "settings.my_profile", bundle: .main))
    }

    // MARK: - Appearance

    private var themeRow: some View {
        settingsRow(icon: theme.preference.icon, title: String(localized: "settings.theme", bundle: .main), color: theme.preference.tintColor) {
            SettingsThemePicker(selection: theme.preference, onSelect: selectTheme)
        }
    }

    private func selectTheme(_ pref: ThemePreference) {
        meeshyWithAnimation(MeeshyAnimation.springFast, reduced: MeeshyMotion.reducedFade, reduceMotion: reduceMotion) {
            theme.preference = pref
            theme.syncWithSystem(colorScheme)
        }
        syncThemeToPrefs(pref)
    }

    /// Le picker avait été retiré le 2026-07-20 : il écrivait
    /// `application.interfaceLanguage`, que personne ne relisait. Il est branché
    /// sur `UILanguageOverride`, qui applique réellement la langue au lancement :
    /// c'était le fil manquant, pas le contrôle qui était en trop.
    private var interfaceLanguageRow: some View {
        settingsRow(icon: "globe",
                    title: String(localized: "settings.interface_language",
                                  defaultValue: "Langue de l'interface", bundle: .main),
                    color: MeeshyColors.indigo600Hex) {
            SettingsInterfaceLanguageMenu(choice: interfaceLanguageChoice, onSelect: selectInterfaceLanguage)
        }
    }

    /// Enregistre le choix et prévient : il s'applique au relancement
    /// (`MeeshyLaunch.main()`). Écrire `AppleLanguages` maintenant basculerait
    /// les dates et les vues système sans le reste de l'écran (#10804).
    private func selectInterfaceLanguage(_ code: String?) {
        HapticFeedback.light()
        UILanguageOverride.explicitChoice = code
        UILanguageOverride.refreshNotificationLanguage()
        interfaceLanguageChoice = code
        showInterfaceLanguageRestartHint = true
    }

    /// Un pack décore : la Boutique se range avec l'apparence. « Mes packs »
    /// reste joignable par le Profil (#16433 : une porte règle, l'autre montre).
    private var shopRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                HapticFeedback.light()
                open(.shop)
            } label: {
                settingsRow(icon: "shippingbox.fill", title: String(localized: "settings.packs.shop", defaultValue: "Boutique", bundle: .main), color: MeeshyColors.warningHex) {
                    SettingsRowChevron()
                }
            }
            .accessibilityLabel(String(localized: "settings.packs.shop", defaultValue: "Boutique", bundle: .main))
            SettingsRowSentence(text: SettingsOrientation.packs)
        }
    }

    // MARK: - Interface Features

    /// Liste Lentille, modes de lecture et Rivière ont quitté la bêta (#6482) :
    /// actifs par défaut, réglés sur l'appareil, rangés en annexe parce qu'on
    /// les règle une fois. La Rivière est un mode de lecture — modes coupés, la
    /// loi ne l'ouvre jamais, d'où sa rangée désactivée et la phrase qui dit pourquoi.
    private var lentilleListRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            settingsRow(icon: "list.bullet.rectangle.fill", title: lentilleListTitle, color: MeeshyColors.trackingAccentHex) {
                featureToggle(.lentilleList, title: lentilleListTitle, isOn: $lentilleListEnabled)
            }
            SettingsRowSentence(text: SettingsOrientation.lentilleList)
        }
    }

    private var readingModesRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            settingsRow(icon: "text.book.closed.fill", title: readingModesTitle, color: MeeshyColors.indigo400Hex, note: SettingsInfoNotes.readingModes) {
                featureToggle(.readingModes, title: readingModesTitle, isOn: $readingModesEnabled)
            }
            SettingsRowSentence(text: SettingsOrientation.readingModes)
        }
    }

    /// Couper les modes de lecture grise la Rivière et change sa phrase : le
    /// changement se fond au lieu de sauter.
    private var riviereModeRow: some View {
        VStack(alignment: .leading, spacing: 0) {
            settingsRow(icon: "water.waves", title: riviereModeTitle, color: MeeshyColors.infoHex) {
                featureToggle(.riviereMode, title: riviereModeTitle, isOn: $riviereModeEnabled)
            }
            .disabled(!readingModesEnabled)
            .opacity(readingModesEnabled ? 1 : 0.45)
            SettingsRowSentence(text: readingModesEnabled ? SettingsOrientation.riviereMode : SettingsOrientation.riviereUnavailable)
                .contentTransition(.opacity)
        }
        .meeshyAnimation(.easeInOut(duration: MeeshyGlassRecipe.toneFadeDuration), reduced: MeeshyMotion.reducedFade, value: readingModesEnabled)
    }

    private func featureToggle(_ flag: LentilleFeatureFlag, title: String, isOn: Binding<Bool>) -> some View {
        Toggle("", isOn: Binding(
            get: { isOn.wrappedValue },
            set: { value in
                isOn.wrappedValue = value
                LentilleFeatureFlag.setEnabled(flag, enabled: value)
            }
        ))
        .labelsHidden()
        .tint(Color(hex: accentColor))
        .accessibilityLabel(title)
        .accessibilityValue(isOn.wrappedValue ? String(localized: "settings.value.active", bundle: .main) : String(localized: "settings.value.disabled", bundle: .main))
    }

    private var lentilleListTitle: String {
        String(localized: "settings.interface.lentille_list", defaultValue: "Liste Lentille", bundle: .main)
    }

    private var readingModesTitle: String {
        String(localized: "settings.interface.reading_modes", defaultValue: "Mode de lecture", bundle: .main)
    }

    private var riviereModeTitle: String {
        String(localized: "settings.interface.riviere_mode", defaultValue: "Mode Rivière", bundle: .main)
    }

    // MARK: - Transcription

    private var transcriptionMineRow: some View {
        settingsRow(icon: "mic.fill", title: String(localized: "settings.transcription.mine", defaultValue: "Mes messages vocaux", bundle: .main), color: MeeshyColors.indigo300Hex) {
            Toggle("", isOn: Binding(
                get: { prefs.audio.transcriptionEnabled },
                set: { val in prefs.updateAudio { $0.transcriptionEnabled = val } }
            ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(String(localized: "settings.transcription.mine", defaultValue: "Mes messages vocaux", bundle: .main))
                .accessibilityValue(prefs.audio.transcriptionEnabled ? String(localized: "settings.value.active", bundle: .main) : String(localized: "settings.value.disabled", bundle: .main))
        }
    }

    private var transcriptionAutoRow: some View {
        settingsRow(icon: "waveform", title: String(localized: "settings.transcription.auto", bundle: .main), color: MeeshyColors.indigo300Hex, note: SettingsInfoNotes.transcriptionAuto) {
            Toggle("", isOn: Binding(
                get: { prefs.audio.autoTranscribeIncoming },
                set: { val in prefs.updateAudio { $0.autoTranscribeIncoming = val } }
            ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(String(localized: "settings.transcription.auto", bundle: .main))
                .accessibilityValue(prefs.audio.autoTranscribeIncoming ? String(localized: "settings.value.active", bundle: .main) : String(localized: "settings.value.disabled", bundle: .main))
        }
    }

    // MARK: - Theme Sync

    private func syncThemeToPrefs(_ pref: ThemePreference) {
        let appTheme: AppThemeMode = switch pref {
        case .system: .auto
        case .light: .light
        case .dark: .dark
        }
        prefs.updateApplication { $0.theme = appTheme }
    }

    // MARK: - Reusable Components

    private func settingsRow<Trailing: View>(
        icon: String,
        title: String,
        color: String,
        note: MeeshyInfoNote? = nil,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        SettingsRowLabel(icon: icon, title: title, color: color, note: note, openNoteID: $openNoteID, trailing: trailing())
    }
}

/// Construit son contenu dans SON corps, que SwiftUI évalue à part : les sections des
/// réglages ne se construisent plus sous le corps de l'écran, et les modificateurs qui
/// les entourent n'enveloppent qu'une fermeture au lieu de toute la colonne.
private struct SettingsDeferredContent<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
    }
}
