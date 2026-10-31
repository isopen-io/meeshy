package me.meeshy.sdk.relation

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * **Le fournisseur du niveau de lien** (#13997) : le niveau EFFECTIF entre le lecteur et [userId], tel que le serveur le SERT
 * (chaîne brute : `FRIEND`, `CLOSE`, `BLOOD`…), ou `null` quand rien n'est servi. L'export d'une story y lit le cercle de son
 * auteur pour décider du logo de l'intro ; il ne devine jamais un niveau.
 *
 * Le port est posé avant la route : `GET /relations/:userId` (#13998) n'existe pas encore, donc la liaison par défaut rend
 * `null` — l'export ne peint alors aucun logo. Quand la route sera servie, une seule implémentation remplace la liaison de
 * [RelationLevelModule]; le rendu et son câblage n'ont rien à changer.
 */
public interface RelationLevelProvider {
    public suspend fun servedLevel(userId: String): String?
}

/** Tant que la route n'existe pas : aucun niveau servi, donc aucun logo. */
public object NoRelationLevelProvider : RelationLevelProvider {
    override suspend fun servedLevel(userId: String): String? = null
}

@Module
@InstallIn(SingletonComponent::class)
internal object RelationLevelModule {
    @Provides
    @Singleton
    fun providesRelationLevelProvider(): RelationLevelProvider = NoRelationLevelProvider
}
