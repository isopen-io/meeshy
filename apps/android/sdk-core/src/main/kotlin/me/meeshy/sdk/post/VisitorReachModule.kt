package me.meeshy.sdk.post

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.sdk.model.SocialEventsReceipt
import me.meeshy.sdk.model.analytics.SocialEventsBody
import me.meeshy.sdk.model.analytics.SocialEventsDispatch
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.net.VisitorReaderKeyProviding
import me.meeshy.sdk.net.api.SocialEventsApi
import me.meeshy.sdk.net.apiCall

internal class SocialEventsVisitorSender(
    private val api: SocialEventsApi,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) : VisitorReachSender {
    override suspend fun send(
        events: List<me.meeshy.sdk.model.analytics.StampedSocialEvent>,
        token: String,
    ): VisitorReachDelivery {
        val body = SocialEventsBody.of(events, nowMillis())
        val result: NetworkResult<SocialEventsReceipt> = apiCall { api.record(body, token) }
        return when (result) {
            is NetworkResult.Success -> VisitorReachDelivery.ACKNOWLEDGED
            is NetworkResult.Failure ->
                if (SocialEventsDispatch.isPermanentRefusal(result.error.httpStatus)) {
                    VisitorReachDelivery.REFUSED_PERMANENTLY
                } else {
                    VisitorReachDelivery.FAILED
                }
        }
    }
}

internal class SharedPreferencesVisitorReachStorage(context: Context) : VisitorReachStorage {
    private val prefs = context.getSharedPreferences("meeshy_visitor_reach", Context.MODE_PRIVATE)

    override fun read(): String? = try {
        prefs.getString(KEY, null)
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    override fun write(json: String?) {
        prefs.edit().apply { if (json == null) remove(KEY) else putString(KEY, json) }.apply()
    }

    private companion object {
        const val KEY = "pending"
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal object VisitorReachModule {

    @Provides
    @Singleton
    fun providesVisitorReachReporter(
        api: SocialEventsApi,
        @ApplicationContext context: Context,
        tokenStore: TokenStore,
        visitorKey: VisitorReaderKeyProviding,
    ): VisitorReachReporter = VisitorReachReporter(
        sender = SocialEventsVisitorSender(api),
        storage = SharedPreferencesVisitorReachStorage(context),
        token = { tokenStore.sessionToken ?: visitorKey.readerKey() },
        knownTokens = { listOfNotNull(tokenStore.sessionToken, visitorKey.storedReaderKey()) },
        isSignedIn = { tokenStore.jwt != null },
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    )
}
