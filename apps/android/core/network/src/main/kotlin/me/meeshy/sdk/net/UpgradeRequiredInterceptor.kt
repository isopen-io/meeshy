package me.meeshy.sdk.net

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.net.UpgradeRequirement
import okhttp3.Interceptor
import okhttp3.Response

/**
 * L'état « ce binaire n'a plus le droit de parler au serveur » (iOS `UpgradeGateController`). COLLANT : un 426 arrivé avant
 * que l'hôte écoute ne se perd pas, et l'écran n'a pas de sortie — seule la mise à jour, qui remplace le processus, le lève.
 */
public class UpgradeRequiredNotifier {
    private val _required = MutableStateFlow<UpgradeRequirement?>(null)
    public val required: StateFlow<UpgradeRequirement?> = _required.asStateFlow()

    public fun notifyRequired(requirement: UpgradeRequirement) {
        _required.update { UpgradeRequirement.preferred(it, requirement) }
    }
}

/**
 * Lit tout `426` (le plancher de version, et la porte des stories) et le signale : retenter ne peut pas aboutir, l'écran
 * doit le dire (iOS `UpgradeGateSignal`). Le STATUT déclenche, jamais le corps — un corps illisible rend une exigence nue.
 * La réponse ressort intacte.
 */
internal class UpgradeRequiredInterceptor(
    private val onRequired: (UpgradeRequirement) -> Unit,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (response.code != UpgradeRequirement.STATUS) return response
        val body = runCatching { response.peekBody(MAX_BODY_BYTES).string() }.getOrNull()
        onRequired(UpgradeRequirement.fromResponseBody(body))
        return response
    }

    private companion object {
        const val MAX_BODY_BYTES = 4_096L
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal object UpgradeRequiredModule {
    @Provides
    @Singleton
    fun providesUpgradeRequiredNotifier(): UpgradeRequiredNotifier = UpgradeRequiredNotifier()

    @Provides
    @IntoSet
    fun providesUpgradeRequiredContributor(notifier: UpgradeRequiredNotifier): HttpClientContributor =
        HttpClientContributor.of("upgrade-required", HttpPriority.UPGRADE_REQUIRED) {
            it.addInterceptor(UpgradeRequiredInterceptor(notifier::notifyRequired))
        }
}
