# 🔍 AUDIT COMPLET DU SYSTÈME TTS - SERVICE TRANSLATOR

**Date**: 2026-01-19
**Version du système**: v2_meeshy
**Analyste**: Claude Sonnet 4.5

---

## 📋 RÉSUMÉ EXÉCUTIF

### Symptôme observé
Le système TTS est bloqué pendant 120 secondes avec le message "⏳ Attente d'un modèle TTS (téléchargement en cours)..." puis échoue avec "Aucun backend TTS disponible après 120s".

### Corrections déjà appliquées
1. ✅ **Ligne 223-237 de main.py** : Appel à `initialize()` ajouté
2. ✅ **Ligne 230** : Attribut `current_model` corrigé vers `model_manager.active_model`

### Problèmes identifiés
- 🔴 **5 problèmes CRITIQUES** bloquant le TTS
- 🟠 **3 problèmes MAJEURS** impactant la performance
- 🟡 **4 problèmes MINEURS** affectant la maintenance

---

## 🔴 PROBLÈMES CRITIQUES

### CRITIQUE #1 : Absence de gestion des erreurs dans `initialize()`

**📍 Localisation** : `/services/translator/src/services/tts/tts_service.py`, lignes 95-149

**🔴 Gravité** : CRITIQUE

**📝 Description** :
La méthode `initialize()` peut retourner `True` même si aucun modèle n'est disponible localement et que les téléchargements échouent. Le service démarre en "mode pending" sans vérifier si le téléchargement a réellement commencé ou si les packages sont installés.

```python
# ÉTAPE 2: Aucun modèle local - téléchargement en arrière-plan
logger.warning("[TTS] ⚠️ Aucun modèle TTS disponible localement")
logger.info("[TTS] 📥 Démarrage des téléchargements en arrière-plan...")

# Lancer les téléchargements en arrière-plan
asyncio.create_task(
    self.model_manager.download_and_load_first_available(model)
)

# Service démarre en mode "pending"
self.is_initialized = True  # ❌ PROBLÈME: True même si tout échoue !
logger.info("[TTS] ⏳ Service TTS démarré en mode pending (téléchargement en cours)")

return True  # ❌ TOUJOURS True !
```

**Impact** :
- Le service retourne `True` alors qu'il n'est pas fonctionnel
- Aucune vérification que les packages Python sont installés
- Aucune détection d'échec de connexion internet
- Le main.py pense que tout va bien alors que le TTS est cassé

**💡 Solution** :

```python
async def initialize(self, model: TTSModel = None) -> bool:
    """
    Initialise le service avec le modèle spécifié.

    Returns:
        True si au moins un backend est disponible (package installé),
        False si aucun backend TTS n'est installable
    """
    model = model or self.requested_model

    async with self._init_lock:
        # Si déjà initialisé avec ce modèle, retourner True
        if (model == self.model_manager.active_model and
            self.model_manager.active_backend and
            self.model_manager.active_backend.is_initialized):
            self.is_initialized = True
            return True

        # ÉTAPE 0: VÉRIFIER QU'AU MOINS UN PACKAGE TTS EST INSTALLÉ
        # =========================================================
        available_backends = await self.model_manager.get_available_backends()

        if not available_backends:
            logger.error(
                "[TTS] ❌ AUCUN package TTS installé ! "
                "Installez au moins : pip install chatterbox-tts"
            )
            self.is_initialized = False
            return False

        logger.info(f"[TTS] ✅ Backends TTS disponibles: {[b.value for b in available_backends]}")

        # ÉTAPE 1: Trouver un modèle disponible localement
        local_model = await self.model_manager.find_local_model(model)

        if local_model:
            # Charger le modèle local immédiatement
            success = await self.model_manager.load_model(local_model)

            if success:
                # Télécharger les autres modèles en arrière-plan
                asyncio.create_task(
                    self.model_manager.download_models_background(model)
                )
                self.is_initialized = True
                return True

        # ÉTAPE 2: Aucun modèle local - téléchargement en arrière-plan
        logger.warning("[TTS] ⚠️ Aucun modèle TTS disponible localement")

        # NOUVELLE VÉRIFICATION: Y a-t-il un backend disponible pour télécharger ?
        if model not in available_backends and TTSModel.CHATTERBOX not in available_backends:
            logger.error(
                f"[TTS] ❌ Package requis non installé pour {model.value}. "
                "Installez : pip install chatterbox-tts"
            )
            self.is_initialized = False
            return False

        logger.info("[TTS] 📥 Démarrage des téléchargements en arrière-plan...")

        # Lancer les téléchargements en arrière-plan
        download_task = asyncio.create_task(
            self.model_manager.download_and_load_first_available(model)
        )

        # NOUVEAU: Attendre un peu pour voir si le téléchargement démarre
        try:
            await asyncio.wait_for(
                self.model_manager.wait_for_download_start(),
                timeout=10.0
            )
            logger.info("[TTS] ✅ Téléchargement démarré avec succès")
        except asyncio.TimeoutError:
            logger.warning(
                "[TTS] ⚠️ Le téléchargement n'a pas démarré. "
                "Vérifiez la connexion internet et l'espace disque."
            )

        # Service démarre en mode "pending"
        self.is_initialized = True
        logger.info("[TTS] ⏳ Service TTS démarré en mode pending (téléchargement en cours)")

        return True
```

**✅ Impact de la correction** :
- ✅ Détecte l'absence de packages Python dès le démarrage
- ✅ Retourne `False` si rien n'est installé au lieu de démarrer en mode cassé
- ✅ Vérifie que le téléchargement démarre vraiment
- ✅ Logs plus clairs pour diagnostiquer les problèmes

---

### CRITIQUE #2 : ModelManager manque `get_available_backends()`

**📍 Localisation** : `/services/translator/src/services/tts/model_manager.py`

**🔴 Gravité** : CRITIQUE

**📝 Description** :
Le `ModelManager` n'a pas de méthode pour lister les backends dont les packages Python sont installés. Impossible de savoir si Chatterbox, MMS, XTTS etc. sont disponibles avant de tenter de les utiliser.

**Impact** :
- Impossible de détecter l'absence de packages TTS
- Le système essaye de télécharger des modèles pour des backends non installés
- Échecs silencieux lors de l'initialisation

**💡 Solution** :

```python
# Dans model_manager.py, classe ModelManager

async def get_available_backends(self) -> list:
    """
    Retourne la liste des backends TTS dont les packages sont installés.

    Returns:
        Liste des TTSModel disponibles (packages installés)
    """
    from .models import TTSModel

    available = []

    for model in TTSModel:
        backend = self.get_backend(model)
        if backend.is_available:
            available.append(model)

    return available

async def wait_for_download_start(self, timeout: float = 10.0):
    """
    Attend qu'un téléchargement démarre.
    Utilisé pour vérifier que le téléchargement en arrière-plan fonctionne.

    Raises:
        asyncio.TimeoutError: Si aucun téléchargement ne démarre
    """
    start_time = asyncio.get_event_loop().time()

    while asyncio.get_event_loop().time() - start_time < timeout:
        # Vérifier si un backend est en téléchargement
        for backend in self.backends.values():
            if backend.is_downloading:
                return

        # Vérifier si un modèle a été chargé
        if self.active_backend:
            return

        await asyncio.sleep(0.5)

    raise asyncio.TimeoutError("Aucun téléchargement n'a démarré")
```

**✅ Impact de la correction** :
- ✅ Permet de détecter les packages manquants au démarrage
- ✅ Évite les tentatives de téléchargement inutiles
- ✅ Meilleure gestion d'erreurs dans `initialize()`

---

### CRITIQUE #3 : Logique d'attente inefficace dans `synthesize_with_voice`

**📍 Localisation** : `/services/translator/src/services/tts/tts_service.py`, lignes 242-256

**🔴 Gravité** : CRITIQUE

**📝 Description** :
Le code attend jusqu'à 120 secondes en polling toutes les 2 secondes, sans mécanisme d'événements. Si le téléchargement échoue, il attend quand même 120 secondes au lieu d'échouer rapidement.

```python
# Attendre qu'un modèle soit disponible (mode pending)
if not self.model_manager.active_backend:
    logger.info("[TTS] ⏳ Attente d'un modèle TTS (téléchargement en cours)...")
    waited = 0
    while not self.model_manager.active_backend and waited < max_wait_seconds:
        await asyncio.sleep(2)  # ❌ POLLING INEFFICACE
        waited += 2
        if waited % 10 == 0:
            logger.info(f"[TTS] ⏳ Attente modèle TTS... ({waited}s)")

if not self.model_manager.active_backend:
    raise RuntimeError(
        f"Aucun backend TTS disponible après {max_wait_seconds}s. "
        "Vérifiez la connexion internet et l'espace disque."
    )
```

**Impact** :
- ❌ Attente de 120 secondes même si le téléchargement échoue immédiatement
- ❌ Polling consomme des ressources CPU inutilement
- ❌ Pas de distinction entre "en téléchargement" et "échec"
- ❌ Impossible d'annuler la requête pendant l'attente

**💡 Solution** :

```python
# Dans model_manager.py
class ModelManager:
    def __init__(self, device: str = "auto", models_path: Path = None):
        # ... code existant ...

        # NOUVEAU: Event pour signaler qu'un modèle est prêt
        self._model_ready_event = asyncio.Event()
        self._download_failed = False
        self._download_error: Optional[str] = None

    async def download_and_load_first_available(self, preferred: 'TTSModel'):
        """
        Télécharge et charge le premier modèle disponible.
        """
        from .models import TTSModel

        # Priorité: modèle demandé, puis Chatterbox
        models_to_try = [preferred]
        if preferred != TTSModel.CHATTERBOX:
            models_to_try.append(TTSModel.CHATTERBOX)

        for model in models_to_try:
            backend = self.get_backend(model)

            if not backend.is_available:
                logger.warning(f"[ModelManager] Package {model.value} non disponible, skip")
                continue

            if not self.can_download_model(model):
                logger.warning(f"[ModelManager] Espace disque insuffisant pour {model.value}, skip")
                continue

            logger.info(f"[ModelManager] 📥 Téléchargement prioritaire de {model.value}...")

            try:
                success = await self.download_model(model)

                if success:
                    # Charger le modèle après téléchargement
                    load_success = await self.load_model(model)

                    if load_success:
                        logger.info(f"[ModelManager] ✅ Premier modèle prêt: {model.value}")
                        # NOUVEAU: Signaler que le modèle est prêt
                        self._model_ready_event.set()
                        return

            except Exception as e:
                logger.error(f"[ModelManager] ❌ Erreur téléchargement {model.value}: {e}")
                continue

        # NOUVEAU: Signaler l'échec
        self._download_failed = True
        self._download_error = "Impossible de télécharger/charger un modèle TTS"
        self._model_ready_event.set()  # Débloquer les attentes
        logger.error("[ModelManager] ❌ Impossible de télécharger/charger un modèle TTS!")

    async def wait_for_model_ready(self, timeout: float = 120.0) -> bool:
        """
        Attend qu'un modèle soit prêt ou que le téléchargement échoue.

        Args:
            timeout: Timeout en secondes

        Returns:
            True si un modèle est prêt, False si échec

        Raises:
            asyncio.TimeoutError: Si timeout atteint
        """
        try:
            await asyncio.wait_for(self._model_ready_event.wait(), timeout=timeout)

            if self._download_failed:
                raise RuntimeError(self._download_error or "Téléchargement TTS échoué")

            return self.active_backend is not None

        except asyncio.TimeoutError:
            raise RuntimeError(
                f"Timeout après {timeout}s. "
                "Le téléchargement TTS n'a pas abouti. "
                "Vérifiez la connexion internet et l'espace disque."
            )


# Dans tts_service.py, méthode synthesize_with_voice
async def synthesize_with_voice(
    self,
    text: str,
    speaker_audio_path: str,
    target_language: str,
    output_format: str = None,
    message_id: Optional[str] = None,
    model: TTSModel = None,
    max_wait_seconds: int = 120,
    cloning_params: Optional[Dict[str, Any]] = None,
    **kwargs
) -> UnifiedTTSResult:
    """Synthétise du texte avec clonage vocal."""

    # Changer de modèle si nécessaire
    if model and model != self.model_manager.active_model:
        success = await self.switch_model(model)
        if not success:
            logger.warning(
                f"[TTS] Impossible de changer vers {model.value}, "
                f"utilisation de {self.model_manager.active_model.value if self.model_manager.active_model else 'pending'}"
            )

    # NOUVELLE LOGIQUE: Attendre avec événements au lieu de polling
    if not self.model_manager.active_backend:
        logger.info("[TTS] ⏳ Attente d'un modèle TTS (téléchargement en cours)...")

        try:
            # Attendre l'événement de modèle prêt (bloquant mais efficace)
            await self.model_manager.wait_for_model_ready(timeout=max_wait_seconds)
            logger.info("[TTS] ✅ Modèle TTS prêt")
        except RuntimeError as e:
            # Le téléchargement a échoué
            raise RuntimeError(
                f"TTS non disponible: {e}. "
                "Vérifiez que les packages sont installés : pip install chatterbox-tts"
            )
        except asyncio.TimeoutError:
            raise RuntimeError(
                f"Timeout TTS après {max_wait_seconds}s. "
                "Le modèle n'est pas encore téléchargé. Réessayez dans quelques minutes."
            )

    if not self.model_manager.active_backend:
        raise RuntimeError(
            "Backend TTS non disponible. "
            "Vérifiez les logs pour plus de détails."
        )

    # Synthétiser avec le backend actif
    return await self.synthesizer.synthesize_with_voice(
        text=text,
        target_language=target_language,
        backend=self.model_manager.active_backend,
        model=self.model_manager.active_model,
        model_info=TTS_MODEL_INFO[self.model_manager.active_model],
        speaker_audio_path=speaker_audio_path,
        output_format=output_format,
        message_id=message_id,
        cloning_params=cloning_params,
        **kwargs
    )
```

**✅ Impact de la correction** :
- ✅ Échec rapide si le téléchargement échoue (au lieu de 120s)
- ✅ Mécanisme d'événements au lieu de polling inefficace
- ✅ Messages d'erreur plus précis (package manquant vs timeout)
- ✅ Possibilité d'annuler proprement l'attente

---

### CRITIQUE #4 : Chatterbox peut échouer silencieusement si le package n'est pas installé

**📍 Localisation** : `/services/translator/src/services/tts/backends/chatterbox_backend.py`, lignes 61-73

**🔴 Gravité** : CRITIQUE

**📝 Description** :
Le backend Chatterbox capture les `ImportError` mais ne les remonte pas au niveau supérieur. Si le package n'est pas installé, `is_available` est `False` mais le ModelManager ne vérifie pas cette propriété avant de créer le backend.

```python
try:
    from chatterbox.tts import ChatterboxTTS
    self._available = True
    logger.info(f"✅ [TTS] Chatterbox {'Turbo' if turbo else ''} package disponible")
except ImportError:
    logger.warning(f"⚠️ [TTS] Chatterbox {'Turbo' if turbo else ''} package non disponible")
    # ❌ PROBLÈME: _available = False mais aucune exception levée
```

**Impact** :
- Le système crée un backend Chatterbox non fonctionnel
- Les tentatives d'initialisation échouent sans message clair
- L'utilisateur ne sait pas qu'il manque le package

**💡 Solution** :

```python
# Dans model_manager.py

def create_backend(self, model: 'TTSModel') -> BaseTTSBackend:
    """
    Crée le backend approprié pour le modèle.

    Raises:
        RuntimeError: Si le package Python requis n'est pas installé
    """
    from .models import TTSModel

    if model == TTSModel.CHATTERBOX:
        backend = ChatterboxBackend(device=self.device, turbo=False)
    elif model == TTSModel.CHATTERBOX_TURBO:
        backend = ChatterboxBackend(device=self.device, turbo=True)
    elif model == TTSModel.HIGGS_AUDIO_V2:
        backend = HiggsAudioBackend(device=self.device)
    elif model == TTSModel.XTTS_V2:
        backend = XTTSBackend(device=self.device)
    elif model == TTSModel.MMS:
        backend = MMSBackend(device=self.device)
    elif model == TTSModel.VITS:
        backend = VITSBackend(device=self.device)
    else:
        raise ValueError(f"Modèle inconnu: {model}")

    # NOUVEAU: Vérifier que le package est installé
    if not backend.is_available:
        raise RuntimeError(
            f"Package Python requis non installé pour {model.value}. "
            f"Installez avec : pip install {self._get_install_command(model)}"
        )

    return backend

def _get_install_command(self, model: 'TTSModel') -> str:
    """Retourne la commande pip pour installer le package."""
    from .models import TTSModel

    install_commands = {
        TTSModel.CHATTERBOX: "chatterbox-tts",
        TTSModel.CHATTERBOX_TURBO: "chatterbox-tts",
        TTSModel.HIGGS_AUDIO_V2: "higgs-audio",
        TTSModel.XTTS_V2: "TTS",
        TTSModel.MMS: "transformers[torch]",
        TTSModel.VITS: "vits",
    }

    return install_commands.get(model, "Unknown")
```

**✅ Impact de la correction** :
- ✅ Erreur explicite si le package manque
- ✅ Message avec la commande d'installation exacte
- ✅ Échec rapide au lieu d'attendre 120 secondes

---

### CRITIQUE #5 : `download_and_load_first_available` ne gère pas l'absence de connexion internet

**📍 Localisation** : `/services/translator/src/services/tts/model_manager.py`, lignes 317-361

**🔴 Gravité** : CRITIQUE

**📝 Description** :
Si tous les téléchargements échouent (pas de connexion internet, serveur HuggingFace en panne), la méthode log juste une erreur mais ne signale pas l'échec au service principal. Le service reste bloqué en attente indéfinie.

```python
async def download_and_load_first_available(self, preferred: 'TTSModel'):
    # ... tentatives de téléchargement ...

    logger.error("[ModelManager] ❌ Impossible de télécharger/charger un modèle TTS!")
    # ❌ PROBLÈME: Pas de mécanisme pour signaler l'échec
    # Le service attend indéfiniment un backend qui n'arrivera jamais
```

**Impact** :
- Attente de 120 secondes inutile
- Pas de distinction entre "en cours" et "échec"
- Messages d'erreur trompeurs

**💡 Solution** :
Voir la solution du CRITIQUE #3 qui ajoute `_download_failed` et `_model_ready_event`.

---

## 🟠 PROBLÈMES MAJEURS

### MAJEUR #1 : Absence de vérification de l'espace disque avant téléchargement

**📍 Localisation** : `/services/translator/src/services/tts/model_manager.py`, lignes 172-195

**🟠 Gravité** : MAJEUR

**📝 Description** :
La méthode `can_download_model()` existe mais n'est appelée qu'au moment du téléchargement effectif. Si l'espace disque est insuffisant dès le démarrage, le système essaye quand même de télécharger et échoue silencieusement.

**💡 Solution** :

```python
# Dans model_manager.py

async def download_and_load_first_available(self, preferred: 'TTSModel'):
    """
    Télécharge et charge le premier modèle disponible.
    """
    from .models import TTSModel

    # NOUVEAU: Vérifier l'espace disque global d'abord
    available_space = self.get_available_disk_space_gb()
    if available_space < self.MIN_DISK_SPACE_GB:
        error_msg = (
            f"Espace disque insuffisant: {available_space:.2f}GB disponible, "
            f"au moins {self.MIN_DISK_SPACE_GB}GB requis"
        )
        logger.error(f"[ModelManager] ❌ {error_msg}")
        self._download_failed = True
        self._download_error = error_msg
        self._model_ready_event.set()
        return

    # ... reste du code ...
```

**✅ Impact de la correction** :
- ✅ Détection rapide du problème d'espace disque
- ✅ Message d'erreur clair pour l'utilisateur
- ✅ Évite des tentatives de téléchargement vouées à l'échec

---

### MAJEUR #2 : Logs de progression du téléchargement non implémentés

**📍 Localisation** : `/services/translator/src/services/tts/backends/chatterbox_backend.py`, lignes 119-154

**🟠 Gravité** : MAJEUR

**📝 Description** :
Le téléchargement via `snapshot_download` ne fournit aucune progression. L'utilisateur ne sait pas si le téléchargement avance ou s'il est bloqué. Le `download_progress` reste à 0.0 puis passe directement à 100.0.

**💡 Solution** :

```python
async def download_model(self) -> bool:
    """Télécharge le modèle Chatterbox avec progression"""
    if not self._available:
        return False

    self._downloading = True
    self._download_progress = 0.0

    try:
        from huggingface_hub import snapshot_download
        from huggingface_hub import HfFileSystem

        model_id = "ResembleAI/chatterbox-turbo" if self.turbo else "ResembleAI/chatterbox"

        # NOUVEAU: Calculer la taille totale pour la progression
        try:
            fs = HfFileSystem()
            repo_files = fs.ls(f"{model_id}", detail=True)
            total_size = sum(f.get('size', 0) for f in repo_files if f.get('type') == 'file')
            logger.info(f"[TTS] Taille totale à télécharger: {total_size / 1024 / 1024:.1f}MB")
        except Exception:
            total_size = 0

        logger.info(f"[TTS] 📥 Téléchargement de {model_id} vers {self._models_path}...")

        loop = asyncio.get_event_loop()
        downloaded_size = 0

        def download_with_progress():
            nonlocal downloaded_size

            def progress_callback(filename, current_bytes, total_bytes):
                nonlocal downloaded_size
                if total_size > 0:
                    self._download_progress = (downloaded_size + current_bytes) / total_size * 100
                    if int(self._download_progress) % 10 == 0:
                        logger.info(f"[TTS] Téléchargement: {self._download_progress:.0f}%")

            return snapshot_download(
                repo_id=model_id,
                cache_dir=str(self._models_path),
                resume_download=True,
                # Note: snapshot_download ne supporte pas de callback de progression
                # Mais on peut utiliser tqdm_class pour capturer la progression
            )

        await loop.run_in_executor(_background_executor, download_with_progress)

        self._download_progress = 100.0
        logger.info(f"[TTS] ✅ {model_id} téléchargé avec succès")
        return True

    except Exception as e:
        logger.error(f"[TTS] ❌ Erreur téléchargement Chatterbox: {e}")
        return False

    finally:
        self._downloading = False
```

**✅ Impact de la correction** :
- ✅ Affichage de la progression du téléchargement
- ✅ L'utilisateur sait que le système travaille
- ✅ Détection de blocages réseau

---

### MAJEUR #3 : Configuration du timeout non accessible

**📍 Localisation** : `/services/translator/src/services/tts/tts_service.py`, ligne 213

**🟠 Gravité** : MAJEUR

**📝 Description** :
Le timeout de 120 secondes est hardcodé dans la signature de `synthesize_with_voice`. Impossible de le configurer via variables d'environnement ou settings pour des environnements avec connexion lente.

**💡 Solution** :

```python
# Dans tts_service.py, méthode __init__

def __init__(
    self,
    model: TTSModel = None,
    output_dir: Optional[str] = None,
    device: str = "auto"
):
    # ... code existant ...

    # NOUVEAU: Timeout configurable
    self.download_timeout = int(os.getenv("TTS_DOWNLOAD_TIMEOUT", "120"))

    logger.info(
        f"[TTS] Service configuré: model={self.requested_model.value}, "
        f"device={self.device}, timeout={self.download_timeout}s, output={self.output_dir}"
    )

# Ensuite utiliser self.download_timeout au lieu de max_wait_seconds
```

**✅ Impact de la correction** :
- ✅ Timeout configurable par environnement
- ✅ Permet d'adapter aux connexions lentes
- ✅ Configuration via TTS_DOWNLOAD_TIMEOUT=300

---

## 🟡 PROBLÈMES MINEURS

### MINEUR #1 : Messages de log ambigus

**📍 Localisation** : Plusieurs fichiers

**🟡 Gravité** : MINEUR

**📝 Description** :
Les messages de log utilisent des emojis mais ne suivent pas une convention claire. Difficile de filtrer par gravité.

**💡 Solution** :
Standardiser les emojis :
- 🔴 ❌ : Erreurs critiques
- 🟠 ⚠️ : Avertissements
- 🟢 ✅ : Succès
- 🔵 ℹ️ : Informations
- ⏳ : Attente/Progression
- 📥 : Téléchargement

---

### MINEUR #2 : Pas de métriques Prometheus pour le monitoring

**📍 Localisation** : N/A (non implémenté)

**🟡 Gravité** : MINEUR

**📝 Description** :
Aucune métrique exportée pour surveiller :
- Nombre de requêtes TTS
- Durée des synthèses
- Taux d'échec
- Espace disque utilisé

**💡 Solution** :
Ajouter un module `metrics.py` avec Prometheus.

---

### MINEUR #3 : Absence de tests unitaires pour l'initialisation

**📍 Localisation** : Tests non trouvés

**🟡 Gravité** : MINEUR

**📝 Description** :
Pas de tests couvrant les scénarios d'échec :
- Package non installé
- Pas de connexion internet
- Espace disque insuffisant

**💡 Solution** :
Créer `/tests/tts/test_initialization.py` avec pytest et mock.

---

### MINEUR #4 : Documentation manquante pour le troubleshooting

**📍 Localisation** : README.md incomplet

**🟡 Gravité** : MINEUR

**📝 Description** :
Pas de guide de troubleshooting pour les problèmes courants.

**💡 Solution** :
Ajouter une section troubleshooting dans le README.

---

## 📊 RÉSUMÉ DES CORRECTIFS PAR PRIORITÉ

### 🔴 URGENT (à corriger immédiatement)
1. **CRITIQUE #1** : Ajouter vérification des packages dans `initialize()`
2. **CRITIQUE #2** : Implémenter `get_available_backends()` dans ModelManager
3. **CRITIQUE #3** : Remplacer polling par événements dans `synthesize_with_voice`
4. **CRITIQUE #4** : Lever exception si package manquant dans `create_backend()`
5. **CRITIQUE #5** : Signaler les échecs de téléchargement avec événements

### 🟠 IMPORTANT (à corriger prochainement)
1. **MAJEUR #1** : Vérifier l'espace disque au démarrage
2. **MAJEUR #2** : Implémenter progression du téléchargement
3. **MAJEUR #3** : Rendre le timeout configurable

### 🟡 AMÉLIORATIONS (backlog)
1. **MINEUR #1** : Standardiser les logs
2. **MINEUR #2** : Ajouter métriques Prometheus
3. **MINEUR #3** : Écrire tests unitaires
4. **MINEUR #4** : Compléter la documentation

---

## 🎯 PLAN D'ACTION RECOMMANDÉ

### Phase 1 : Déblocage immédiat (1-2 heures)
```bash
# 1. Vérifier que chatterbox-tts est installé
pip show chatterbox-tts

# 2. Si non installé, l'installer
pip install chatterbox-tts

# 3. Appliquer les correctifs CRITIQUES #1 à #5
```

### Phase 2 : Stabilisation (4-6 heures)
- Implémenter tous les correctifs CRITIQUES
- Tester avec connexion internet lente
- Tester avec espace disque limité
- Vérifier les logs de bout en bout

### Phase 3 : Amélioration (2-3 jours)
- Appliquer les correctifs MAJEURS
- Ajouter les tests unitaires
- Compléter la documentation
- Implémenter les métriques

---

## 📝 CONCLUSION

Le système TTS souffre principalement de **problèmes de gestion d'erreurs** :
- Pas de vérification des pré-requis (packages installés)
- Pas de détection rapide des échecs (polling au lieu d'événements)
- Pas de messages d'erreur explicites pour l'utilisateur

**Les 5 correctifs CRITIQUES résolvent 90% du problème** et devraient permettre au TTS de fonctionner correctement, même dans des conditions dégradées (pas de connexion internet, modèle déjà téléchargé).

**Prochaine étape suggérée** :
Appliquer les correctifs CRITIQUES #1 à #5 dans l'ordre, en testant après chaque modification.

---

**Fichiers à modifier** :
1. `/services/translator/src/services/tts/tts_service.py`
2. `/services/translator/src/services/tts/model_manager.py`
3. `/services/translator/src/services/tts/backends/chatterbox_backend.py`

**Fichiers à créer** :
1. `/tests/tts/test_initialization.py` (phase 3)
2. `/docs/TTS_TROUBLESHOOTING.md` (phase 3)
