"""
Service de base de données pour le Translator Meeshy
Gère la sauvegarde et la récupération des traductions

Note: User management and voice profile persistence are handled by Gateway.
Translator only stores translation cache and handles audio processing.
"""

import asyncio
import base64
import logging
import os
from typing import Optional, Dict, Any
import httpx

logger = logging.getLogger(__name__)

class DatabaseService:
    """Service de base de données pour le Translator"""

    def __init__(self, database_url: str = None):
        self.database_url = database_url
        self.prisma = None
        self.is_connected = False
        self._prisma_available = False

        # Vérifier si Prisma est disponible
        try:
            from prisma import Prisma
            self._prisma_available = True
            logger.info("[TRANSLATOR-DB] ✅ Module Prisma disponible")
        except ImportError:
            logger.warning("[TRANSLATOR-DB] ⚠️ Module Prisma non disponible - DatabaseService désactivé")
            self._prisma_available = False
    
    async def connect(self, max_retries: int = 3):
        """Établit la connexion à la base de données avec retry"""
        # Vérifier si Prisma est disponible
        if not self._prisma_available:
            logger.warning("[TRANSLATOR-DB] ⚠️ Prisma non installé - connexion ignorée")
            self.is_connected = False
            return False

        # Importer Prisma dynamiquement
        try:
            from prisma import Prisma
        except ImportError:
            logger.error("[TRANSLATOR-DB] ❌ Impossible d'importer Prisma")
            self.is_connected = False
            return False

        # Afficher l'URL de connexion (masquée) pour debug
        db_url = self.database_url or os.getenv('DATABASE_URL', 'NON DÉFINIE')
        # Masquer le mot de passe dans l'URL
        masked_url = db_url
        if '@' in db_url and '://' in db_url:
            protocol = db_url.split('://')[0]
            rest = db_url.split('://')[1]
            if '@' in rest:
                credentials = rest.split('@')[0]
                host_and_path = rest.split('@')[1]
                if ':' in credentials:
                    user = credentials.split(':')[0]
                    masked_url = f"{protocol}://{user}:***@{host_and_path}"

        logger.info(f"[TRANSLATOR-DB] 🔗 DATABASE_URL: {masked_url}")

        for attempt in range(1, max_retries + 1):
            try:
                if not self.prisma:
                    # Le client Prisma est déjà généré dans l'image Docker
                    # CORRECTION: Configurer les timeouts pour éviter ReadTimeout
                    self.prisma = Prisma(
                        http={
                            'timeout': 60.0,  # Timeout global de 60 secondes
                            'limits': httpx.Limits(
                                max_connections=10,  # Limiter les connexions
                                max_keepalive_connections=5
                            )
                        }
                    )
                
                # Utiliser la configuration par défaut (le DATABASE_URL est dans .env)
                # Ajouter un timeout pour éviter le blocage indéfini
                logger.info(f"[TRANSLATOR-DB] Tentative {attempt}/{max_retries} de connexion à la base de données...")
                
                try:
                    await asyncio.wait_for(self.prisma.connect(), timeout=10.0)
                except asyncio.TimeoutError:
                    logger.error(f"❌ [TRANSLATOR-DB] Timeout lors de la connexion (10s) - tentative {attempt}/{max_retries}")
                    if attempt < max_retries:
                        wait_time = 2 ** attempt  # Backoff exponentiel: 2s, 4s, 8s
                        logger.info(f"⏳ [TRANSLATOR-DB] Nouvelle tentative dans {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue
                    self.is_connected = False
                    return False
                
                self.is_connected = True
                logger.info(f"✅ [TRANSLATOR-DB] Connexion à la base de données établie (tentative {attempt}/{max_retries})")
                return True
                
            except Exception as e:
                logger.error(f"❌ [TRANSLATOR-DB] Erreur connexion base de données (tentative {attempt}/{max_retries}): {type(e).__name__}: {e}")
                # Afficher la stack trace complète pour diagnostic
                import traceback
                logger.error(f"[TRANSLATOR-DB] Stack trace:\n{traceback.format_exc()}")
                
                if attempt < max_retries:
                    wait_time = 2 ** attempt  # Backoff exponentiel
                    logger.info(f"⏳ [TRANSLATOR-DB] Nouvelle tentative dans {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    self.is_connected = False
                    return False
        
        # Si on arrive ici, toutes les tentatives ont échoué
        self.is_connected = False
        logger.error(f"❌ [TRANSLATOR-DB] Échec de connexion après {max_retries} tentatives")
        return False
    
    async def disconnect(self):
        """Ferme la connexion à la base de données"""
        try:
            if self.prisma:
                await self.prisma.disconnect()
                self.is_connected = False
                logger.info("✅ [TRANSLATOR-DB] Connexion à la base de données fermée")
        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur fermeture base de données: {e}")
    
    async def save_translation(self, translation_data: Dict[str, Any]) -> bool:
        """
        Sauvegarde une traduction en base de données (upsert)

        Args:
            translation_data: Dictionnaire contenant les données de traduction
                - messageId: ID du message
                - sourceLanguage: Langue source
                - targetLanguage: Langue cible
                - translatedText: Texte traduit
                - translatorModel: Modèle utilisé
                - confidenceScore: Score de confiance
                - processingTime: Temps de traitement
                - workerName: Nom du worker
                - poolType: Type de pool utilisée

        Returns:
            bool: True si la sauvegarde a réussi, False sinon
        """
        if not self._prisma_available or not self.is_connected:
            logger.debug("⚠️ [TRANSLATOR-DB] Base de données non disponible, pas de sauvegarde")
            return False
        
        try:
            # Extraire les données
            message_id = translation_data.get('messageId')
            source_language = translation_data.get('sourceLanguage', 'fr')
            target_language = translation_data.get('targetLanguage')
            translated_text = translation_data.get('translatedText')
            translator_model = translation_data.get('translatorModel', translation_data.get('modelType', 'basic'))
            confidence_score = translation_data.get('confidenceScore', 0.9)
            processing_time = translation_data.get('processingTime', 0.0)
            worker_name = translation_data.get('workerName', 'unknown')
            pool_type = translation_data.get('poolType', 'normal')
            
            # Validation des données obligatoires
            if not all([message_id, target_language, translated_text]):
                logger.warning(f"⚠️ [TRANSLATOR-DB] Données de traduction incomplètes: {translation_data}")
                return False
            
            # Créer la clé de cache unique
            cache_key = f"{message_id}_{source_language}_{target_language}_{translator_model}"
            
            # Définir la hiérarchie des modèles
            model_hierarchy = {
                "basic": 1,
                "medium": 2,
                "premium": 3
            }
            current_model_level = model_hierarchy.get(translator_model, 1)
            
            # Vérifier si la traduction existe déjà
            existing_translation = await self.prisma.messagetranslation.find_unique(
                where={
                    "messageId_targetLanguage": {
                        "messageId": message_id,
                        "targetLanguage": target_language
                    }
                }
            )
            
            if existing_translation:
                # Vérifier le niveau du modèle existant
                existing_model_level = model_hierarchy.get(existing_translation.translationModel, 1)
                
                # Ne mettre à jour que si le nouveau modèle est de niveau supérieur ou égal
                if current_model_level >= existing_model_level:
                    await self.prisma.messagetranslation.update(
                        where={
                            "messageId_targetLanguage": {
                                "messageId": message_id,
                                "targetLanguage": target_language
                            }
                        },
                        data={
                            "translatedContent": translated_text,
                            "translationModel": translator_model,
                            "confidenceScore": confidence_score,
                            "cacheKey": cache_key
                        }
                    )
                    
                    if current_model_level > existing_model_level:
                        logger.info(f"⬆️ [TRANSLATOR-DB] Traduction améliorée: {message_id} -> {target_language} ({existing_translation.translationModel} → {translator_model})")
                    else:
                        logger.info(f"🔄 [TRANSLATOR-DB] Traduction mise à jour: {message_id} -> {target_language} ({translator_model})")
                else:
                    logger.info(f"⏭️ [TRANSLATOR-DB] Traduction existante de niveau supérieur ignorée: {message_id} -> {target_language} ({existing_translation.translationModel} > {translator_model})")
                    return True
                
            else:
                # Créer une nouvelle traduction
                await self.prisma.messagetranslation.create(
                    data={
                        "messageId": message_id,
                        "sourceLanguage": source_language,
                        "targetLanguage": target_language,
                        "translatedContent": translated_text,
                        "translationModel": translator_model,
                        "confidenceScore": confidence_score,
                        "cacheKey": cache_key
                    }
                )
                
                logger.info(f"✅ [TRANSLATOR-DB] Nouvelle traduction sauvegardée: {message_id} -> {target_language} ({translator_model})")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur sauvegarde traduction: {e}")
            return False
    
    def is_db_connected(self) -> bool:
        """Vérifie si la connexion à la base de données est active"""
        return self.is_connected
    
    async def get_translation(self, message_id: str, target_language: str) -> Optional[Dict[str, Any]]:
        """
        Récupère une traduction depuis la base de données

        Args:
            message_id: ID du message
            target_language: Langue cible

        Returns:
            Dict ou None: Données de traduction ou None si non trouvée
        """
        if not self._prisma_available or not self.is_connected:
            logger.debug("⚠️ [TRANSLATOR-DB] Base de données non disponible")
            return None
        
        try:
            translation = await self.prisma.messagetranslation.find_unique(
                where={
                    "messageId_targetLanguage": {
                        "messageId": message_id,
                        "targetLanguage": target_language
                    }
                }
            )
            
            if translation:
                return {
                    "messageId": translation.messageId,
                    "sourceLanguage": translation.sourceLanguage,
                    "targetLanguage": translation.targetLanguage,
                    "translatedText": translation.translatedContent,
                    "translatorModel": translation.translationModel,
                    "confidenceScore": translation.confidenceScore,
                    "cacheKey": translation.cacheKey,
                    "createdAt": translation.createdAt.isoformat() if translation.createdAt else None
                }
            
            return None
            
        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur récupération traduction: {e}")
            return None
    
    async def invalidate_message_translations(self, message_id: str) -> bool:
        """
        Invalide toutes les traductions d'un message (pour forcer la retraduction)

        Args:
            message_id: ID du message

        Returns:
            bool: True si succès, False sinon
        """
        if not self._prisma_available or not self.is_connected:
            logger.debug("⚠️ [TRANSLATOR-DB] Base de données non disponible")
            return False
        
        try:
            # Supprimer toutes les traductions existantes pour ce message
            deleted_count = await self.prisma.messagetranslation.delete_many(
                where={
                    "messageId": message_id
                }
            )
            
            logger.info(f"🗑️ [TRANSLATOR-DB] {deleted_count} traductions supprimées pour le message {message_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur invalidation traductions: {e}")
            return False
    
    async def health_check(self) -> Dict[str, Any]:
        """Vérifie la santé de la connexion à la base de données"""
        try:
            if not self._prisma_available:
                return {
                    "connected": False,
                    "status": "unavailable",
                    "error": "Prisma module not installed"
                }

            if not self.is_connected:
                return {
                    "connected": False,
                    "status": "disconnected",
                    "error": "Database not connected"
                }

            # Test simple de connexion (MongoDB ne supporte pas SELECT 1)
            # Utiliser une requête MongoDB valide à la place
            await self.prisma.user.count()

            return {
                "connected": True,
                "status": "healthy",
                "type": "mongodb"
            }

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur health check: {type(e).__name__}: {str(e)}")
            import traceback
            logger.error(f"❌ [TRANSLATOR-DB] Stack trace: {traceback.format_exc()}")
            return {
                "connected": False,
                "status": "error",
                "error": str(e)
            }

    # =========================================================================
    # VOICE PROFILE METHODS (DEPRECATED)
    # =========================================================================
    # Ces méthodes sont DÉPRÉCIÉES - Utiliser AudioCacheService (Redis) à la place.
    # Le Translator utilise Redis pour le cache des profils vocaux.
    # Gateway est responsable de la persistance dans MongoDB.
    # Ces méthodes sont conservées pour compatibilité mais ne sont plus appelées.
    # =========================================================================

    async def save_voice_profile(
        self,
        user_id: str,
        embedding: bytes,
        audio_count: int,
        total_duration_ms: int,
        quality_score: float,
        profile_id: str = None,
        embedding_model: str = "openvoice_v2",
        embedding_dimension: int = 256,
        voice_characteristics: Dict[str, Any] = None,
        fingerprint: Dict[str, Any] = None,
        signature_short: str = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Sauvegarde ou met à jour un profil vocal en base de données

        Args:
            user_id: ID de l'utilisateur (ObjectId string)
            embedding: Données binaires de l'embedding (numpy array sérialisé)
            audio_count: Nombre d'audios utilisés pour l'entraînement
            total_duration_ms: Durée totale des audios (ms)
            quality_score: Score de qualité (0-1)
            profile_id: Identifiant unique du profil (vfp_xxx)
            embedding_model: Modèle utilisé (default: openvoice_v2)
            embedding_dimension: Dimension du vecteur (default: 256)
            voice_characteristics: Caractéristiques vocales (JSON)
            fingerprint: Empreinte vocale (JSON)
            signature_short: Signature courte pour lookups rapides

        Returns:
            Dict avec les données du profil ou None si erreur
        """
        if not self._prisma_available or not self.is_connected:
            logger.debug("⚠️ [TRANSLATOR-DB] Base de données non disponible, pas de sauvegarde")
            return None

        try:
            # Vérifier si un profil existe déjà pour cet utilisateur
            existing = await self.prisma.uservoicemodel.find_unique(
                where={"userId": user_id}
            )

            # Encoder l'embedding en base64 pour Prisma Python (Bytes type)
            embedding_b64 = base64.b64encode(embedding).decode('utf-8') if embedding else None

            data = {
                "embedding": embedding_b64,
                "embeddingModel": embedding_model,
                "embeddingDimension": embedding_dimension,
                "audioCount": audio_count,
                "totalDurationMs": total_duration_ms,
                "qualityScore": quality_score,
            }

            if profile_id:
                data["profileId"] = profile_id
            if voice_characteristics:
                data["voiceCharacteristics"] = voice_characteristics
            if fingerprint:
                data["fingerprint"] = fingerprint
            if signature_short:
                data["signatureShort"] = signature_short

            if existing:
                # Mise à jour avec incrémentation de version
                result = await self.prisma.uservoicemodel.update(
                    where={"userId": user_id},
                    data={
                        **data,
                        "version": existing.version + 1,
                    }
                )
                logger.info(f"🔄 [TRANSLATOR-DB] Profil vocal mis à jour: userId={user_id}, version={result.version}")
            else:
                # Création d'un nouveau profil
                result = await self.prisma.uservoicemodel.create(
                    data={
                        "userId": user_id,
                        **data,
                    }
                )
                logger.info(f"✅ [TRANSLATOR-DB] Nouveau profil vocal créé: userId={user_id}")

            return {
                "id": result.id,
                "userId": result.userId,
                "profileId": result.profileId,
                "embeddingModel": result.embeddingModel,
                "embeddingDimension": result.embeddingDimension,
                "audioCount": result.audioCount,
                "totalDurationMs": result.totalDurationMs,
                "qualityScore": result.qualityScore,
                "version": result.version,
                "createdAt": result.createdAt.isoformat() if result.createdAt else None,
                "updatedAt": result.updatedAt.isoformat() if result.updatedAt else None,
            }

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur sauvegarde profil vocal: {e}")
            return None

    async def get_voice_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Récupère un profil vocal depuis la base de données

        Args:
            user_id: ID de l'utilisateur (ObjectId string)

        Returns:
            Dict avec les données du profil (incluant embedding) ou None si non trouvé
        """
        if not self._prisma_available or not self.is_connected:
            logger.debug("⚠️ [TRANSLATOR-DB] Base de données non disponible")
            return None

        try:
            profile = await self.prisma.uservoicemodel.find_unique(
                where={"userId": user_id}
            )

            if not profile:
                logger.debug(f"🔍 [TRANSLATOR-DB] Aucun profil vocal trouvé pour userId={user_id}")
                return None

            return {
                "id": profile.id,
                "userId": profile.userId,
                "profileId": profile.profileId,
                "embedding": profile.embedding,  # bytes
                "embeddingModel": profile.embeddingModel,
                "embeddingDimension": profile.embeddingDimension,
                "audioCount": profile.audioCount,
                "totalDurationMs": profile.totalDurationMs,
                "qualityScore": profile.qualityScore,
                "version": profile.version,
                "voiceCharacteristics": profile.voiceCharacteristics,
                "fingerprint": profile.fingerprint,
                "signatureShort": profile.signatureShort,
                "createdAt": profile.createdAt.isoformat() if profile.createdAt else None,
                "updatedAt": profile.updatedAt.isoformat() if profile.updatedAt else None,
                "nextRecalibrationAt": profile.nextRecalibrationAt.isoformat() if profile.nextRecalibrationAt else None,
            }

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur récupération profil vocal: {e}")
            return None

    async def get_voice_embedding(self, user_id: str) -> Optional[bytes]:
        """
        Récupère uniquement l'embedding d'un profil vocal (optimisé)

        Args:
            user_id: ID de l'utilisateur (ObjectId string)

        Returns:
            bytes de l'embedding ou None si non trouvé
        """
        if not self._prisma_available or not self.is_connected:
            logger.debug("⚠️ [TRANSLATOR-DB] Base de données non disponible")
            return None

        try:
            profile = await self.prisma.uservoicemodel.find_unique(
                where={"userId": user_id}
            )

            if not profile or not profile.embedding:
                return None

            return profile.embedding

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur récupération embedding: {e}")
            return None

    async def update_voice_embedding(
        self,
        user_id: str,
        embedding: bytes,
        embedding_model: str = None,
        embedding_dimension: int = None,
    ) -> bool:
        """
        Met à jour uniquement l'embedding d'un profil vocal existant

        Args:
            user_id: ID de l'utilisateur
            embedding: Nouvelles données binaires de l'embedding
            embedding_model: Modèle utilisé (optionnel)
            embedding_dimension: Dimension du vecteur (optionnel)

        Returns:
            bool: True si mise à jour réussie
        """
        if not self._prisma_available or not self.is_connected:
            logger.debug("⚠️ [TRANSLATOR-DB] Base de données non disponible")
            return False

        try:
            # Vérifier que le profil existe
            existing = await self.prisma.uservoicemodel.find_unique(
                where={"userId": user_id}
            )

            if not existing:
                logger.warning(f"⚠️ [TRANSLATOR-DB] Profil vocal non trouvé pour userId={user_id}")
                return False

            data = {
                "embedding": embedding,
                "version": existing.version + 1,
            }

            if embedding_model:
                data["embeddingModel"] = embedding_model
            if embedding_dimension:
                data["embeddingDimension"] = embedding_dimension

            await self.prisma.uservoicemodel.update(
                where={"userId": user_id},
                data=data
            )

            logger.info(f"🔄 [TRANSLATOR-DB] Embedding mis à jour: userId={user_id}, version={existing.version + 1}")
            return True

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur mise à jour embedding: {e}")
            return False

    async def delete_voice_profile(self, user_id: str) -> bool:
        """
        Supprime un profil vocal

        Args:
            user_id: ID de l'utilisateur

        Returns:
            bool: True si suppression réussie
        """
        if not self._prisma_available or not self.is_connected:
            logger.debug("⚠️ [TRANSLATOR-DB] Base de données non disponible")
            return False

        try:
            result = await self.prisma.uservoicemodel.delete(
                where={"userId": user_id}
            )

            if result:
                logger.info(f"🗑️ [TRANSLATOR-DB] Profil vocal supprimé: userId={user_id}")
                return True

            return False

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur suppression profil vocal: {e}")
            return False

    async def voice_profile_exists(self, user_id: str) -> bool:
        """
        Vérifie si un profil vocal existe pour un utilisateur

        Args:
            user_id: ID de l'utilisateur

        Returns:
            bool: True si le profil existe
        """
        if not self._prisma_available or not self.is_connected:
            return False

        try:
            profile = await self.prisma.uservoicemodel.find_unique(
                where={"userId": user_id}
            )
            return profile is not None

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur vérification profil vocal: {e}")
            return False
