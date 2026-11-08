package me.meeshy.sdk.model

/** Les contenus qu'un invité du lien peut produire ; l'ordre est celui des icônes du résumé iOS. */
enum class InvitePermission { Messages, Images, Files, History }

/**
 * Ce que la feuille « Inviter » édite : le formulaire du lien ([CreateShareLinkForm], source de vérité de la
 * requête) et le message d'invitation, qui part dans `description`. Miroir de `InviteFriendsSheet` (iOS).
 */
data class InviteLinkDraft(
    val form: CreateShareLinkForm,
    val message: String = "",
) {
    fun withForm(transform: (CreateShareLinkForm) -> CreateShareLinkForm): InviteLinkDraft =
        copy(form = transform(form))

    fun withMessage(value: String): InviteLinkDraft = copy(message = value)
}

/** Résumé d'une ligne sous la carte : l'expiration et les icônes des permissions accordées. */
data class InviteLinkSummary(
    val expiration: ShareLinkExpiration,
    val permissions: List<InvitePermission>,
)

/**
 * Défauts sûrs de l'invitation (iOS : messages, images et historique autorisés, fichiers refusés, pseudo
 * requis) et lois pures de la feuille : détection d'une modification depuis la génération du lien, résumé,
 * requête finale. Le lien se crée à l'ouverture, sans formulaire à remplir.
 */
object InviteLinkDefaults {

    fun draft(conversationId: String): InviteLinkDraft = InviteLinkDraft(
        form = CreateShareLinkForm.from(conversationId).copy(
            allowAnonymousMessages = true,
            allowAnonymousImages = true,
            allowAnonymousFiles = false,
            allowViewHistory = true,
            requireAccount = false,
            requireNickname = true,
            requireEmail = false,
        ),
    )

    /** `"Rejoins la conversation "Nom""` : le nom du lien quand l'utilisateur n'en saisit pas. */
    fun defaultLinkName(prefix: String, conversationName: String): String =
        "$prefix \"$conversationName\""

    /** Vrai dès que le brouillon diffère de celui qui a servi à générer le lien affiché. */
    fun optionsModified(generated: InviteLinkDraft?, current: InviteLinkDraft): Boolean =
        generated == null || generated != current

    fun summary(draft: InviteLinkDraft): InviteLinkSummary = InviteLinkSummary(
        expiration = draft.form.expiration,
        permissions = buildList {
            if (draft.form.allowAnonymousMessages) add(InvitePermission.Messages)
            if (draft.form.allowAnonymousImages) add(InvitePermission.Images)
            if (draft.form.allowAnonymousFiles) add(InvitePermission.Files)
            if (draft.form.allowViewHistory) add(InvitePermission.History)
        },
    )

    /** Pas du stepper d'iOS (`value < 100 ? 1 : 10`), au plafond de [CreateShareLinkForm.MAX_MAX_USES]. */
    fun maxUsesStep(value: Int): Int = if (value < STEP_THRESHOLD) 1 else 10

    fun stepMaxUses(form: CreateShareLinkForm, direction: Int): CreateShareLinkForm =
        form.withMaxUses(form.maxUses + direction * maxUsesStep(form.maxUses))

    private const val STEP_THRESHOLD = 100

    /** La requête de création : nom et message vides retombent sur leurs textes par défaut. */
    fun toRequest(
        draft: InviteLinkDraft,
        nowMillis: Long,
        defaultMessage: String,
        defaultName: String,
    ): CreateShareLinkRequest? = draft.form
        .withName(draft.form.name.ifBlank { defaultName })
        .withDescription(draft.message.ifBlank { defaultMessage })
        .toRequest(nowMillis)
}
