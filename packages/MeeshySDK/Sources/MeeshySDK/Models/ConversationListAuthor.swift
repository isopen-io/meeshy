import Foundation

/// **Qui a écrit le dernier message, tel que la LIGNE DE LISTE le préfixe.**
///
/// La ligne rend « `<Auteur>` : `<message>` » (règle produit du 2026-08-22,
/// « juste mettre l'auteur : message »). Ce qui manquait n'était pas le rendu
/// mais ce qui l'ALIMENTE au moment d'un envoi : `conversation:updated` efface
/// l'auteur par construction (`adoptLastMessage` le remet à `nil`, un nouveau
/// message n'ayant a priori pas le même auteur que l'ancien), et seul l'aperçu
/// était REPOSÉ ensuite. D'où le symptôme rapporté : le texte est là, l'auteur
/// a disparu.
///
/// ### Ce résolveur ne casse PAS la garde anti-périmé
///
/// Des témoins existants exigent qu'un auteur périmé ne survive pas à un
/// changement de dernier message — sans quoi « Windie : salut » attribuerait au
/// message suivant l'auteur du précédent. Cette règle est juste. Elle tient ici
/// parce que **rien n'est posé qui ne soit PORTÉ par l'événement** : l'absence
/// d'information reste `nil`, exactement comme avant. Ce qui change est qu'une
/// information PRÉSENTE cesse d'être jetée.
///
/// ### Pourquoi « Toi » ne peut pas se décider au rendu
///
/// `MeeshyConversation` porte un `lastMessageSenderName` mais **aucun
/// `lastMessageSenderId`** : au moment de dessiner la ligne, le client n'a plus
/// de quoi dire « ce message est de moi ». L'événement, lui, porte `senderId`.
/// La décision se prend donc À LA FUSION, là où l'identité est encore là, et le
/// modèle ne reçoit que le mot à afficher. C'est aussi ce qui évite d'ajouter un
/// champ d'identité à un modèle qui est encodé, persisté en GRDB et replié dans
/// une empreinte de rendu.
///
/// Pure, donc testable sans socket, sans base et sans vue — `youLabel` est
/// passé par l'appelant plutôt que lu d'un catalogue, pour que le témoin n'ait
/// pas à monter une localisation.
public enum ConversationListAuthor {

    /// Le mot qui désigne le lecteur, **fourni par l'app**.
    ///
    /// Le SDK ne lit pas le catalogue de l'app : ce mot est traduit là où les
    /// sept langues vivent (`focal.row.you`), et posé ici une fois au démarrage.
    /// Les chemins SDK (pont socket, moteur de synchro) le relaient dans leur
    /// événement de store ; le résolveur, lui, le reçoit toujours en PARAMÈTRE —
    /// c'est ce qui le garde pur et testable sans localisation.
    ///
    /// Le repli anglais n'est pas une traduction de confort : il ne sert que la
    /// fenêtre entre le lancement du processus et la configuration, pendant
    /// laquelle aucune ligne n'est encore rendue.
    nonisolated(unsafe) public static var readerLabel: String = "You"

    /// Posé au démarrage par l'app, avec sa chaîne localisée.
    public static func configureReaderLabel(_ label: String) {
        guard !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        readerLabel = label
    }

    /// L'auteur d'un message dont on TIENT l'expéditeur (ligne REST) : le mot
    /// du lecteur quand c'est lui, son nom servi sinon. Même verdict que
    /// `resolve` pour « moi », pour que le REST ne dise pas le nom du lecteur
    /// là où le socket dit « Vous » (#7548).
    public static func name(
        senderId: String?,
        senderName: String?,
        readerId: String?,
        youLabel: String = readerLabel
    ) -> String? {
        if let readerId, !readerId.isEmpty, senderId == readerId { return youLabel }
        return senderName
    }

    /// Ce que l'événement AFFIRME de l'auteur — trois états, comme partout où
    /// ce dépôt sépare une clé absente d'une clé nulle.
    ///
    /// La distinction n'est pas décorative : elle a été trouvée par un témoin.
    /// Rendre un simple `String?` confondait « cet événement ne dit rien de
    /// l'auteur » et « il n'y a pas d'auteur », et les deux s'arbitrent à
    /// l'OPPOSÉ selon le site :
    ///
    /// | site | `.unchanged` veut dire |
    /// |---|---|
    /// | message NEUF (bump) | aucun auteur — celui de l'ancien message ne s'hérite pas |
    /// | même message (ÉDITION, traduction) | **garder** ce qu'on savait : éditer une légende ne change pas l'auteur |
    ///
    /// Écrire `nil` dans le second cas effaçait l'auteur à chaque édition.
    public enum Resolution: Sendable, Equatable {
        /// L'événement ne dit rien de l'auteur. Au site de décider.
        case unchanged
        /// L'événement affirme un auteur, ou son absence (`nil`).
        case display(String?)

        /// Le nom pour un site où « rien de dit » vaut « aucun auteur » —
        /// typiquement un message NEUF.
        public var displayedNameForNewMessage: String? {
            if case .display(let nom) = self { return nom }
            return nil
        }
    }

    /// Rend ce que l'événement affirme de l'auteur.
    ///
    /// L'ordre n'est pas arbitraire :
    /// 1. **moi** — dans MA liste, c'est moi qui lis ; me désigner par mon nom
    ///    d'affichage serait une information que je n'ai pas demandée, et le
    ///    porteur l'a demandé explicitement sous la forme « Toi : ».
    /// 2. **le nom SERVI** — l'autorité, calculée par la passerelle au Prisme
    ///    du lecteur.
    /// 3. **le pair d'un direct** — le repli local, seul recours quand
    ///    l'événement ne porte pas de nom (les payloads antérieurs au champ).
    /// 4. **rien** — la garde anti-périmé.
    ///
    /// `eventSenderUserId` : le `User.id` de l'auteur quand l'événement le
    /// porte (`ConversationUpdatedEvent.messageSenderUserId`). `eventSenderId`
    /// est souvent un `Participant.id`, qui ne vaut jamais l'id du lecteur :
    /// mon message envoyé depuis un autre client se disait alors par mon nom
    /// (#7612).
    public static func resolve(
        eventSenderId: String?,
        eventSenderUserId: String? = nil,
        eventSenderName: LastMessageSenderName,
        currentUserId: String?,
        conversationType: MeeshyConversation.ConversationType,
        peerUserId: String?,
        peerUsername: String?,
        youLabel: String
    ) -> Resolution {
        // `currentUserId` DOIT être non nul pour que l'égalité veuille dire
        // quelque chose : comparer deux `nil` ferait dire « Toi » au premier
        // message dont l'auteur est inconnu, sur l'écran de quelqu'un dont
        // l'authentification n'est pas encore résolue.
        if let me = currentUserId, !me.isEmpty, eventSenderId == me || eventSenderUserId == me {
            return .display(youLabel)
        }

        if case .replaced(let servi) = eventSenderName {
            // Une clé PRÉSENTE est une affirmation, y compris quand elle vaut
            // `nil` ou du blanc : elle dit « pas d'auteur à afficher ». Elle ne
            // doit donc pas réveiller le repli local, qui parlerait d'un autre
            // message.
            guard let nom = servi?.trimmingCharacters(in: .whitespacesAndNewlines), !nom.isEmpty else {
                return .display(nil)
            }
            return .display(nom)
        }

        if conversationType == .direct,
           let senderId = eventSenderId,
           let peerUserId,
           senderId == peerUserId {
            return .display(peerUsername)
        }

        return .unchanged
    }

    /// Ce que `conversation:updated` affirme de l'auteur, pour la ligne `row`
    /// que lit `readerId` — la même règle que la fusion du store, sans que
    /// l'appelant ait à recopier les champs un à un.
    public static func resolve(
        _ event: ConversationUpdatedEvent,
        readerId: String?,
        row: MeeshyConversation,
        youLabel: String
    ) -> Resolution {
        resolve(
            eventSenderId: event.senderId,
            eventSenderUserId: event.messageSenderUserId,
            eventSenderName: event.lastMessageSenderName,
            currentUserId: readerId,
            conversationType: row.type,
            peerUserId: row.participantUserId,
            peerUsername: row.participantUsername,
            youLabel: youLabel
        )
    }
}
