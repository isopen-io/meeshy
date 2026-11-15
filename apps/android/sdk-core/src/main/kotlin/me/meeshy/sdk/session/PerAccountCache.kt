package me.meeshy.sdk.session

/**
 * Un cache lie a un compte, contribue en `@IntoSet` : [SessionTeardown.wipe] appelle
 * [clear] sur chacun a la deconnexion ou au changement de compte, pour qu'un second
 * compte n'herite jamais des donnees du premier. [clear] est idempotent.
 */
public interface PerAccountCache {
    public suspend fun clear()
}
