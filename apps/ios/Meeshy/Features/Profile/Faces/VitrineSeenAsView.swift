import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// « Voir comme » (#18869, planche `Moi-Apercu`) : ma Vitrine telle qu'un cercle la voit, la page publique en étant le
/// niveau Public (loi 2).
///
/// Faite du kit : l'échelle de proximité (K33) choisit le cercle, la bannière vivante (K27) ouvre la Vitrine, le bouton
/// (K40) dit le geste de contact, les rangées verrouillées (K37) disent ce qui est fermé et le cercle qui l'ouvre, les
/// lignes inertes (K06) l'échelle de ce que chaque cercle ajoute. Une rangée verrouillée ne porte que son nom et son
/// cercle : aucune valeur, aucun champ voisin (loi 4). La présence ne paraît que si le serveur l'a servie à CE cercle
/// (loi 10).
struct VitrineSeenAsView: View {
    let user: MeeshyUser
    let accentColor: String

    @StateObject private var model: VitrineSeenAsViewModel
    private let crans: [VitrineCran]
    @State private var linkCopied = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale

    private var theme: ThemeManager { ThemeManager.shared }

    init(user: MeeshyUser, accentColor: String, initial: RelationLevel = .public) {
        self.user = user
        self.accentColor = accentColor
        _model = StateObject(wrappedValue: VitrineSeenAsViewModel(
            handle: user.username, ownerRole: PlatformRole(raw: user.role), initial: initial
        ))
        crans = VitrineCran.make(ownerRole: PlatformRole(raw: user.role))
    }

    private var accent: Color { Color(hex: accentColor) }

    /// Les champs que CE cercle reçoit quand le serveur les a servis ; sinon les miens, dont la Vitrine ne montre que
    /// ce qui est public (nom, pseudo, bio, langues).
    private var shown: MeeshyUser { model.preview.profile?.user ?? user }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                hero
                VitrineCransSection(crans: crans, current: model.level, accentColor: accentColor,
                                    onSelect: { level in model.select(level) })
                if let voice = Self.publicVoice(of: shown) {
                    ProfileVoiceSection(sample: voice, accentColor: accentColor)
                }
                lockedSection
                ladderSection
                linkFooter
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.xxxl)
            .meeshyAnimation(MeeshyAnimation.springDefault, value: model.level)
        }
        .safeAreaInset(edge: .top, spacing: 0) { header }
        .background(theme.backgroundGradient.ignoresSafeArea())
        .task { model.start() }
        .task(id: linkCopied) {
            guard linkCopied else { return }
            _ = await cancellableSleep(for: .seconds(2))
            linkCopied = false
        }
    }

    // MARK: - En-tête

    private var header: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                MeeshyGlassButton(systemImage: "xmark", label: VitrineSeenAsCopy.close, action: { dismiss() })
                Text(VitrineSeenAsCopy.title)
                    .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                    .foregroundStyle(theme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
            }
            ViewThatFits(in: .horizontal) {
                circlePicker.frame(maxWidth: .infinity)
                ScrollView(.horizontal, showsIndicators: false) { circlePicker }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .meeshyGlass(in: Rectangle(), density: .dense)
    }

    /// Les six cercles d'une rangée ; aux grandes tailles de texte, la rangée défile plutôt que d'écraser les noms.
    private var circlePicker: some View {
        MeeshyCircleScale(
            levels: Self.levels,
            current: RelationLevel.allCases.firstIndex(of: model.level),
            tint: accent,
            form: .dots,
            size: .regular,
            label: VitrineSeenAsCopy.pickerLabel,
            onSelect: { index in select(index) }
        )
    }

    static let levels: [MeeshyCircleScaleLevel] = RelationLevel.allCases.map { level in
        MeeshyCircleScaleLevel(title: CircleLevelNames.title(of: level), systemImage: VitrineSeenAsCopy.glyph(of: level))
    }

    private func select(_ index: Int) {
        guard RelationLevel.allCases.indices.contains(index) else { return }
        model.select(RelationLevel.allCases[index])
    }

    // MARK: - La Vitrine rendue

    private var hero: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshyLivingBanner(tint: accent, height: MeeshyLivingBannerHeight.card)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                .accessibilityHidden(true)
                .overlay(alignment: .bottomTrailing) { whatSeesBadge }
            MeeshyAvatar(
                name: shown.displayName ?? shown.username,
                context: .profileBanner,
                accentColor: accentColor,
                secondaryColor: MeeshyColors.indigo300Hex,
                avatarURL: shown.avatar,
                presenceState: model.preview.isOnline ? .online : nil,
                ring: shown.profileDecor?.avatarRing
            )
            .offset(y: -MeeshySpacing.xxxl)
            .padding(.bottom, -MeeshySpacing.xxxl)
            .padding(.leading, MeeshySpacing.md)
            identity
            contactButton
        }
    }

    /// « Ce que voit le cercle Ami », posé SUR la bannière (planche `Moi-Apercu`) : le cercle courant, dit là où l'œil
    /// lit la Vitrine rendue.
    private var whatSeesBadge: some View {
        MeeshyBadge(.label(VitrineSeenAsCopy.whatSees(model.level)), leading: .systemImage("eye"), surface: .glass)
            .padding(MeeshySpacing.sm)
            .accessibilityAddTraits(.updatesFrequently)
            .accessibilityIdentifier("profile.seenAs.whatSees")
    }

    /// Ma voix ne paraît dans l'aperçu que si je l'ai rendue publique : elle n'est gardée par aucun cercle.
    static func publicVoice(of user: MeeshyUser) -> ProfileVoiceSample? {
        guard let sample = ProfileVoiceSample.make(user: user), sample.isPublic else { return nil }
        return sample
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            if model.preview.isOnline {
                MeeshyBadge(.label(VitrineSeenAsCopy.online), leading: .liveDot, kind: .ok)
            }
            Text(shown.displayName ?? shown.username)
                .font(MeeshyFont.relative(MeeshyFont.displaySize, weight: .bold))
                .foregroundStyle(theme.textPrimary)
            Text(verbatim: "@\(shown.username)")
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium, design: .monospaced))
                .foregroundStyle(theme.textMuted)
            if let bio = shown.bio, !bio.isEmpty {
                Text(bio)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
                    .foregroundStyle(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            languageChips
        }
    }

    private var languageChips: some View {
        HStack(spacing: MeeshySpacing.xs) {
            ForEach(Self.languageNames(of: shown), id: \.self) { name in
                MeeshyBadge(.label(name), surface: .tonal, kind: .accent, tint: accent)
            }
        }
    }

    /// Les langues du Prisme que la Vitrine affiche, dans leur ordre, sans doublon.
    static func languageNames(of user: MeeshyUser) -> [String] {
        let codes = [user.systemLanguage, user.regionalLanguage, user.customDestinationLanguage]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        let unique = codes.reduce(into: [String]()) { result, code in
            if !result.contains(code) { result.append(code) }
        }
        return unique.map { LanguageData.info(for: $0)?.nativeName ?? $0 }
    }

    @ViewBuilder
    private var contactButton: some View {
        switch model.preview.seen.contact {
        case .write:
            MeeshyButton(VitrineSeenAsCopy.write, systemImage: "bubble.left", kind: .accent, width: .fill,
                         tint: accent, disabledReason: VitrineSeenAsCopy.previewOnly, action: {})
        case .requestToWrite:
            MeeshyButton(VitrineSeenAsCopy.requestToWrite, systemImage: "bubble.left", kind: .accent, width: .fill,
                         tint: accent, disabledReason: VitrineSeenAsCopy.previewOnly, action: {})
        case .unavailable:
            EmptyView()
        }
    }

    // MARK: - Masqué à ce niveau

    private var lockedSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshySectionHeader(title: VitrineSeenAsCopy.maskedTitle)
            let rows = model.preview.seen.lockedRows
            if rows.isEmpty {
                MeeshyNote(VitrineSeenAsCopy.nothingMasked, kind: .neutral)
            } else {
                ForEach(rows) { locked in
                    MeeshyLockedRow(
                        title: VitrineSeenAsCopy.rowTitle(locked.row),
                        requirement: VitrineSeenAsCopy.opensAt(locked.opensAt),
                        systemImage: VitrineSeenAsCopy.rowGlyph(locked.row),
                        tint: accent
                    )
                    .meeshyTransition(.opacity)
                }
            }
        }
    }

    // MARK: - Ce que chaque cercle ajoute

    private var ladderSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshySectionHeader(title: VitrineSeenAsCopy.ladderTitle)
            VStack(spacing: 0) {
                ForEach(VitrineLadder.steps) { step in
                    ladderRow(step, isLast: step.level == .blood)
                }
            }
        }
    }

    private func ladderRow(_ step: VitrineLadder.Step, isLast: Bool) -> some View {
        let isCurrent = step.level == model.level
        let content = MeeshyToggleRowContent(
            title: CircleLevelNames.title(of: step.level),
            subtitle: VitrineSeenAsCopy.ladderSentence(step, locale: locale),
            showsDivider: !isLast,
            tint: accent
        )
        return MeeshyToggleRowFace(
            content: content,
            leading: { MeeshyToggleRowSymbol(VitrineSeenAsCopy.glyph(of: step.level)) },
            titleAccessory: {
                if isCurrent {
                    MeeshyBadge(.label(VitrineSeenAsCopy.youAreHere), surface: .solid, kind: .accent, tint: accent, size: .s18)
                }
            },
            trailing: { MeeshyToggleRowNoSlot() }
        )
        .opacity(VitrineLadder.isReached(step.level, seenAs: model.level) ? 1 : MeeshyOpacity.strong)
    }

    // MARK: - Le lien de la page publique

    @ViewBuilder
    private var linkFooter: some View {
        if let link = ProfileLink(username: user.username) {
            VStack(spacing: MeeshySpacing.sm) {
                Label {
                    Text(verbatim: link.displayText)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold, design: .monospaced))
                } icon: {
                    Image(systemName: "link").accessibilityHidden(true)
                }
                .foregroundStyle(theme.textMuted)
                MeeshyButton(linkCopied ? VitrineSeenAsCopy.linkCopied : VitrineSeenAsCopy.copyLink,
                             systemImage: linkCopied ? "checkmark" : "doc.on.doc",
                             kind: .accent, width: .fill, tint: accent, action: { copy(link) })
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func copy(_ link: ProfileLink) {
        UIPasteboard.general.url = link.url
        HapticFeedback.success()
        linkCopied = true
        UIAccessibility.post(notification: .announcement, argument: VitrineSeenAsCopy.linkCopied)
    }
}
