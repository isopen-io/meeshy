package me.meeshy.sdk.model

/**
 * Les accès que l'app demande, chacun avec son libellé de refus propre : un message
 * générique (« accès refusé ») n'apprend pas à l'utilisateur quelle ligne activer.
 *
 * Sur-ensemble de `MediaPermissionKind` côté iOS (micro, caméra, lecture et écriture de la
 * photothèque) auquel s'ajoutent le lieu, les notifications et les contacts, qui passent
 * par la même porte.
 */
enum class PermissionNature(val slug: String) {
    MICROPHONE("microphone"),
    CAMERA("camera"),
    PHOTO_LIBRARY_READ("photos"),
    PHOTO_LIBRARY_ADD("photos_add"),
    LOCATION("location"),
    NOTIFICATIONS("notifications"),
    CONTACTS("contacts");

    /**
     * Ce que ce niveau d'API demande réellement au système. Le sélecteur de médias système
     * (`PickVisualMedia`) ne figure pas ici : il tourne hors processus et n'exige rien.
     */
    fun requirements(sdkInt: Int): PermissionRequirements = when (this) {
        MICROPHONE -> PermissionRequirements.runtime(AndroidPermissions.RECORD_AUDIO)
        CAMERA -> PermissionRequirements.runtime(AndroidPermissions.CAMERA)
        PHOTO_LIBRARY_READ -> photoLibraryRead(sdkInt)
        PHOTO_LIBRARY_ADD -> photoLibraryAdd(sdkInt)
        LOCATION -> PermissionRequirements.runtime(
            AndroidPermissions.ACCESS_FINE_LOCATION,
            AndroidPermissions.ACCESS_COARSE_LOCATION,
        )
        NOTIFICATIONS -> notifications(sdkInt)
        CONTACTS -> PermissionRequirements.runtime(AndroidPermissions.READ_CONTACTS)
    }

    private fun photoLibraryRead(sdkInt: Int): PermissionRequirements = when {
        sdkInt >= AndroidApi.UPSIDE_DOWN_CAKE -> PermissionRequirements(
            request = listOf(
                AndroidPermissions.READ_MEDIA_IMAGES,
                AndroidPermissions.READ_MEDIA_VIDEO,
                AndroidPermissions.READ_MEDIA_VISUAL_USER_SELECTED,
            ),
            fullAccess = setOf(AndroidPermissions.READ_MEDIA_IMAGES, AndroidPermissions.READ_MEDIA_VIDEO),
            partialAccess = setOf(AndroidPermissions.READ_MEDIA_VISUAL_USER_SELECTED),
        )
        sdkInt >= AndroidApi.TIRAMISU -> PermissionRequirements.runtime(
            AndroidPermissions.READ_MEDIA_IMAGES,
            AndroidPermissions.READ_MEDIA_VIDEO,
        )
        else -> PermissionRequirements.runtime(AndroidPermissions.READ_EXTERNAL_STORAGE)
    }

    private fun photoLibraryAdd(sdkInt: Int): PermissionRequirements =
        if (sdkInt >= AndroidApi.Q) {
            PermissionRequirements.noPrompt(NoPromptGrant.ALWAYS)
        } else {
            PermissionRequirements.runtime(AndroidPermissions.WRITE_EXTERNAL_STORAGE)
        }

    private fun notifications(sdkInt: Int): PermissionRequirements =
        if (sdkInt >= AndroidApi.TIRAMISU) {
            PermissionRequirements.runtime(AndroidPermissions.POST_NOTIFICATIONS)
        } else {
            PermissionRequirements.noPrompt(NoPromptGrant.FOLLOWS_APP_NOTIFICATIONS)
        }
}

/**
 * Ce qu'il faut demander pour une [PermissionNature] à un niveau d'API donné, et quelles
 * permissions comptent comme un accès entier ou partiel.
 *
 * [request] vide = le système n'affiche aucune boîte : l'accès est alors soit implicite
 * ([NoPromptGrant.ALWAYS]), soit commandé par l'interrupteur de l'app dans les Réglages
 * ([NoPromptGrant.FOLLOWS_APP_NOTIFICATIONS], notifications avant Android 13).
 */
data class PermissionRequirements(
    val request: List<String>,
    val fullAccess: Set<String>,
    val partialAccess: Set<String> = emptySet(),
    val whenNoPrompt: NoPromptGrant = NoPromptGrant.ALWAYS,
) {
    val hasSystemPrompt: Boolean get() = request.isNotEmpty()

    companion object {
        fun runtime(vararg permissions: String): PermissionRequirements =
            PermissionRequirements(request = permissions.toList(), fullAccess = permissions.toSet())

        fun noPrompt(whenNoPrompt: NoPromptGrant): PermissionRequirements =
            PermissionRequirements(request = emptyList(), fullAccess = emptySet(), whenNoPrompt = whenNoPrompt)
    }
}

enum class NoPromptGrant {
    /** Aucune permission n'existe à ce niveau d'API : l'accès est acquis. */
    ALWAYS,

    /** L'accès est accordé tant que les notifications de l'app ne sont pas coupées dans les Réglages. */
    FOLLOWS_APP_NOTIFICATIONS,
}

/** Niveaux d'API qui changent ce qu'une nature demande. */
object AndroidApi {
    const val Q = 29
    const val TIRAMISU = 33
    const val UPSIDE_DOWN_CAKE = 34
}

/** Noms de permissions Android (littéraux : `:core:model` n'importe aucun `android.*`). */
object AndroidPermissions {
    const val RECORD_AUDIO = "android.permission.RECORD_AUDIO"
    const val CAMERA = "android.permission.CAMERA"
    const val ACCESS_FINE_LOCATION = "android.permission.ACCESS_FINE_LOCATION"
    const val ACCESS_COARSE_LOCATION = "android.permission.ACCESS_COARSE_LOCATION"
    const val POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS"
    const val READ_CONTACTS = "android.permission.READ_CONTACTS"
    const val READ_MEDIA_IMAGES = "android.permission.READ_MEDIA_IMAGES"
    const val READ_MEDIA_VIDEO = "android.permission.READ_MEDIA_VIDEO"
    const val READ_MEDIA_VISUAL_USER_SELECTED = "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
    const val READ_EXTERNAL_STORAGE = "android.permission.READ_EXTERNAL_STORAGE"
    const val WRITE_EXTERNAL_STORAGE = "android.permission.WRITE_EXTERNAL_STORAGE"
}
