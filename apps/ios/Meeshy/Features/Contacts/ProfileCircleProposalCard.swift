import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Une proposition de cercle reçue (#19449, planche `Autre-Cercle`)

/// La demande de montée que CETTE personne m'a envoyée, au-dessus de notre cercle commun. Elle ne se lit que sur un
/// lien servi d'au moins Connaissance : sans lien, la demande de connexion garde la carte d'avant de la fiche. Pur.
nonisolated struct ProfileCircleProposal: Equatable, Sendable {
    let requestId: String
    let level: RelationLevel
    let avatar: String?
    /// Ce que le cercle proposé ajoute au commun, par la loi d'accès : rien n'est réécrit ici.
    let opens: [OurCircleFeature]

    static func received(in requests: [FriendRequest], from senderId: String, common: RelationLevel?,
                         setAside: Set<String>) -> ProfileCircleProposal? {
        guard let common else { return nil }
        let sender = senderId.lowercased()
        let match = requests.first { request in
            guard request.status == "pending", request.senderId.lowercased() == sender,
                  !setAside.contains(request.id), let level = request.requestedLevel else { return false }
            return level > common
        }
        guard let match, let level = match.requestedLevel else { return nil }
        return ProfileCircleProposal(requestId: match.id, level: level, avatar: match.sender?.avatar,
                                     opens: opens(from: common, to: level))
    }

    /// Du cran proposé vers le commun, ce que chaque cran ajoute — le plus haut d'abord, comme « Notre cercle ».
    static func opens(from common: RelationLevel, to level: RelationLevel) -> [OurCircleFeature] {
        RelationLevel.allCases.reversed()
            .filter { $0 > common && $0 <= level }
            .flatMap { OurCircleSummary.addedBy($0) }
    }
}

/// Ce que la carte rend à l'hôte : la réponse est partie, rien n'est parti, ou le Sang demande son rituel.
nonisolated enum ProfileCircleProposalAnswer: Equatable, Sendable {
    case answered
    case notSent
    case opensRitual(CircleRitualTarget)
}

// MARK: - La carte

/// « Léo te propose d'être Sang · Sang t'ouvrira : … · Accepter · Plus tard · Refuser », faite du kit : une carte
/// d'accent (K43) teintée du cercle proposé et ses boutons (K40). Elle lit le modèle partagé de la personne, sur la
/// face Actions comme dans « Notre cercle » : une réponse donnée d'un côté retire la carte des deux.
struct ProfileCircleProposalCard: View {
    @ObservedObject var viewModel: ProfileCircleViewModel
    let displayName: String
    @State private var ritual: CircleRitualTarget?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Group {
            if let proposal = viewModel.receivedProposal {
                card(proposal)
                    .transition(.opacity)
            }
        }
        .meeshyMotion(.morph, value: viewModel.receivedProposal)
        .sheet(item: $ritual) { target in
            BloodRitualView(target: target, onFinished: {
                ritual = nil
                Task { await viewModel.reload() }
            })
        }
    }

    private func card(_ proposal: ProfileCircleProposal) -> some View {
        let tint = CircleLevelColor.color(for: proposal.level)
        return MeeshyGroupCard(surface: .accent, layout: .prompt, tint: tint,
                               label: ProfileCircleProposalCopy.title(name: displayName, level: proposal.level)) {
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                header(proposal, tint: tint)
                actions(proposal, tint: tint)
            }
            .padding(.horizontal, MeeshySpacing.lg)
        }
        .accessibilityIdentifier("profile.circle.proposal")
    }

    private func header(_ proposal: ProfileCircleProposal, tint: Color) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            avatar(proposal, tint: tint)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(ProfileCircleProposalCopy.title(name: displayName, level: proposal.level))
                    .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                    .foregroundStyle(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if let opens = ProfileCircleProposalCopy.opens(level: proposal.level, features: proposal.opens) {
                    Text(opens)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private func avatar(_ proposal: ProfileCircleProposal, tint: Color) -> some View {
        MeeshyAvatar(name: displayName, context: .conversationList,
                     accentColor: DynamicColorGenerator.colorForName(displayName), avatarURL: proposal.avatar)
            .overlay(alignment: .bottomTrailing) {
                Image(systemName: VitrineSeenAsCopy.glyph(of: proposal.level) + ".fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .bold))
                    .foregroundStyle(theme.backgroundPrimary)
                    .frame(width: MeeshyControlSize.tapTarget * 0.6, height: MeeshyControlSize.tapTarget * 0.6)
                    .background(Circle().fill(tint))
                    .overlay(Circle().stroke(theme.backgroundPrimary, lineWidth: 2.5))
                    .offset(x: MeeshySpacing.xs, y: MeeshySpacing.xs)
            }
            .accessibilityHidden(true)
    }

    private func actions(_ proposal: ProfileCircleProposal, tint: Color) -> some View {
        let secondary = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: MeeshySpacing.sm))
            : AnyLayout(HStackLayout(spacing: MeeshySpacing.sm))
        return VStack(spacing: MeeshySpacing.sm) {
            MeeshyButton(ProfileCircleProposalCopy.accept, systemImage: VitrineSeenAsCopy.glyph(of: proposal.level),
                         kind: .accent, size: .s56, width: .fill, tint: tint,
                         action: { Task { await accept() } })
                .accessibilityHint(ProfileCircleProposalCopy.acceptHint(level: proposal.level))
            secondary {
                MeeshyButton(ProfileCircleProposalCopy.later, kind: .outline, width: .fill,
                             action: { viewModel.postponeProposal() })
                MeeshyButton(ProfileCircleProposalCopy.decline, kind: .outline, width: .fill, isDestructive: true,
                             action: { Task { await viewModel.declineProposal() } })
                    .accessibilityHint(ProfileCircleProposalCopy.declineHint(name: displayName))
            }
        }
    }

    private func accept() async {
        guard case .opensRitual(let target) = await viewModel.acceptProposal(name: displayName) else { return }
        ritual = target
    }
}

// MARK: - Les mots de la carte

nonisolated enum ProfileCircleProposalCopy {
    static func title(name: String, level: RelationLevel) -> String {
        String(format: String(localized: "circles.proposal.title", defaultValue: "%1$@ te propose d'être %2$@", bundle: .main),
               name, CircleLevelNames.title(of: level))
    }

    /// Les trois premières ouvertures du cercle proposé ; rien quand il n'ajoute rien de nommé.
    static func opens(level: RelationLevel, features: [OurCircleFeature]) -> String? {
        guard !features.isEmpty else { return nil }
        let named = features.prefix(3).map(\.title).formatted(.list(type: .and))
        return String(format: String(localized: "circles.proposal.opens", defaultValue: "%1$@ t'ouvrira : %2$@", bundle: .main),
                      CircleLevelNames.title(of: level), named)
    }

    static var accept: String {
        String(localized: "circles.proposal.accept", defaultValue: "Accepter", bundle: .main)
    }

    static var later: String {
        String(localized: "circles.proposal.later", defaultValue: "Plus tard", bundle: .main)
    }

    static var decline: String {
        String(localized: "circles.proposal.decline", defaultValue: "Refuser", bundle: .main)
    }

    static func acceptHint(level: RelationLevel) -> String {
        guard level != .blood else {
            return String(localized: "circles.requests.ritual", defaultValue: "Ouvrir le rituel", bundle: .main)
        }
        return String(format: String(localized: "circles.proposal.accept.a11y", defaultValue: "Votre cercle commun passe à %@", bundle: .main),
                      CircleLevelNames.title(of: level))
    }

    static func declineHint(name: String) -> String {
        String(format: String(localized: "circles.proposal.decline.a11y", defaultValue: "%@ n'en sera pas averti(e)", bundle: .main), name)
    }
}
