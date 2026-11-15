package me.meeshy.sdk.model

import me.meeshy.sdk.model.media.ImageByteBudget

/**
 * La règle des images d'une communauté (avatar, bannière), alignée sur iOS : le même plafond d'octets que
 * les photos d'entité (500 Ko l'avatar, 800 Ko la bannière) et le même refus d'un fichier qui n'est pas une image.
 * Une seule source : [ImageByteBudget] porte les plafonds, [ImageUploadValidator] le refus.
 */
object CommunityImageUpload {
    fun maxBytes(target: ImageUploadTarget): Long = ImageByteBudget.forTarget(target).maxBytes

    /** Une image qui passe le budget, prête à être téléversée par le chemin des images de profil. */
    fun validateCompressed(target: ImageUploadTarget, byteCount: Int, mimeType: String): ImageUploadValidation =
        when (val base = ImageUploadValidator.validate(target, byteCount, mimeType)) {
            is ImageUploadValidation.Rejected -> base
            ImageUploadValidation.Accepted ->
                if (ImageByteBudget.forTarget(target).admits(byteCount.toLong())) ImageUploadValidation.Accepted
                else ImageUploadValidation.Rejected(ImageUploadValidation.Reason.TOO_LARGE)
        }
}
