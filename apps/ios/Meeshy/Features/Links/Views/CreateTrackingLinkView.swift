import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Nouveau lien de suivi » (planche `Lien-Suivi-Creer`, #19502) : ① ce qu'on suit, en tuiles du kit (K47), puis le
/// contenu choisi sous la cible ; ② le nom (K08), l'adresse `meeshy.me/l/…`, « Expire » (K04), « Compter les visiteurs
/// uniques » (K06) et la mesure UTM repliable avec son adresse complète ; l'aperçu du billet (K30) qui suit la saisie ;
/// « Créer et copier » (K40). Fait du kit : rien n'est redessiné ici.
struct CreateTrackingLinkView: View {
    /// Qui crée le lien ; `nil` ⇒ l'utilisateur connecté.
    var owner: TrackingLinkOwner? = nil
    let onCreate: (TrackingLink) -> Void

    @State private var draft = TrackingLinkDraft()
    @State private var showsMeasure = false
    @State private var openNoteID: String?
    @State private var isCreating = false
    @State private var errorMessage: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.meeshyConversationList) private var conversationList
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    private let accent = MeeshyColors.trackingAccent

    private var creator: TrackingLinkOwner? {
        owner ?? AuthManager.shared.currentUser.map { TrackingLinkOwner(userId: $0.id, username: $0.username) }
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    var body: some View {
        LinksPage(
            title: String(localized: "tracking.link.create.title", defaultValue: "Nouveau lien de suivi", bundle: .main),
            accent: accent,
            glyph: .close
        ) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                targetStep
                rulesStep
                LinkTicketPreviewView(preview: draft.ticket, tint: accent, systemImage: LinkCreationCopy.targetGlyph(draft.target))
                createButton
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.sm)
            .padding(.bottom, 40)
        }
    }

    // MARK: - ① Que veux-tu suivre ?

    private var targetStep: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            stepHeader(1, LinkCreationCopy.whatToTrack)
            MeeshyChoiceTiles(
                label: LinkCreationCopy.whatToTrack,
                items: TrackingLinkTarget.allCases.map { target in
                    MeeshyChoiceItem(id: target.rawValue, title: LinkCreationCopy.targetTitle(target),
                                     systemImage: LinkCreationCopy.targetGlyph(target), spansRow: target == .external)
                },
                selection: .single(draft.target.rawValue),
                columns: 2,
                format: .wide,
                tint: accent,
                onSelect: { id in choose(TrackingLinkTarget(rawValue: id) ?? .external) }
            )
            targetDetail
        }
    }

    @ViewBuilder
    private var targetDetail: some View {
        switch draft.target {
        case .external:
            LinksFormField(label: LinkCreationCopy.externalLabel, prompt: "https://", text: $draft.externalAddress,
                           input: .token, caption: draft.showsAddressError ? LinkCreationCopy.externalInvalid : nil)
        case .conversation:
            TrackingConversationPicker(conversations: (conversationList?.conversations ?? []).filter { $0.type != .direct },
                                       selection: draft.content, onPick: { pick($0) })
        case .profile:
            EmptyView()
        case .publication, .reel, .story, .status:
            if let creator {
                TrackingPublicationPicker(userId: creator.userId, target: draft.target, selection: draft.content,
                                          tint: accent, onPick: { pick($0) })
                    .id(draft.target)
            }
        }
    }

    // MARK: - ② Règle ton lien

    private var rulesStep: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            stepHeader(2, LinkCreationCopy.ruleTheLink)
            MeeshyGroupCard(tint: accent) {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    LinksFormField(label: LinkCreationCopy.nameLabel, prompt: draft.ticket.title, text: nameBinding)
                    LinkSlugField(prefix: "meeshy.me/l/", slug: draft.slug, isAcceptable: draft.slugIsAcceptable,
                                  openNoteID: $openNoteID, onChange: { draft.slug = $0 })
                }
            }
            MeeshyGroupCard(tint: accent) {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    LinkExpiryPicker(notches: LinkExpiryNotch.trackingNotches, selection: draft.expiry,
                                     onChange: { draft.expiry = $0 })
                    MeeshyToggleRow(LinkCreationCopy.countUnique,
                                    accessory: .toggle(isOn: draft.countsUniqueVisitors), tint: accent,
                                    action: { draft.countsUniqueVisitors.toggle() })
                }
            }
            measureCard
        }
    }

    private var measureCard: some View {
        MeeshyGroupCard(tint: accent) {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshyInfoNoted(note: LinkCreationCopy.utmNote, openNoteID: $openNoteID, tint: ThemeManager.shared.textSecondary) {
                    MeeshyToggleRow(LinkCreationCopy.utmTitle, systemImage: "chart.line.uptrend.xyaxis",
                                    accessory: .toggle(isOn: showsMeasure), tint: accent,
                                    action: { toggleMeasure() })
                }
                if showsMeasure {
                    LinksFormField(label: LinkCreationCopy.utmSource, prompt: "instagram", text: $draft.source, input: .token)
                    LinksFormField(label: LinkCreationCopy.utmMedium, prompt: "bio", text: $draft.medium, input: .token)
                    LinksFormField(label: LinkCreationCopy.utmCampaign, prompt: nil, text: $draft.campaign, input: .token)
                    if let full = draft.fullAddress {
                        MeeshyNote(full, emphasis: LinkCreationCopy.fullAddress, lead: .systemImage("link"), tint: accent)
                            .environment(\.layoutDirection, .leftToRight)
                            .textSelection(.enabled)
                    }
                }
            }
        }
    }

    // MARK: - Créer et copier

    private var createButton: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if let errorMessage {
                MeeshyNote(errorMessage, kind: .warn)
            }
            MeeshyButton(LinkCreationCopy.createAndCopy, systemImage: "doc.on.doc", kind: .primary, width: .fill,
                         tint: accent, isPending: isCreating, action: { create() })
                .disabled(!draft.canCreate(owner: creator) || isCreating)
                .accessibilityIdentifier("links.create.tracking.submit")
        }
    }

    private func stepHeader(_ number: Int, _ title: String) -> some View {
        MeeshySectionHeader(title: title, form: .step, step: (number: number, state: .current), tint: accent,
                            lead: { EmptyView() }, accessory: { EmptyView() })
    }

    /// Le nom propose l'adresse tant qu'on ne l'a pas réglée soi-même.
    private var nameBinding: Binding<String> {
        Binding(get: { draft.name }, set: { typed in
            let suggested = LinkSlugRules.normalized(draft.name)
            if draft.slug.isEmpty || draft.slug == suggested { draft.slug = LinkSlugRules.normalized(typed) }
            draft.name = String(typed.prefix(TrackingLinkDraft.nameMaxLength))
        })
    }

    private func choose(_ target: TrackingLinkTarget) {
        meeshyWithAnimation(MeeshyAnimation.springFast, reduced: MeeshyMotion.reducedFade, reduceMotion: reduceMotion) {
            draft.choose(target)
        }
    }

    private func pick(_ content: TrackingLinkContent) {
        draft.content = content
        HapticFeedback.light()
    }

    private func toggleMeasure() {
        meeshyWithAnimation(MeeshyAnimation.springFast, reduced: MeeshyMotion.reducedFade, reduceMotion: reduceMotion) {
            showsMeasure.toggle()
        }
    }

    private func create() {
        guard let request = draft.request(owner: creator, now: Date()) else { return }
        isCreating = true
        errorMessage = nil
        Task {
            do {
                let link = try await TrackingLinkService.shared.createLink(request)
                HapticFeedback.success()
                LinksClipboard.copy(link.shortUrl, message: LinkCreationCopy.copied)
                onCreate(link)
                dismiss()
            } catch {
                errorMessage = error.localizedDescription
                isCreating = false
                UIAccessibility.post(notification: .announcement, argument: error.localizedDescription)
            }
        }
    }
}
