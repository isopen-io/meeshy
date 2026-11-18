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
    @Binding var linked: Bool
    @State private var showsOurCircle = false

    init(userId: String, displayName: String, linked: Binding<Bool> = .constant(false)) {
        _viewModel = StateObject(wrappedValue: ProfileCircleModels.model(for: userId))
        self.displayName = displayName
        _linked = linked
    }

    var body: some View {
        Group {
            if let level = viewModel.shownLevel {
                MeeshyButton(
                    CircleLevelNames.title(of: level),
                    systemImage: filledCircleGlyph(level),
                    kind: .accent,
                    size: .s44,
                    tint: CircleLevelColor.color(for: level),
                    action: { showsOurCircle = true },
                    trailing: { Image(systemName: "chevron.down") }
                )
                .accessibilityLabel([OurCircleCopy.scaleLabel, CircleLevelNames.title(of: level)].joined(separator: ", "))
                .transition(.opacity)
            }
        }
        .meeshyMotion(.morph, value: viewModel.shownLevel)
        .task(id: viewModel.userId) { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.claimsTheSlot, initial: true) { _, claims in linked = claims }
        .sheet(isPresented: $showsOurCircle) {
            OurCircleSheet(viewModel: viewModel, displayName: displayName)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
    }
}

// MARK: - « Notre cercle » (planche `Autre-Cercle`)

/// Le lien vu des deux côtés : l'orbite des six cercles (K33) allume le commun et trace mon accord en pointillé, puis
/// ce que chacun accorde, ce que le commun ouvre, ce que le cran suivant ajouterait (K37, sans aucune donnée derrière)
/// et ce qui manque. En bas, monter et descendre d'un cran — les mêmes gestes que la fiche, optimistes et confirmés.
struct OurCircleSheet: View {
    @ObservedObject var viewModel: ProfileCircleViewModel
    let displayName: String
    @Environment(\.dismiss) private var dismiss
    @State private var confirmedLowering: ProfileCircleLowering?
    private var theme: ThemeManager { ThemeManager.shared }
    private var myName: String {
        AuthManager.shared.currentUser.map { $0.displayName ?? $0.username } ?? ""
    }

    var body: some View {
        ScrollView {
            if let summary = viewModel.ourCircle {
                VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                    orbit(summary)
                    sides(summary)
                    opened(summary)
                    nextOpens(summary)
                    missing(summary)
                    ProfileCircleProposalCard(viewModel: viewModel, displayName: displayName)
                    actions(summary)
                }
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.bottom, MeeshySpacing.xxl)
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
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                .foregroundStyle(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            MeeshyGlassButton(systemImage: "xmark", label: OurCircleCopy.close, action: { dismiss() })
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
    }

    private func orbit(_ summary: OurCircleSummary) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            MeeshyCircleScale(
                levels: VitrineSeenAsView.levels,
                current: RelationLevel.allCases.firstIndex(of: summary.common),
                other: summary.mine > summary.common ? RelationLevel.allCases.firstIndex(of: summary.mine) : nil,
                tint: CircleLevelColor.color(for: summary.common),
                form: .rings,
                label: OurCircleCopy.scaleLabel
            )
            .frame(maxWidth: .infinity)
            VStack(spacing: MeeshySpacing.xs) {
                Text(OurCircleCopy.common(summary.common, since: summary.since))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .foregroundStyle(theme.textPrimary)
                Text(OurCircleCopy.lowestOfBoth)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundStyle(theme.textSecondary)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .accessibilityElement(children: .combine)
        }
    }

    private func sides(_ summary: OurCircleSummary) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: MeeshySpacing.sm) { sideCards(summary) }
            VStack(spacing: MeeshySpacing.sm) { sideCards(summary) }
        }
    }

    @ViewBuilder
    private func sideCards(_ summary: OurCircleSummary) -> some View {
        sideCard(OurCircleSide(person: displayName, avatarURL: nil, caption: OurCircleCopy.theirSide(name: displayName),
                               value: OurCircleCopy.grant(summary.theirs), level: summary.theirs.level))
        sideCard(OurCircleSide(person: myName, avatarURL: AuthManager.shared.currentUser?.avatar,
                               caption: OurCircleCopy.mySide, value: CircleLevelNames.title(of: summary.mine),
                               level: summary.mine))
    }

    /// Une carte K43 par côté (planche `Autre-Cercle`) : l'avatar de qui accorde, ce qu'il accorde, le cercle en K45.
    private func sideCard(_ side: OurCircleSide) -> some View {
        let tint = CircleLevelColor.color(for: side.level)
        return MeeshyGroupCard(surface: .accent, tint: tint) {
            HStack(spacing: MeeshySpacing.sm) {
                MeeshyAvatar(name: side.person, context: .postComment,
                             accentColor: DynamicColorGenerator.colorForName(side.person), avatarURL: side.avatarURL)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(side.caption)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundStyle(theme.textSecondary)
                    Text(side.value)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                        .foregroundStyle(theme.textPrimary)
                }
                Spacer(minLength: 0)
                MeeshyMedallion(systemImage: filledCircleGlyph(side.level), tint: tint, size: .s24)
            }
            .padding(.horizontal, CGFloat(MeeshyGroupCardRecipe.dividerInset))
            .accessibilityElement(children: .combine)
        }
    }

    @ViewBuilder
    private func opened(_ summary: OurCircleSummary) -> some View {
        if !summary.opened.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                MeeshySectionHeader(title: OurCircleCopy.opens(summary.common), form: .overline, size: .sheet)
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: MeeshySpacing.sm)], spacing: MeeshySpacing.sm) {
                    ForEach(summary.opened, id: \.self) { feature in
                        openedTile(feature, tint: CircleLevelColor.color(for: summary.common))
                    }
                }
            }
        }
    }

    /// Une tuile de ce que le commun ouvre : le glyphe en médaillon K45, le nom, dans une carte K43.
    private func openedTile(_ feature: RelationCapability, tint: Color) -> some View {
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

    @ViewBuilder
    private func nextOpens(_ summary: OurCircleSummary) -> some View {
        if let next = summary.next, !summary.nextOpens.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                MeeshySectionHeader(title: OurCircleCopy.nextAdds(next), form: .overline, size: .sheet)
                ForEach(summary.nextOpens, id: \.self) { feature in
                    MeeshyLockedRow(
                        title: feature.title,
                        requirement: ProfileRelationLockedGroup.requirement(opensAt: next),
                        systemImage: feature.systemImage,
                        tint: CircleLevelColor.color(for: next)
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func missing(_ summary: OurCircleSummary) -> some View {
        if let missing = summary.missing {
            let level = summary.next ?? summary.common
            MeeshyNote(OurCircleCopy.missing(missing, name: displayName),
                       lead: .systemImage(VitrineSeenAsCopy.glyph(of: level)),
                       tint: CircleLevelColor.color(for: level))
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
                    width: .fill,
                    tint: CircleLevelColor.color(for: target),
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
            kind: .outline,
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

/// Un côté du lien dans « Notre cercle » : qui accorde, et quoi.
private struct OurCircleSide {
    let person: String
    let avatarURL: String?
    let caption: String
    let value: String
    let level: RelationLevel
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
