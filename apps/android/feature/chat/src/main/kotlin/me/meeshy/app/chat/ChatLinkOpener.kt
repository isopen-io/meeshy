package me.meeshy.app.chat

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import me.meeshy.sdk.link.LinkOpenPolicy
import me.meeshy.sdk.link.LinkOpenTarget

/**
 * App-side launcher that turns the pure [LinkOpenPolicy] decision into a concrete Android intent —
 * the coverage-exempt glue over the tested state machine. Mirrors iOS presenting an
 * `SFSafariViewController` for a tapped link, but routes each arm faithfully:
 *  - [LinkOpenTarget.InAppBrowser] → a Chrome Custom Tab tinted with the conversation accent,
 *  - [LinkOpenTarget.External]     → the OS `ACTION_VIEW` handler (mail app, dialer, deep link…),
 *  - [LinkOpenTarget.Unsupported]  → a no-op (a dangerous or unparseable link is never opened).
 *
 * Every launch is guarded so a missing handler (`ActivityNotFoundException`) degrades to nothing
 * rather than crashing the chat.
 */
internal fun openChatLink(context: Context, rawUrl: String, accentArgb: Int) {
    when (val target = LinkOpenPolicy.targetFor(rawUrl)) {
        is LinkOpenTarget.InAppBrowser -> openInAppBrowser(context, target.url, accentArgb)
        is LinkOpenTarget.External -> openExternally(context, target.url)
        LinkOpenTarget.Unsupported -> Unit
    }
}

private fun openInAppBrowser(context: Context, url: String, accentArgb: Int) {
    runCatching {
        CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setUrlBarHidingEnabled(true)
            .setDefaultColorSchemeParams(
                CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(accentArgb)
                    .build(),
            )
            .build()
            .launchUrl(context, Uri.parse(url))
    }
}

private fun openExternally(context: Context, url: String) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
