# 🔧 CORRECTIFS TTS À APPLIQUER

**Date**: 2026-01-19
**Basé sur**: AUDIT_COMPLET_TTS.md

---

## 🎯 OBJECTIF

Débloquer le système TTS actuellement bloqué pendant 120 secondes avant d'échouer avec "Aucun backend TTS disponible après 120s".

---

## ✅ PRÉ-REQUIS

Avant d'appliquer les correctifs, vérifier que les packages Python sont installés :

```bash
# Vérifier l'installation de Chatterbox
pip show chatterbox-tts

# Si non installé, installer
pip install chatterbox-tts

# Vérifier PyTorch
pip show torch

# Vérifier les dépendances audio
pip show torchaudio librosa pydub
```

---

## 📦 CORRECTIF #1 : ModelManager - Ajout de méthodes manquantes

**Fichier** : `/services/translator/src/services/tts/model_manager.py`

**Action** : Ajouter les méthodes suivantes dans la classe `ModelManager` (après la méthode `get_all_models_status`, ligne 158)

```python
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

    logger.debug(f"[ModelManager] Backends disponibles: {[m.value for m in available]}")
    return available

async def wait_for_download_start(self, timeout: float = 10.0):
    """
    Attend qu'un téléchargement démarre.
    Utilisé pour vérifier que le téléchargement en arrière-plan fonctionne.

    Args:
        timeout: Timeout en secondes

    Raises:
        asyncio.TimeoutError: Si aucun téléchargement ne démarre
    """
    start_time = asyncio.get_event_loop().time()

    while asyncio.get_event_loop().time() - start_time < timeout:
        # Vérifier si un backend est en téléchargement
        for backend in self.backends.values():
            if backend.is_downloading:
                logger.debug("[ModelManager] Téléchargement détecté")
                return

        # Vérifier si un modèle a été chargé
        if self.active_backend:
            logger.debug("[ModelManager] Modèle chargé détecté")
            return

        await asyncio.sleep(0.5)

    raise asyncio.TimeoutError("Aucun téléchargement n'a démarré")

async def wait_for_model_ready(self, timeout: float = 120.0) -> bool:
    """
    Attend qu'un modèle soit prêt ou que le téléchargement échoue.

    Args:
        timeout: Timeout en secondes

    Returns:
        True si un modèle est prêt, False si échec

    Raises:
        asyncio.TimeoutError: Si timeout atteint
        RuntimeError: Si le téléchargement échoue
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
```

**Action** : Ajouter les attributs d'événements dans `__init__` (après ligne 80)

```python
def __init__(self, device: str = "auto", models_path: Path = None):
    """Initialise le gestionnaire de modèles."""
    self.device = device
    self.models_path = models_path or Path.home() / ".cache" / "meeshy" / "models"

    # Backends instanciés (pas forcément chargés)
    self.backends: Dict['TTSModel', BaseTTSBackend] = {}

    # Backend actuellement actif (chargé en mémoire)
    self.active_backend: Optional[BaseTTSBackend] = None
    self.active_model: Optional['TTSModel'] = None

    # Téléchargements en arrière-plan
    self._background_downloads: Dict['TTSModel', asyncio.Task] = {}

    # NOUVEAU: Events pour signaler qu'un modèle est prêt
    self._model_ready_event = asyncio.Event()
    self._download_failed = False
    self._download_error: Optional[str] = None

    logger.info(f"[ModelManager] Initialisé: device={device}, path={self.models_path}")
```

**Action** : Modifier la méthode `download_and_load_first_available` (ligne 317)

```python
async def download_and_load_first_available(self, preferred: 'TTSModel'):
    """
    Télécharge et charge le premier modèle disponible.
    Utilisé quand aucun modèle n'est disponible localement.

    Args:
        preferred: Modèle préféré
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
```

**Action** : Ajouter méthode helper pour les commandes d'installation (à la fin de la classe)

```python
def _get_install_command(self, model: 'TTSModel') -> str:
    """Retourne la commande pip pour installer le package requis."""
    from .models import TTSModel

    install_commands = {
        TTSModel.CHATTERBOX: "chatterbox-tts",
        TTSModel.CHATTERBOX_TURBO: "chatterbox-tts",
        TTSModel.HIGGS_AUDIO_V2: "higgs-audio",
        TTSModel.XTTS_V2: "TTS",
        TTSModel.MMS: "transformers[torch]",
        TTSModel.VITS: "vits",
    }

    return install_commands.get(model, "chatterbox-tts")
```

**Action** : Modifier `create_backend` pour vérifier la disponibilité (ligne 83)

```python
def create_backend(self, model: 'TTSModel') -> BaseTTSBackend:
    """
    Crée le backend approprié pour le modèle.

    Args:
        model: Type de modèle TTS

    Returns:
        Instance du backend correspondant

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
        install_cmd = self._get_install_command(model)
        raise RuntimeError(
            f"Package Python requis non installé pour {model.value}. "
            f"Installez avec : pip install {install_cmd}"
        )

    return backend
```

---

## 📦 CORRECTIF #2 : TTSService - Amélioration de l'initialisation

**Fichier** : `/services/translator/src/services/tts/tts_service.py`

**Action** : Remplacer complètement la méthode `initialize` (lignes 95-149)

```python
async def initialize(self, model: TTSModel = None) -> bool:
    """
    Initialise le service avec le modèle spécifié.

    Logique NON-BLOQUANTE:
    1. Vérifier qu'au moins un package TTS est installé
    2. Chercher un modèle disponible localement (priorité: demandé > chatterbox > autres)
    3. Si trouvé → le charger immédiatement
    4. Télécharger les modèles manquants en ARRIÈRE-PLAN
    5. Si aucun modèle local → mode "pending" jusqu'à fin du premier téléchargement

    Args:
        model: Modèle à initialiser (optionnel)

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
        try:
            available_backends = await self.model_manager.get_available_backends()
        except Exception as e:
            logger.error(f"[TTS] ❌ Erreur lors de la vérification des backends: {e}")
            available_backends = []

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
                logger.info(f"[TTS] ✅ Modèle {local_model.value} chargé et prêt")
                return True

        # ÉTAPE 2: Aucun modèle local - téléchargement en arrière-plan
        logger.warning("[TTS] ⚠️ Aucun modèle TTS disponible localement")

        # Vérifier que le modèle demandé a un package disponible
        if model not in available_backends and TTSModel.CHATTERBOX not in available_backends:
            logger.error(
                f"[TTS] ❌ Package requis non installé pour {model.value}. "
                "Installez : pip install chatterbox-tts"
            )
            self.is_initialized = False
            return False

        logger.info("[TTS] 📥 Démarrage des téléchargements en arrière-plan...")

        # Lancer les téléchargements en arrière-plan
        asyncio.create_task(
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
                "[TTS] ⚠️ Le téléchargement n'a pas démarré rapidement. "
                "Vérifiez la connexion internet et l'espace disque."
            )
        except Exception as e:
            logger.warning(f"[TTS] ⚠️ Erreur lors du démarrage du téléchargement: {e}")

        # Service démarre en mode "pending"
        self.is_initialized = True
        logger.info("[TTS] ⏳ Service TTS démarré en mode pending (téléchargement en cours)")

        return True
```

**Action** : Remplacer la logique d'attente dans `synthesize_with_voice` (lignes 242-256)

```python
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
```

**Action** : Ajouter timeout configurable dans `__init__` (après ligne 73)

```python
self.models_path = Path(self._settings.models_path)

# NOUVEAU: Timeout configurable
self.download_timeout = int(os.getenv("TTS_DOWNLOAD_TIMEOUT", "120"))

# Modules spécialisés
self.model_manager = ModelManager(device=self.device, models_path=self.models_path)
```

---

## 📦 CORRECTIF #3 : Imports manquants

**Fichier** : `/services/translator/src/services/tts/model_manager.py`

**Action** : Vérifier les imports en haut du fichier (ajouter si manquant)

```python
import asyncio
from typing import Optional
```

---

## 🧪 TESTS APRÈS APPLICATION

Une fois les correctifs appliqués, tester :

### Test 1 : Package non installé
```bash
# Désinstaller temporairement chatterbox
pip uninstall chatterbox-tts -y

# Redémarrer le service
# Résultat attendu : Message clair "AUCUN package TTS installé"

# Réinstaller
pip install chatterbox-tts
```

### Test 2 : Connexion internet lente
```bash
# Simuler connexion lente (Linux)
tc qdisc add dev eth0 root netem delay 500ms

# Lancer une requête TTS
# Résultat attendu : Progression visible, pas de timeout immédiat

# Retirer la simulation
tc qdisc del dev eth0 root
```

### Test 3 : Modèle déjà téléchargé
```bash
# Vérifier le cache
ls ~/.cache/meeshy/models/huggingface/ResembleAI/

# Redémarrer le service
# Résultat attendu : Chargement immédiat, pas de téléchargement
```

### Test 4 : Espace disque insuffisant
```bash
# Créer un filesystem limité (pour test)
# Résultat attendu : Message "Espace disque insuffisant"
```

---

## 📋 CHECKLIST D'APPLICATION

- [ ] Backup des fichiers originaux
- [ ] Appliquer CORRECTIF #1 (ModelManager)
- [ ] Appliquer CORRECTIF #2 (TTSService)
- [ ] Appliquer CORRECTIF #3 (Imports)
- [ ] Redémarrer le service Translator
- [ ] Exécuter Test 1 (package non installé)
- [ ] Exécuter Test 2 (connexion lente)
- [ ] Exécuter Test 3 (modèle téléchargé)
- [ ] Vérifier les logs pour messages clairs
- [ ] Tester une vraie requête de traduction avec TTS

---

## 🚨 ROLLBACK EN CAS DE PROBLÈME

Si les correctifs causent des problèmes :

```bash
# Restaurer les backups
cp model_manager.py.bak model_manager.py
cp tts_service.py.bak tts_service.py

# Redémarrer le service
systemctl restart translator  # ou docker restart translator
```

---

## 📞 SUPPORT

En cas de problème après application :
1. Consulter `/logs/translator.log` pour les erreurs
2. Vérifier `pip list | grep chatterbox`
3. Vérifier l'espace disque : `df -h ~/.cache/meeshy/models`
4. Consulter AUDIT_COMPLET_TTS.md pour plus de détails
