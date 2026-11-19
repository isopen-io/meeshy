import SwiftUI
import MeeshySDK

/// Nos communautés en commun : une carte du kit (K43) par communauté, en rangée qui défile.
struct ProfileInCommonCommunities: View {
    let communities: [InCommonCommunity]
    let total: Int
    let accentHex: String

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileInCommonCopy.communities, count: total)
                .padding(.horizontal, MeeshySpacing.xl)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.md) {
                    ForEach(communities) { community in
                        card(community)
                    }
                }
                .padding(.horizontal, MeeshySpacing.xl)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.inCommon.communities")
    }

    private func card(_ community: InCommonCommunity) -> some View {
        MeeshyGroupCard(label: community.name) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                MeeshyAvatar(name: community.name, context: .custom(44), kind: .entity, accentColor: accentHex,
                             avatarURL: community.avatar, enablePulse: false, isDark: colorScheme == .dark)
                    .accessibilityHidden(true)
                Text(community.name)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .lineLimit(2)
                if let memberCount = community.memberCount {
                    Text(ProfileInCommonCopy.members(memberCount))
                        .font(MeeshyFont.relative(MeeshyFont.captionSize))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 132, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

/// Nos amis en commun : la pile du kit (K48) qui les résume, puis une rangée (K39) par ami avec le cercle que JE lui
/// accorde. Aucune présence : ce n'est pas la fiche d'un ami qui dit qui est en ligne.
struct ProfileInCommonFriends: View {
    let digest: ProfileInCommonDigest
    let tint: Color
    let accentHex: String

    static let shownRows = 3

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let lead = digest.friendLead
        let sentence = ProfileInCommonCopy.friendLead(names: lead.names, others: lead.others)
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileInCommonCopy.friends, count: digest.friendsTotal)
            MeeshyAvatarGroup(count: digest.friendsTotal, layout: .stack, size: .s40, max: 4, summary: sentence,
                              label: ProfileInCommonCopy.friends, tint: tint, breathes: false) { index, diameter in
                avatar(at: index, diameter: diameter)
            }
            MeeshyGroupCard {
                MeeshyGroupCardRows(Array(digest.friends.prefix(Self.shownRows))) { friend in
                    row(friend)
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.inCommon.friends")
    }

    @ViewBuilder
    private func avatar(at index: Int, diameter: CGFloat) -> some View {
        let friend = index < digest.friends.count ? digest.friends[index] : nil
        MeeshyAvatar(name: friend?.shownName ?? "", context: .custom(diameter), accentColor: accentHex,
                     avatarURL: friend?.avatar, enablePulse: false, isDark: colorScheme == .dark)
    }

    private func row(_ friend: InCommonFriend) -> some View {
        MeeshyPersonRow(title: friend.shownName,
                        subtitle: "@\(friend.username)",
                        levelImage: friend.level.map { ProfileInCommonCopy.circleGlyph($0) },
                        levelLabel: friend.level.map { ProfileInCommonCopy.circle($0) },
                        showsDivider: false) {
            MeeshyAvatar(name: friend.shownName, context: .custom(40), accentColor: accentHex,
                         avatarURL: friend.avatar, enablePulse: false, isDark: colorScheme == .dark)
        }
    }
}

/// « Notre histoire » : les jalons datés du kit (K53, forme jalons), du premier message au dernier passage.
struct ProfileInCommonHistory: View {
    let steps: [ProfileInCommonDigest.HistoryStep]
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileInCommonCopy.history)
            MeeshyStepper(value: steps.count - 1, range: 0...(steps.count - 1), label: ProfileInCommonCopy.history,
                          kind: .milestones, stops: stops, tint: tint)
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .accessibilityIdentifier("profile.inCommon.history")
    }

    private var stops: [MeeshyStepperStop] {
        steps.map { step in
            MeeshyStepperStop(id: step.kind.rawValue, title: ProfileInCommonCopy.historyTitle(step.kind),
                              caption: ProfileInCommonCopy.historyDate(step.date),
                              systemImage: ProfileInCommonCopy.historyGlyph(step.kind))
        }
    }
}
