# 📋 Tests de Traduction EN→FR - Guide d'utilisation

## 🎯 Objectif

Tester la pipeline complète de traduction anglais → français avec préservation de la structure (emojis, paragraphes, listes).

## 📁 Scripts Disponibles

### 1. `test_real_translation.py` - Traduction ML réelle

**Utilise le vrai service ML avec modèles NLLB**

```bash
# DANS L'ENVIRONNEMENT DOCKER (avec modèles ML)
cd /app
python3 test_real_translation.py
```

**Ce script fait :**
- ✅ Initialise le service ML avec les vrais modèles
- ✅ Traduit EN→FR avec `translate_with_structure()`
- ✅ Affiche texte original EN et traduction FR
- ✅ Vérifie préservation emojis, structure, qualité
- ✅ Logs détaillés de tous les segments

**Prérequis :**
- torch, transformers installés
- Modèles NLLB téléchargés dans `models/`

---

### 2. `test_translation_segmentation.py` - Tests de segmentation uniquement

**Teste la segmentation/réassemblage SANS traduction ML**

```bash
# PEUT ÊTRE EXÉCUTÉ LOCALEMENT
python3 test_translation_segmentation.py
```

**Ce script fait :**
- ✅ 22 cas de test (simple → complexe → inattendu)
- ✅ Vérifie que segmentation + réassemblage = identique
- ✅ Pas besoin des modèles ML
- ✅ Résultats : **21/22 tests réussis (95.5%)**

---

### 3. `test_display_results.py` - Affichage visuel

**Affiche les entrées et sorties formatées**

```bash
python3 test_display_results.py
```

---

## 🚀 Exécution dans Docker (Recommandé pour traduction réelle)

### Méthode 1: Exécuter le test directement dans le container

```bash
# 1. Se connecter au container Translator
docker exec -it meeshy-translator bash

# 2. Lancer le test de traduction
cd /app
python3 test_real_translation.py
```

### Méthode 2: Via docker-compose exec

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/translator
docker-compose exec translator python3 /app/test_real_translation.py
```

---

## 📊 Cas de Test Inclus

### Test 1: 100-200 caractères
```
🎉 New Feature Alert!

We've just launched our new dashboard...
```
→ Traduction FR attendue avec emojis et structure préservés

### Test 2: 400 caractères - Team Update
```
📢 TEAM UPDATE - Week of Dec 4th

🎯 ACHIEVEMENTS
✅ Released v3.2...
```

### Test 3: 600 caractères - Product Release
```
🚀 PRODUCT RELEASE v4.0 - Major Update

📱 NEW FEATURES...
```

### Test 4: 900 caractères - EXEMPLE ORIGINAL
```
🎉 MAJOR UPDATES - Last 48 Hours 🚀

🎤 AUDIO RECORDING OVERHAUL
✅ Universal MP4/AAC format...
```

---

## 🔍 Ce que les Tests Vérifient

Pour chaque traduction EN→FR :

1. ✅ **Traduction effective** : Texte FR ≠ texte EN
2. ✅ **Emojis préservés** : Même nombre avant/après
3. ✅ **Structure préservée** : Lignes, paragraphes, listes
4. ✅ **Pas de placeholders** : Pas de `🔹EMOJI_X🔹` restants
5. ✅ **Emojis bien placés** : Pas d'emojis au milieu des mots

---

## 📝 Exemple de Sortie Attendue

```
🧪 TEST: Major Updates (900 chars)
====================================

🇬🇧 TEXTE ORIGINAL (ANGLAIS)
────────────────────────────────────
🎉 MAJOR UPDATES - Last 48 Hours 🚀

🎤 AUDIO RECORDING OVERHAUL
✅ Universal MP4/AAC format - works on ALL browsers
✅ Fixed Chrome buffer issues...
────────────────────────────────────

🔄 Traduction en cours... (basic model, en→fr)

🇫🇷 TEXTE TRADUIT (FRANÇAIS)
────────────────────────────────────
🎉 MISES À JOUR MAJEURES - Dernières 48 Heures 🚀

🎤 REFONTE DE L'ENREGISTREMENT AUDIO
✅ Format MP4/AAC universel - fonctionne sur TOUS les navigateurs
✅ Problèmes de tampon Chrome corrigés...
────────────────────────────────────

🔍 VÉRIFICATIONS:
   ✅ Texte traduit (différent de l'original)
   ✅ Tous les emojis préservés (24/24)
   ✅ Structure préservée (29 → 29 lignes)
   ✅ Pas de placeholders non remplacés
   ✅ Pas d'emojis mal placés

✅ TEST RÉUSSI - 100%
```

---

## ⚙️ Configuration

Les tests utilisent :
- **Modèle**: `basic` (Helsinki-NLP/opus-mt-tc-big-en-fr)
- **Source**: `en` (anglais)
- **Target**: `fr` (français)
- **Méthode**: `translate_with_structure()` pour préservation

---

## 🐛 Troubleshooting

### "ModuleNotFoundError: No module named 'transformers'"
→ Vous devez exécuter dans l'environnement Docker avec les dépendances ML

### "ModuleNotFoundError: No module named 'psutil'"
→ Installer avec `pip install psutil` ou exécuter dans Docker

### "❌ Service ML non initialisé"
→ Les modèles ML ne sont pas téléchargés dans `models/`

### Tests trop lents
→ Normal, les modèles ML prennent 20-60s à charger la première fois

---

## 📈 Résultats Attendus

**Test de Segmentation (sans ML):**
- ✅ 21/22 tests réussis (95.5%)
- ✅ SIMPLE: 6/6 (100%)
- ✅ MEDIUM: 5/5 (100%)
- ✅ COMPLEX: 3/3 (100%)
- ✅ UNEXPECTED: 7/8 (87.5%)

**Test de Traduction ML (avec modèles):**
- ✅ 4/4 tests attendus réussis
- ✅ Préservation structure: 100%
- ✅ Préservation emojis: 100%
- ✅ Qualité traduction: selon modèle utilisé

---

## 🎯 Prochaines Étapes

1. **Exécuter `test_translation_segmentation.py`** localement ✅
2. **Exécuter `test_real_translation.py`** dans Docker
3. **Tester via l'application** en envoyant de vrais messages
4. **Vérifier les logs Translator** pour voir la segmentation en action

---

## 📞 Support

Si les tests échouent, vérifier :
1. Service Translator en cours d'exécution
2. Modèles ML téléchargés
3. Variables d'environnement correctes (.env)
4. Logs du service: `docker logs meeshy-translator`
