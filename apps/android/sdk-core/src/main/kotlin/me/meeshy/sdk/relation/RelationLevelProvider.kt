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
 * L'implémentation réelle est [RelationLevelRepository], qui lit `GET /relations/:userId` (#13998) ; [RelationLevelModule]
 * la lie. [NoRelationLevelProvider] reste le témoin « rien de servi » des tests.
 */
public interface RelationLevelProvider {
    public suspend fun servedLevel(userId: String): String?
}

/** Aucun niveau servi, donc aucun logo : le témoin des tests. */
public object NoRelationLevelProvider : RelationLevelProvider {
    override suspend fun servedLevel(userId: String): String? = null
}

@Module
@InstallIn(SingletonComponent::class)
internal object RelationLevelModule {
    @Provides
    @Singleton
    fun providesRelationLevelProvider(repository: RelationLevelRepository): RelationLevelProvider = repository
}
