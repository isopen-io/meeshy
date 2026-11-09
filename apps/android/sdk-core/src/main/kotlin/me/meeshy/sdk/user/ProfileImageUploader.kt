package me.meeshy.sdk.user

import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.AvatarBannerApply
import me.meeshy.sdk.model.AvatarBannerUpload
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.ImageUploadValidation
import me.meeshy.sdk.model.ImageUploadValidator
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ProfileSnapshot
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.SessionRepository

/** Ce qu'un envoi d'avatar ou de bannière a donné. */
sealed interface ProfileImageUploadOutcome {
    /** L'image est en ligne et le profil la porte : [url] est l'adresse servie. */
    data class Applied(val url: String) : ProfileImageUploadOutcome
    data class Rejected(val reason: ImageUploadValidation.Reason) : ProfileImageUploadOutcome
    data object UploadFailed : ProfileImageUploadOutcome
    data object UpdateFailed : ProfileImageUploadOutcome
}

/**
 * Le trajet UNIQUE « envoyer les octets → peindre l'adresse sur la session → confirmer par le PATCH avatar/bannière →
 * adopter l'identité servie, ou revenir à l'instantané », partagé par l'édition du profil et la carte d'onboarding
 * « Montre-toi » (#17238). Chaque adoption passe sous le TICKET de compte pris au choix ([AccountFence.commit], #13568).
 * Ne libère jamais l'item : son appelant en décide (il peut le garder pour « Réessayer »). Ne lève que l'annulation.
 */
class ProfileImageUploader @Inject constructor(
    private val mediaRepository: MediaRepository,
    private val userRepository: UserRepository,
    private val sessionRepository: SessionRepository,
    private val fence: AccountFence,
) {
    /** La raison du refus d'une image avant tout réseau, ou `null` si elle peut partir. */
    fun validate(target: ImageUploadTarget, item: MediaUploadItem): ImageUploadValidation.Reason? {
        val size = item.sizeBytes.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        return when (val validation = ImageUploadValidator.validateCompressed(target, size, item.mimeType)) {
            is ImageUploadValidation.Rejected -> validation.reason
            ImageUploadValidation.Accepted -> null
        }
    }

    /** Valide puis envoie, l'instantané et le ticket étant pris MAINTENANT. */
    suspend fun upload(target: ImageUploadTarget, item: MediaUploadItem): ProfileImageUploadOutcome {
        validate(target, item)?.let { return ProfileImageUploadOutcome.Rejected(it) }
        return send(target, item, sessionRepository.currentUser.value, fence.ticket())
    }

    /** Envoie une image déjà validée ; [snapshot] et [ticket] sont ceux du moment du choix. */
    suspend fun send(
        target: ImageUploadTarget,
        item: MediaUploadItem,
        snapshot: MeeshyUser?,
        ticket: AccountTicket,
    ): ProfileImageUploadOutcome {
        suspend fun adoptUnderTicket(user: MeeshyUser) = fence.commit(ticket) { sessionRepository.adopt(user) }
        return try {
            val uploaded = when (val result = mediaRepository.upload(listOf(item))) {
                is NetworkResult.Success -> result.data
                is NetworkResult.Failure -> return ProfileImageUploadOutcome.UploadFailed
            }
            val url = AvatarBannerUpload.firstUploadedUrl(uploaded) ?: return ProfileImageUploadOutcome.UploadFailed
            if (snapshot != null) adoptUnderTicket(AvatarBannerApply.apply(snapshot, target, url))
            when (val confirm = confirm(target, url)) {
                is NetworkResult.Success -> {
                    adoptUnderTicket(ProfileSnapshot.mergingServerUser(confirm.data, sessionRepository.currentUser.value))
                    val served = when (target) {
                        ImageUploadTarget.AVATAR -> confirm.data.avatar
                        ImageUploadTarget.BANNER -> confirm.data.banner
                    }
                    ProfileImageUploadOutcome.Applied(served?.takeIf { it.isNotBlank() } ?: url)
                }
                is NetworkResult.Failure -> {
                    snapshot?.let { adoptUnderTicket(it) }
                    ProfileImageUploadOutcome.UpdateFailed
                }
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            snapshot?.let { adoptUnderTicket(it) }
            ProfileImageUploadOutcome.UpdateFailed
        }
    }

    private suspend fun confirm(target: ImageUploadTarget, url: String) = when (target) {
        ImageUploadTarget.AVATAR -> userRepository.updateAvatar(url)
        ImageUploadTarget.BANNER -> userRepository.updateBanner(url)
    }
}
