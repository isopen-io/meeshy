import SwiftUI
import MeeshySDK

// MARK: - La face Actions d'un autre, section par section (#19433, planche `Autre-Actions`)
//
// Talkie, Ensemble (regarder, écouter, Bring), Son téléphone, les nouveautés et « Notre cercle » vivent côté app : le
// cercle commun, la passerelle qui rejuge chaque geste, les caches. Le SDK pose leurs PLACES dans la hiérarchie de la
// planche et l'app y dessine chaque section — ou rien, sous le cercle qui l'ouvre (loi 4). Sans app, la face garde
// Parler, Où il est, Sa fiche et la sécurité.

/// Une section de la face Actions que l'app lit.
public nonisolated enum ProfileActionsPart: String, CaseIterable, Sendable, Hashable {
    /// « Maintenir pour parler · Ta voix part en direct ».
    case talkie
    /// « Ensemble » : regarder, écouter, Bring.
    case together
    /// « Son téléphone » : batterie, réseau, l'alerte, mes partages.
    case phone
    /// « Notifications de ses nouveautés », rangée de « Sa fiche ».
    case newsNotify
    /// « Notre cercle », rangée de « Sa fiche » qui ouvre la feuille du cercle.
    case circle
    /// « Pour aller plus loin » d'un lien servi : les cercles qu'il reste à gagner et le chemin (#19674). Sans lien, la
    /// fiche la pose elle-même sous la demande d'ami.
    case nextCircle
}

/// Ce que l'app fournit : pour une section et la personne (son identifiant, son nom, sa présence servie, l'âge de la
/// fiche hors ligne, la teinte), la vue de la section. Une section non ouverte rend une vue vide.
public struct ProfileActionsParts {
    public let build: (ProfileActionsPart, ProfileLiveRequest) -> AnyView

    public init(build: @escaping (ProfileActionsPart, ProfileLiveRequest) -> AnyView) {
        self.build = build
    }
}

private struct ProfileActionsPartsKey: EnvironmentKey {
    static let defaultValue: ProfileActionsParts? = nil
}

public extension EnvironmentValues {
    /// Les sections de la face Actions lues par l'app ; `nil` : la face ne les pose pas.
    var profileActionsParts: ProfileActionsParts? {
        get { self[ProfileActionsPartsKey.self] }
        set { self[ProfileActionsPartsKey.self] = newValue }
    }
}

// MARK: - La hiérarchie

/// Les sections de la face Actions, de haut en bas, comme la planche les range.
nonisolated enum ProfileActionsSection: Hashable, Sendable {
    case talk
    case part(ProfileActionsPart)
    case whereTheyAre
    /// La demande de connexion tant qu'aucun lien n'est servi ; lié, ce que l'app y garde (partager ma position).
    case circle
    case card
    case safety

    static let order: [ProfileActionsSection] = [
        .talk, .part(.talkie), .part(.together), .whereTheyAre, .circle, .part(.phone), .part(.nextCircle), .card, .safety,
    ]

    var part: ProfileActionsPart? {
        if case .part(let part) = self { return part }
        return nil
    }

    /// « Notre cercle » garde son titre tant qu'aucun lien n'est servi ; lié, il n'est plus qu'une rangée de « Sa fiche ».
    static func showsCircleTitle(linked: Bool) -> Bool {
        !linked
    }
}

/// Les rangées de « Sa fiche », dans l'ordre de la planche.
nonisolated enum ProfileActionsCardRow: Hashable, Sendable {
    case sendProfile
    case copyLink
    case qr
    case part(ProfileActionsPart)

    var part: ProfileActionsPart? {
        if case .part(let part) = self { return part }
        return nil
    }

    /// Sans pseudo, ni lien ni QR ; sans app, ni nouveautés ni cercle.
    static func rows(hasLink: Bool, hasParts: Bool) -> [ProfileActionsCardRow] {
        let linkRows: [ProfileActionsCardRow] = hasLink ? [.sendProfile, .copyLink, .qr] : []
        let appRows: [ProfileActionsCardRow] = hasParts ? [.part(.newsNotify), .part(.circle)] : []
        return linkRows + appRows
    }
}

// MARK: - La place d'une section lue par l'app

/// Une section de l'app à sa place : rien sans app, sur ma propre fiche, ou quand l'un de nous a bloqué l'autre.
struct ProfileActionsPartSlot: View {
    let parts: ProfileActionsParts?
    let request: ProfileLiveRequest?
    let part: ProfileActionsPart

    var body: some View {
        if let parts, let request {
            parts.build(part, request)
        }
    }

    static func of(_ sheet: UserProfileSheet, _ part: ProfileActionsPart) -> ProfileActionsPartSlot {
        ProfileActionsPartSlot(parts: sheet.actionsParts, request: request(of: sheet), part: part)
    }

    /// Ce que l'app lit : la personne, sa présence servie, l'âge de la fiche hors ligne, la teinte de la fiche.
    static func request(of sheet: UserProfileSheet) -> ProfileLiveRequest? {
        guard sheet.actionsParts != nil, sheet.showsRelationBlocks, let userId = sheet.resolvedUserId else { return nil }
        return ProfileLiveRequest(userId: userId, displayName: sheet.displayUser.resolvedDisplayName,
                                  isOnline: sheet.resolvedPresence == .online, staleAge: sheet.phase.offlineAge,
                                  tint: sheet.accentTint, openMap: nil)
    }
}

// MARK: - « Sa fiche »

/// « Sa fiche » en rangées du kit (K06) : envoyer son profil, copier son lien, son QR (K31 en grand), puis ce que l'app
/// lit — les nouveautés et notre cercle. Chaque rangée de l'app porte son propre filet : elle peut ne rien rendre.
struct ProfileActionsCardSection: View {
    let rows: [ProfileActionsCardRow]
    let link: ProfileLink?
    let name: String
    let tint: Color
    let parts: ProfileActionsParts?
    let request: ProfileLiveRequest?
    let onSend: () -> Void
    let onCopy: (ProfileLink) -> Void

    @State private var showsQR = false

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileActionsCardCopy.title)
            VStack(spacing: 0) {
                ForEach(Array(rows.enumerated()), id: \.element) { index, row in
                    cardRow(row, showsDivider: index > 0)
                }
            }
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        }
        .sheet(isPresented: $showsQR) {
            if let link {
                RelationLinksCodeSheet(link: link, name: name, tint: tint, mode: .qr)
            }
        }
        .accessibilityIdentifier("profile.actions.card")
    }

    @ViewBuilder
    private func cardRow(_ row: ProfileActionsCardRow, showsDivider: Bool) -> some View {
        switch row {
        case .sendProfile:
            MeeshyToggleRow(ProfileRelationAction.sendProfile.title,
                            systemImage: ProfileRelationAction.sendProfile.systemImage,
                            accessory: .chevron, showsDivider: showsDivider, tint: tint, action: onSend)
        case .copyLink:
            if let link {
                MeeshyToggleRow(ProfileActionsCardCopy.copyLink, systemImage: "doc.on.doc", subtitle: link.displayText,
                                showsDivider: showsDivider, tint: tint, action: { onCopy(link) })
            }
        case .qr:
            MeeshyToggleRow(ProfileActionsCardCopy.theirQR, systemImage: "qrcode", accessory: .chevron,
                            showsDivider: showsDivider, tint: tint, action: { showsQR = true })
        case .part(let part):
            ProfileActionsPartSlot(parts: parts, request: request, part: part)
        }
    }

    /// « Sa fiche » d'une fiche : rien quand elle n'a ni pseudo ni section de l'app.
    @ViewBuilder
    static func of(_ sheet: UserProfileSheet) -> some View {
        let link = ProfileLink(username: sheet.displayUser.username)
        let request = ProfileActionsPartSlot.request(of: sheet)
        let rows = ProfileActionsCardRow.rows(hasLink: link != nil, hasParts: request != nil)
        if !rows.isEmpty {
            ProfileActionsCardSection(
                rows: rows, link: link, name: sheet.displayUser.resolvedDisplayName, tint: sheet.accentTint,
                parts: sheet.actionsParts, request: request,
                onSend: { sheet.sharesProfile = true },
                onCopy: { sheet.copyProfileLink($0) }
            )
            .padding(.bottom, MeeshySpacing.xxl)
        }
    }
}

/// Les mots de « Sa fiche ».
enum ProfileActionsCardCopy {
    static var title: String {
        String(localized: "profile.relation.section.card", defaultValue: "Sa fiche", bundle: .module)
    }

    static var copyLink: String {
        String(localized: "profile.relation.action.copyLink", defaultValue: "Copier son lien", bundle: .module)
    }

    static var theirQR: String {
        String(localized: "profile.relation.action.theirQR", defaultValue: "Son QR", bundle: .module)
    }
}
