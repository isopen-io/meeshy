package me.meeshy.app.chat

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsClient
import androidx.browser.customtabs.CustomTabsIntent
import me.meeshy.sdk.link.LinkOpenPolicy
import me.meeshy.sdk.link.LinkOpenTarget
import me.meeshy.sdk.model.link.InAppLinks

/**
 * What a tapped link becomes — the pure decision of [chatLinkLaunchFor], one arm per concrete launch.
 * Mirrors iOS `InAppLinks` (#7808, #8075, #10874): a link that must never reach the app is a different
 * arm from an ordinary web link, not a flag on it.
 */
internal sealed interface ChatLinkLaunch {
    /** An ordinary web link — a Chrome Custom Tab; the OS may hand a verified Meeshy App Link to the app. */
    data class InAppBrowser(val url: String) : ChatLinkLaunch

    /**
     * A browser, and ONLY a browser: the Custom Tab is pinned to a browser package so the OS can never answer
     * with Meeshy as an App Link. An e-mail token link would sign the reader in as whoever posted it; a
     * referral invitation has nothing to open in the app of a signed-in account.
     */
    data class BrowserOnly(val url: String) : ChatLinkLaunch

    /** A well-formed non-web scheme (mailto:, tel:, geo:, deep link…) — handed to the OS. */
    data class External(val url: String) : ChatLinkLaunch

    /** Nothing happens: a dangerous or unparseable link, or an e-mail token link that cannot open over https. */
    data object Ignored : ChatLinkLaunch
}

/**
 * The single pure decision for a tapped chat link, layered on [LinkOpenPolicy]:
 *  - an e-mail token link ([InAppLinks.isEmailLink]) opens in the browser over https and otherwise not at all —
 *    never as an App Link, never through `meeshy://` (fail-closed, as iOS `EmailLinkBrowser`);
 *  - a referral invitation ([InAppLinks.isReferralLink]) opens in the browser;
 *  - everything else keeps [LinkOpenPolicy]'s verdict.
 */
internal fun chatLinkLaunchFor(rawUrl: String): ChatLinkLaunch = when (val target = LinkOpenPolicy.targetFor(rawUrl)) {
    is LinkOpenTarget.InAppBrowser -> when {
        InAppLinks.isEmailLink(target.url) ->
            if (target.url.startsWith(HTTPS_PREFIX)) ChatLinkLaunch.BrowserOnly(target.url) else ChatLinkLaunch.Ignored
        InAppLinks.isReferralLink(target.url) -> ChatLinkLaunch.BrowserOnly(target.url)
        else -> ChatLinkLaunch.InAppBrowser(target.url)
    }
    is LinkOpenTarget.External ->
        if (InAppLinks.isEmailLink(target.url)) ChatLinkLaunch.Ignored else ChatLinkLaunch.External(target.url)
    LinkOpenTarget.Unsupported -> ChatLinkLaunch.Ignored
}

private const val HTTPS_PREFIX = "https://"

/** A neutral web address no app claims as an App Link — only used to ask the OS which browsers exist. */
private const val BROWSER_PROBE_URL = "https://www.example.com"

/**
 * App-side launcher that turns the pure [chatLinkLaunchFor] decision into a concrete Android intent —
 * the coverage-exempt glue over the tested state machine. Mirrors iOS presenting an
 * `SFSafariViewController` for a tapped link, but routes each arm faithfully:
 *  - [ChatLinkLaunch.InAppBrowser] → a Chrome Custom Tab tinted with the conversation accent,
 *  - [ChatLinkLaunch.BrowserOnly]  → the same Custom Tab pinned to a browser package, never answered by this app,
 *  - [ChatLinkLaunch.External]     → the OS `ACTION_VIEW` handler (mail app, dialer, deep link…),
 *  - [ChatLinkLaunch.Ignored]      → a no-op (a dangerous, unparseable or token link is never opened).
 *
 * Every launch is guarded so a missing handler (`ActivityNotFoundException`) degrades to nothing
 * rather than crashing the chat.
 */
internal fun openChatLink(context: Context, rawUrl: String, accentArgb: Int) {
    when (val launch = chatLinkLaunchFor(rawUrl)) {
        is ChatLinkLaunch.InAppBrowser -> openInAppBrowser(context, launch.url, accentArgb, browserPackage = null)
        is ChatLinkLaunch.BrowserOnly ->
            browserPackage(context)?.let { openInAppBrowser(context, launch.url, accentArgb, browserPackage = it) }
        is ChatLinkLaunch.External -> openExternally(context, launch.url)
        ChatLinkLaunch.Ignored -> Unit
    }
}

private fun openInAppBrowser(context: Context, url: String, accentArgb: Int, browserPackage: String?) {
    runCatching {
        val tab = CustomTabsIntent.Builder()
            .setShowTitle(true)
            .setUrlBarHidingEnabled(true)
            .setDefaultColorSchemeParams(
                CustomTabColorSchemeParams.Builder()
                    .setToolbarColor(accentArgb)
                    .build(),
            )
            .build()
        browserPackage?.let { tab.intent.setPackage(it) }
        tab.launchUrl(context, Uri.parse(url))
    }
}

/**
 * A browser package that is not this app: the Custom Tabs provider the user already uses when there is one, any
 * installed browser otherwise, `null` when the device has none — then the link is not opened (fail-closed), because
 * an unpinned launch could be answered by this very app.
 */
private fun browserPackage(context: Context): String? {
    val self = context.packageName
    val customTabsProvider = runCatching { CustomTabsClient.getPackageName(context, null) }.getOrNull()
    if (customTabsProvider != null && customTabsProvider != self) return customTabsProvider
    val probe = Intent(Intent.ACTION_VIEW, Uri.parse(BROWSER_PROBE_URL)).addCategory(Intent.CATEGORY_BROWSABLE)
    return runCatching { context.packageManager.queryIntentActivities(probe, PackageManager.MATCH_ALL) }
        .getOrDefault(emptyList())
        .map { it.activityInfo.packageName }
        .firstOrNull { it != self }
}

private fun openExternally(context: Context, url: String) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
