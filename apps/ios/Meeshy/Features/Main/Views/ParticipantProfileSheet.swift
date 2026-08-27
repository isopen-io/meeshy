import SwiftUI
import Combine
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
    @State private var hasLeft = false
    @State private var rightsWriteInFlight = false
    @State private var historyGrantWriteInFlight = false
    @State private var historyGrantErrorMessage: String?

    /// `entryLink` n'est servi qu'aux administrateurs et modérateurs : sa
    /// PRÉSENCE est la réponse du gateway à « ce lecteur peut-il écrire ». La
    /// vue ne refait pas cet arbitrage — un droit recalculé côté client n'est
    /// pas un droit.
    private var canEditRights: Bool { profile?.entryLink != nil }

    /// Distinct de `canEditRights` : l'octroi d'historique par date vaut pour
    /// TOUT participant (inscrit compris), pas seulement les visiteurs sans
    /// compte, et sa permission d'écriture est plus étroite côté gateway
    /// (admin/creator, pas modérateur). `profile.canGrantHistory` en est la
    /// réponse sûre — la vue ne recalcule jamais ce droit.
    private var canGrantHistory: Bool { profile?.canGrantHistory ?? false }

    var body: some View {
        NavigationStack {
            Group {
                if let profile {
                    // Les deux cercles allongent la fiche autant que l'hôte a
                    // posé de conditions : elle doit défiler, sinon un lien très
                    // configuré tronque ses propres réglages.
                    ScrollView { content(profile) }
                } else if loadFailed {
                    Text(hasLeft
                        ? String(
                            localized: "participantProfile.hasLeft",
                            defaultValue: "Cette personne a quitté la conversation",
                            bundle: .main
                          )
                        : String(
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
                // 404 et panne ne se disent pas pareil. Un avis d'arrivée reste
                // dans le fil pour toujours et mène ici longtemps après le
                // départ de son auteur : servir « Fiche indisponible » ferait
                // passer un fait de conversation pour une panne.
                //
                // Le STATUT suffit à trancher — le gateway ne rend 404 sur cette
                // route que pour un participant qu'il ne sert pas — là où une
                // coupure réseau lève `networkError` et garde le message
                // générique, qui est alors le bon.
                if case APIError.serverError(404, _) = error {
                    hasLeft = true
                }
                loadFailed = true
            }
        }
        // Un AUTRE hôte peut modifier ces droits pendant que cette fiche est
        // ouverte. L'événement porte l'état résolu : on le pose, sans recharger
        // — la charge utile est déjà la vérité.
        .onReceive(
            MessageSocketManager.shared.participantRightsUpdated
                .receive(on: DispatchQueue.main)
        ) { event in
            guard event.participantId == participantId,
                  event.conversationId == conversationId else { return }
            profile?.entryCapabilities = event.rights
            // La PRÉSENCE de la clé, jamais sa valeur : `null` efface (le
            // serveur affirme qu'il n'y a pas d'octroi), une clé ABSENTE
            // n'affirme rien — un gateway antérieur au champ — et ne doit pas
            // faire disparaître un octroi affiché. Même règle que le web.
            if event.carriesHistoryGrant {
                profile?.historyVisibleFrom = event.historyVisibleFrom
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

            // Vaut pour TOUT participant, contrairement à `entryCapabilities`
            // ci-dessus (réservée aux anonymes) — d'où une condition séparée.
            // Muette pour un membre ordinaire : `historyVisibleFrom` et
            // `canGrantHistory` sont alors tous deux `nil`/`false`, et il
            // n'existe volontairement aucun signal « un octroi existe » à qui
            // n'a pas le droit de le savoir.
            if canGrantHistory || profile.historyVisibleFrom != nil {
                historyGrantSection(profile)
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

            if canEditRights {
                // En lecture, la feuille n'énonce que les refus. En ÉDITION il
                // faut les huit : on n'accorde pas un droit qu'on ne montre pas.
                ForEach(ParticipantEntryCapabilities.Capability.allCases, id: \.rawValue) { capability in
                    Toggle(isOn: Binding(
                        get: { capabilities.isAllowed(capability) },
                        set: { newValue in Task { await setRight(capability, to: newValue) } }
                    )) {
                        Text(allowedLabel(capability))
                            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular))
                            .foregroundColor(theme.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .tint(MeeshyColors.success)
                    .disabled(rightsWriteInFlight)
                    .accessibilityIdentifier("participant-profile-toggle-\(capability.rawValue)")
                }
            } else if capabilities.denied.isEmpty {
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
                ForEach(capabilities.denied, id: \.rawValue) { capability in
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

    /// L'octroi d'historique par DATE — vaut pour TOUT participant, inscrit
    /// compris, pas seulement les visiteurs sans compte : distincte de
    /// `capabilitiesSection`, réservée aux anonymes. Éditable seulement quand
    /// `canGrantHistory` répond vrai, sinon lecture seule (un modérateur LIT
    /// l'octroi mais ne peut pas l'écrire).
    @ViewBuilder
    private func historyGrantSection(_ profile: ConversationParticipantProfile) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle(historyGrantTitleLabel)

            if canGrantHistory {
                HStack(spacing: 8) {
                    Image(systemName: "clock.arrow.circlepath")
                        .font(.system(size: 13))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 18)
                    Text(seesHistorySinceLabel)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular))
                        .foregroundColor(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    DatePicker(
                        "",
                        selection: Binding(
                            get: { profile.historyVisibleFrom ?? Date() },
                            set: { newValue in Task { await setHistoryGrant(newValue) } }
                        ),
                        in: ...Date(),
                        displayedComponents: [.date]
                    )
                    .labelsHidden()
                    .disabled(historyGrantWriteInFlight)
                    .accessibilityIdentifier("participant-profile-history-grant-input")

                    if profile.historyVisibleFrom != nil {
                        Button {
                            Task { await setHistoryGrant(nil) }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(theme.textMuted)
                        }
                        .disabled(historyGrantWriteInFlight)
                        .accessibilityLabel(historyGrantClearLabel)
                        .accessibilityIdentifier("participant-profile-history-grant-clear")
                    }
                }
            } else if let historyVisibleFrom = profile.historyVisibleFrom {
                row(icon: "clock.arrow.circlepath", label: seesHistorySinceLabel, value: historyVisibleFrom.formatted(date: .abbreviated, time: .omitted))
                    .accessibilityIdentifier("participant-profile-history-grant-readonly")
            }

            if let historyGrantErrorMessage {
                Text(historyGrantErrorMessage)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .regular))
                    .foregroundColor(MeeshyColors.error)
                    .accessibilityIdentifier("participant-profile-history-grant-error")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("participant-profile-history-grant")
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

    /// Écrit UN droit, et n'envoie que celui-là : la surcharge est un delta côté
    /// gateway, et lui poster les huit gèlerait les sept autres à leur valeur du
    /// moment — ils cesseraient de suivre les conditions du join.
    ///
    /// La réponse porte l'état RÉSOLU : on la pose telle quelle. En cas d'échec,
    /// on ne touche à rien — l'interrupteur revient de lui-même à ce que
    /// `profile` dit, qui est resté la vérité.
    private func setRight(_ capability: ParticipantEntryCapabilities.Capability, to value: Bool) async {
        guard !rightsWriteInFlight else { return }
        rightsWriteInFlight = true
        defer { rightsWriteInFlight = false }

        do {
            let updated = try await ConversationService.shared.updateParticipantRights(
                conversationId: conversationId,
                participantId: participantId,
                rights: [capability.rawValue: value]
            )
            profile?.entryCapabilities = updated
        } catch {
            // L'échec laisse l'état serveur intact ; le rendu suivant réaligne
            // l'interrupteur sur `profile`.
        }
    }

    /// Pose ou retire l'octroi d'historique par date. `nil` retire.
    ///
    /// Réponse RÉSOLUE reposée telle quelle, comme `setRight` ci-dessus. En cas
    /// d'échec, l'état serveur reste intact — le contrôle revient de lui-même à
    /// ce que `profile` dit — et un message d'erreur bref s'affiche sous le
    /// contrôle (dimension 8 : état d'erreur dessiné, pas silencieux).
    private func setHistoryGrant(_ date: Date?) async {
        guard !historyGrantWriteInFlight else { return }
        historyGrantWriteInFlight = true
        historyGrantErrorMessage = nil
        defer { historyGrantWriteInFlight = false }

        do {
            let updated = try await ConversationService.shared.updateHistoryGrant(
                conversationId: conversationId,
                participantId: participantId,
                historyVisibleFrom: date
            )
            profile?.historyVisibleFrom = updated
        } catch {
            historyGrantErrorMessage = String(
                localized: "participantProfile.historyGrant.error",
                defaultValue: "Échec de la mise à jour",
                bundle: .main
            )
        }
    }

    private var historyGrantTitleLabel: String {
        String(localized: "participantProfile.historyGrant.title", defaultValue: "Historique", bundle: .main)
    }
    private var seesHistorySinceLabel: String {
        String(localized: "participantProfile.historyGrant.label", defaultValue: "Voit l’historique depuis", bundle: .main)
    }
    private var historyGrantClearLabel: String {
        String(localized: "participantProfile.historyGrant.clear", defaultValue: "Retirer", bundle: .main)
    }

    private func allowedLabel(_ capability: ParticipantEntryCapabilities.Capability) -> String {
        switch capability {
        case .canViewHistory:
            return String(localized: "participantProfile.allowed.canViewHistory", defaultValue: "Voir les messages antérieurs", bundle: .main)
        case .canSendMessages:
            return String(localized: "participantProfile.allowed.canSendMessages", defaultValue: "Écrire des messages", bundle: .main)
        case .canSendImages:
            return String(localized: "participantProfile.allowed.canSendImages", defaultValue: "Envoyer des photos", bundle: .main)
        case .canSendFiles:
            return String(localized: "participantProfile.allowed.canSendFiles", defaultValue: "Envoyer des fichiers", bundle: .main)
        case .canSendVideos:
            return String(localized: "participantProfile.allowed.canSendVideos", defaultValue: "Envoyer des vidéos", bundle: .main)
        case .canSendAudios:
            return String(localized: "participantProfile.allowed.canSendAudios", defaultValue: "Envoyer de l’audio", bundle: .main)
        case .canSendLinks:
            return String(localized: "participantProfile.allowed.canSendLinks", defaultValue: "Envoyer des liens", bundle: .main)
        case .canSendLocations:
            return String(localized: "participantProfile.allowed.canSendLocations", defaultValue: "Partager sa position", bundle: .main)
        }
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
