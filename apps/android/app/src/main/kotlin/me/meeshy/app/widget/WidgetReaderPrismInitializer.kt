package me.meeshy.app.widget

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.app.startup.AppInitializer
import me.meeshy.app.widget.kit.WidgetReaderPrismStore
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.session.SessionRepository

/**
 * Grave, à chaque compte et à chaque changement de langue, le prisme du lecteur que les widgets
 * relisent à froid ([WidgetReaderPrismStore]) et redemande leur repeinte quand elle change. Sans compte, la descente est vidée : un widget ne
 * traduit pour personne.
 */
class WidgetReaderPrismInitializer @Inject constructor(
    @ApplicationContext private val context: Context,
    private val session: SessionRepository,
    private val refresher: WidgetRefresher,
) : AppInitializer {
    override fun initialize() {
        val store = WidgetReaderPrismStore(context)
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            session.currentUser
                .map { user -> user?.let(LanguageResolver::preferredContentLanguages).orEmpty() }
                .distinctUntilChanged()
                .collect { prism -> if (store.save(prism)) refresher.request() }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface WidgetReaderPrismModule {
    @Binds
    @IntoSet
    fun widgetReaderPrismInitializer(impl: WidgetReaderPrismInitializer): AppInitializer
}
