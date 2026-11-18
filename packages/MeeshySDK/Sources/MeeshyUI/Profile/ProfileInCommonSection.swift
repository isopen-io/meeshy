import SwiftUI
import MeeshySDK

/// « En commun » sur la Vitrine de l'autre (#19377, planche `Autre-Commun`) : le résumé, nos conversations, puis nos
/// communautés (K43), nos amis (K48 puis K39), nos médias (K04 + K49, un vocal par K35), notre histoire (K53) et, pour
/// chaque partie que le cercle commun n'ouvre pas, une rangée verrouillée (K37) sans nombre ni nom. Rien en commun :
/// le bloc d'état du kit (K38, planche `Etat-Vide` § 6). Sans donnée servie ni en cache, seules les conversations.
struct ProfileInCommonSection<Conversations: View>: View {
    let userId: String?
    let source: any ProfileInCommonLoading
    let conversationCount: Int
    let isLoadingConversations: Bool
    let tint: Color
    let accentHex: String
    let onFirstMessage: (() -> Void)?
    let onOpenImage: (String) -> Void
    private let conversations: Conversations

    @StateObject private var model = ProfileInCommonModel()
    @ResolvedThemePalette private var theme

    init(userId: String?, source: any ProfileInCommonLoading, conversationCount: Int, isLoadingConversations: Bool,
         tint: Color, accentHex: String,
         onFirstMessage: (() -> Void)?, onOpenImage: @escaping (String) -> Void,
         @ViewBuilder conversations: () -> Conversations) {
        self.userId = userId
        self.source = source
        self.conversationCount = conversationCount
        self.isLoadingConversations = isLoadingConversations
        self.tint = tint
        self.accentHex = accentHex
        self.onFirstMessage = onFirstMessage
        self.onOpenImage = onOpenImage
        self.conversations = conversations()
    }

    var body: some View {
        let digest = model.digest(conversations: conversationCount)
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            header(digest)
            if let digest, digest.isNothingInCommon, !isLoadingConversations {
                nothingInCommon(digest)
            } else {
                conversations
                if let digest {
                    ProfileInCommonParts(digest: digest, model: model, userId: userId ?? "", source: source,
                                         tint: tint, accentHex: accentHex, onOpenImage: onOpenImage)
                }
            }
        }
        .task(id: userId) {
            guard let userId, !userId.isEmpty else { return }
            await model.open(userId: userId, using: source)
        }
        .accessibilityIdentifier("profile.inCommon")
    }

    private func header(_ digest: ProfileInCommonDigest?) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            MeeshySectionHeader(
                title: String(localized: "profile.relation.section.common", defaultValue: "En commun", bundle: .module)
            )
            if let summary = digest.flatMap({ ProfileInCommonCopy.summary($0.figures) }) {
                Text(summary)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("profile.inCommon.summary")
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
    }

    /// Rien en commun : trois tuiles fantômes, la phrase, et écrire le premier message quand c'est possible.
    private func nothingInCommon(_ digest: ProfileInCommonDigest) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshyStateBlock(
                kind: .empty,
                title: ProfileInCommonCopy.nothingInCommon,
                primary: onFirstMessage.map { open in
                    MeeshyStateBlockAction(title: ProfileInCommonCopy.firstMessage, systemImage: "bubble.left") { open() }
                },
                art: .ghost(.tile, count: 3),
                tint: tint
            )
            ProfileInCommonLockedRows(locked: digest.locked, tint: tint)
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .accessibilityIdentifier("profile.inCommon.empty")
    }
}

/// Les parties servies, dans l'ordre de la planche.
private struct ProfileInCommonParts: View {
    let digest: ProfileInCommonDigest
    @ObservedObject var model: ProfileInCommonModel
    let userId: String
    let source: any ProfileInCommonLoading
    let tint: Color
    let accentHex: String
    let onOpenImage: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            if !digest.communities.isEmpty {
                ProfileInCommonCommunities(communities: digest.communities, total: digest.communitiesTotal,
                                           accentHex: accentHex)
            }
            if !digest.friends.isEmpty {
                ProfileInCommonFriends(digest: digest, tint: tint, accentHex: accentHex)
            }
            if let kind = model.shownFilter(in: digest) {
                ProfileInCommonMedia(
                    digest: digest, kind: kind, items: model.media(of: kind, in: digest), tint: tint,
                    onSelect: { chosen in Task { await model.select(chosen, userId: userId, using: source) } },
                    onOpenImage: onOpenImage
                )
            }
            if !digest.history.isEmpty {
                ProfileInCommonHistory(steps: digest.history, tint: tint)
            }
            if !digest.locked.isEmpty {
                ProfileInCommonLockedRows(locked: digest.locked, tint: tint)
                    .padding(.horizontal, MeeshySpacing.xl)
            }
        }
    }
}

/// Ce que le cercle commun n'ouvre pas d'« En commun » : le nom de la partie et le cercle qui l'ouvre. Jamais un nombre,
/// jamais un nom de communauté, d'ami ou de fichier.
struct ProfileInCommonLockedRows: View {
    let locked: [ProfileInCommonDigest.LockedPart]
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            ForEach(locked, id: \.part) { item in
                MeeshyLockedRow(
                    title: ProfileInCommonCopy.lockedTitle(item.part),
                    requirement: ProfileRelationLockedGroup.requirement(opensAt: item.opensAt),
                    systemImage: ProfileInCommonCopy.lockedGlyph(item.part),
                    tint: tint
                )
                .accessibilityIdentifier("profile.inCommon.locked.\(item.part.rawValue)")
            }
        }
    }
}
