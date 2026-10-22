package me.meeshy.ui.component.permission

import androidx.annotation.StringRes
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.PermissionSurface
import me.meeshy.ui.R

/**
 * Le titre, le corps et le libellé d'action d'une surface de permission, en ressources
 * localisées. Les noms de ressources suivent `PermissionPresentation` (le présentateur pur
 * de `:core:model`) : un test garde les deux alignés.
 */
public data class PermissionCopy(
    @StringRes val title: Int,
    @StringRes val body: Int,
    @StringRes val action: Int,
)

public object MediaPermissionMessages {

    /** Le message d'une ligne par accès, repris de l'iOS (« Micro refusé — … Réglages »). */
    @StringRes
    public fun deniedMessage(nature: PermissionNature): Int = when (nature) {
        PermissionNature.MICROPHONE -> R.string.media_permission_microphone_denied_message
        PermissionNature.CAMERA -> R.string.media_permission_camera_denied_message
        PermissionNature.PHOTO_LIBRARY_READ -> R.string.media_permission_photos_denied_message
        PermissionNature.PHOTO_LIBRARY_ADD -> R.string.media_permission_photos_add_denied_message
        PermissionNature.LOCATION -> R.string.media_permission_location_denied_message
        PermissionNature.NOTIFICATIONS -> R.string.media_permission_notifications_denied_message
        PermissionNature.CONTACTS -> R.string.media_permission_contacts_denied_message
    }

    public fun copy(nature: PermissionNature, surface: PermissionSurface): PermissionCopy = when (surface) {
        PermissionSurface.RATIONALE -> rationale(nature)
        PermissionSurface.DENIED -> denied(nature)
    }

    private fun rationale(nature: PermissionNature): PermissionCopy = when (nature) {
        PermissionNature.MICROPHONE -> PermissionCopy(
            R.string.media_permission_microphone_rationale_title,
            R.string.media_permission_microphone_rationale_body,
            R.string.media_permission_continue,
        )
        PermissionNature.CAMERA -> PermissionCopy(
            R.string.media_permission_camera_rationale_title,
            R.string.media_permission_camera_rationale_body,
            R.string.media_permission_continue,
        )
        PermissionNature.PHOTO_LIBRARY_READ -> PermissionCopy(
            R.string.media_permission_photos_rationale_title,
            R.string.media_permission_photos_rationale_body,
            R.string.media_permission_continue,
        )
        PermissionNature.PHOTO_LIBRARY_ADD -> PermissionCopy(
            R.string.media_permission_photos_add_rationale_title,
            R.string.media_permission_photos_add_rationale_body,
            R.string.media_permission_continue,
        )
        PermissionNature.LOCATION -> PermissionCopy(
            R.string.media_permission_location_rationale_title,
            R.string.media_permission_location_rationale_body,
            R.string.media_permission_continue,
        )
        PermissionNature.NOTIFICATIONS -> PermissionCopy(
            R.string.media_permission_notifications_rationale_title,
            R.string.media_permission_notifications_rationale_body,
            R.string.media_permission_continue,
        )
        PermissionNature.CONTACTS -> PermissionCopy(
            R.string.media_permission_contacts_rationale_title,
            R.string.media_permission_contacts_rationale_body,
            R.string.media_permission_continue,
        )
    }

    private fun denied(nature: PermissionNature): PermissionCopy = when (nature) {
        PermissionNature.MICROPHONE -> PermissionCopy(
            R.string.media_permission_microphone_denied_title,
            R.string.media_permission_microphone_denied_body,
            R.string.media_permission_open_settings,
        )
        PermissionNature.CAMERA -> PermissionCopy(
            R.string.media_permission_camera_denied_title,
            R.string.media_permission_camera_denied_body,
            R.string.media_permission_open_settings,
        )
        PermissionNature.PHOTO_LIBRARY_READ -> PermissionCopy(
            R.string.media_permission_photos_denied_title,
            R.string.media_permission_photos_denied_body,
            R.string.media_permission_open_settings,
        )
        PermissionNature.PHOTO_LIBRARY_ADD -> PermissionCopy(
            R.string.media_permission_photos_add_denied_title,
            R.string.media_permission_photos_add_denied_body,
            R.string.media_permission_open_settings,
        )
        PermissionNature.LOCATION -> PermissionCopy(
            R.string.media_permission_location_denied_title,
            R.string.media_permission_location_denied_body,
            R.string.media_permission_open_settings,
        )
        PermissionNature.NOTIFICATIONS -> PermissionCopy(
            R.string.media_permission_notifications_denied_title,
            R.string.media_permission_notifications_denied_body,
            R.string.media_permission_open_settings,
        )
        PermissionNature.CONTACTS -> PermissionCopy(
            R.string.media_permission_contacts_denied_title,
            R.string.media_permission_contacts_denied_body,
            R.string.media_permission_open_settings,
        )
    }
}
