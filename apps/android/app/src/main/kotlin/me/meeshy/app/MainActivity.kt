package me.meeshy.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import me.meeshy.app.navigation.MeeshyApp
import me.meeshy.ui.theme.MeeshyTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MeeshyTheme {
                MeeshyApp()
            }
        }
    }
}
