package me.meeshy.sdk.model.reading.focal

/** Anneau pointillé et étincelle : drapeau agent_grammar actif ET message d'agent (désactivé par défaut). */
object AgentAuthoredStyle {

    data class Descriptor(val showsDashedRing: Boolean, val showsSpark: Boolean) {
        companion object {
            val Human = Descriptor(showsDashedRing = false, showsSpark = false)
        }
    }

    fun resolve(isAgentAuthored: Boolean, isAgentGrammarEnabled: Boolean): Descriptor =
        if (isAgentGrammarEnabled && isAgentAuthored) Descriptor(showsDashedRing = true, showsSpark = true)
        else Descriptor.Human
}
