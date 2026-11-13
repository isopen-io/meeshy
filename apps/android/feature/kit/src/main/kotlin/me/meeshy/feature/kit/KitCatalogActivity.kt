package me.meeshy.feature.kit

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import me.meeshy.ui.theme.MeeshyTheme

/** Ouvre le catalogue du kit (debug seulement) ; l'extra `kit` demande le détail d'un composant livré. */
public class KitCatalogActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val requested = KitCatalogLaunch.initialKey(intent)
        setContent {
            MeeshyTheme(darkTheme = isSystemInDarkTheme()) {
                KitCatalogScreen(initialKey = requested)
            }
        }
    }
}
