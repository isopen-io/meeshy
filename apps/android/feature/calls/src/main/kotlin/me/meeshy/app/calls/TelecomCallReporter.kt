package me.meeshy.app.calls

import android.util.Log
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.call.TelecomConnectionUpdate
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The output seam for OS-level call reporting: it turns the decisions of the
 * pure [me.meeshy.sdk.model.call.TelecomCallPolicy] into telecom reports.
 * Isolating it behind an interface keeps every *decision* (which connection
 * state, which disconnect cause, when to report) in the tested policy + the
 * [CallViewModel] fold, and leaves the concrete reporter as thin, decision-free
 * platform glue — so the VM's telecom behaviour is asserted through a recording
 * fake, no device required.
 *
 * [report] is only called by the VM on a genuine transition (the policy dedupes
 * inert edges to `null`), so the implementation may assume each call is a real
 * connection change.
 */
interface TelecomCallReporter {
    /** Report a genuine connection [update] to the OS telecom layer. */
    fun report(update: TelecomConnectionUpdate)

    /** Tear down the telecom connection — called when the call surface is torn down. */
    fun release()
}

/**
 * Interim reporter: emits each connection transition to the system log so the
 * seam is live end-to-end while the heavier self-managed
 * `android.telecom.ConnectionService` + `PhoneAccount` registration (which will
 * swap this [dagger.Binds]) is built as its own glue slice. Decision-free — the
 * `TelecomConnectionState` / `TelecomDisconnectCause` are already resolved by the
 * pure policy.
 */
@Singleton
class LogTelecomCallReporter @Inject constructor() : TelecomCallReporter {

    override fun report(update: TelecomConnectionUpdate) {
        val cause = update.cause?.let { " ($it)" }.orEmpty()
        Log.i(TAG, "telecom → ${update.state}$cause")
    }

    override fun release() {
        Log.i(TAG, "telecom connection released")
    }

    private companion object {
        const val TAG = "CallTelecom"
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface TelecomCallModule {
    @Binds
    fun bindTelecomCallReporter(impl: LogTelecomCallReporter): TelecomCallReporter
}
