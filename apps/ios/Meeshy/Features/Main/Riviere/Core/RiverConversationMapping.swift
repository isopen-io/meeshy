import Foundation
import MeeshySDK
import MeeshyUI

/// Le pont PUR entre le fil d'une conversation (`MeeshyMessage`) et la loi de
/// la Rivière (`RiverLaneResolver`) — chantier Rivière iOS, lot 1
/// (2026-08-21). Zéro pixel, zéro singleton : tout est injecté.
///
/// Règle produit relayée le 2026-08-20 : les messages SYSTÈME (avis
/// d'arrivée, résumés d'appel — `messageSource == .system`) ne sont la voix
/// de personne — sinon l'arrivant obtenait une lane fantôme et l'avis un rang
/// dans sa colonne.
///
/// **Lot 2 (2026-08-21) — ils ne sortent plus de la loi, ils y entrent
/// MARQUÉS.** Le lot 1 les écartait AVANT `resolveRiverLanes` : la lane
/// fantôme disparaissait, mais l'avis avec elle — un lecteur en Rivière ne
/// voyait jamais « X a rejoint la conversation ». La loi partagée sait faire
/// mieux depuis `RiverMessageInput.isSystem` : un avis marqué descend l'axe du
/// TEMPS avec les autres (il garde son rang, il est servi dans
/// `geometry.bubbles`) et n'entre dans AUCUN des deux autres axes — ni voix,
/// ni couloir, ni connecteur, ni groupe (`RiverLaneResolver.spokenOnly`). La
/// peau le rend alors GRAVÉ, pleine largeur, heure en tête
/// (`RiverSystemNotice`, `RiverBubbleView`, `RiverStreamHost`) : exactement ce
/// que le Fil et Focal en font, avec les mêmes vues et les mêmes clés i18n.
/// Où une bulle se tient dans son GROUPE (messages consécutifs d'une même
/// voix, tels que la loi les découpe par `isFirstInGroup`). La loi ne dit que
/// la tête ; la queue se lit sur le rang SUIVANT — ici, purement, jamais dans
/// la vue.
///
/// Directive produit 2026-08-22 : « deux messages envoyés à la suite et
/// faisant partie du même groupe ont LEUR BORDURE JOINTE en pointillé et
/// partagée — non pas des bordures fermées puis des pointillés en plus ». La
/// position dit donc quels bords sont fermés et lequel est partagé : une
/// bulle qui CONTINUE un groupe porte la jointure pointillée en haut
/// (`joinsAbove`) ; une bulle que la suivante continue laisse son bas OUVERT
/// (`joinsBelow`) pour que la suivante vienne s'y coller.
nonisolated enum RiverGroupPosition: Equatable {
    /// Seule dans son groupe : contour fermé des quatre côtés.
    case solo
    /// Première d'un groupe qui continue : haut fermé, bas ouvert.
    case head
    /// Entre deux bulles du même groupe : haut partagé, bas ouvert.
    case middle
    /// Dernière d'un groupe : haut partagé, bas fermé.
    case tail

    /// Le bord haut est la JOINTURE pointillée avec la bulle précédente.
    var joinsAbove: Bool { self == .middle || self == .tail }
    /// Le bord bas reste ouvert : la bulle suivante vient s'y coller.
    var joinsBelow: Bool { self == .head || self == .middle }
}

nonisolated enum RiverConversationMapping {

    /// Le libellé du lecteur — EXACTEMENT celui de l'en-tête de couloir
    /// (`RiverLaneHeaderStrip`, clé `riviere.header.you`).
    @MainActor
    static var viewerLabel: String {
        String(localized: "riviere.header.you", defaultValue: "Toi", bundle: .main)
    }

    /// Ce que la loi doit voir : TOUT ce qui a un rang dans le temps — les
    /// voix ET les avis, ces derniers MARQUÉS `isSystem` (lot 2). Seuls les
    /// messages supprimés restent dehors : une bulle vide ferait un rang vide.
    ///
    /// Les participants, eux, sont les VOIX seules — dérivés des expéditeurs
    /// (dernier nom connu), jamais d'un second fetch. Un auteur d'avis qui
    /// n'a jamais parlé n'y figure donc pas : la loi ne lui fera naître
    /// aucune branche, et sa graine de couleur n'aurait servi à rien.
    static func lanesInput(
        messages: [MeeshyMessage],
        viewerId: String,
        silenceWindowMs: Double? = nil
    ) -> RiverLaneResolver.ResolveRiverLanesInput {
        let ranked = messages.filter { !$0.isDeleted }
        var namesById: [String: String] = [:]
        var order: [String] = []
        for message in ranked where isVoice(message) {
            if namesById[message.senderId] == nil { order.append(message.senderId) }
            namesById[message.senderId] = displayName(of: message)
        }
        return RiverLaneResolver.ResolveRiverLanesInput(
            messages: ranked.map {
                RiverLaneResolver.RiverMessageInput(
                    id: $0.id,
                    senderId: $0.senderId,
                    createdAt: .date($0.createdAt),
                    replyToMessageId: $0.replyToId,
                    // La marque que `senderId` ne peut pas porter : l'avis
                    // d'arrivée est écrit avec l'ARRIVANT pour auteur
                    // (`packages/shared/utils/join-notice.ts`).
                    isSystem: $0.messageSource == .system
                )
            },
            participants: order.map { RiverLaneResolver.RiverParticipantInput(id: $0, displayName: namesById[$0] ?? $0) },
            viewerId: viewerId,
            silenceWindowMs: silenceWindowMs
        )
    }

    /// **La fenêtre de silence ne peut pas être une constante — et elle ne
    /// peut pas non plus être devinée.**
    ///
    /// Elle décide combien de temps une branche survit à sa dernière prise de
    /// parole, donc combien de voix tiennent SIMULTANÉMENT dans le plan.
    /// Arbitrage produit 2026-08-21 : « il devrait aller jusqu'à 7 personnes
    /// alignées sur l'horizontal pour les communications de l'ordre des dix
    /// minutes — valeur configurable : dans une conversation peu causante on
    /// peut monter en heures ou en jours, là où dans une conversation très
    /// dynamique on peut passer en minutes voire en dessous ».
    ///
    /// Deux essais l'ont montré au simulateur : une fenêtre TROP LARGE fait
    /// déborder l'axe (plus de `maxLanes` branches vivantes au même instant ⇒
    /// `.aboveMaximum`), une fenêtre TROP COURTE le vide (moins de `minVoices`
    /// ⇒ `.belowMinimum`) — les deux rabattent le plan sur une colonne unique.
    /// Le bon réglage dépend de la conversation, et aucune formule fermée ne
    /// le donne : il se CHERCHE.
    ///
    /// La recherche est bornée et pure — on rejoue la loi (fonction pure, sans
    /// I/O) sur une échelle de fenêtres allant du jour à la minute, et on
    /// garde celle qui aligne le PLUS de voix sans déborder. Aucun seuil n'est
    /// deviné, aucune constante de loi n'est recopiée
    /// (`RiverLaneResolver.laneSilenceWindowMs` sert de premier barreau).
    /// Si aucune ne donne un plan à couloirs, on rend `nil` : la loi applique
    /// son défaut et prononce elle-même sa sérialisation, plutôt qu'un nombre
    /// fabriqué qui prétendrait avoir essayé.
    static func resolveGeometry(
        messages: [MeeshyMessage],
        viewerId: String
    ) -> RiverLaneResolver.RiverGeometry {
        let base = lanesInput(messages: messages, viewerId: viewerId, silenceWindowMs: nil)
        var best: RiverLaneResolver.RiverGeometry?

        for window in silenceWindowLadder {
            let candidate = RiverLaneResolver.resolveRiverLanes(
                lanesInput(messages: messages, viewerId: viewerId, silenceWindowMs: window)
            )
            guard candidate.layout == .lanes else { continue }
            if best == nil || candidate.laneCount > best!.laneCount {
                best = candidate
            }
            if candidate.laneCount >= RiverLaneResolver.maxLanes { break }
        }

        return best ?? RiverLaneResolver.resolveRiverLanes(base)
    }

    /// L'échelle des fenêtres essayées, du plus large au plus serré : une
    /// conversation qui s'étale sur des jours garde ses voix côte à côte, une
    /// conversation en rafale se resserre jusqu'à la minute. Le défaut de la
    /// loi y figure comme un barreau parmi d'autres — jamais comme un plancher
    /// caché.
    static let silenceWindowLadder: [Double] = [
        7 * 24 * 60 * 60 * 1000,
        24 * 60 * 60 * 1000,
        6 * 60 * 60 * 1000,
        60 * 60 * 1000,
        RiverLaneResolver.laneSilenceWindowMs,
        10 * 60 * 1000,
        5 * 60 * 1000,
        2 * 60 * 1000,
        60 * 1000,
        30 * 1000,
    ]

    /// Un message est une VOIX s'il vient d'un humain ou d'un agent — jamais du
    /// système, jamais supprimé (une bulle vide ferait un rang vide).
    static func isVoice(_ message: MeeshyMessage) -> Bool {
        message.messageSource != .system && !message.isDeleted
    }

    static func displayName(of message: MeeshyMessage) -> String {
        message.senderName ?? message.senderUsername ?? message.senderId
    }

    /// Une citation tient sur UNE ligne (§7ter A4) : retours à la ligne et
    /// blancs répétés repliés en un espace. `previewText` arrive brut du
    /// message cité — laissé tel quel, il faisait gonfler le bloc de citation
    /// à la hauteur de toutes ses lignes (mesuré au simulateur 2026-08-22).
    static func singleLine(_ text: String) -> String {
        text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    /// Position de groupe de CHAQUE bulle, déduite de la loi seule : la tête
    /// est `isFirstInGroup` ; la bulle est suivie dans son groupe si le rang
    /// SUIVANT n'ouvre pas de groupe. Un avis système ouvre toujours un groupe
    /// (la loi ne le rattache à personne), donc il coupe celui qui le précède.
    static func groupPositions(bubbles: [RiverLaneResolver.RiverBubble]) -> [String: RiverGroupPosition] {
        Dictionary(uniqueKeysWithValues: bubbles.enumerated().map { index, bubble in
            let next = bubbles.indices.contains(index + 1) ? bubbles[index + 1] : nil
            let isFollowed = next.map { !$0.isFirstInGroup && !$0.isSystem } ?? false
            let position: RiverGroupPosition
            switch (bubble.isFirstInGroup || bubble.isSystem, isFollowed) {
            case (true, false): position = .solo
            case (true, true): position = .head
            case (false, true): position = .middle
            case (false, false): position = .tail
            }
            return (bubble.messageId, position)
        })
    }

    /// Ce que le lecteur voit dans chaque bulle — texte PRISME (résolu par
    /// l'appelant), heure, nom, graine de couleur, aperçu de la réponse.
    /// `@MainActor` : `RiverBubbleContent` est un modèle de VUE (isolé) ;
    /// la règle reste pure — rien n'est lu hors de ses arguments.
    ///
    /// R-5 : la présence et le cercle de story de la voix sont RÉSOLUS par
    /// l'appelant (`PresenceManager`, `StoryViewModel`) et injectés — par
    /// défaut muets. La fiche (`ProfileSheetUser.from(message:)`) est celle
    /// que le Fil ouvre, jamais une seconde composition d'identité.
    @MainActor
    static func contents(
        geometry: RiverLaneResolver.RiverGeometry,
        messages: [MeeshyMessage],
        viewerId: String,
        text: (MeeshyMessage) -> String,
        time: (Date) -> String,
        presence: (MeeshyMessage) -> PresenceState? = { _ in nil },
        storyRing: (MeeshyMessage) -> StoryRingState = { _ in .none }
    ) -> [RiverBubbleContent] {
        let byId = Dictionary(messages.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let positions = groupPositions(bubbles: geometry.bubbles)
        return geometry.bubbles.compactMap { bubble in
            guard let message = byId[bubble.messageId] else { return nil }
            let resolvedTime = time(message.createdAt)
            return RiverBubbleContent(
                bubble: bubble,
                senderDisplayName: displayName(of: message),
                // MÊME valeur que `RiverParticipantInput.displayName` ci-dessus
                // — c'est elle que la loi a donnée à la branche
                // (`RiverLane.colorSeed`). `senderName ?? senderId` sautait le
                // repli par pseudo : un auteur sans `senderName` peignait sa
                // bulle d'une couleur et son trait d'une autre.
                colorSeed: displayName(of: message),
                timeString: resolvedTime,
                text: text(message),
                layout: geometry.layout,
                replyPreview: message.replyTo.map {
                    RiverReplyPreview(authorDisplayName: singleLine($0.authorName), text: singleLine($0.previewText))
                },
                systemNotice: systemNotice(for: message, viewerId: viewerId, timeString: resolvedTime, text: text),
                groupPosition: positions[bubble.messageId] ?? .solo,
                identity: bubble.isSystem ? nil : RiverBubbleIdentity(
                    avatarURL: message.senderAvatarURL,
                    presence: presence(message),
                    storyRing: storyRing(message),
                    profileUser: ProfileSheetUser.from(message: message),
                    userId: message.senderIsAnonymous ? nil : (message.senderUserId ?? message.senderId)
                )
            )
        }
    }

    /// L'avis, prêt à peindre — non-nil UNIQUEMENT pour un message système.
    ///
    /// Le libellé ne se réécrit PAS ici : `BubbleContent` (le MÊME
    /// constructeur que `ThemedMessageBubble` et `MessageListViewController`)
    /// résout déjà l'arrivée et le résumé d'appel, avec leurs clés i18n et
    /// leur direction par lecteur. La Rivière n'en fait que le décor.
    @MainActor
    static func systemNotice(
        for message: MeeshyMessage,
        viewerId: String,
        timeString: String,
        text: (MeeshyMessage) -> String
    ) -> RiverSystemNotice? {
        guard message.messageSource == .system else { return nil }
        let content = BubbleContent(
            message: message,
            translations: [],
            preferredTranslation: nil,
            currentUserId: viewerId,
            timeString: timeString
        )
        if let joinNotice = content.joinNotice { return .join(joinNotice) }
        if let callNotice = content.callNotice { return .call(callNotice) }
        return .plain(text(message))
    }

    /// R-6 — la citation mène à sa cible : le curseur du message cité,
    /// couloir et rang tels que la loi les a servis. `nil` si le message
    /// n'est pas dans la fenêtre, ou s'il est un avis système (la loi ne lui
    /// donne aucun couloir — il n'est la cible de personne).
    static func cursor(forMessageId messageId: String, geometry: RiverLaneResolver.RiverGeometry) -> RiverLaneResolver.RiverCursor? {
        guard let bubble = geometry.bubbles.first(where: { $0.messageId == messageId }), !bubble.isSystem else { return nil }
        return RiverLaneResolver.RiverCursor(laneIndex: bubble.laneIndex, rank: bubble.rank)
    }

    /// Curseur d'ouverture : la bulle la plus RÉCENTE — là où le lecteur
    /// arrive dans le fil — sinon la rive du lecteur au premier rang.
    static func initialCursor(geometry: RiverLaneResolver.RiverGeometry) -> RiverLaneResolver.RiverCursor {
        guard let last = geometry.bubbles.max(by: { $0.rank < $1.rank }) else {
            return RiverLaneResolver.RiverCursor(laneIndex: 0, rank: 0)
        }
        return RiverLaneResolver.RiverCursor(laneIndex: last.laneIndex, rank: last.rank)
    }

    /// « Au présent » (#3901) : le curseur porte le rang de la bulle la plus
    /// RÉCENTE — même calcul que `initialCursor`. Preuve de consultation pour
    /// le rattrapage du badge en Rivière (`ConversationViewModel
    /// .markCaughtUpFromSummaryOrRiver`) : un fil sans bulle n'a rien à
    /// rattraper.
    static func isAtPresent(cursor: RiverLaneResolver.RiverCursor, geometry: RiverLaneResolver.RiverGeometry) -> Bool {
        guard let mostRecentRank = geometry.bubbles.map(\.rank).max() else { return false }
        return cursor.rank == mostRecentRank
    }

    /// Empreinte du fil pour ne recalculer la géométrie que si les messages
    /// QUI ONT UN RANG ont changé (ids + compte).
    ///
    /// Lot 2 : les avis système en font désormais partie. Tant qu'ils étaient
    /// écartés de la loi, les ignorer ici était juste ; maintenant qu'ils
    /// occupent un rang, une arrivée qui n'aurait pas changé l'empreinte
    /// n'aurait jamais été redessinée.
    ///
    /// **Elle n'ALLOUE plus.** La docstring promettait « jamais à chaque passe
    /// de body » et le site d'appel la contredisait : l'empreinte est passée en
    /// ARGUMENT d'`adaptiveOnChange(of:)`, donc réévaluée à chaque évaluation
    /// du body — et elle construisait alors une chaîne de N identifiants
    /// (`map(\.id).joined(separator: "|")`), soit une allocation
    /// proportionnelle au fil, à chaque passe. Sur une conversation de mille
    /// messages, une chaîne de ~25 ko par frame.
    ///
    /// Le COMPARATEUR n'a jamais eu besoin de la chaîne : seule l'égalité
    /// compte. Un `Hasher` parcourt les mêmes identifiants sans rien allouer,
    /// et le compte l'accompagne pour que deux fils distincts n'aient pas à se
    /// fier au seul hachage.
    ///
    /// L'empreinte ne vaut QUE dans le processus qui l'a calculée
    /// (`Hasher` est ensemencé par exécution) — elle ne se persiste pas, ne se
    /// journalise pas et ne voyage sur aucun fil.
    struct Fingerprint: Equatable {
        let count: Int
        let digest: Int
    }

    static func fingerprint(messages: [MeeshyMessage]) -> Fingerprint {
        var hasher = Hasher()
        var count = 0
        for message in messages where !message.isDeleted {
            hasher.combine(message.id)
            count += 1
        }
        return Fingerprint(count: count, digest: hasher.finalize())
    }
}
