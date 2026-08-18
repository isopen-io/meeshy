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
                    content(profile)
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
        .presentationDetents([.medium])
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

            Spacer(minLength: 0)
        }
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
}
