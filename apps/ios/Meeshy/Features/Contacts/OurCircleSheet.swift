import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La pilule de relation sous le nom (#18870, loi 3)

/// Le glyphe plein d'un cercle (brief § 4) ; le globe du Public n'a pas de variante pleine.
private func filledCircleGlyph(_ level: RelationLevel) -> String {
    level == .public ? VitrineSeenAsCopy.glyph(of: level) : VitrineSeenAsCopy.glyph(of: level) + ".fill"
}

/// « 🔥 Proche ▾ » sous le nom de l'autre : le cercle COMMUN (le plus bas des deux accords), en bouton accent du kit
/// (K40), qui ouvre « Notre cercle ». Rien tant qu'aucun lien d'au moins Connaissance n'est servi : la pilule n'invente
/// aucun niveau. Cache d'abord : le même store que « Mes cercles » la peint avant le réseau.
struct ProfileRelationPillView: View {
    @StateObject private var viewModel: ProfileCircleViewModel
    let displayName: String
    /// Le lien montré, publié à la fiche depuis l'en-tête — toujours monté, quelle que soit la face lue (#18857) : la
    /// Vitrine sait dès le cache qu'écrire n'est plus une demande.
    @Binding var standing: ProfileRelationStanding
    @State private var showsOurCircle = false
    /// L'accent de la fiche ouverte (#19674) : la pilule et « Notre cercle » prennent la couleur de la personne, comme
    /// la planche `Autre-Cercle` ; hors d'une fiche, la couleur du cercle.
    @Environment(\.meeshyProfileAccent) private var profileAccent

    init(userId: String, displayName: String, standing: Binding<ProfileRelationStanding> = .constant(.unresolved)) {
        _viewModel = StateObject(wrappedValue: ProfileCircleModels.model(for: userId))
        self.displayName = displayName
        _standing = standing
    }

    var body: some View {
        Group {
            if let level = viewModel.shownLevel {
                MeeshyButton(
                    CircleLevelNames.title(of: level),
                    systemImage: filledCircleGlyph(level),
                    kind: .accent,
                    size: .s44,
                    tint: OurCircleTint.person(profileAccent, level: level),
                    action: { showsOurCircle = true },
                    trailing: { Image(systemName: "chevron.down") }
                )
                .accessibilityLabel([OurCircleCopy.scaleLabel, CircleLevelNames.title(of: level)].joined(separator: ", "))
                .transition(.opacity)
            }
        }
        .meeshyMotion(.morph, value: viewModel.shownLevel)
        .task(id: viewModel.userId) { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.standing, initial: true) { _, read in standing = read }
        .sheet(isPresented: $showsOurCircle) {
            OurCircleSheet(viewModel: viewModel, displayName: displayName, accentHex: profileAccent)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }
}

// MARK: - « Notre cercle » (planche `Autre-Cercle`)

/// Le lien vu des deux côtés (planche `Autre-Cercle`) : l'orbite des six cercles (K33) dans le halo de la personne, moi
/// au centre et elle sur le cercle commun ; « Vous êtes Proches depuis… » ; les deux accords en crans, chacun à la
/// couleur de qui l'accorde ; ce que le commun ouvre ; ce que le cran suivant ajouterait, en pointillé, sans aucune
/// donnée derrière ; ce qui manque. En bas, monter et descendre d'un cran — les mêmes gestes que la fiche, optimistes et
/// confirmés. Les couleurs sont celles des PERSONNES (leur accent de profil), jamais une couleur par cercle.
struct OurCircleSheet: View {
    @ObservedObject var viewModel: ProfileCircleViewModel
    let displayName: String
    /// L'accent de profil de la personne (hex) ; `nil` hors d'une fiche : la couleur du cercle commun.
    var accentHex: String? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var confirmedLowering: ProfileCircleLowering?
    private var theme: ThemeManager { ThemeManager.shared }
    private var me: MeeshyUser? { AuthManager.shared.currentUser }
    private var myName: String {
        me.map { $0.displayName ?? $0.username } ?? ""
    }
    private var myAccentHex: String {
        ProfileAccent.hex(chosen: me?.profileAccentColor, userId: me?.id, name: myName)
    }
    private func theirTint(_ summary: OurCircleSummary) -> Color {
        OurCircleTint.person(accentHex, level: summary.common)
    }
    private func myTint(_ summary: OurCircleSummary) -> Color {
        OurCircleTint.person(myAccentHex, level: summary.mine)
    }

    var body: some View {
        ScrollView {
            if let summary = viewModel.ourCircle {
                VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                    orbit(summary)
                    headline(summary)
                    OurCircleGrantBars(summary: summary, theirName: displayName, myName: myName,
                                       theirAccentHex: accentHex, myAccentHex: myAccentHex, myAvatarURL: me?.avatar,
                                       theirTint: theirTint(summary), myTint: myTint(summary))
                        .meeshyCascade(rank: 2)
                    opened(summary)
                    nextOpens(summary)
                    missing(summary)
                    ProfileCircleProposalCard(viewModel: viewModel, displayName: displayName)
                    actions(summary)
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.bottom, MeeshySpacing.xxl)
                .meeshyCascadeFace()
            }
        }
        .safeAreaInset(edge: .top) { header }
        .background(theme.backgroundPrimary)
        .adaptiveOnChange(of: viewModel.didUnlink) { _, unlinked in
            if unlinked { dismiss() }
        }
    }

    private var header: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Text(OurCircleCopy.title(name: displayName))
                .font(MeeshyFont.relative(MeeshyFont.displaySize, weight: .bold))
                .foregroundStyle(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            MeeshyGlassButton(systemImage: "xmark", label: OurCircleCopy.close, action: { dismiss() })
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
    }

    /// L'orbite K33 dans le halo de la personne : moi au centre, elle posée sur notre cercle commun.
    private func orbit(_ summary: OurCircleSummary) -> some View {
        let tint = theirTint(summary)
        return MeeshyCircleScale(
            levels: VitrineSeenAsView.levels,
            current: RelationLevel.allCases.firstIndex(of: summary.common),
            other: summary.mine > summary.common ? RelationLevel.allCases.firstIndex(of: summary.mine) : nil,
            tint: tint,
            otherTint: myTint(summary),
            form: .rings,
            label: OurCircleCopy.scaleLabel,
            center: {
                MeeshyAvatar(name: myName, context: .custom(OurCircleGrantBars.centerAvatar),
                             accentColor: myAccentHex, avatarURL: me?.avatar)
            },
            marker: {
                MeeshyAvatar(name: displayName, context: .custom(OurCircleGrantBars.markerAvatar),
                             accentColor: accentHex ?? DynamicColorGenerator.colorForName(displayName))
            }
        )
        .frame(maxWidth: .infinity)
        .background(
            RadialGradient(colors: [tint.opacity(MeeshyOpacity.medium), .clear], center: .center,
                           startRadius: 0, endRadius: OurCircleGrantBars.glowRadius)
                .accessibilityHidden(true)
        )
        .meeshyCascade(rank: 0)
    }

    /// « Vous êtes Proches depuis le 19 mars » : le cercle commun dit à la couleur de la personne, puis la règle.
    private func headline(_ summary: OurCircleSummary) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(OurCircleCopy.commonHeadline(summary.common, since: summary.since, tint: theirTint(summary)))
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                .foregroundStyle(theme.textPrimary)
            Text(OurCircleCopy.lowestOfBoth)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundStyle(theme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .meeshyCascade(rank: 1)
    }

    @ViewBuilder
    private func opened(_ summary: OurCircleSummary) -> some View {
        if !summary.opened.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                MeeshySectionHeader(title: OurCircleCopy.opens(summary.common), size: .sheet)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: MeeshySpacing.sm), GridItem(.flexible(), spacing: MeeshySpacing.sm)],
                          spacing: MeeshySpacing.sm) {
                    ForEach(summary.opened, id: \.self) { feature in
                        openedTile(feature, tint: theirTint(summary))
                    }
                }
            }
            .meeshyCascade(rank: 3)
        }
    }

    /// Une tuile de ce que le commun ouvre : le glyphe en médaillon K45, le nom, dans une carte K43.
    private func openedTile(_ feature: OurCircleFeature, tint: Color) -> some View {
        MeeshyGroupCard {
            HStack(spacing: MeeshySpacing.sm) {
                MeeshyMedallion(systemImage: feature.systemImage, tint: tint, size: .s36)
                Text(feature.title)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, MeeshySpacing.md)
            .accessibilityElement(children: .combine)
        }
    }

    /// « 🔒 Avec Sang, en plus » : les noms de ce que le cran suivant ajouterait, en pointillé, sans aucune donnée.
    @ViewBuilder
    private func nextOpens(_ summary: OurCircleSummary) -> some View {
        if let next = summary.next, !summary.nextOpens.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                Label(OurCircleCopy.nextAdds(next), systemImage: "lock")
                    .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                    .foregroundStyle(theme.textMuted)
                    .accessibilityAddTraits(.isHeader)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(summary.nextOpens, id: \.self) { feature in
                        Label(feature.title, systemImage: "lock")
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                            .foregroundStyle(theme.textSecondary)
                            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget, alignment: .leading)
                    }
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.vertical, MeeshySpacing.xs)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                        .stroke(theme.textMuted.opacity(MeeshyOpacity.strong),
                                style: StrokeStyle(lineWidth: MeeshyBorder.emphasis, dash: [5, 4]))
                )
                .accessibilityElement(children: .combine)
            }
            .meeshyCascade(rank: 4)
        }
    }

    @ViewBuilder
    private func missing(_ summary: OurCircleSummary) -> some View {
        if let missing = summary.missing {
            let level = summary.next ?? summary.common
            Label(OurCircleCopy.missing(missing, name: displayName), systemImage: VitrineSeenAsCopy.glyph(of: level))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            if let progress = viewModel.summary {
                Text(progress)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundStyle(theme.textSecondary)
            }
        }
    }

    @ViewBuilder
    private func actions(_ summary: OurCircleSummary) -> some View {
        VStack(spacing: MeeshySpacing.sm) {
            if let target = viewModel.offeredRaise, let label = ProfileCircleWording.promote(to: target) {
                MeeshyButton(
                    label,
                    systemImage: VitrineSeenAsCopy.glyph(of: target),
                    kind: .accent,
                    size: .s56,
                    width: .fill,
                    tint: theirTint(summary),
                    action: { Task { await viewModel.requestRaise() } }
                )
                .accessibilityHint(ProfileCircleWording.promoteAccessibility(to: target, name: displayName) ?? label)
            }
            if let failed = viewModel.failedRaise, viewModel.pendingLevel == nil {
                MeeshyNote(OurCircleCopy.raiseFailed(failed), form: .band, kind: .warn, announces: true) {
                    MeeshyButton(OurCircleCopy.retry, systemImage: "arrow.clockwise", kind: .outline, size: .s44,
                                 action: { Task { await viewModel.requestRaise() } })
                }
                .accessibilityIdentifier("circles.ours.raiseFailed")
            }
            if !viewModel.offeredLowerings.isEmpty {
                ForEach(viewModel.offeredLowerings, id: \.self) { lowering in
                    loweringButton(lowering, from: summary.common)
                }
                Text(OurCircleCopy.silentLowering(name: displayName))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundStyle(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private func loweringButton(_ lowering: ProfileCircleLowering, from level: RelationLevel) -> some View {
        MeeshyButton(
            lowering.label,
            systemImage: lowering == .unlink ? "person.crop.circle.badge.xmark" : "arrow.down.circle",
            kind: lowering == .unlink ? .danger : .outline,
            width: .fill,
            isDestructive: lowering == .unlink,
            isPending: viewModel.isLowering,
            action: { confirmedLowering = lowering }
        )
        .confirmationDialog(lowering.confirmationTitle(name: displayName), isPresented: confirms(lowering),
                            titleVisibility: .visible) {
            Button(lowering.label, role: .destructive) {
                Task { await viewModel.lower(lowering) }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: {
            Text(lowering.confirmationBody(name: displayName, from: level))
        }
    }

    /// Chaque geste de baisse a SA confirmation : une seule s'ouvre, celle du bouton touché.
    private func confirms(_ lowering: ProfileCircleLowering) -> Binding<Bool> {
        Binding(
            get: { confirmedLowering == lowering },
            set: { if !$0 { confirmedLowering = nil } }
        )
    }
}


// MARK: - Les mots de « Notre cercle »

nonisolated enum OurCircleCopy {
    static var close: String {
        String(localized: "common.close", defaultValue: "Fermer", bundle: .main)
    }

    static var scaleLabel: String {
        String(localized: "circles.ours.scale", defaultValue: "Notre cercle", bundle: .main)
    }

    static var lowestOfBoth: String {
        String(localized: "circles.ours.lowest", defaultValue: "Votre niveau commun est le plus bas des deux.", bundle: .main)
    }

    static var mySide: String {
        String(localized: "circles.ours.mySide", defaultValue: "Tu lui accordes", bundle: .main)
    }

    static func title(name: String) -> String {
        String(format: String(localized: "circles.ours.title", defaultValue: "%@ et toi", bundle: .main), name)
    }

    static func common(_ level: RelationLevel, since: Date?) -> String {
        let title = CircleLevelNames.title(of: level)
        guard let since else {
            return String(format: String(localized: "circles.ours.common", defaultValue: "Votre cercle commun : %@", bundle: .main), title)
        }
        let day = since.formatted(.dateTime.day().month(.wide))
        return String(format: String(localized: "circles.ours.commonSince", defaultValue: "Votre cercle commun : %1$@, depuis le %2$@", bundle: .main), title, day)
    }

    /// La phrase du cercle commun, son nom de cercle mis à la couleur de la personne (planche `Autre-Cercle`).
    static func commonHeadline(_ level: RelationLevel, since: Date?, tint: Color) -> AttributedString {
        var headline = AttributedString(common(level, since: since))
        if let range = headline.range(of: CircleLevelNames.title(of: level)) {
            headline[range].foregroundColor = tint
        }
        return headline
    }

    static func theirSide(name: String) -> String {
        String(format: String(localized: "circles.ours.theirSide", defaultValue: "%@ t'accorde", bundle: .main), name)
    }

    static func grant(_ grant: OurCircleTheirGrant) -> String {
        switch grant {
        case .exactly(let level):
            return CircleLevelNames.title(of: level)
        case .atLeast(let level):
            return String(format: String(localized: "circles.ours.atLeast", defaultValue: "Au moins %@", bundle: .main), CircleLevelNames.title(of: level))
        }
    }

    static func opens(_ level: RelationLevel) -> String {
        String(format: String(localized: "circles.ours.opens", defaultValue: "Ce que %@ vous ouvre", bundle: .main), CircleLevelNames.title(of: level))
    }

    static func nextAdds(_ level: RelationLevel) -> String {
        String(format: String(localized: "circles.ours.nextAdds", defaultValue: "Avec %@, en plus", bundle: .main), CircleLevelNames.title(of: level))
    }

    static func missing(_ missing: OurCircleMissing, name: String) -> String {
        switch missing {
        case .theirGrant(let level):
            return String(format: String(localized: "circles.ours.missing.theirs", defaultValue: "Il manque : que %1$@ t'accorde %2$@", bundle: .main), name, CircleLevelNames.title(of: level))
        case .bothChoose(let level):
            return String(format: String(localized: "circles.ours.missing.both", defaultValue: "Il manque : que vous choisissiez tous les deux %@", bundle: .main), CircleLevelNames.title(of: level))
        case .pending(let level):
            return String(format: String(localized: "circles.pending", defaultValue: "Demande envoyée · %@", bundle: .main), CircleLevelNames.title(of: level))
        }
    }

    static func raiseFailed(_ level: RelationLevel) -> String {
        String(format: String(localized: "circles.ours.raiseFailed", defaultValue: "Ta demande pour %@ n'est pas partie", bundle: .main), CircleLevelNames.title(of: level))
    }

    static var retry: String {
        String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main)
    }

    static func silentLowering(name: String) -> String {
        String(format: String(localized: "circles.ours.silent", defaultValue: "%@ n'est pas prévenu(e) si tu descends d'un niveau.", bundle: .main), name)
    }
}
