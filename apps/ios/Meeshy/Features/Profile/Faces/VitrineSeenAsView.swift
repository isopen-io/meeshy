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

    /// Les personnes de chaque cercle (« Mes cercles », en cache) ; `nil` tant que rien n'est servi : aucun compte dit.
    let circleSummary: ProfileCirclesSummary?

    @StateObject private var model: VitrineSeenAsViewModel
    @State private var linkCopied = false
    /// Mes publications en cache (celles de « Publications ») : l'aperçu n'en montre que ce que le cercle choisi voit.
    @State private var publications: [FeedPost] = []
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale

    private var theme: ThemeManager { ThemeManager.shared }

    init(user: MeeshyUser, accentColor: String, initial: RelationLevel = .public,
         circleSummary: ProfileCirclesSummary? = nil) {
        self.user = user
        self.accentColor = accentColor
        self.circleSummary = circleSummary
        _model = StateObject(wrappedValue: VitrineSeenAsViewModel(
            handle: user.username, ownerRole: PlatformRole(raw: user.role), initial: initial
        ))
    }

    private var accent: Color { Color(hex: accentColor) }

    /// Les champs que CE cercle reçoit quand le serveur les a servis ; sinon les miens, dont la Vitrine ne montre que
    /// ce qui est public (nom, pseudo, bio, langues).
    private var shown: MeeshyUser { model.preview.profile?.user ?? user }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                hero
                VitrineCransSection(crans: model.crans, current: model.level, accentColor: accentColor,
                                    onSelect: { level in model.select(level) })
                if let voice = Self.publicVoice(of: shown) {
                    ProfileVoiceSection(sample: voice, accentColor: accentColor)
                }
                publicationsSection
                lockedSection
                ladderSection
                linkFooter
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.xxxl)
            .meeshyMotion(.morph, value: model.level)
        }
        .safeAreaInset(edge: .top, spacing: 0) { header }
        .background(theme.backgroundGradient.ignoresSafeArea())
        .task { model.start() }
        .task { publications = await Self.cachedPublications(of: user.id) }
        .task(id: linkCopied) {
            guard linkCopied else { return }
            _ = await cancellableSleep(for: .seconds(2))
            linkCopied = false
        }
    }

    // MARK: - En-tête

    private var header: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            ProfileNoveltyReader(feature: .vitrinePreview, accountId: user.id) { badge in
                HStack(spacing: MeeshySpacing.sm) {
                    MeeshyGlassButton(systemImage: "xmark", label: VitrineSeenAsCopy.close, action: { dismiss() })
                    Text(VitrineSeenAsCopy.title)
                        .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                        .foregroundStyle(theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    if let badge { ProfileNoveltyTag(text: badge, tint: accent) }
                    Spacer(minLength: 0)
                }
            }
            // L'en-tête épinglé ne défile pas : l'échelle y reste une rangée, qui défile de côté plutôt que de
            // s'empiler en six rangées et de manger l'aperçu.
            ViewThatFits(in: .horizontal) {
                circlePicker(form: .dots).frame(maxWidth: .infinity)
                ScrollView(.horizontal, showsIndicators: false) { circlePicker(form: .dots) }
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .meeshyGlass(in: Rectangle(), density: .dense)
    }

    /// Les six cercles d'une rangée (K33 `dots`), jamais des noms écrasés.
    private func circlePicker(form: MeeshyCircleScaleForm) -> some View {
        MeeshyCircleScale(
            levels: Self.levels,
            current: RelationLevel.allCases.firstIndex(of: model.level),
            tint: accent,
            form: form,
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
            if let city = Self.seenCity(of: user, by: model.level) {
                Text(city)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
                    .accessibilityIdentifier("profile.seenAs.city")
            }
            if let bio = shown.bio, !bio.isEmpty {
                Text(bio)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
                    .foregroundStyle(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ProfileLanguageChips(languages: Self.shownLanguages(of: model.preview, owner: user))
        }
    }

    /// Ma ville telle que CE cercle la lit (#19388) : lue de MON réglage, jamais de la fiche servie ni projetée — une
    /// projection porte ma fiche entière, et un serveur d'avant #19164 pourrait la servir à tort.
    static func seenCity(of owner: MeeshyUser, by level: RelationLevel) -> String? {
        ProfileCity.seen(city: owner.city, circle: owner.cityCircle, by: level)
    }

    /// Les langues que CE cercle lit : la liste servie quand le serveur a servi sa fiche (elle ne porte plus les trois
    /// rangs), mes trois rangs en projection — jamais des pastilles qui disparaissent quand la réponse arrive.
    static func shownLanguages(of preview: VitrinePreview, owner: MeeshyUser) -> ProfilePrismLanguages {
        guard preview.source == .served, let served = preview.profile else {
            return ProfilePrismLanguages(system: owner.systemLanguage ?? "", regional: owner.regionalLanguage ?? "",
                                         custom: owner.customDestinationLanguage ?? "")
        }
        let ranked = served.languages
        func rank(_ index: Int) -> String { ranked.indices.contains(index) ? ranked[index] : "" }
        return ProfilePrismLanguages(system: rank(0), regional: rank(1), custom: rank(2))
    }

    /// Ce que CE cercle voit de mes publications : la visibilité déclarée de chacune, lue fail-closed — une audience
    /// choisie (ONLY, EXCEPT), privée ou absente n'est montrée à aucun cercle.
    static func visiblePublications(_ posts: [FeedPost], to level: RelationLevel) -> [FeedPost] {
        posts.filter { post in
            guard let floor = audienceFloor(of: post.visibility) else { return false }
            return level >= floor
        }
    }

    static func audienceFloor(of visibility: String?) -> RelationLevel? {
        switch PostVisibility(rawValue: (visibility ?? "").uppercased()) {
        case .public: return .public
        case .community: return .community
        case .acquaintances: return .acquaintance
        case .friends: return .friend
        case .close: return .close
        case .blood: return .blood
        case .except, .only, .private, .none: return nil
        }
    }

    private static func cachedPublications(of userId: String) async -> [FeedPost] {
        await CacheCoordinator.shared.feed.loadIgnoringExpiry(for: "user:\(userId)")?.items ?? []
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

    // MARK: - Publications

    /// « Publications » entre « Ma voix » et « Masqué à ce niveau » (planche `Moi-Apercu`) : les trois dernières que CE
    /// cercle voit, dans la grille du kit (K49), sous-titrées de leur nombre ; rien de visible ⇒ la section se tait.
    @ViewBuilder
    private var publicationsSection: some View {
        let visible = Self.visiblePublications(publications, to: model.level)
        if !visible.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                MeeshySectionHeader(title: ProfilePublicationsCopy.title, lead: { EmptyView() }, accessory: {
                    Text(VitrineSeenAsCopy.publicationsCount(visible.count))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                })
                MeeshyMediaGrid(label: ProfilePublicationsCopy.title,
                                items: visible.prefix(ProfilePublicationTiles.limit).map(ProfilePublicationTiles.item(for:)),
                                layout: .row, columns: 3, shape: .tall, tint: accent,
                                onOpen: { _ in },
                                content: { item, size in publicationThumbnail(item, in: visible, size: size) })
            }
            .meeshyTransition(.opacity)
            .accessibilityIdentifier("profile.seenAs.publications")
        }
    }

    private func publicationThumbnail(_ item: MeeshyMediaGridItem, in posts: [FeedPost], size: CGSize) -> some View {
        let post = posts.first { $0.id == item.id }
        return CachedAsyncImage(url: post.flatMap { ProfilePublicationTiles.thumbnail(of: $0) }, targetSize: size,
                                thumbHash: post?.media.first?.thumbHash, showsStatusOverlays: false) {
            accent.opacity(MeeshyOpacity.light)
        }
        .scaledToFill()
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
                if let count = Self.ladderCount(of: step.level, in: circleSummary) {
                    Text(count.formatted(.number.locale(locale)))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundStyle(theme.textMuted)
                }
                if isCurrent {
                    MeeshyBadge(.label(VitrineSeenAsCopy.youAreHere), surface: .solid, kind: .accent, tint: accent, size: .s18)
                }
            },
            trailing: { MeeshyToggleRowNoSlot() }
        )
        .opacity(VitrineLadder.isReached(step.level, seenAs: model.level) ? 1 : MeeshyOpacity.strong)
    }

    /// Les personnes d'un cercle, quand « Mes cercles » les a servies ; le Public n'en a pas.
    static func ladderCount(of level: RelationLevel, in summary: ProfileCirclesSummary?) -> Int? {
        guard let summary, ProfileCirclesSummary.levels.contains(level) else { return nil }
        return summary.count(of: level)
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
