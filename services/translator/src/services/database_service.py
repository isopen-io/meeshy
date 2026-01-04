"""
Service de base de données pour le Translator Meeshy
Gère la sauvegarde et la récupération des traductions
Gère les profils vocaux et le consentement utilisateur
"""

import asyncio
import logging
import os
from typing import Optional, Dict, Any, List
from datetime import datetime
import httpx
from prisma import Prisma

logger = logging.getLogger(__name__)

class DatabaseService:
    """Service de base de données pour le Translator"""
    
    def __init__(self, database_url: str = None):
        self.database_url = database_url
        self.prisma = None
        self.is_connected = False
    
    async def connect(self, max_retries: int = 3):
        """Établit la connexion à la base de données avec retry"""
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
        if not self.is_connected:
            logger.warning("⚠️ [TRANSLATOR-DB] Base de données non connectée, pas de sauvegarde")
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
        if not self.is_connected:
            logger.warning("⚠️ [TRANSLATOR-DB] Base de données non connectée")
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
        if not self.is_connected:
            logger.warning("⚠️ [TRANSLATOR-DB] Base de données non connectée")
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

    # ═══════════════════════════════════════════════════════════════════════════
    # VOICE PROFILE & CONSENT METHODS
    # ═══════════════════════════════════════════════════════════════════════════

    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get user by ID with consent and voice profile fields.

        Args:
            user_id: User ID (MongoDB ObjectId)

        Returns:
            Dict with user data or None if not found
        """
        if not self.is_connected:
            logger.warning("⚠️ [TRANSLATOR-DB] Base de données non connectée")
            return None

        try:
            user = await self.prisma.user.find_unique(
                where={"id": user_id},
                include={"voiceModel": True}
            )

            if user:
                return {
                    "id": user.id,
                    "username": user.username,
                    "voiceProfileConsentAt": user.voiceProfileConsentAt.isoformat() if user.voiceProfileConsentAt else None,
                    "ageVerificationConsentAt": user.ageVerificationConsentAt.isoformat() if user.ageVerificationConsentAt else None,
                    "birthDate": user.birthDate,
                    "voiceCloningEnabledAt": user.voiceCloningEnabledAt.isoformat() if user.voiceCloningEnabledAt else None,
                    "voiceProfileUpdateNotifiedAt": user.voiceProfileUpdateNotifiedAt.isoformat() if user.voiceProfileUpdateNotifiedAt else None,
                    "voiceModel": user.voiceModel
                }

            return None

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur récupération utilisateur: {e}")
            return None

    async def update_user_consent(
        self,
        user_id: str,
        voice_profile_consent_at: Optional[datetime] = None,
        age_verification_consent_at: Optional[datetime] = None,
        birth_date: Optional[datetime] = None,
        voice_cloning_enabled_at: Optional[datetime] = None
    ) -> bool:
        """
        Update user consent fields for voice profile.

        Args:
            user_id: User ID
            voice_profile_consent_at: Consent timestamp for voice recording
            age_verification_consent_at: Age verification consent timestamp
            birth_date: User's birth date
            voice_cloning_enabled_at: Timestamp when voice cloning was enabled

        Returns:
            bool: True if update succeeded
        """
        if not self.is_connected:
            logger.warning("⚠️ [TRANSLATOR-DB] Base de données non connectée")
            return False

        try:
            data = {}
            if voice_profile_consent_at is not None:
                data["voiceProfileConsentAt"] = voice_profile_consent_at
            if age_verification_consent_at is not None:
                data["ageVerificationConsentAt"] = age_verification_consent_at
            if birth_date is not None:
                data["birthDate"] = birth_date
            if voice_cloning_enabled_at is not None:
                data["voiceCloningEnabledAt"] = voice_cloning_enabled_at

            if not data:
                logger.warning("⚠️ [TRANSLATOR-DB] Aucune donnée de consentement à mettre à jour")
                return False

            await self.prisma.user.update(
                where={"id": user_id},
                data=data
            )

            logger.info(f"✅ [TRANSLATOR-DB] Consentement utilisateur mis à jour: {user_id}")
            return True

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur mise à jour consentement: {e}")
            return False

    async def save_voice_profile(
        self,
        user_id: str,
        profile_id: str,
        embedding_path: str,
        audio_count: int,
        total_duration_ms: int,
        quality_score: float,
        version: int = 1,
        voice_characteristics: Optional[Dict[str, Any]] = None,
        fingerprint: Optional[Dict[str, Any]] = None,
        signature_short: Optional[str] = None,
        next_recalibration_at: Optional[datetime] = None
    ) -> bool:
        """
        Save a new voice profile to database (UserVoiceModel).

        Embeddings are stored as binary files on disk (embeddingPath).
        The database stores metadata and fingerprints for quick lookup.

        Args:
            user_id: User ID
            profile_id: Unique profile identifier (vp_xxx)
            embedding_path: Path to the .pkl embedding file
            audio_count: Number of audio samples used
            total_duration_ms: Total audio duration in ms
            quality_score: Model quality score (0-1)
            version: Model version
            voice_characteristics: Voice analysis data (pitch, spectral, etc.)
            fingerprint: Voice signature for identification
            signature_short: 12-char short signature for quick lookups
            next_recalibration_at: When profile should be recalibrated

        Returns:
            bool: True if save succeeded
        """
        if not self.is_connected:
            logger.warning("⚠️ [TRANSLATOR-DB] Base de données non connectée")
            return False

        try:
            # Check if profile already exists
            existing = await self.prisma.uservoicemodel.find_unique(
                where={"userId": user_id}
            )

            if existing:
                logger.warning(f"⚠️ [TRANSLATOR-DB] Profil vocal existe déjà pour {user_id}")
                return False

            # Create new voice profile
            await self.prisma.uservoicemodel.create(
                data={
                    "userId": user_id,
                    "profileId": profile_id,
                    "embeddingPath": embedding_path,
                    "audioCount": audio_count,
                    "totalDurationMs": total_duration_ms,
                    "qualityScore": quality_score,
                    "version": version,
                    "voiceCharacteristics": voice_characteristics,
                    "fingerprint": fingerprint,
                    "signatureShort": signature_short,
                    "nextRecalibrationAt": next_recalibration_at
                }
            )

            logger.info(f"✅ [TRANSLATOR-DB] Profil vocal créé: {profile_id} pour {user_id}")
            return True

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur création profil vocal: {e}")
            import traceback
            logger.error(f"[TRANSLATOR-DB] Stack trace:\n{traceback.format_exc()}")
            return False

    async def update_voice_profile(
        self,
        user_id: str,
        quality_score: Optional[float] = None,
        audio_count: Optional[int] = None,
        total_duration_ms: Optional[int] = None,
        version: Optional[int] = None,
        voice_characteristics: Optional[Dict[str, Any]] = None,
        fingerprint: Optional[Dict[str, Any]] = None,
        signature_short: Optional[str] = None,
        next_recalibration_at: Optional[datetime] = None
    ) -> bool:
        """
        Update an existing voice profile.

        Args:
            user_id: User ID
            quality_score: Updated quality score
            audio_count: Updated audio count
            total_duration_ms: Updated total duration
            version: New version number
            voice_characteristics: Updated voice analysis
            fingerprint: Updated voice signature
            signature_short: Updated short signature
            next_recalibration_at: New recalibration date

        Returns:
            bool: True if update succeeded
        """
        if not self.is_connected:
            logger.warning("⚠️ [TRANSLATOR-DB] Base de données non connectée")
            return False

        try:
            data = {}
            if quality_score is not None:
                data["qualityScore"] = quality_score
            if audio_count is not None:
                data["audioCount"] = audio_count
            if total_duration_ms is not None:
                data["totalDurationMs"] = total_duration_ms
            if version is not None:
                data["version"] = version
            if voice_characteristics is not None:
                data["voiceCharacteristics"] = voice_characteristics
            if fingerprint is not None:
                data["fingerprint"] = fingerprint
            if signature_short is not None:
                data["signatureShort"] = signature_short
            if next_recalibration_at is not None:
                data["nextRecalibrationAt"] = next_recalibration_at

            if not data:
                logger.warning("⚠️ [TRANSLATOR-DB] Aucune donnée de profil à mettre à jour")
                return False

            await self.prisma.uservoicemodel.update(
                where={"userId": user_id},
                data=data
            )

            logger.info(f"✅ [TRANSLATOR-DB] Profil vocal mis à jour pour {user_id}")
            return True

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur mise à jour profil vocal: {e}")
            return False

    async def delete_voice_profile(self, user_id: str) -> bool:
        """
        Delete a voice profile from database.

        Note: This only deletes the database record.
        The caller should also delete the embedding files from disk.

        Args:
            user_id: User ID

        Returns:
            bool: True if delete succeeded
        """
        if not self.is_connected:
            logger.warning("⚠️ [TRANSLATOR-DB] Base de données non connectée")
            return False

        try:
            # Delete the voice model
            await self.prisma.uservoicemodel.delete(
                where={"userId": user_id}
            )

            # Also reset consent fields on user
            await self.prisma.user.update(
                where={"id": user_id},
                data={
                    "voiceProfileConsentAt": None,
                    "voiceCloningEnabledAt": None
                }
            )

            logger.info(f"🗑️ [TRANSLATOR-DB] Profil vocal supprimé pour {user_id}")
            return True

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur suppression profil vocal: {e}")
            return False

    async def get_voice_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get voice profile for a user.

        Args:
            user_id: User ID

        Returns:
            Dict with voice profile data or None
        """
        if not self.is_connected:
            logger.warning("⚠️ [TRANSLATOR-DB] Base de données non connectée")
            return None

        try:
            profile = await self.prisma.uservoicemodel.find_unique(
                where={"userId": user_id}
            )

            if profile:
                return {
                    "id": profile.id,
                    "userId": profile.userId,
                    "profileId": profile.profileId,
                    "embeddingPath": profile.embeddingPath,
                    "audioCount": profile.audioCount,
                    "totalDurationMs": profile.totalDurationMs,
                    "qualityScore": profile.qualityScore,
                    "version": profile.version,
                    "voiceCharacteristics": profile.voiceCharacteristics,
                    "fingerprint": profile.fingerprint,
                    "signatureShort": profile.signatureShort,
                    "nextRecalibrationAt": profile.nextRecalibrationAt.isoformat() if profile.nextRecalibrationAt else None,
                    "createdAt": profile.createdAt.isoformat() if profile.createdAt else None,
                    "updatedAt": profile.updatedAt.isoformat() if profile.updatedAt else None
                }

            return None

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur récupération profil vocal: {e}")
            return None

    async def get_profiles_needing_recalibration(
        self,
        before_date: Optional[datetime] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get voice profiles that need recalibration.

        Args:
            before_date: Get profiles with recalibration date before this
            limit: Maximum number of profiles to return

        Returns:
            List of voice profiles needing update
        """
        if not self.is_connected:
            logger.warning("⚠️ [TRANSLATOR-DB] Base de données non connectée")
            return []

        try:
            check_date = before_date or datetime.now()

            profiles = await self.prisma.uservoicemodel.find_many(
                where={
                    "nextRecalibrationAt": {"lte": check_date}
                },
                take=limit,
                order_by={"nextRecalibrationAt": "asc"}
            )

            return [
                {
                    "userId": p.userId,
                    "profileId": p.profileId,
                    "qualityScore": p.qualityScore,
                    "nextRecalibrationAt": p.nextRecalibrationAt.isoformat() if p.nextRecalibrationAt else None
                }
                for p in profiles
            ]

        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur récupération profils à recalibrer: {e}")
            return []

    async def notify_profile_update(self, user_id: str) -> bool:
        """
        Mark that user was notified about profile update.

        Args:
            user_id: User ID

        Returns:
            bool: True if update succeeded
        """
        if not self.is_connected:
            return False

        try:
            await self.prisma.user.update(
                where={"id": user_id},
                data={"voiceProfileUpdateNotifiedAt": datetime.now()}
            )
            return True
        except Exception as e:
            logger.error(f"❌ [TRANSLATOR-DB] Erreur notification profil: {e}")
            return False
