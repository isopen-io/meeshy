package me.meeshy.app.widget.kit

import android.os.Build
import androidx.glance.GlanceModifier
import androidx.glance.ImageProvider
import androidx.glance.appwidget.cornerRadius
import androidx.glance.background
import me.meeshy.app.R

/**
 * Le fond d'un widget, aux coins du lanceur. Dès Android 12 le rayon est celui du système ; avant,
 * il n'existe pas : un fond arrondi à 22 dp prend le relais, sans quoi le widget est un carré brut
 * (S8, Android 9). Les deux voies lisent les mêmes couleurs jour/nuit.
 */
internal fun GlanceModifier.widgetSurface(brand: Boolean = false): GlanceModifier =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        background(if (brand) WidgetTheme.brandSurface else WidgetTheme.background)
            .cornerRadius(android.R.dimen.system_app_widget_background_radius)
    } else {
        background(ImageProvider(if (brand) R.drawable.widget_brand_surface else R.drawable.widget_surface))
    }
