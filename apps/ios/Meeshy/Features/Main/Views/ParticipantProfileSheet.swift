import SwiftUI
import MeeshySDK
import MeeshyUI

/// Enveloppe `Identifiable` pour présenter une feuille pilotée par un simple
/// identifiant. `.sheet(item:)` exige `Identifiable` ; un `String` ne l'est pas,
/// et `.sheet(isPresented:)` obligerait à porter l'identifiant dans un second
/// état — deux sources pour une même intention.
struct IdentifiedString: Identifiable {
    let value: String
    var id: String { value }

    init(_ value: String) { self.value = value }
}

/// Le couple qui désigne une participation — et non un compte.
///
/// Une fiche de participant n'existe que DANS une conversation : un visiteur
/// entré par lien n'a pas d'identité hors d'elle. Les deux identifiants voyagent
/// donc ensemble, `Identifiable` pour être présentés par `.sheet(item:)`.
struct ParticipantProfileTarget: Identifiable, Equatable {
    let conversationId: String
    let participantId: String

    var id: String { "\(conversationId)/\(participantId)" }
}

/// Fiche d'un participant — écrite d'abord pour ceux qui n'ont PAS de compte.
///
/// Un visiteur entré par lien a rempli un formulaire pour passer la porte, et
/// rien de ce qu'il y a écrit n'était lisible ensuite : les autres membres ne
/// voyaient qu'un pseudo. Il n'a pas de page `/u/{pseudo}` non plus — son
/// identité vit dans la conversation, donc sa fiche s'ouvre là.
///
/// Les COORDONNÉES suivent la règle posée par le gateway : `email` et
/// `birthday` arrivent `nil` à un membre ordinaire, accompagnés de `hasEmail` /
/// `hasBirthday`. La fiche traduit cela en TROIS états et pas deux — absent
/// (aucune ligne), fourni-et-masqué (ligne en italique), fourni-et-visible
/// (valeur). Sans la nuance, un visiteur qui a tout rempli et un visiteur qui
/// n'a rien donné s'afficheraient à l'identique.
///
/// Le client ne refait JAMAIS l'arbitrage du gateway : un secret dont la
/// visibilité dépendrait de la vue n'est plus un secret.
struct ParticipantProfileSheet: View {
    let conversationId: String
    let participantId: String

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss
    @State private var profile: ConversationParticipantProfile?
    @State private var loadFailed = false

    var body: some View {
        NavigationStack {
            Group {
                if let profile {
                    // Les deux cercles allongent la fiche autant que l'hôte a
                    // posé de conditions : elle doit défiler, sinon un lien très
                    // configuré tronque ses propres réglages.
                    ScrollView { content(profile) }
                } else if loadFailed {
                    Text(String(
                        localized: "participantProfile.unavailable",
                        defaultValue: "Fiche indisponible",
                        bundle: .main
                    ))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
                    .foregroundColor(theme.textSecondary)
                    .accessibilityIdentifier("participant-profile-error")
                } else {
                    ProgressView()
                        .accessibilityIdentifier("participant-profile-loading")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .padding(20)
            .background(theme.backgroundPrimary.ignoresSafeArea())
            .navigationTitle(String(
                localized: "participantProfile.title",
                defaultValue: "Fiche du participant",
                bundle: .main
            ))
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task {
            do {
                profile = try await ConversationService.shared.getParticipantProfile(
                    conversationId: conversationId,
                    participantId: participantId
                )
            } catch {
                loadFailed = true
            }
        }
    }

    @ViewBuilder
    private func content(_ profile: ConversationParticipantProfile) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            header(profile)

            VStack(spacing: 10) {
                if let language = profile.language {
                    row(icon: "globe", label: languageLabel, value: language.uppercased())
                }
                if let country = profile.country {
                    row(icon: "mappin.and.ellipse", label: countryLabel, value: country)
                }
                if let joinedAt = profile.joinedAt {
                    row(icon: "calendar", label: joinedLabel, value: joinedAt.formatted(date: .abbreviated, time: .shortened))
                }
                if let link = profile.shareLinkName {
                    row(icon: "link", label: viaLinkLabel, value: link)
                }
                if profile.hasEmail {
                    row(icon: "envelope", label: emailLabel, value: profile.email, withheld: profile.email == nil)
                }
                if profile.hasBirthday {
                    row(
                        icon: "gift",
                        label: birthdayLabel,
                        value: profile.birthday?.formatted(date: .abbreviated, time: .omitted),
                        withheld: profile.birthday == nil
                    )
                }
            }
            .padding(14)
            .background(theme.backgroundSecondary)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

            if let capabilities = profile.entryCapabilities {
                capabilitiesSection(capabilities)
            }

            if let link = profile.entryLink {
                entryLinkSection(link)
            }

            Spacer(minLength: 0)
        }
    }

    /// Ce que la personne peut faire — premier cercle, servi à tout membre.
    ///
    /// N'énonce que les REFUS : `denied` porte la règle côté SDK pour que la
    /// feuille iOS et la carte web disent la même chose sans la réécrire. Une
    /// section qui listerait huit permissions dont sept accordées noierait la
    /// seule information utile.
    @ViewBuilder
    private func capabilitiesSection(_ capabilities: ParticipantEntryCapabilities) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle(capabilitiesLabel)

            let denied = capabilities.denied
            if denied.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.shield.fill")
                        .font(.system(size: 13))
                        .foregroundColor(MeeshyColors.success)
                        .frame(width: 18)
                    Text(noRestrictionLabel)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular))
                        .foregroundColor(theme.textSecondary)
                    Spacer(minLength: 0)
                }
                .accessibilityIdentifier("participant-profile-no-restriction")
            } else {
                ForEach(denied, id: \.rawValue) { capability in
                    HStack(spacing: 8) {
                        Image(systemName: "nosign")
                            .font(.system(size: 13))
                            .foregroundColor(MeeshyColors.warning)
                            .frame(width: 18)
                        Text(deniedLabel(capability))
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular))
                            .foregroundColor(theme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .accessibilityIdentifier("participant-profile-denied-\(capability.rawValue)")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("participant-profile-capabilities")
    }

    /// Les réglages du lien — second cercle. Cette section n'existe que si le
    /// gateway a servi `entryLink`, c'est-à-dire si le lecteur est hôte. Le
    /// client ne refait jamais cet arbitrage.
    @ViewBuilder
    private func entryLinkSection(_ link: ParticipantEntryLink) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle(entryLinkLabel)

            if !link.isActive {
                Text(linkInactiveLabel)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular))
                    .foregroundColor(MeeshyColors.warning)
                    .accessibilityIdentifier("participant-profile-entry-link-inactive")
            }

            row(
                icon: "link",
                label: linkUsesLabel,
                value: link.maxUses.map { "\(link.currentUses) / \($0)" } ?? "\(link.currentUses)"
            )

            if let expiresAt = link.expiresAt {
                row(icon: "hourglass", label: linkExpiresLabel, value: expiresAt.formatted(date: .abbreviated, time: .omitted))
            }

            // Les exigences se lisent ensemble : « pseudo · email » dit d'un
            // regard ce que l'hôte a demandé pour laisser passer. Une ligne par
            // exigence transformerait trois booléens en trois lignes de
            // formulaire.
            let requirements = [
                link.requireNickname ? requireNicknameLabel : nil,
                link.requireEmail ? requireEmailLabel : nil,
                link.requireBirthday ? requireBirthdayLabel : nil
            ].compactMap { $0 }
            if !requirements.isEmpty {
                row(icon: "checkmark.seal", label: linkRequiresLabel, value: requirements.joined(separator: " · "))
            }

            if !link.allowedCountries.isEmpty {
                row(icon: "globe.europe.africa", label: linkCountriesLabel, value: link.allowedCountries.joined(separator: ", "))
            }

            if !link.allowedLanguages.isEmpty {
                row(icon: "character.bubble", label: linkLanguagesLabel, value: link.allowedLanguages.joined(separator: ", ").uppercased())
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(theme.textMuted.opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
        )
        .accessibilityIdentifier("participant-profile-entry-link")
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title.uppercased())
            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
            .foregroundColor(theme.textMuted)
    }

    private func header(_ profile: ConversationParticipantProfile) -> some View {
        HStack(spacing: 10) {
            // Le masque QUALIFIE l'identité — il la précède, il ne la décore pas.
            if profile.isAnonymous {
                Image(systemName: "theatermasks.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.purple)
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(profile.resolvedFullName)
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                if let username = profile.username {
                    Text("@\(username)")
                        .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .regular))
                        .foregroundColor(theme.textSecondary)
                }
            }

            Spacer(minLength: 0)

            // Le masque seul ne se lit ni par VoiceOver ni par quelqu'un qui
            // ignore la convention : la mention l'accompagne toujours.
            if profile.isAnonymous {
                Text(String(
                    localized: "participantProfile.noAccount",
                    defaultValue: "sans compte",
                    bundle: .main
                ))
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                .foregroundColor(.purple)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Capsule().fill(Color.purple.opacity(theme.mode.isDark ? 0.22 : 0.12)))
                .accessibilityIdentifier("participant-profile-no-account")
            }
        }
    }

    private func row(icon: String, label: String, value: String?, withheld: Bool = false) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundColor(theme.textMuted)
                .frame(width: 18)
            Text(label)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .regular))
                .foregroundColor(theme.textSecondary)
            Spacer(minLength: 8)
            Text(withheld ? withheldLabel : (value ?? ""))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: withheld ? .regular : .medium))
                .italic(withheld)
                .foregroundColor(withheld ? theme.textMuted : theme.textPrimary)
                .lineLimit(1)
        }
    }

    private var languageLabel: String { String(localized: "participantProfile.language", defaultValue: "Langue", bundle: .main) }
    private var countryLabel: String { String(localized: "participantProfile.country", defaultValue: "Pays", bundle: .main) }
    private var joinedLabel: String { String(localized: "participantProfile.joined", defaultValue: "Arrivé le", bundle: .main) }
    private var viaLinkLabel: String { String(localized: "participantProfile.viaLink", defaultValue: "Par le lien", bundle: .main) }
    private var emailLabel: String { String(localized: "participantProfile.email", defaultValue: "Email", bundle: .main) }
    private var birthdayLabel: String { String(localized: "participantProfile.birthday", defaultValue: "Naissance", bundle: .main) }
    private var withheldLabel: String {
        String(
            localized: "participantProfile.withheld",
            defaultValue: "fourni, réservé aux modérateurs",
            bundle: .main
        )
    }

    private var capabilitiesLabel: String { String(localized: "participantProfile.capabilities", defaultValue: "Dans cette conversation", bundle: .main) }
    private var noRestrictionLabel: String { String(localized: "participantProfile.noRestriction", defaultValue: "Aucune restriction", bundle: .main) }
    private var entryLinkLabel: String { String(localized: "participantProfile.entryLink", defaultValue: "Réglages du lien", bundle: .main) }
    private var linkInactiveLabel: String { String(localized: "participantProfile.linkInactive", defaultValue: "Ce lien a été désactivé", bundle: .main) }
    private var linkUsesLabel: String { String(localized: "participantProfile.linkUses", defaultValue: "Entrées", bundle: .main) }
    private var linkExpiresLabel: String { String(localized: "participantProfile.linkExpires", defaultValue: "Expire le", bundle: .main) }
    private var linkRequiresLabel: String { String(localized: "participantProfile.linkRequires", defaultValue: "Exige", bundle: .main) }
    private var linkCountriesLabel: String { String(localized: "participantProfile.linkCountries", defaultValue: "Pays admis", bundle: .main) }
    private var linkLanguagesLabel: String { String(localized: "participantProfile.linkLanguages", defaultValue: "Langues admises", bundle: .main) }
    private var requireNicknameLabel: String { String(localized: "participantProfile.requireNickname", defaultValue: "pseudo", bundle: .main) }
    private var requireEmailLabel: String { String(localized: "participantProfile.requireEmail", defaultValue: "email", bundle: .main) }
    private var requireBirthdayLabel: String { String(localized: "participantProfile.requireBirthday", defaultValue: "date de naissance", bundle: .main) }

    /// Un refus, en toutes lettres. Le `switch` est exhaustif par construction :
    /// ajouter une capacité au SDK sans lui donner son libellé ici ne compile
    /// pas — c'est la garde qui empêche une restriction muette.
    private func deniedLabel(_ capability: ParticipantEntryCapabilities.Capability) -> String {
        switch capability {
        case .canViewHistory:
            return String(localized: "participantProfile.denied.canViewHistory", defaultValue: "Ne voit pas les messages antérieurs à son arrivée", bundle: .main)
        case .canSendMessages:
            return String(localized: "participantProfile.denied.canSendMessages", defaultValue: "Ne peut pas écrire", bundle: .main)
        case .canSendImages:
            return String(localized: "participantProfile.denied.canSendImages", defaultValue: "Ne peut pas envoyer d’images", bundle: .main)
        case .canSendFiles:
            return String(localized: "participantProfile.denied.canSendFiles", defaultValue: "Ne peut pas envoyer de fichiers", bundle: .main)
        case .canSendVideos:
            return String(localized: "participantProfile.denied.canSendVideos", defaultValue: "Ne peut pas envoyer de vidéos", bundle: .main)
        case .canSendAudios:
            return String(localized: "participantProfile.denied.canSendAudios", defaultValue: "Ne peut pas envoyer d’audio", bundle: .main)
        case .canSendLinks:
            return String(localized: "participantProfile.denied.canSendLinks", defaultValue: "Ne peut pas envoyer de liens", bundle: .main)
        case .canSendLocations:
            return String(localized: "participantProfile.denied.canSendLocations", defaultValue: "Ne peut pas partager sa position", bundle: .main)
        }
    }
}
