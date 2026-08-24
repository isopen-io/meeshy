import Foundation

/// Pure, side-effect-free helpers used by `NotificationService` (the rich-push
/// `UNNotificationServiceExtension`) to repair fields that iOS Communication
/// Notifications (`INSendMessageIntent` donation + `content.updating(from:)`)
/// either silently drop or that the gateway cannot deliver through the
/// encrypted (E2EE) push path.
///
/// Living in a separate file with no `UserNotifications` / `Intents`
/// dependencies makes the policy unit-testable from the main `MeeshyTests`
/// target without dragging the whole notification extension runtime.
///
/// Source of the bugs these helpers patch:
///  - APN subtitle (conversation name for groups / Meeshy Global) is wiped by
///    `try content.updating(from: intent)` — confirmed empirically in iOS 18
///    and aligned with the long-standing `feedback_ios_communication_intent_overwrites_title`
///    pattern (same issue, the title was already worked around server-side
///    via `subtitle`, now we have to preserve `subtitle` after donation).
///  - Audio-only E2EE messages reach the device with an empty plaintext body
///    (the gateway only encrypts the optional caption, which is empty for a
///    voice memo), so after decryption the rich push has no audio context at
///    all even though `attachmentMimeType` is `audio/*`.
nonisolated enum NotificationPayloadHelpers {

    /// Returns the subtitle that should be re-applied to the notification
    /// content AFTER `try content.updating(from: intent)`, since that call
    /// strips the APN-native `subtitle` field on iOS Communication Notifications.
    ///
    /// - Parameters:
    ///   - originalSubtitle: subtitle of the ORIGINAL (pre-`updating`) content,
    ///     i.e. whatever the gateway actually sent in the APN alert. Covers the
    ///     social context subtitles ("Votre story", "En réponse à « … »",
    ///     "Nouvelle humeur"…) as well as group conversation names.
    ///   - currentSubtitle: subtitle currently set on the (post-`updating`)
    ///     content. Pass `bestAttemptContent.subtitle` (which is `""` when iOS
    ///     dropped it).
    ///   - userInfo: the original `request.content.userInfo` carrying the
    ///     server-provided `conversationTitle` + `conversationType`, used as a
    ///     legacy fallback when the alert subtitle itself was empty.
    /// - Returns: the subtitle to write back, or `nil` to leave the content
    ///   unchanged. We only restore when the post-`updating` subtitle is empty
    ///   (so we never clobber a subtitle iOS actually preserved).
    nonisolated static func preservedSubtitle(
        originalSubtitle: String,
        currentSubtitle: String,
        userInfo: [AnyHashable: Any],
        customName: String? = nil,
        favoriteEmoji: String? = nil,
        categoryName: String? = nil,
        isMuted: Bool = false,
        isLocked: Bool = false
    ) -> String? {
        // Only repair when the post-`updating(from: intent)` subtitle was wiped.
        // Trimming whitespace catches the "single space" workaround that
        // some integrations use to force iOS to keep a subtitle slot.
        guard currentSubtitle.trimmingCharacters(in: .whitespaces).isEmpty else {
            return nil
        }

        // 1. Notification DE CONVERSATION (group/public/global/broadcast) : la
        //    présentation est résolue CÔTÉ CLIENT (Local-First). On compose
        //    `<icône de type> <customName ?? titre canonique>` — le gateway
        //    n'envoie que les identifiants bruts (type + titre), le client
        //    préfère le renommage LOCAL (`customName`) résolu depuis l'App
        //    Group, et déduit l'icône du type. Indépendant de la valeur du
        //    subtitle d'origine (qui n'est que le titre brut).
        let conversationType = (userInfo["conversationType"] as? String) ?? ""
        if !conversationType.trimmingCharacters(in: .whitespaces).isEmpty,
           conversationType.lowercased() != "direct" {
            return composedConversationSubtitle(
                conversationType: conversationType,
                conversationTitle: userInfo["conversationTitle"] as? String,
                customName: customName,
                favoriteEmoji: favoriteEmoji,
                categoryName: categoryName,
                isMuted: isMuted,
                isLocked: isLocked
            )
        }

        // 2. Notification SOCIALE (réponse story/post, mood…) : le subtitle
        //    d'origine est une string explicite du gateway (« Votre story »,
        //    « En réponse à … ») — on la restaure telle quelle.
        let trimmedOriginal = originalSubtitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedOriginal.isEmpty ? nil : trimmedOriginal
    }

    /// Icône préfixant le nom d'une conversation de groupe dans une notification,
    /// pour distinguer son type d'un coup d'œil :
    ///   - groupe privé   (group)             → 👥  (communauté de personnes)
    ///   - groupe public  (public)            → 🌐  (ouvert à tous)
    ///   - général/broadcast (global, broadcast) → 📢
    ///   - direct / inconnu                   → ""  (pas d'icône)
    ///
    /// Miroir exact du helper TS `conversationTypeIcon` côté gateway
    /// (services/gateway/.../NotificationService.ts) — garder les deux en
    /// lockstep. Le cadenas 🔒 est délibérément évité (évoque le chiffrement) ;
    /// il sera réservé à un futur état « conversation verrouillée ».
    nonisolated static func conversationTypeIcon(_ conversationType: String) -> String {
        switch conversationType.trimmingCharacters(in: .whitespaces).lowercased() {
        case "group":  return "👥"
        case "public": return "🌐"
        case "global", "broadcast": return "📢"
        default: return ""
        }
    }

    /// Compose le subtitle final d'une notification de conversation de groupe,
    /// dans l'ordre demandé :
    ///
    ///   `<emoji favori> <icône de type> <nom> (<catégorie>) <mute> <lock>`
    ///
    /// Exemple : `😴 👥 Cours de mathématique classe CME1 (cours élémentaire) 🔒`
    ///
    /// - `nom` = renommage LOCAL (`customName`) s'il existe, sinon titre canonique.
    /// - `favoriteEmoji` = emoji favori associé à la conversation (en TÊTE).
    /// - `categoryName` = nom d'une catégorie CRÉÉE PAR L'UTILISATEUR uniquement
    ///   (les catégories induites/prédéfinies passent `nil` → pas de parenthèses).
    /// - `🔇`/`🔒` = badges mute / verrou, APRÈS le titre (et la catégorie).
    ///
    /// Retourne `nil` pour une conversation directe ou sans nom. PUR et testable.
    nonisolated static func composedConversationSubtitle(
        conversationType: String,
        conversationTitle: String?,
        customName: String?,
        favoriteEmoji: String? = nil,
        categoryName: String? = nil,
        isMuted: Bool = false,
        isLocked: Bool = false
    ) -> String? {
        let type = conversationType.trimmingCharacters(in: .whitespaces).lowercased()
        guard !type.isEmpty, type != "direct" else { return nil }

        let custom = customName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let canonical = conversationTitle?.trimmingCharacters(in: .whitespacesAndNewlines)
        let name = (custom?.isEmpty == false ? custom : canonical) ?? ""
        guard !name.isEmpty else { return nil }

        var parts: [String] = []
        // 1. Emoji favori, en premier.
        if let fav = favoriteEmoji?.trimmingCharacters(in: .whitespaces), !fav.isEmpty {
            parts.append(fav)
        }
        // 2. Icône de type de groupe.
        let icon = conversationTypeIcon(type)
        if !icon.isEmpty { parts.append(icon) }
        // 3. Nom + (catégorie utilisateur) accolée.
        let cat = categoryName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let cat, !cat.isEmpty {
            parts.append("\(name) (\(cat))")
        } else {
            parts.append(name)
        }
        // 4. Badges après le titre : mute puis lock.
        if isMuted { parts.append("🔇") }
        if isLocked { parts.append("🔒") }

        return parts.joined(separator: " ")
    }

    /// Returns a body fallback for an audio-only push when the current body
    /// arrived empty (typical for E2EE: the gateway encrypted an empty caption
    /// since the message is a voice memo) and the payload carries an audio
    /// mime type. Returns `nil` when the existing body is already meaningful
    /// (the gateway's pre-formatted `"🎵 Audio · 0:34"` for non-E2EE messages)
    /// or when the attachment isn't audio.
    ///
    /// The fallback is intentionally short — iOS Communication Notifications
    /// truncate aggressively on the lock screen.
    nonisolated static func audioBodyFallback(
        currentBody: String,
        userInfo: [AnyHashable: Any]
    ) -> String? {
        let trimmedBody = currentBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmedBody.isEmpty else { return nil }

        let mime = (userInfo["attachmentMimeType"] as? String) ?? ""
        guard mime.lowercased().hasPrefix("audio/") else { return nil }

        return NSLocalizedString(
            "notification.audio_voice_message.body",
            value: "🎵 Message vocal",
            comment: "Push body fallback for an audio-only message when the gateway body is empty (E2EE caption)."
        )
    }

    /// N4 — maps the push payload's `attachmentMimeType` to the
    /// `messageType` / `contentType` pair stored on the pre-persisted
    /// `MessageRecord`, so the bubble written by the NSE renders as the right
    /// media kind BEFORE the canonical REST payload overwrites it (previously
    /// hardcoded to `"text"`, showing an empty text bubble for a voice memo).
    ///
    /// Values mirror `MeeshyMessage.MessageType` raw values (`text`, `image`,
    /// `audio`, `video`). Unknown / absent mime → `text`, matching the
    /// gateway's default for caption-only messages.
    nonisolated static func mediaMessageTypes(
        forAttachmentMimeType mimeType: String?
    ) -> (messageType: String, contentType: String) {
        let normalized = mimeType?
            .trimmingCharacters(in: .whitespaces)
            .lowercased() ?? ""
        if normalized.hasPrefix("audio/") { return ("audio", "audio") }
        if normalized.hasPrefix("video/") { return ("video", "video") }
        if normalized.hasPrefix("image/") { return ("image", "image") }
        return ("text", "text")
    }

    /// R3 — social push types whose banner exposes the inline « Commenter »
    /// text action. A type is commentable when the produced comment has an
    /// unambiguous target:
    ///  - comment / thread notifications (`post_comment`, `comment_reply`,
    ///    `story_new_comment`, `story_thread_reply`, `friend_story_comment`)
    ///    → threaded reply to THE notified comment ;
    ///  - `friend_new_post` → root comment on the new post.
    /// Reactions / likes / moods / new stories stay on plain `MEESHY_SOCIAL`
    /// (a Comment button there would be misleading).
    nonisolated static let commentableSocialTypes: Set<String> = [
        "post_comment",
        "comment_reply",
        "story_new_comment",
        "story_thread_reply",
        "friend_story_comment",
        "friend_new_post"
    ]

    /// Category for a social push: `MEESHY_SOCIAL_COMMENTABLE` when the type
    /// is commentable AND the payload carries a `postId` (the comment
    /// endpoint's target), plain `MEESHY_SOCIAL` otherwise. Identifiers are a
    /// cross-layer contract — the gateway (`category` push field) and
    /// `AppDelegate.registerNotificationCategories` use the SAME strings.
    nonisolated static func socialCategoryIdentifier(
        type: String,
        postId: String?
    ) -> String {
        guard commentableSocialTypes.contains(type),
              let postId,
              !postId.trimmingCharacters(in: .whitespaces).isEmpty else {
            return "MEESHY_SOCIAL"
        }
        return "MEESHY_SOCIAL_COMMENTABLE"
    }

    /// G4d — call categories are SPLIT by call state so a terminated call
    /// never shows an « Answer » button:
    ///  - `incoming_call` (regular-APNs ringing path — China devices, VoIP
    ///    fallback) → `MEESHY_CALL_INCOMING` [answer, decline] ;
    ///  - terminal states (`missed_call`, `call_ended`, `call_declined`,
    ///    `call_recording_ready`) → `MEESHY_CALL_MISSED` [callback, view].
    /// Returns `nil` for non-call types. Identifiers are a cross-layer
    /// contract shared with the gateway `category` push field and
    /// `AppDelegate.registerNotificationCategories`.
    nonisolated static func callCategoryIdentifier(type: String) -> String? {
        switch type {
        case "incoming_call":
            return "MEESHY_CALL_INCOMING"
        case "missed_call", "call_ended", "call_declined", "call_recording_ready":
            return "MEESHY_CALL_MISSED"
        default:
            return nil
        }
    }

    // MARK: - Résolution des URLs média du payload push

    /// Résout une URL média du payload push en URL absolue téléchargeable.
    ///
    /// Le gateway persiste les avatars et les pièces jointes en chemin RELATIF
    /// (`/api/v1/attachments/file/…`) et les recopie tels quels dans `imageURL`
    /// / `attachmentUrl`. `URL(string:)` accepte volontiers cette chaîne, mais
    /// l'URL produite n'a ni schéma ni hôte : `URLSession` échoue sans qu'on
    /// puisse le distinguer d'un réseau lent, et la bannière retombe
    /// silencieusement sur l'icône de l'app.
    ///
    /// - Parameters:
    ///   - raw: la valeur brute du payload (relative ou absolue).
    ///   - apiBaseURL: l'origine API, résolue depuis l'ALLOWLIST du NSE
    ///     (`NSEDataSync.trustedApiBaseURL`) — jamais depuis le payload, qui
    ///     n'est pas une source de confiance pour une destination réseau.
    /// - Returns: une URL `https` (ou `http` sur localhost, pour le dev), ou
    ///   `nil` si la valeur est vide ou porte un schéma non suivable.
    nonisolated static func resolveRemoteMediaURL(_ raw: String, apiBaseURL: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // Toute valeur qui PORTE un schéma (`https:`, `file:`, `data:`,
        // `javascript:`…) est traitée comme absolue et devra passer le contrôle
        // de schéma ci-dessous. La préfixer de l'origine API la déguiserait en
        // chemin `https` valide vers le gateway — un rejet transformé en 404.
        // Un chemin relatif ne peut pas matcher : le `/` y précède tout `:`.
        let carriesScheme = trimmed.range(of: "^[A-Za-z][A-Za-z0-9+.-]*:", options: .regularExpression) != nil

        let absolute: String
        if carriesScheme {
            absolute = trimmed
        } else {
            // Les chemins portent déjà leur pourcentage-encodage (`%2F` comme
            // séparateur interne) : on concatène sans ré-encoder, sinon un
            // `%2F` deviendrait `%252F` et le fichier serait introuvable.
            let base = apiBaseURL.hasSuffix("/") ? String(apiBaseURL.dropLast()) : apiBaseURL
            absolute = trimmed.hasPrefix("/") ? base + trimmed : base + "/" + trimmed
        }

        guard let url = URL(string: absolute),
              let scheme = url.scheme?.lowercased(),
              let host = url.host?.lowercased() else { return nil }

        if scheme == "https" { return url }
        if scheme == "http", host == "localhost" || host == "127.0.0.1" || host == "::1" { return url }
        return nil
    }

    // MARK: - Cadrage de la Communication Notification

    /// Comment cadrer l'`INSendMessageIntent` d'une notification donnée.
    nonisolated struct CommunicationFraming: Equatable {
        /// `true` → l'intent est donné avec des destinataires (mode GROUPE).
        /// C'est le seul mode où iOS rend quoi que ce soit sous le nom de
        /// l'expéditeur ; en 1:1 (`recipients: nil`) il ignore jusqu'au
        /// `content.subtitle` posé à la main.
        let usesGroupFraming: Bool
        /// Nom de groupe à donner à l'intent, ou `nil` pour laisser l'appelant
        /// composer le sien (cas d'une vraie conversation de groupe, dont le
        /// nom est recomposé côté client en Local-First).
        let groupName: String?
        /// Identifiant de conversation de l'intent, jamais vide.
        let intentKey: String
    }

    /// Décide du cadrage d'une notification.
    ///
    /// Une notification SOCIALE (commentaire, nouveau post, réaction) n'a pas
    /// de conversation : elle tombait donc en 1:1, où iOS n'affiche que le nom
    /// et le corps. Son sous-titre — qui porte l'action (« a commenté un
    /// réel · Publication de Windie Nh ») — n'atteignait jamais l'écran. On la
    /// cadre en groupe pour que l'action devienne le `speakableGroupName`,
    /// affiché sous le nom.
    ///
    /// Une vraie conversation garde son comportement : un groupe reste un
    /// groupe avec son nom composé côté client, un direct reste un 1:1.
    nonisolated static func communicationFraming(
        conversationId: String,
        conversationType: String,
        postId: String,
        notificationId: String,
        subtitle: String
    ) -> CommunicationFraming {
        let type = conversationType.trimmingCharacters(in: .whitespaces).lowercased()
        let conversation = conversationId.trimmingCharacters(in: .whitespaces)
        let post = postId.trimmingCharacters(in: .whitespaces)
        let key = !conversation.isEmpty ? conversation
            : (!post.isEmpty ? "post:\(post)" : notificationId)

        // Conversation identifiée : le cadrage suit son type, et son nom est
        // l'affaire de l'appelant (composition Local-First).
        if !type.isEmpty {
            return CommunicationFraming(
                usesGroupFraming: type != "direct",
                groupName: nil,
                intentKey: key
            )
        }

        // Hors conversation : le mode groupe n'a d'intérêt que s'il y a
        // quelque chose à dire sous le nom.
        let action = subtitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !action.isEmpty else {
            return CommunicationFraming(usesGroupFraming: false, groupName: nil, intentKey: key)
        }
        return CommunicationFraming(usesGroupFraming: true, groupName: action, intentKey: key)
    }

    // MARK: - Cycle 124 bis — le message PRÉ-ENREGISTRÉ au démarrage à froid

    /// Les champs que `prePersistMessage` écrit dans la bulle locale, dérivés du
    /// fil RÉEL — c'est-à-dire des clés que la passerelle émet vraiment.
    ///
    /// Le cycle 124 a posé `content` et `originalLanguage` sur le fil, sous les
    /// noms que cette extension lit déjà. Restaient TROIS écarts, mesurés par le
    /// diff du contrat dans les deux sens :
    ///
    ///  - `senderName` — lu ici, jamais émis : la passerelle envoie
    ///    `senderDisplayName`, que le cadrage Communication du fichier voisin
    ///    lit correctement depuis toujours ;
    ///  - `createdAt` et `messageType` — ÉMIS pour cette extension (« GW5 —
    ///    persistance NSE »), et lus par personne : la bulle était ordonnée par
    ///    l'horloge du device.
    struct PrePersistedMessageFields: Equatable {
        /// Le texte du message, tel que le fil le porte. VIDE quand la
        /// passerelle n'a rien à donner (mode privé, placeholder de protection,
        /// transcription) — une bulle sans texte vaut mieux qu'une bulle qui
        /// MENT et que la synchro REST pourrait ne jamais corriger.
        let content: String
        /// L'étiquette de langue de ce texte. Le repli « en » ne vaut que le
        /// temps que la synchro REST écrase l'enregistrement — mais il ne
        /// s'applique plus au cas nominal, où le fil la porte.
        let language: String
        /// L'horodatage SERVEUR du message, qui ordonne la bulle dans le fil.
        let createdAt: Date
        /// Le nom d'affichage de l'expéditeur, sous la clé que la passerelle émet.
        let senderName: String?
    }

    /// Compose ces quatre champs depuis le payload.
    ///
    /// `fallbackNow` est l'horloge du device, conservée en repli — mais elle
    /// n'est plus le cas nominal : deux appareils qui reçoivent le même message
    /// n'ont aucune raison de l'ordonner pareil.
    nonisolated static func prePersistedMessageFields(
        userInfo: [AnyHashable: Any],
        fallbackNow: Date
    ) -> PrePersistedMessageFields {
        PrePersistedMessageFields(
            content: nonEmptyString(userInfo["content"]) ?? "",
            // Repli historique : « en » est un faux moins nuisible que « fr »
            // pour la résolution du Prisme d'un lecteur non francophone.
            language: nonEmptyString(userInfo["originalLanguage"]) ?? "en",
            createdAt: pushDate(userInfo["createdAt"]) ?? fallbackNow,
            // `senderName` n'a JAMAIS été une clé du payload : la passerelle
            // émet `senderDisplayName`, que le cadrage Communication de ce
            // même fichier lit correctement depuis toujours.
            senderName: nonEmptyString(userInfo["senderDisplayName"])
                ?? nonEmptyString(userInfo["senderUsername"])
        )
    }

    /// Le `messageType` / `contentType` de la bulle pré-enregistrée.
    ///
    /// Le mime de la pièce jointe reste PRIORITAIRE : c'est lui qui décide du
    /// rendu média (N4), et `Message.messageType` vaut `text` pour un vocal
    /// légendé. Le type du fil ne sert qu'en l'absence de pièce jointe, où il
    /// est plus fin que le repli `text`.
    nonisolated static func prePersistedMessageTypes(
        userInfo: [AnyHashable: Any]
    ) -> (messageType: String, contentType: String) {
        let mime = userInfo["attachmentMimeType"] as? String
        let fromMime = mediaMessageTypes(forAttachmentMimeType: mime)
        guard fromMime.messageType == "text",
              let wireType = nonEmptyString(userInfo["messageType"])?.lowercased(),
              wireType != "text"
        else { return fromMime }
        return (wireType, wireType)
    }

    /// Une valeur de payload lue comme chaîne NON VIDE. Les `data` APNs/FCM ne
    /// transportent que des chaînes, et la passerelle y pose `''` là où elle
    /// n'a rien à dire — les deux formes veulent dire « absent ».
    private static func nonEmptyString(_ value: Any?) -> String? {
        guard let string = value as? String else { return nil }
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    /// Un horodatage ISO 8601 du fil, avec ou sans fraction de seconde — la
    /// passerelle émet `toISOString()`, qui en porte toujours une, mais un
    /// parseur qui n'accepte qu'une seule forme rendrait `nil` au premier
    /// producteur qui l'omet.
    private static func pushDate(_ value: Any?) -> Date? {
        guard let raw = nonEmptyString(value) else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: raw) { return date }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: raw)
    }
}
