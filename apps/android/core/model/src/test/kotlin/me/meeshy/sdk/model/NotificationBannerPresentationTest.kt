package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Les SEPT cadrages de la bannière in-app (#4457), miroir de la suite iOS
 * `NotificationBannerPresentationTests` et de `notification-banner.test.ts` côté web.
 *
 * Ce que ces témoins gardent d'abord, c'est que la phrase d'action vient du SERVEUR : aucun
 * cas ici ne compose de français en dur. Le seul texte que le client fabrique est
 * « X dans <groupe> », et il voyage en DEUX morceaux jusqu'à la couche UI, qui seule a les
 * ressources pour le traduire.
 */
class NotificationBannerPresentationTest {

    private fun notification(
        type: String,
        actor: String? = "Alice",
        title: String? = null,
        subtitle: String? = null,
        content: String? = null,
        metadata: NotificationMetadata? = null,
        context: NotificationContext? = null,
    ) = ApiNotification(
        id = "n1",
        type = type,
        title = title,
        subtitle = subtitle,
        content = content,
        actor = actor?.let { NotificationActor(id = "u1", username = "alice", displayName = it) },
        context = context,
        metadata = metadata,
    )

    private fun headlineText(headline: BannerHeadline): String = when (headline) {
        is BannerHeadline.Plain -> headline.text
        is BannerHeadline.InConversation -> "${headline.actor} ⟨dans⟩ ${headline.groupName}"
        is BannerHeadline.Someone -> listOfNotNull("⟨quelqu'un⟩", headline.action).joinToString(" ")
        is BannerHeadline.GameSurface -> listOfNotNull("⟨${headline.surface}⟩", headline.action).joinToString(" ")
    }

    // MARK: - 1. Commentaire de contenu

    @Test
    fun contentComment_headlineCarriesTheServerActionPhrase() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "story_new_comment",
                title = "Alice",
                subtitle = "a commenté votre story",
                content = "trop beau !",
            )
        )
        assertThat(headlineText(banner.headline)).isEqualTo("Alice a commenté votre story")
        assertThat(banner.body).isEqualTo("trop beau !")
    }

    // MARK: - 2. Nouvelle publication

    @Test
    fun newPublication_saysWhichKindOfContent() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "friend_new_reel",
                title = "Alice",
                subtitle = "a publié un réel",
                content = "a publié un réel",
                metadata = NotificationMetadata(contentType = "REEL"),
            )
        )
        assertThat(headlineText(banner.headline)).isEqualTo("Alice a publié un réel")
        assertThat(banner.contentIcon).isEqualTo(BannerContentIcon.REEL)
    }

    /**
     * Le serveur garantit que la ligne de LISTE n'est jamais vide : à défaut d'extrait,
     * `content` retombe sur la phrase d'action. Sur une bannière qui porte déjà cette phrase
     * en headline, la répéter juste dessous est le défaut que `dedupePushSubtitle` corrige
     * côté push — même règle ici.
     */
    @Test
    fun aBodyThatMerelyRepeatsTheActionPhrase_isDropped() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "friend_new_story",
                subtitle = "a publié une nouvelle story",
                content = "a publié une nouvelle story",
            )
        )
        assertThat(banner.body).isNull()
    }

    // MARK: - 3. Message privé

    @Test
    fun directMessage_showsOnlyTheSender() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "new_message",
                subtitle = "Les copains",
                content = "on se voit demain ?",
                context = NotificationContext(conversationId = "c1", conversationTitle = "Les copains"),
            ),
            groupName = "Les copains",
            isDirect = true,
        )
        assertThat(banner.headline).isEqualTo(BannerHeadline.Plain("Alice"))
        assertThat(banner.body).isEqualTo("on se voit demain ?")
    }

    // MARK: - 4. Message de groupe

    /**
     * Le nom LOCAL gagne sur le titre serveur : un renommage et un emoji favori n'existent que
     * sur l'appareil, et c'est le nom que le lecteur reconnaît.
     */
    @Test
    fun groupMessage_prefersTheLocalGroupName() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "new_message",
                content = "on se voit demain ?",
                context = NotificationContext(conversationId = "c1", conversationTitle = "Groupe 42"),
            ),
            groupName = "🎉 Les copains",
        )
        assertThat(banner.headline).isEqualTo(BannerHeadline.InConversation("Alice", "🎉 Les copains"))
    }

    @Test
    fun groupMessage_fallsBackToTheServerTitle_whenTheDeviceKnowsNoLocalName() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "new_message",
                context = NotificationContext(conversationId = "c1", conversationTitle = "Groupe 42"),
            )
        )
        assertThat(banner.headline).isEqualTo(BannerHeadline.InConversation("Alice", "Groupe 42"))
    }

    /**
     * La headline voyage en DEUX morceaux, jamais composée ici : `core/model` n'a pas de
     * ressources, et une chaîne « X dans Y » assemblée dans le modèle serait invisible aux six
     * autres langues.
     */
    @Test
    fun theInConversationHeadline_isNeverPreComposedIntoAString() {
        val banner = NotificationBannerFraming.present(
            notification(type = "new_message"),
            groupName = "Les copains",
        )
        assertThat(banner.headline).isInstanceOf(BannerHeadline.InConversation::class.java)
    }

    // MARK: - 5 & 6. Relation

    @Test
    fun relationRequest_headlineSaysItAll_andTheBodyIsDropped() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "friend_request",
                title = "Alice",
                subtitle = "veut se connecter",
                content = "Nouvelle demande de contact",
            )
        )
        assertThat(headlineText(banner.headline)).isEqualTo("Alice veut se connecter")
        assertThat(banner.body).isNull()
    }

    @Test
    fun relationAccepted_isFramedTheSameWay() {
        val banner = NotificationBannerFraming.present(
            notification(type = "contact_accepted", title = "Alice", subtitle = "a accepté votre demande")
        )
        assertThat(headlineText(banner.headline)).isEqualTo("Alice a accepté votre demande")
        assertThat(banner.body).isNull()
    }

    // MARK: - 7. Réaction

    @Test
    fun contentReaction_surfacesTheEmojiAsABadge() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "story_reaction",
                subtitle = "a réagi à votre story",
                metadata = NotificationMetadata(emoji = "🔥"),
            )
        )
        assertThat(banner.reactionBadge).isEqualTo("🔥")
    }

    /** Deux noms de fil pour une seule donnée : contenu → `emoji`, message → `reactionEmoji`. */
    @Test
    fun messageReaction_readsTheOtherWireNameForTheSameEmoji() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "message_reaction",
                subtitle = "a réagi à votre message",
                metadata = NotificationMetadata(reactionEmoji = "❤️"),
            )
        )
        assertThat(banner.reactionBadge).isEqualTo("❤️")
    }

    @Test
    fun anEmojiAlreadyInsideTheActionPhrase_isNotRepeatedAsABadge() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "story_reaction",
                subtitle = "a réagi 🔥 à votre story",
                metadata = NotificationMetadata(emoji = "🔥"),
            )
        )
        assertThat(banner.reactionBadge).isNull()
    }

    // MARK: - Vignette

    @Test
    fun theTargetContentThumbnail_wins() {
        val banner = NotificationBannerFraming.present(
            notification(type = "post_comment", metadata = NotificationMetadata(postThumbnailUrl = "https://x/t.jpg"))
        )
        assertThat(banner.thumbnailUrl).isEqualTo("https://x/t.jpg")
    }

    @Test
    fun aMessagePhoto_becomesTheThumbnail_onlyWhenItIsAnImage() {
        val image = NotificationBannerFraming.present(
            notification(
                type = "new_message",
                context = NotificationContext(
                    firstAttachmentUrl = "https://x/p.jpg",
                    firstAttachmentMimeType = "image/jpeg",
                ),
            )
        )
        assertThat(image.thumbnailUrl).isEqualTo("https://x/p.jpg")

        val audio = NotificationBannerFraming.present(
            notification(
                type = "new_message",
                context = NotificationContext(
                    firstAttachmentUrl = "https://x/v.m4a",
                    firstAttachmentMimeType = "audio/m4a",
                ),
            )
        )
        assertThat(audio.thumbnailUrl).isNull()
    }

    /**
     * Un message PROTÉGÉ (éphémère, vue unique, flouté, chiffré) n'a pas d'URL sur le fil : la
     * passerelle la retient en bloc (cycle 125). Le client n'a rien à re-garder — mais il ne
     * doit rien FABRIQUER depuis une autre source, et ce témoin est ce qui l'en empêche.
     */
    @Test
    fun aProtectedMessage_carriesNoThumbnail_andNoneIsInvented() {
        val banner = NotificationBannerFraming.present(
            notification(
                type = "new_message",
                content = "👁️ Message à vue unique",
                context = NotificationContext(conversationId = "c1"),
                metadata = NotificationMetadata(postThumbnailUrl = null),
            )
        )
        assertThat(banner.thumbnailUrl).isNull()
    }

    // MARK: - Le média, traduit par la couche UI et jamais ici

    @Test
    fun theMediaSummary_isAnEnum_notAFrenchStringBakedIntoTheModel() {
        val banner = NotificationBannerFraming.present(
            notification(type = "friend_new_post", metadata = NotificationMetadata(mediaType = "video"))
        )
        assertThat(banner.mediaSummary).isEqualTo(MediaSummary.VIDEO)
        assertThat(banner.contentIcon).isEqualTo(BannerContentIcon.VIDEO)
    }

    // MARK: - La famille de cadrage

    /**
     * Le TYPE décide, jamais la forme des champs — `subtitle` porte le nom du GROUPE pour un
     * message et la PHRASE D'ACTION pour tout le reste. Deux sens pour un champ, et seul le
     * type les sépare : lire `subtitle` sans regarder le type produirait « Alice Les copains ».
     */
    @Test
    fun theFramingComesFromTheType_andToleratesLegacyUppercase() {
        assertThat(NotificationBannerFraming.framing("new_message")).isEqualTo(BannerFraming.CONVERSATION)
        assertThat(NotificationBannerFraming.framing("NEW_MESSAGE")).isEqualTo(BannerFraming.CONVERSATION)
        assertThat(NotificationBannerFraming.framing("friend_request")).isEqualTo(BannerFraming.RELATION)
        assertThat(NotificationBannerFraming.framing("FRIEND_ACCEPTED")).isEqualTo(BannerFraming.RELATION)
        assertThat(NotificationBannerFraming.framing("post_comment")).isEqualTo(BannerFraming.ACTION)
        assertThat(NotificationBannerFraming.framing("something_new_the_client_ignores"))
            .isEqualTo(BannerFraming.ACTION)
    }

    /**
     * La régression que ce lot corrige : un décodeur qui ne DÉCLARE pas `subtitle` le jette, et
     * la bannière reste muette sur son type. Même forme que `lastMessageTranslations` sur
     * `ApiConversation` (cycle 118) — une donnée servie depuis toujours, lue par personne.
     */
    @Test
    fun theWireCarriesSubtitle_andTheDecoderKeepsIt() {
        val decoded = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
            .decodeFromString(
                ApiNotification.serializer(),
                """{"id":"n1","type":"story_reaction","title":"Alice","subtitle":"a réagi à votre story"}""",
            )
        assertThat(decoded.subtitle).isEqualTo("a réagi à votre story")
        assertThat(decoded.title).isEqualTo("Alice")
    }

    // MARK: - Cadrage complet (banniere-regles-et-contenu)

    private fun present(n: ApiNotification, groupName: String? = null, isDirect: Boolean = false) =
        NotificationBannerFraming.present(n, groupName, isDirect)

    @Test
    fun contactJoined_isARelationAndCarriesNoBody() {
        val banner = present(
            notification("contact_joined", title = "Alice", subtitle = "a rejoint Meeshy", content = "Nouveau contact"),
        )
        assertThat(NotificationBannerFraming.framing("contact_joined")).isEqualTo(BannerFraming.RELATION)
        assertThat(headlineText(banner.headline)).isEqualTo("Alice a rejoint Meeshy")
        assertThat(banner.body).isNull()
    }

    @Test
    fun gameNotificationWithoutActor_isNamedByItsSurface() {
        val league = present(notification("game_league_result", actor = null, subtitle = null, content = "Tu es 3e"))
        assertThat(league.headline).isEqualTo(BannerHeadline.GameSurface(GameSurfaceTitle.LEAGUE_RESULT, null))
        assertThat(league.body).isEqualTo("Tu es 3e")
        assertThat(present(notification("game_season_step", actor = null)).headline)
            .isEqualTo(BannerHeadline.GameSurface(GameSurfaceTitle.SEASON_STEP, null))
        assertThat(present(notification("game_mission_window", actor = null)).headline)
            .isEqualTo(BannerHeadline.GameSurface(GameSurfaceTitle.MISSION_WINDOW, null))
    }

    @Test
    fun gameNotificationWithAServerTitle_keepsTheServerTitle() {
        val banner = present(notification("game_league_result", actor = null, title = "Meeshy", subtitle = "a clos la semaine"))
        assertThat(banner.headline).isEqualTo(BannerHeadline.Plain("Meeshy a clos la semaine"))
    }

    @Test
    fun noActorNoTitle_fallsBackToSomeoneNeverBlank() {
        assertThat(present(notification("post_like", actor = null, subtitle = "a aimé votre post")).headline)
            .isEqualTo(BannerHeadline.Someone("a aimé votre post"))
        assertThat(present(notification("new_message", actor = null)).headline).isEqualTo(BannerHeadline.Someone(null))
    }

    @Test
    fun aTitleThatAlreadyEndsWithTheActionDoesNotReceiveItTwice() {
        val banner = present(
            notification("contact_recently_active", title = "Marie était sur Meeshy récemment", subtitle = "était sur Meeshy récemment"),
        )
        assertThat(banner.headline).isEqualTo(BannerHeadline.Plain("Marie était sur Meeshy récemment"))
    }

    // MARK: - Détail du message x protection x aperçu

    private fun message(
        vararg fields: Pair<String, String>,
        content: String? = null,
        preview: String? = null,
        mime: String? = null,
        firstType: String? = null,
    ): ApiNotification {
        val f = fields.toMap()
        return ApiNotification(
            id = "n1",
            type = "new_message",
            content = content,
            actor = NotificationActor(id = "u1", displayName = "Alice"),
            context = NotificationContext(
                conversationId = "c1",
                firstAttachmentMimeType = mime,
                firstAttachmentUrl = "https://cdn/x".takeIf { mime != null },
                locationLat = f["locationLat"], locationLon = f["locationLon"], locationName = f["locationName"],
                contactName = f["contactName"], inviteUrl = f["inviteUrl"], inviteConversationTitle = f["inviteConversationTitle"],
                linkUrl = f["linkUrl"], linkTitle = f["linkTitle"], linkImageUrl = f["linkImageUrl"],
                thumbnailUrl = f["thumbnailUrl"], notificationLocKey = f["notificationLocKey"],
            ),
            metadata = NotificationMetadata(
                messagePreview = preview,
                attachments = firstType?.let { NotificationAttachments(count = 1, firstType = it) },
            ),
        )
    }

    @Test
    fun aSharedLocationWithNoText_carriesItsDetailInsteadOfABody() {
        val banner = present(message("locationLat" to "48.85", "locationLon" to "2.29", "locationName" to "Tour Eiffel"), isDirect = true)
        assertThat(banner.body).isNull()
        assertThat(banner.detail).isInstanceOf(NotificationMessageDetail.Location::class.java)
    }

    @Test
    fun aBodyTheGatewayAlreadyComposedIsKeptOverTheDetail() {
        val banner = present(message("contactName" to "Bob", content = "👤 Bob", preview = "👤 Bob"), isDirect = true)
        assertThat(banner.body).isEqualTo("👤 Bob")
        assertThat(banner.detail).isNull()
    }

    @Test
    fun aBareLinkBodyYieldsToTheLinkDetail() {
        val banner = present(message("linkUrl" to "https://x.io/a", content = "https://x.io/a"), isDirect = true)
        assertThat(banner.body).isNull()
        assertThat(banner.detail).isInstanceOf(NotificationMessageDetail.Link::class.java)
    }

    @Test
    fun aProtectedMessageLeaksNoDetailAndNoThumbnail() {
        val banner = present(
            message(
                "contactName" to "Bob", "linkUrl" to "https://x.io", "linkImageUrl" to "https://i/x.png",
                "thumbnailUrl" to "https://t/v.png", "notificationLocKey" to "message.viewOnce",
                content = "🔒", mime = "video/mp4", firstType = "video",
            ),
            isDirect = true,
        )
        assertThat(banner.detail).isNull()
        assertThat(banner.thumbnailUrl).isNull()
        assertThat(banner.body).isEqualTo("🔒")
        assertThat(banner.mediaSummary).isNull()
    }

    @Test
    fun aVideoMessageShowsItsServedThumbnailNeverTheFile() {
        val banner = present(message("thumbnailUrl" to "https://t/v.png", mime = "video/mp4", firstType = "video"), isDirect = true)
        assertThat(banner.thumbnailUrl).isEqualTo("https://t/v.png")
    }

    @Test
    fun aLinkMessageShowsItsPreviewImage() {
        val banner = present(message("linkUrl" to "https://x.io/a", "linkImageUrl" to "https://i/x.png", content = "regarde"), isDirect = true)
        assertThat(banner.thumbnailUrl).isEqualTo("https://i/x.png")
        assertThat(banner.body).isEqualTo("regarde")
    }

    @Test
    fun aDetailFieldDecodesFromANumberOrAStringOnTheWire() {
        val json = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
        val n = json.decodeFromString(
            ApiNotification.serializer(),
            """{"id":"n","type":"new_message","context":{"locationLat":48.85,"locationLon":"2.29","inviteMemberCount":12}}""",
        )
        assertThat(n.detailField("locationLat")).isEqualTo("48.85")
        assertThat(n.detailField("locationLon")).isEqualTo("2.29")
        assertThat(n.detailField("inviteMemberCount")).isEqualTo("12")
        assertThat(n.messageDetail).isInstanceOf(NotificationMessageDetail.Location::class.java)
    }

    @Test
    fun metadataIsTheFallbackWhenContextLacksTheKey() {
        val n = ApiNotification(id = "n", metadata = NotificationMetadata(contactName = "Zoé"))
        assertThat(n.messageDetail).isEqualTo(NotificationMessageDetail.Contact("Zoé", null, null))
    }
}
