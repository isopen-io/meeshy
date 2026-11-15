package me.meeshy.ui.component.location

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.PlaceLabels

/**
 * Ouvre un lieu dans l'application de cartes du système (Intent `geo:`), l'itinéraire dans la
 * navigation pas à pas. Sans application installée, la page web de Google Maps prend le relais :
 * le geste ne reste jamais muet.
 */
object PlaceIntents {
    fun openInMaps(context: Context, place: SharedPlace): Boolean =
        launch(context, PlaceLabels.geoUri(place), PlaceLabels.webMapsUri(place))

    fun directions(context: Context, place: SharedPlace): Boolean =
        launch(context, PlaceLabels.navigationUri(place), PlaceLabels.webDirectionsUri(place))

    private fun launch(context: Context, primary: String, fallback: String): Boolean =
        start(context, primary) || start(context, fallback)

    private fun start(context: Context, uri: String): Boolean = try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: ActivityNotFoundException) {
        false
    } catch (_: SecurityException) {
        false
    }
}
