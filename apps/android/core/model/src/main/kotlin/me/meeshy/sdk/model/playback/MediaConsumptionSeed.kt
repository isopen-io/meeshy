package me.meeshy.sdk.model.playback

import me.meeshy.sdk.model.MeeshyMediaConsumption

public object MediaConsumptionSeed {
    public fun of(lastPlayPositionMs: Int?, listenedComplete: Boolean): MeeshyMediaConsumption? = MeeshyMediaConsumption()
}
