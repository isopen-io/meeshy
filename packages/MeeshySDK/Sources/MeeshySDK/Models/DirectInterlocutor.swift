import Foundation

// MARK: - L'interlocuteur d'une conversation directe (#11164)
//
// Un direct n'a pas de nom propre : il porte celui de l'AUTRE participant, et
// avec lui son identifiant, son pseudo, son avatar, sa bannière et son contour.
// Ces six champs dérivent d'UNE élection, faite contre l'identifiant du
// lecteur — ils sont donc vrais ensemble ou faux ensemble, jamais à moitié.

extension APIConversation {
    /// L'AUTRE participant, élu contre le LECTEUR.
    ///
    /// Un lecteur INCONNU — identifiant vide, session dont le profil n'est pas
    /// encore chargé — n'élit personne. « Celui qui n'est pas le lecteur »
    /// serait alors le premier participant servi, le plus souvent le lecteur
    /// lui-même (le créateur du direct), et la ligne se graverait sous son nom
    /// et son avatar (#11164).
    func interlocutor(readerId: String) -> APIParticipant? {
        guard !readerId.isEmpty else { return nil }
        return participants?.first { $0.userId != readerId }
    }

    /// Le nom d'un direct : l'interlocuteur élu, sinon l'expéditeur du dernier
    /// message quand on SAIT qu'il n'est pas le lecteur, sinon un nom générique
    /// honnête. Jamais le `title` stocké — un artefact « X et Y » du legacy, qui
    /// nomme aussi le lecteur.
    func directDisplayName(interlocutor: APIParticipant?, readerId: String) -> String {
        if let interlocutor { return interlocutor.user?.name ?? interlocutor.name }
        if !readerId.isEmpty, let sender = lastMessage?.sender,
           (sender.resolvedUserId ?? sender.id) != readerId {
            return sender.name
        }
        return "Conversation"
    }
}

extension MeeshyConversation {
    /// Ce que le cache sait de l'interlocuteur, reporté sur une ligne servie
    /// qui ne l'a PAS élu (lecteur inconnu, participants non servis). Une ligne
    /// qui ne sait rien de lui n'efface pas celle qui sait.
    func keepingInterlocutor(of known: MeeshyConversation) -> MeeshyConversation {
        guard type == .direct, participantUserId == nil, known.participantUserId != nil else { return self }
        var kept = self
        kept.title = known.title
        kept.participantUserId = known.participantUserId
        kept.participantUsername = known.participantUsername
        kept.participantAvatarURL = known.participantAvatarURL
        kept.participantBanner = known.participantBanner
        kept.participantRing = known.participantRing
        return kept
    }

    /// La ligne d'un direct gravée sous le LECTEUR : son « interlocuteur » est
    /// lui-même. Aucune élection juste ne produit cet état — seule une élection
    /// faite sans connaître le lecteur.
    func isInterlocutorTheReader(_ readerId: String) -> Bool {
        type == .direct && !readerId.isEmpty && participantUserId == readerId
    }

    /// La même ligne sans l'identité fausse : rien de ce qu'elle disait de
    /// l'interlocuteur n'était vrai, le nom générique l'est.
    func withoutInterlocutor() -> MeeshyConversation {
        var cleared = self
        cleared.title = "Conversation"
        cleared.participantUserId = nil
        cleared.participantUsername = nil
        cleared.participantAvatarURL = nil
        cleared.participantBanner = nil
        cleared.participantRing = nil
        return cleared
    }

    /// L'identité qu'une ligne `/sync` SERT, appliquée à la ligne du cache.
    ///
    /// Groupe, communauté, canal : le titre servi avance, verbatim. Direct : le
    /// titre ne se sépare plus de l'interlocuteur dont il dérive — l'id, le
    /// pseudo, l'avatar et le contour avancent avec lui, sans quoi une ligne
    /// gravée sous le lecteur gardait son avatar après que son titre était
    /// réparé. `/sync` ne sert pas la bannière : elle reste si l'interlocuteur
    /// est le même, tombe s'il change. Sans interlocuteur élu, rien ne bouge.
    func adoptingServedIdentity(of served: MeeshyConversation) -> MeeshyConversation {
        var adopted = self
        guard served.type == .direct else {
            adopted.title = served.title
            return adopted
        }
        guard served.participantUserId != nil else { return self }
        let sameInterlocutor = participantUserId == served.participantUserId
        adopted.title = served.title
        adopted.participantUserId = served.participantUserId
        adopted.participantUsername = served.participantUsername
        adopted.participantAvatarURL = served.participantAvatarURL
        adopted.participantBanner = served.participantBanner ?? (sameInterlocutor ? participantBanner : nil)
        adopted.participantRing = served.participantRing
        return adopted
    }
}
