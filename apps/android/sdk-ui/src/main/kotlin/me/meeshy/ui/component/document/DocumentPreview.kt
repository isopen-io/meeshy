package me.meeshy.ui.component.document

import android.annotation.SuppressLint
import android.content.Context
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

/**
 * Durcit une vue web qui n'affiche QU'UN document reçu : aucun script, aucun accès aux fichiers de l'app ni au réseau,
 * aucune navigation ; ni sélection de texte, ni appui long, ni glisser-déposer — le contenu ne s'emporte pas par la
 * vue (miroir du `WKWebView` de `DocumentFullSheet`, iOS). Seul l'accès `content://` reste ouvert : c'est par lui que
 * le fichier téléchargé est lu.
 */
@SuppressLint("SetJavaScriptEnabled")
public fun hardenDocumentWebView(webView: WebView) {
    webView.settings.apply {
        javaScriptEnabled = false
        allowFileAccess = false
        allowContentAccess = true
        allowFileAccessFromFileURLs = false
        allowUniversalAccessFromFileURLs = false
        blockNetworkLoads = true
        blockNetworkImage = true
        domStorageEnabled = false
        databaseEnabled = false
        javaScriptCanOpenWindowsAutomatically = false
        setSupportMultipleWindows(false)
        setGeolocationEnabled(false)
        cacheMode = WebSettings.LOAD_NO_CACHE
        builtInZoomControls = false
        displayZoomControls = false
        saveFormData = false
    }
    webView.setOnLongClickListener { true }
    webView.isLongClickable = false
    webView.isHapticFeedbackEnabled = false
    webView.setOnDragListener { _, _ -> true }
}

private fun newDocumentWebView(context: Context): WebView = WebView(context).also(::hardenDocumentWebView)

/** L'aperçu d'une image reçue dans une vue web durcie ; la vue est détruite avec la composition. */
@Composable
public fun DocumentWebPreview(uri: String, modifier: Modifier = Modifier) {
    val holder = remember { arrayOfNulls<WebView>(1) }
    DisposableEffect(Unit) {
        onDispose { holder[0]?.destroy(); holder[0] = null }
    }
    AndroidView(
        modifier = modifier,
        factory = { context -> newDocumentWebView(context).also { holder[0] = it } },
        update = { view -> if (view.url != uri) view.loadUrl(uri) },
    )
}
