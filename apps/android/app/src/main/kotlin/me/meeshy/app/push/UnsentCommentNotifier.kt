package me.meeshy.app.push

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.app.MainActivity
import me.meeshy.app.R
import me.meeshy.sdk.outbox.UnsentCommentNotice
import me.meeshy.sdk.outbox.OutboxOwnerSource
import javax.inject.Inject
import javax.inject.Singleton

/**
 * « Commentaire non envoyé » (#13693, iOS `notifyUnsentComment`) : la bannière de « Commenter » est partie dès que la file a
 * gardé le commentaire ; si le serveur le refuse pour de bon ensuite, cette notification locale le dit à l'auteur et porte
 * son texte. Toucher ouvre le post (la destination d'un `post_comment`) ; le texte, gardé par
 * [me.meeshy.sdk.post.UnsentCommentStore], revient dans le champ de commentaire du post.
 *
 * Sur un écran verrouillé qui masque le contenu sensible, seule la version publique (sans corps) s'affiche ; la
 * notification n'est posée que sous le compte AUTEUR de la ligne, lu comme la file le lit ([OutboxOwnerSource] : la session,
 * sinon l'identité gardée d'un processus réveillé par la file) — une ligne sans auteur ne s'affiche sous aucun compte.
 */
@Singleton
class UnsentCommentNotifier @Inject constructor(
    @ApplicationContext private val context: Context,
    private val owner: OutboxOwnerSource,
) : UnsentCommentNotice {

    override suspend fun commentNotSent(ownerId: String?, postId: String, text: String) {
        if (!addressesCurrentAccount(ownerId)) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val title = context.getString(R.string.push_comment_unsent_title)
        val publicVersion = NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_SOCIAL_V2)
            .setSmallIcon(R.drawable.ic_stat_meeshy)
            .setContentTitle(title)
            .build()
        val notification = NotificationCompat.Builder(context, NotificationChannelIds.CHANNEL_SOCIAL_V2)
            .setSmallIcon(R.drawable.ic_stat_meeshy)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text).setSummaryText(context.getString(R.string.push_comment_unsent_hint)))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setCategory(NotificationCompat.CATEGORY_ERROR)
            .setAutoCancel(true)
            .setContentIntent(openPost(postId))
            .build()
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notificationTag(postId), NOTIFICATION_ID, notification)
    }

    private fun addressesCurrentAccount(ownerId: String?): Boolean =
        ownerId != null && owner.currentOwnerId() == ownerId

    private fun openPost(postId: String): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            PushTapExtras.put(this, mapOf("type" to TAP_TYPE, "postId" to postId))
        }
        return PendingIntent.getActivity(
            context,
            notificationTag(postId).hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        const val NOTIFICATION_ID: Int = 13693
        const val TAP_TYPE: String = "post_comment"
        fun notificationTag(postId: String): String = "comment-unsent:$postId"
    }
}
