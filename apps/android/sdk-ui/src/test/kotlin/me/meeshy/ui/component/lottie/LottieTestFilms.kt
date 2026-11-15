package me.meeshy.ui.component.lottie

import com.airbnb.lottie.LottieCompositionFactory

internal const val EMPTY_FILM_JSON =
    """{"v":"5.5.7","fr":30,"ip":0,"op":30,"w":100,"h":100,"nm":"t","ddd":0,"assets":[],"layers":[]}"""

internal fun emptyFilm(): LottieFilm =
    LottieFilm(LottieCompositionFactory.fromJsonStringSync(EMPTY_FILM_JSON, null).value!!)
