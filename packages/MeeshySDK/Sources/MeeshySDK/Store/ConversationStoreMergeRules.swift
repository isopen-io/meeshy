import Foundation

/// Pure merge rules behind `ConversationStore.merging(...)`. No state, no I/O:
/// the RAM store and the disk-cache writer (`ConversationSyncEngine`) both apply
/// THESE rules, so they can never disagree on what a socket payload means.
enum ConversationStoreMergeRules {

    // MARK: - conversation:updated

    static func merging(
        _ conversation: MeeshyConversation,
        with event: ConversationUpdatedStoreEvent
    ) -> MeeshyConversation? {
        var conv = conversation
        var changed = false

        // `>=` et non `>` : la règle DOCUMENTÉE ci-dessus est « un `lastMessageAt`
        // plus ANCIEN décrit un message périmé ». Un `>` strict rejetait aussi
        // l'ÉGALITÉ — c'est-à-dire le même message, qui n'est pas périmé du tout.
        // C'est exactement ce que produit une ÉDITION : le contenu change, le
        // message (donc son `createdAt`) ne change pas. Tout le groupe d'aperçu
        // était donc silencieusement jeté sur le seul chemin qui en avait besoin.
        // Ré-appliquer les mêmes valeurs sur un doublon d'événement est idempotent.
        let lastMessageIsCurrent = event.lastMessageAt.map { $0 >= conv.lastMessageAt } ?? true

        // …sauf quand le serveur DÉCLARE avoir recalculé l'aperçu depuis sa base.
        //
        // La garde monotone lit un recul comme la marque d'un message périmé.
        // C'en est une pour un événement message-driven, qui ne porte que le
        // message qu'on vient d'écrire. C'en est une FAUSSE pour un recalcul :
        // supprimer le dernier message pour tous fait redescendre la ligne sur
        // le message PRÉCÉDENT, et un lecteur qui masque son propre dernier
        // message visible se voit servir un remplaçant plus ancien par
        // construction. Les deux reculent, les deux nomment un autre message —
        // du seul contenu, ils sont indiscernables, et la garde jetait donc le
        // groupe ENTIER sur deux chemins nominaux. C'est pourquoi le
        // discriminant ne pouvait venir que de l'émetteur.
        //
        // Ce qu'il ne faut PAS faire à la place : omettre `lastMessageAt` du
        // payload pour passer sous la garde. Le champ deviendrait faux et le tri
        // de la liste avec lui — on remplacerait un aperçu périmé par un tri
        // périmé.
        //
        // Reste assumé : deux recalculs qui se doubleraient s'appliquent dans
        // l'ordre d'ARRIVÉE. Une même connexion Socket.IO préserve l'ordre
        // d'émission, et le cas où ça se joue vraiment — une traduction qui
        // atterrit derrière un message plus neuf — est déjà tenu côté serveur
        // par la borne `onlyIfLatestIs`, qui abandonne le fan-out.
        if lastMessageIsCurrent || event.previewRecalculated {
            // « Ce lecteur n'a plus AUCUN message visible ici » — il vient de
            // masquer POUR LUI le dernier qui lui restait. Le serveur l'énonce
            // en posant tout le groupe à `null`, et cette branche doit sortir en
            // premier : lu par les `if let` d'en dessous, ce payload ne dit
            // RIEN (chaque champ est jeté un par un), et la ligne garde l'aperçu
            // de ce qui vient de disparaître — définitivement, puisque plus rien
            // ne bougera dans cette conversation.
            //
            // Le fait est porté par l'IDENTITÉ du message et par elle seule :
            // c'est le seul champ du groupe dont l'ABSENCE (métadonnées) et la
            // NULLITÉ (plus rien) se distinguent sur le fil. `lastMessageAt`
            // nul, lui, décrit aussi bien un renommage.
            if case .replaced(.none) = event.lastMessage {
                changed = conv.clearLastMessage() || changed
            } else {
                if let incoming = event.lastMessageAt { conv.lastMessageAt = incoming; changed = true }
                // Nommer un AUTRE message, c'est cesser de décrire le
                // précédent. Le payload recalculé ne porte que l'identité, le
                // texte et le Prisme : l'auteur, les pièces jointes et les
                // drapeaux éphémères de l'ancien message survivraient à un
                // simple `conv.lastMessageId = id`, et la ligne décrirait un
                // mélange des deux (« Vue unique » sur un texte neuf, la
                // vignette d'une photo supprimée sous l'aperçu de son
                // remplaçant). `adoptLastMessage` les remet à neutre — et se
                // tait quand l'identité ne change pas, c'est-à-dire à l'ÉDITION
                // et à la TRADUCTION, où ils restent vrais.
                //
                // Posé AVANT les champs ci-dessous, qui reposent ce que ce
                // payload-ci porte vraiment.
                if case .replaced(.some(let id)) = event.lastMessage {
                    conv.adoptLastMessage(id: id)
                    // L'épingle fait partie de ce que `adoptLastMessage` vient
                    // de remettre à neutre, et c'est le seul de ces champs que
                    // le payload PORTE vraiment — les trois émetteurs la hissent
                    // depuis `metadata.location` du message qu'ils nomment. La
                    // reposer est donc exactement le geste que
                    // `adoptLastMessage` demande à son appelant ; l'omettre
                    // laissait une ligne BLANCHE derrière un message
                    // position-seule, dont l'aperçu est vide par construction.
                    //
                    // Écrite AVEC l'identité et jamais seule : `nil` efface
                    // l'épingle du message précédent quand un texte le remplace.
                    // Même règle, au même endroit, que le chemin jumeau de
                    // `ConversationListViewModel` — et c'est le seul point du
                    // groupe d'aperçu où les deux fusions divergeaient.
                    conv.lastMessageLocation = event.location
                    changed = true
                }
                if let v = event.lastMessagePreview { conv.lastMessagePreview = v.meeshyPreviewTruncated; changed = true }
                // L'AUTEUR appartient au même groupe monotone que l'aperçu, et
                // se repose au même endroit (#6921). `adoptLastMessage` vient de
                // l'effacer — à raison — et rien ne le remettait : la ligne
                // gardait le texte et perdait son préfixe, y compris dans le
                // cache disque, donc jusqu'au prochain rechargement complet.
                // `nil` reste `nil` : la garde anti-périmé est intacte.
                // Comme au ViewModel : seul ce que l'événement AFFIRME s'écrit.
                // `.unchanged` laisse l'auteur en place — `adoptLastMessage` a
                // déjà tranché le cas du message neuf juste au-dessus.
                if case .display(let auteur) = ConversationListAuthor.resolve(
                    eventSenderId: event.senderId,
                    eventSenderUserId: event.senderUserId,
                    eventSenderName: event.lastMessageSenderName,
                    currentUserId: event.readerId,
                    conversationType: conv.type,
                    peerUserId: conv.participantUserId,
                    peerUsername: conv.participantUsername,
                    youLabel: event.youLabel,
                    eventMessageId: event.lastMessage.messageId,
                    rowMessageId: conv.lastMessageId,
                    rowSenderName: conv.lastMessageSenderName
                ), auteur != conv.lastMessageSenderName {
                    conv.lastMessageSenderName = auteur
                    conv.lastMessageSenderUserId = ConversationListAuthor.peerUserId(
                        senderUserId: event.senderUserId, senderName: auteur,
                        readerId: event.readerId, youLabel: event.youLabel
                    )
                    changed = true
                }
                // Le Prisme fait partie du MÊME groupe monotone : le résolveur
                // préfère la traduction à l'aperçu brut, donc poser l'un sans
                // l'autre laisse la ligne rendre l'ANCIEN texte traduit.
                // `.replaced([:])` → `nil` : le résolveur doit distinguer « pas de
                // carte » d'une carte vide (cf. `resolvedLastMessagePreview`).
                if case .replaced(let map) = event.lastMessageTranslations {
                    conv.lastMessageTranslations = map.isEmpty ? nil : map
                    conv.lastMessageOriginalLanguage = event.lastMessageOriginalLanguage
                    changed = true
                }
                // Média et nature du message NOMMÉ (#7548) : ils ne valent que
                // pour lui, donc ne s'écrivent qu'avec son identité. Sans eux,
                // une ligne touchée par ce seul événement (conversation fermée,
                // hors de la room) perdait icône, détails et effets.
                if case .replaced(.some(_)) = event.lastMessage {
                    if let media = event.media {
                        conv.lastMessageAttachments = media.attachments
                        conv.lastMessageAttachmentCount = media.attachmentCount
                        conv.lastMessageIsBlurred = media.isBlurred
                        conv.lastMessageIsViewOnce = media.isViewOnce
                        conv.lastMessageExpiresAt = media.expiresAt
                        changed = true
                    }
                    if let nature = event.nature, nature != conv.lastMessageNature {
                        conv.lastMessageNature = nature
                        changed = true
                    }
                }
            }
        }
        // Hors du groupe monotone : la dernière réaction et l'appel en cours ne
        // décrivent pas le dernier message et vivent leur propre vie (#7545).
        if case .replaced(let reaction) = event.lastReaction, reaction != conv.lastReaction {
            conv.lastReaction = reaction
            conv.lastReactionTargetsReader = reaction?.targets(readerId: event.readerId ?? "") ?? false
            changed = true
        }
        if case .replaced(let call) = event.activeCall, call != conv.activeCall {
            conv.activeCall = call
            changed = true
        }
        // #9026 — le rang SERVI, monotone : un rang plus ancien arrivé en retard
        // ne redescend jamais la ligne (l'activité serveur l'est aussi).
        if let rank = event.listRankAt, rank > (conv.listRankAt ?? .distantPast) {
            conv.listRankAt = rank
            changed = true
        }
        // Un DM ne porte JAMAIS le titre de la base : `APIConversation
        // .toConversation` l'écarte explicitement et pose à la place le nom du
        // participant d'en face. Le payload socket, lui, porte le titre BRUT —
        // `PUT /conversations/:id` n'interdit pas de renommer une conversation
        // `direct`, et le rôle `creator` que reçoit l'auteur d'un DM à sa
        // création suffit à passer son contrôle d'accès.
        //
        // L'écran porte cette garde depuis le 2026-07-04 (« sandra raveloson »
        // → « Sany », `ConversationListViewModel`). Elle manquait ICI, et c'est
        // cette copie-ci qui écrit le CACHE DISQUE (`ConversationSyncEngine
        // .applyingConversationUpdate` délègue à cette même fonction) : le nom
        // greffé survivait au redémarrage, et revenait à l'écran avant même
        // celui-ci, la réécriture du cache rediffusant la liste par
        // `conversationsDidChange`. La garde de l'écran ne protégeait donc que
        // le chemin socket direct, pas celui qui la contournait par le cache.
        //
        // Miroir exact de `merging(_:withUserUpdate:)` vingt lignes plus bas,
        // qui dérive DÉJÀ le titre d'un DM du contact d'en face : les deux
        // règles de fusion de ce fichier disent enfin la même chose du même
        // champ.
        if let v = event.title, conv.type != .direct { conv.title = v; changed = true }
        if let v = event.avatar { conv.avatar = v; changed = true }
        if let v = event.description { conv.description = v; changed = true }
        if let v = event.banner { conv.banner = v; changed = true }
        if let v = event.isAnnouncementChannel { conv.isAnnouncementChannel = v; changed = true }
        if let v = event.defaultWriteRole { conv.defaultWriteRole = v; changed = true }
        if let v = event.slowModeSeconds { conv.slowModeSeconds = v; changed = true }
        if let v = event.autoTranslateEnabled { conv.autoTranslateEnabled = v; changed = true }

        return changed ? conv : nil
    }

    // MARK: - user:updated

    /// Pure merge rule behind `applyUserUpdated`, returning `nil` when the
    /// payload changes nothing for this conversation. Lifted out of the actor
    /// for the same reason as `merging(_:with:)` — le cache disque doit
    /// appliquer LA MÊME règle que le store RAM.
    ///
    /// La ligne d'une conversation directe est hydratée par le REST depuis le
    /// participant d'en face : `title` ← `APIConversationUser.name`,
    /// `participantAvatarURL` ← `resolvedAvatar`, etc. Le socket rejoue
    /// exactement ces champs-là, sinon la ligne dirait deux choses différentes
    /// selon le transport qui l'a remplie. Le nom est le nom COMPOSÉ
    /// (`UserUpdatedEvent.composedName`, #9307) : c'est lui que la passerelle
    /// écrit dans `Participant.displayName` au renommage, donc lui que le REST
    /// relit.
    static func merging(
        _ conversation: MeeshyConversation,
        withUserUpdate event: UserUpdatedEvent
    ) -> MeeshyConversation? {
        var conv = conversation
        var changed = false

        // L'AUTEUR de la dernière ligne (« Bob : … » d'un groupe, #9359) suit
        // la loi unique de l'expéditeur, quel que soit le type de conversation.
        if let author = event.repaintedLastMessageAuthor(of: conversation) {
            conv.lastMessageSenderName = author
            changed = true
        }
        guard conversation.type == .direct,
              conversation.participantUserId == event.userId else { return changed ? conv : nil }

        if let name = event.composedName, name != conv.title {
            conv.title = name
            changed = true
        }
        if event.hasNameGroup, let handle = event.username, handle != conv.participantUsername {
            conv.participantUsername = handle
            changed = true
        }
        // `.replaced(nil)` = photo RETIRÉE : poser `nil` est le but, pas un
        // no-op. Un `if let` ici aurait gardé l'ancienne image pour toujours.
        if case .replaced(let url) = event.avatar, url != conv.participantAvatarURL {
            conv.participantAvatarURL = url
            changed = true
        }
        if case .replaced(let url) = event.banner, url != conv.participantBanner {
            conv.participantBanner = url
            changed = true
        }

        return changed ? conv : nil
    }
}
