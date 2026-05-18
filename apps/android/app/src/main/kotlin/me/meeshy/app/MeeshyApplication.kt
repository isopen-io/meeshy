package me.meeshy.app

import android.app.Application
import me.meeshy.app.di.AppContainer

class MeeshyApplication : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
