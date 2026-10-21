import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Header Call Buttons (§7.6)
// Idle → un menu d'appel vocal / vidéo ; appel actif ici → pastille verte
// « toucher pour revenir » (jamais un 2e appel depuis l'en-tête) ; appel
// perdu côté appareil mais vivant côté serveur → pastille « Rejoindre ».
// Le bouton ne lit qu'un `CallHeaderSnapshot` : il ne s'abonne à aucun
// `@Published` de `CallManager` et ne construit pas la pile d'appel.

/// L'emplacement de l'en-tête : porte l'instantané d'appel et la revalidation
/// de l'engagement, et ne monte le bouton que si la conversation s'appelle.
struct ConversationHeaderCallSlot: View {
    let entry: HeaderCallEntry?
    let conversationId: String
    let calleeName: String
    let accentColor: String
    let secondaryColor: String
    let engagementConversationId: String?

    @State private var snapshot = CallHeaderSnapshotStore.shared.snapshot

    var body: some View {
        content
            .onReceive(CallHeaderSnapshotStore.shared.$snapshot) { snapshot = $0 }
            .task(id: engagementConversationId) {
                await ConversationEngagementStore.shared.revalidate(engagementConversationId ?? "")
            }
    }

    @ViewBuilder
    private var content: some View {
        if let entry {
            ConversationHeaderCallButton(
                snapshot: snapshot,
                conversationId: conversationId,
                userId: userId(for: entry),
                calleeName: calleeName,
                accentColor: accentColor,
                secondaryColor: secondaryColor,
                isGroup: entry.callee == .conversation,
                canStart: entry.canStart
            )
        }
    }

    private func userId(for entry: HeaderCallEntry) -> String {
        switch entry.callee {
        case .peer(let userId): return userId
        case .conversation: return conversationId
        }
    }
}

struct ConversationHeaderCallButton: View {
    let snapshot: CallHeaderSnapshot
    let conversationId: String
    let userId: String
    let calleeName: String
    let accentColor: String
    let secondaryColor: String
    /// #3585 — `userId` porte alors la conversation (poignée CallKit du groupe)
    /// et `calleeName` son titre.
    var isGroup = false
    /// `false` : le lecteur ne LANCE pas d'appel ici (#10207) ; il rejoint
    /// seulement celui qui est déjà en cours.
    var canStart = true

    /// Posé quand le SERVEUR (pas la pile locale) rapporte un appel actif de
    /// cette conversation : la session de cet appareil s'est perdue (relance,
    /// crash) alors que l'appel continue. La réconciliation (le REST) est un
    /// atome du SDK (`ActiveCallService`) ; décider QUAND l'appeler est ici.
    @State private var reconciledActiveCall: ActiveCallSession?

    var body: some View {
        Group {
            switch CallHeaderPresentation.resolve(
                snapshot: snapshot,
                reconciled: reconciledActiveCall,
                canStart: canStart,
                conversationId: conversationId
            ) {
            case .none:
                EmptyView()
            case .returnToCall:
                returnToCallIndicator
            case .rejoin(let activeCall):
                rejoinCallIndicator(activeCall)
            case .start:
                startCallButtons
            }
        }
        // Re-réconcilie quand la conversation change OU quand l'appel local
        // commence / finit (#9111) — jamais à chaque tick d'état d'appel.
        .task(id: HeaderCallReconcileKey(conversationId: conversationId, isLocalCallActive: snapshot.isActive)) {
            await reconcileActiveCall()
        }
        // Le gateway fanout `call:ended` jusqu'aux user-rooms de TOUS les
        // membres : sans cette invalidation, la pastille « Rejoindre » resterait
        // pointée sur un appel mort. Match par callId ; hop main obligatoire
        // (le publisher émet depuis la queue du socket, classe SIGTRAP connue).
        .onReceive(MessageSocketManager.shared.callEnded.receive(on: DispatchQueue.main)) { event in
            if reconciledActiveCall?.id == event.callId {
                reconciledActiveCall = nil
            }
        }
    }

    private var returnToCallIndicator: some View {
        Button {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.75)) {
                CallManagerHost.shared.require().displayMode = .fullScreen
            }
            HapticFeedback.medium()
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Circle()
                    .fill(MeeshyColors.success)
                    .frame(width: 7, height: 7)
                Image(systemName: "phone.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                CallHeaderDurationLabel()
            }
            .foregroundColor(MeeshyColors.success)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xs)
            .background(
                Capsule()
                    .fill(MeeshyColors.success.opacity(MeeshyOpacity.light))
                    .overlay(Capsule().stroke(MeeshyColors.success.opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.hairline))
            )
        }
        .accessibilityLabel(String(localized: "call.header.return", defaultValue: "Appel en cours, toucher pour revenir", bundle: .main))
    }

    /// Même famille visuelle que `returnToCallIndicator`, sans durée : cet
    /// appareil n'a pas rejoint la session média, rien ne tourne à montrer.
    /// Toucher appelle `CallManager.rejoinActiveCall`, qui reprend la session
    /// directement en `.connecting` ; le snapshot passe alors actif et le
    /// bouton bascule de lui-même sur `returnToCallIndicator`.
    private func rejoinCallIndicator(_ activeCall: ActiveCallSession) -> some View {
        Button {
            // Rejoindre un groupe en cours : les membres présents offrent à
            // l'arrivant, et le premier qui offre devient le pair principal.
            if isGroup { GroupCallMeshCoordinator.shared.markGroupConversation(conversationId, title: calleeName) }
            CallManagerHost.shared.require().rejoinActiveCall(
                callId: activeCall.id,
                conversationId: conversationId,
                remoteUserId: userId,
                remoteUsername: calleeName,
                isVideo: activeCall.isVideo
            )
            HapticFeedback.medium()
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Circle()
                    .fill(MeeshyColors.success)
                    .frame(width: 7, height: 7)
                Image(systemName: "phone.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                Text(String(localized: "call.header.rejoin", defaultValue: "Rejoindre", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            }
            .foregroundColor(MeeshyColors.success)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xs)
            .background(
                Capsule()
                    .fill(MeeshyColors.success.opacity(MeeshyOpacity.light))
                    .overlay(Capsule().stroke(MeeshyColors.success.opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.hairline))
            )
        }
        .accessibilityLabel(String(localized: "call.header.rejoin.a11y", defaultValue: "Appel en cours, toucher pour rejoindre", bundle: .main))
    }

    /// Réconcilie avec le serveur à chaque ouverture : l'état local ne sait pas
    /// distinguer « aucun appel » de « appel actif dont cette session s'est
    /// perdue ». Sauté quand la pile locale sait déjà (inutile de frapper le
    /// réseau, et une course pourrait contredire l'état local).
    private func reconcileActiveCall() async {
        guard CallHeaderPresentation.shouldReconcile(snapshot: snapshot) else { return }
        // try? aplatit throws + Optional (SE-0230) : une erreur réseau et
        // « aucun appel » donnent nil — réconciliation silencieuse, jamais une erreur.
        let session = try? await ActiveCallService.shared.activeCall(conversationId: conversationId)
        reconciledActiveCall = session?.conversationId == conversationId ? session : nil
    }

    /// Bouton d'appel unique : un `Menu` qui laisse choisir vocal ou vidéo. Le
    /// glyphe adopte le verre adaptatif (Liquid Glass iOS 26, repli
    /// `.ultraThinMaterial` en deçà) teinté à l'accent de la conversation.
    private var startCallButtons: some View {
        Menu {
            Button {
                startCall(isVideo: false)
            } label: {
                Label(String(localized: "call.start.audio", defaultValue: "Appel vocal", bundle: .main), systemImage: "phone.fill")
            }
            Button {
                startCall(isVideo: true)
            } label: {
                Label(String(localized: "call.start.video", defaultValue: "Appel vidéo", bundle: .main), systemImage: "video.fill")
            }
        } label: {
            callGlyph("phone.fill")
                .meeshyTapTarget()
        }
        .accessibilityLabel(isGroup
            ? String(localized: "call.group.start.menu", defaultValue: "Appeler le groupe", bundle: .main)
            : String(localized: "call.start.menu", defaultValue: "Appeler", bundle: .main))
        .accessibilityHint(isGroup
            ? String(localized: "call.group.start.menu.hint", defaultValue: "Appel vocal ou vidéo avec les membres du groupe, jusqu'à 6 personnes", bundle: .main)
            : String(localized: "call.start.menu.hint", defaultValue: "Choisir un appel vocal ou vidéo", bundle: .main))
    }

    private func startCall(isVideo: Bool) {
        let conversationId = conversationId
        let userId = userId
        let calleeName = calleeName
        guard isGroup else {
            Task { await CallManagerHost.shared.require().requestPermissionsThenStartCall(conversationId: conversationId, userId: userId, displayName: calleeName, isVideo: isVideo) }
            return
        }
        Task { await CallManagerHost.shared.require().startGroupCall(conversationId: conversationId, title: calleeName, isVideo: isVideo) }
    }

    private func callGlyph(_ systemName: String) -> some View {
        Image(systemName: systemName)
            .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
            .foregroundStyle(
                LinearGradient(
                    colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            // Même cercle que `expandedHeaderSearchButton` (28×28, police 13) :
            // les deux boutons de l'en-tête se lisent à la même taille.
            // `.adaptiveGlass` DOIT précéder `.meeshyTapTarget()` : le verre est
            // un Circle dimensionné aux bornes COURANTES de la vue — appliqué
            // après le `.frame(minWidth: 44…)` du tap target, il se dessinait à 44 pt.
            .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
            .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(0.4), interactive: true)
            .meeshyTapTarget()
    }
}

/// La durée de l'appel, lue SANS abonnement : `TimelineView` (1 Hz) relit
/// `formattedDuration` sur la pile quand elle existe — rien ne s'observe.
struct CallHeaderDurationLabel: View {
    var body: some View {
        CallDurationClock {
            Text(CallManagerHost.shared.manager?.formattedDuration ?? "")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold, design: .monospaced))
        }
    }
}
