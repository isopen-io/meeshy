package me.meeshy.app.onboarding

import android.content.Context
import android.os.Build
import androidx.work.WorkManager
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.util.Locale
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.friend.FriendRepository
import me.meeshy.sdk.model.AndroidPermissions
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.contacts.DirectoryFilter
import me.meeshy.sdk.model.contacts.DirectorySyncMode
import me.meeshy.sdk.model.game.engagement.EngagementMilestoneType
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.sdk.model.notification.NotificationPermissionPrompt
import me.meeshy.sdk.model.onboarding.ApiOnboardingState
import me.meeshy.sdk.model.onboarding.OnboardingContactsRules
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.sdk.model.onboarding.OnboardingStepOutcome
import me.meeshy.sdk.model.onboarding.OnboardingSuggestion
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.onboarding.OnboardingRepository
import me.meeshy.sdk.onboarding.OnboardingSettledStore
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.permission.PermissionRequestHistory
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.publication.UnsentPublicationKind
import me.meeshy.sdk.publication.UnsentPublicationStatus
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.user.BirthDateOutcome
import me.meeshy.sdk.user.BirthDateRepository
import me.meeshy.sdk.user.ContactsBookRepository
import me.meeshy.sdk.user.DirectoryRepository
import me.meeshy.sdk.user.UserRepository
import me.meeshy.ui.component.permission.MediaPermissionRequester

/**
 * Le branchement réel du parcours : chaque méthode est UN appel aux dépôts qui existent déjà (déclaration d'âge, demande
 * d'ami, synchronisation du carnet…). Aucune règle ici : elles vivent dans `:core:model` et dans le modèle de vue.
 */
@Singleton
class OnboardingGatewayImpl @Inject constructor(
    @ApplicationContext private val context: Context,
    private val onboarding: OnboardingRepository,
    private val settled: OnboardingSettledStore,
    private val users: UserRepository,
    private val auth: AuthRepository,
    private val birthDates: BirthDateRepository,
    private val messages: MessageRepository,
    private val friends: FriendRepository,
    private val contactsBook: ContactsBookRepository,
    private val directory: DirectoryRepository,
    private val deviceContacts: DeviceContactsReading,
    private val engagement: EngagementProgressRepository,
    private val session: SessionRepository,
    private val workManager: WorkManager,
    private val publications: PublicationOutbox,
) : OnboardingGateway {

    override suspend fun fetchState(): ApiOnboardingState? = onboarding.fetchState()

    override suspend fun record(step: OnboardingStepId, outcome: OnboardingStepOutcome) {
        onboarding.record(step, outcome)
    }

    override suspend fun finish() {
        onboarding.finish()
    }

    /** Optimiste et durable : la session se repeint tout de suite, la file d'envoi porte l'écriture hors ligne. */
    override suspend fun updateLanguages(primary: String, secondary: String?): Boolean {
        val cmid = users.enqueueProfileEdit(UpdateProfileRequest(systemLanguage = primary, regionalLanguage = secondary))
        if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
        return cmid != null
    }

    override suspend fun resendVerification(email: String): Boolean =
        auth.resendEmailVerification(email) is NetworkResult.Success

    override suspend fun declareBirthDate(pickerUtcMillis: Long): OnboardingBirthDateResult =
        when (val outcome = birthDates.setBirthDateFromPicker(pickerUtcMillis)) {
            is BirthDateOutcome.Declared ->
                OnboardingBirthDateResult.Declared(closesGlobal = outcome.declaration.viewerWriteRestrictionGlobal)
            is BirthDateOutcome.Refused -> OnboardingBirthDateResult.Refused(outcome.reason)
        }

    override suspend fun sendGreeting(conversationId: String, text: String, declaredLanguage: String?): Boolean {
        val sender = session.currentUser.value ?: return false
        return runCatching {
            messages.sendOptimistic(
                conversationId = conversationId,
                content = text,
                originalLanguage = declaredLanguage ?: sender.systemLanguage ?: DEFAULT_LANGUAGE,
                sender = sender,
            )
            workManager.enqueue(OutboxFlushWorker.buildRequest())
        }.isSuccess
    }

    override suspend fun sendFriendRequest(userId: String): Boolean =
        friends.sendFriendRequest(userId) is NetworkResult.Success

    override suspend fun findFriendsInContacts(selfId: String?): List<OnboardingSuggestion>? {
        val entries = runCatching { deviceContacts.read() }.getOrElse { return null }
        val country = Locale.getDefault().country.takeIf { it.isNotEmpty() }
        if (contactsBook.syncDirectory(entries, DirectorySyncMode.Replace, country) !is NetworkResult.Success) return null
        val listed = directory.listAll(DirectoryFilter.Meeshy) as? NetworkResult.Success ?: return null
        return OnboardingContactsRules.friends(listed.data, selfId)
    }

    override suspend fun fetchProgress(): OnboardingProgress? {
        val progress = engagement.fetchProgress() ?: return null
        return OnboardingProgress(
            score = progress.level.engagementScore,
            streakDays = progress.streak.currentStreakDays,
            badges = progress.milestones.count { it.milestoneType == EngagementMilestoneType.BADGE },
            elanFactor = maxOf(1, Math.round(progress.elan?.factor ?: 1.0).toInt()),
        )
    }

    override suspend fun contactsPermission(): MediaPermissionState = requester().state(PermissionNature.CONTACTS)

    /** Android 13+ seulement, et seulement si la boîte système n'a jamais servi : sinon la carte n'est pas prévue. */
    override suspend fun notificationsUndetermined(): Boolean {
        val state = requester().state(PermissionNature.NOTIFICATIONS)
        val asked = PermissionRequestHistory.shared(context).wasRequested(AndroidPermissions.POST_NOTIFICATIONS)
        return NotificationPermissionPrompt.asksOnArrival(Build.VERSION.SDK_INT, state, asked)
    }

    /** La file durable des publications : celles de story que le serveur n'a pas confirmées et qui partent encore. */
    override suspend fun sendingStoryPublications(): Set<String>? =
        try {
            publications.unsent().first()
                .filter { it.kind == UnsentPublicationKind.STORY && it.status == UnsentPublicationStatus.SENDING }
                .mapTo(mutableSetOf()) { it.cmid }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }

    override fun isSettled(userId: String): Boolean = settled.isSettled(userId)

    override fun markSettled(userId: String) = settled.markSettled(userId)

    private fun requester() = MediaPermissionRequester(context, PermissionRequestHistory.shared(context))

    private companion object {
        const val DEFAULT_LANGUAGE = "fr"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface OnboardingBindingsModule {
    @Binds
    fun gateway(impl: OnboardingGatewayImpl): OnboardingGateway

    @Binds
    fun texts(impl: AndroidOnboardingTexts): OnboardingTexts

    @Binds
    fun contacts(impl: DeviceContactsReader): DeviceContactsReading
}
