package me.meeshy.app.ongoing

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.Module
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import me.meeshy.sdk.model.ongoing.LiveActivityCommand
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que l'app fait d'un bouton de notification en cours ; `true` quand la commande l'a concerné. */
internal fun interface OngoingCommandHandler {
    fun handle(command: LiveActivityCommand): Boolean
}

/** Remet une commande au premier gestionnaire qui la prend ; sans gestionnaire, elle est sans effet. */
@Singleton
internal class OngoingCommandRouter @Inject constructor(
    private val handlers: Set<@JvmSuppressWildcards OngoingCommandHandler>,
) {
    fun dispatch(command: LiveActivityCommand): Boolean = handlers.any { it.handle(command) }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface OngoingCommandEntryPoint {
    fun router(): OngoingCommandRouter
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class OngoingCommandHandlersModule {
    @Multibinds
    abstract fun handlers(): Set<@JvmSuppressWildcards OngoingCommandHandler>
}

/** UN récepteur pour tous les boutons des notifications en cours (non exporté, intent immuable). */
internal class OngoingCommandReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context?, intent: Intent?) {
        if (context == null || intent?.action != ACTION) return
        val command = LiveActivityCommand.fromWireName(intent.getStringExtra(EXTRA_COMMAND)) ?: return
        val router = EntryPointAccessors.fromApplication(context.applicationContext, OngoingCommandEntryPoint::class.java).router()
        router.dispatch(command)
    }

    internal companion object {
        const val ACTION: String = "me.meeshy.app.ongoing.COMMAND"
        const val EXTRA_COMMAND: String = "me.meeshy.app.ongoing.COMMAND_NAME"

        fun intent(context: Context, command: LiveActivityCommand): Intent =
            Intent(context, OngoingCommandReceiver::class.java)
                .setAction(ACTION)
                .putExtra(EXTRA_COMMAND, command.wireName)
    }
}
