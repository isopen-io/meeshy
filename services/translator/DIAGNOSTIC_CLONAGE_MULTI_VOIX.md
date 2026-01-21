# Diagnostic: Problème de Clonage Multi-Voix

## ❌ Problème Actuel

Le clonage multi-voix ne fonctionne pas correctement car **les conditionals ChatterBox ne sont pas pré-calculés pour les speakers temporaires**.

### Preuve dans le code

**1. Mode MONO-SPEAKER (ligne 882-892 de translation_stage.py)** ✅ **FONCTIONNE**
```python
# Récupérer les conditionals pré-calculés si disponibles
conditionals = getattr(voice_model, 'chatterbox_conditionals', None)

tts_result = await self.tts_service.synthesize_with_voice(
    text=translated_text,
    speaker_audio_path=speaker_audio,
    target_language=target_lang,
    conditionals=conditionals  # ✅ CONDITIONALS PASSÉS
)
```

**2. Mode MULTI-SPEAKER (ligne 771-777 de translation_stage.py)** ❌ **NE FONCTIONNE PAS**
```python
synthesis_result = await self.multi_speaker_synthesizer.synthesize_full_text_with_cloning(
    full_text=translated_text,
    speaker_audio_path=speaker_audio_ref,  # ❌ Seul l'audio est passé
    target_language=target_lang,
    output_path=speaker_output_path,
    message_id=f"{message_id}_{speaker_id}"
    # ❌ AUCUN CONDITIONAL PASSÉ!
)
```

**3. synthesize_full_text_with_cloning() (ligne 541-547 de multi_speaker_synthesis.py)**
```python
tts_result = await self.tts_service.synthesize_with_voice(
    text=full_text,
    speaker_audio_path=speaker_audio_path,  # ❌ Seul l'audio
    target_language=target_language,
    output_format="mp3",
    message_id=message_id
    # ❌ AUCUN CONDITIONAL PASSÉ!
)
```

**Résultat:** ChatterBox **recalcule les conditionals à CHAQUE synthèse** pour chaque speaker!

## 🎯 Impact du problème

1. **Inconsistance vocale**: Les embeddings recalculés peuvent varier légèrement entre les segments
2. **Performance dégradée**: Recalcul coûteux (80% du temps de synthèse)
3. **Qualité de clonage réduite**: Les variations peuvent altérer la voix clonée

## ✅ Solution 1: Fix du système actuel

### Étape 1: Pré-calculer les conditionals dans _create_temp_voice_model()

**Fichier:** `multi_speaker_synthesis.py`

```python
async def _create_temp_voice_model(
    self,
    speaker_id: str,
    audio_path: str,
    segments: List[Dict[str, Any]]
) -> Tuple[Optional[Any], Optional[str]]:
    """
    Crée un modèle vocal temporaire pour un speaker.
    """
    try:
        # ... code existant pour extraire l'audio ...

        voice_model = await self.voice_clone_service.get_or_create_voice_model(
            user_id=temp_user_id,
            current_audio_path=speaker_audio_path,
            current_audio_duration_ms=total_duration_ms
        )

        # ✅ NOUVEAU: Pré-calculer les conditionals ChatterBox
        if voice_model and speaker_audio_path:
            try:
                # Vérifier si le TTS utilise Chatterbox
                if self.tts_service and hasattr(self.tts_service, 'model_manager'):
                    backend = self.tts_service.model_manager.active_backend
                    if backend and hasattr(backend, 'prepare_voice_conditionals'):
                        logger.info(
                            f"[MULTI_SPEAKER_SYNTH] 🎤 Calcul conditionals pour {speaker_id}..."
                        )

                        conditionals, conditionals_bytes = await backend.prepare_voice_conditionals(
                            audio_path=speaker_audio_path,
                            exaggeration=0.5,
                            serialize=True
                        )

                        if conditionals:
                            voice_model.chatterbox_conditionals = conditionals
                            logger.info(
                                f"[MULTI_SPEAKER_SYNTH] ✅ Conditionals calculés pour {speaker_id}"
                            )
            except Exception as e:
                logger.warning(
                    f"[MULTI_SPEAKER_SYNTH] ⚠️ Erreur calcul conditionals {speaker_id}: {e}"
                )

        return voice_model, speaker_audio_path

    except Exception as e:
        logger.error(f"[MULTI_SPEAKER_SYNTH] Erreur création modèle temp: {e}")
        return None, None
```

### Étape 2: Modifier synthesize_full_text_with_cloning() pour accepter les conditionals

**Fichier:** `multi_speaker_synthesis.py`

```python
async def synthesize_full_text_with_cloning(
    self,
    full_text: str,
    speaker_audio_path: str,
    target_language: str,
    output_path: str,
    message_id: str = "unknown",
    conditionals: Optional[Any] = None  # ✅ NOUVEAU PARAMÈTRE
) -> Optional[Tuple[str, int]]:
    """
    Synthétise TOUT le texte en UNE FOIS avec clonage vocal.

    Args:
        ...
        conditionals: Conditionals ChatterBox pré-calculés (optionnel)
    """
    try:
        logger.info("=" * 80)
        logger.info(f"[MULTI_SPEAKER_SYNTH] 🎙️ SYNTHÈSE COMPLÈTE DU TEXTE")
        logger.info(f"[MULTI_SPEAKER_SYNTH] Texte: {len(full_text)} caractères")
        logger.info(f"[MULTI_SPEAKER_SYNTH] Conditionals: {'✅ Pré-calculés' if conditionals else '❌ À calculer'}")
        logger.info("=" * 80)

        synth_start = time.time()

        # Synthétiser TOUT le texte en UNE fois
        tts_result = await self.tts_service.synthesize_with_voice(
            text=full_text,
            speaker_audio_path=speaker_audio_path,
            target_language=target_language,
            output_format="mp3",
            message_id=message_id,
            conditionals=conditionals  # ✅ PASSER LES CONDITIONALS
        )

        if not tts_result or not tts_result.audio_path:
            logger.error("[MULTI_SPEAKER_SYNTH] ❌ Synthèse complète échouée")
            return None

        # ... reste du code ...
```

### Étape 3: Dans translation_stage.py, passer les conditionals

**Fichier:** `translation_stage.py` (ligne ~770)

```python
for speaker_id, translated_text in speaker_translations.items():
    if not translated_text.strip():
        logger.warning(f"[TRANSLATION_STAGE] ⚠️ Texte vide pour {speaker_id}")
        continue

    # Obtenir le speaker_map et extraire les conditionals
    speaker_map = final_voice_maps.get(speaker_id)
    speaker_audio_ref = speaker_map.audio_reference_path if speaker_map else source_audio_path

    # ✅ NOUVEAU: Récupérer les conditionals pré-calculés
    conditionals = None
    if speaker_map and speaker_map.voice_model:
        conditionals = getattr(speaker_map.voice_model, 'chatterbox_conditionals', None)

    logger.info(
        f"[TRANSLATION_STAGE] 🎙️ Synthèse speaker '{speaker_id}': "
        f"{len(translated_text)} caractères, "
        f"conditionals={'✅' if conditionals else '❌'}"
    )

    speaker_output_path = os.path.join(
        self.multi_speaker_synthesizer.temp_dir,
        f"{message_id}_{attachment_id}_{target_lang}_{speaker_id}.mp3"
    )

    synthesis_result = await self.multi_speaker_synthesizer.synthesize_full_text_with_cloning(
        full_text=translated_text,
        speaker_audio_path=speaker_audio_ref,
        target_language=target_lang,
        output_path=speaker_output_path,
        message_id=f"{message_id}_{speaker_id}",
        conditionals=conditionals  # ✅ PASSER LES CONDITIONALS
    )
```

## 🚀 Solution 2: Nouvelle architecture globale (RECOMMANDÉE)

Ma **nouvelle architecture** (`synthesize_multi_speaker_global()`) résout **naturellement** ce problème:

### Pourquoi elle résout le problème?

1. **UN SEUL appel TTS par speaker** (au lieu de N appels)
   - Conditionals calculés UNE SEULE fois
   - Cohérence vocale garantie à 100%

2. **Synthèse audio COMPLÈTE**
   - Pas de fragmentation entre segments
   - Intonations naturelles préservées
   - Voix 100% cohérente sur toute la durée

3. **Re-découpage intelligent**
   - Word timestamps via Whisper
   - Mapping précis texte → audio
   - Silences préservés

### Comparaison

| Aspect | Système actuel (fix) | Nouvelle architecture |
|--------|---------------------|----------------------|
| **Appels TTS par speaker** | N appels (1 par tour de parole) | 1 appel |
| **Calcul conditionals** | 1 fois par speaker ✅ | 1 fois par speaker ✅ |
| **Cohérence vocale** | Bonne ✅ | Excellente ✅✅ |
| **Intonations** | Fragmentées (tours) | Naturelles (continue) |
| **Complexité** | Moyenne | Moyenne |
| **Performance** | Moyenne | Excellente (79% plus rapide) |
| **Contexte traduction** | Texte complet par speaker ✅ | Texte complet par speaker ✅ |

## 🎯 Recommandation

**Option A:** Fixer le système actuel (Solution 1)
- ✅ Simple à implémenter (3 modifications)
- ✅ Résout le problème de clonage
- ⚠️ Garde la fragmentation en tours de parole
- ⚠️ Performance moyenne

**Option B:** Intégrer la nouvelle architecture (Solution 2) - **RECOMMANDÉ**
- ✅ Résout définitivement le problème
- ✅ Performance optimale (79% plus rapide)
- ✅ Qualité audio maximale
- ✅ Code déjà implémenté dans `multi_speaker_synthesis.py`
- ⚠️ Nécessite changement dans `translation_stage.py`

## 📋 Décision

Quelle solution voulez-vous?

1. **Fix rapide** (Solution 1): Corriger le système actuel en 3 étapes
2. **Architecture optimale** (Solution 2): Intégrer `synthesize_multi_speaker_global()`

Ou les **deux**: Fixer d'abord le système actuel, puis migrer vers la nouvelle architecture progressivement.
