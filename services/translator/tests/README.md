# Tests du Système de Traduction Meeshy

## Vue d'ensemble

Ce dossier contient tous les tests du système de traduction, organisés par niveau de complexité croissante.

## Structure des Tests

### 📁 Organisation
```
tests/
├── test_01_model_utils.py          # Niveau 1: Utilitaires de base
├── test_02_model_detection.py      # Niveau 2: Détection des modèles
├── test_03_model_download.py       # Niveau 3: Téléchargement des modèles
├── test_04_service_integration.py  # Niveau 4: Intégration du service
├── test_05_quantized_service.py    # Niveau 5: Service quantifié
└── README.md                       # Ce fichier
```

## Niveaux de Test

### 🟢 Niveau 1: Utilitaires de base (`test_01_model_utils.py`)
**Complexité:** Simple  
**Objectif:** Vérifier les fonctions de base du gestionnaire de modèles

**Tests inclus:**
- ✅ Création du gestionnaire de modèles
- ✅ Génération des chemins de modèles
- ✅ Récupération des informations de modèles

**Dépendances:** Aucune (fonctions de base)

### 🟡 Niveau 2: Détection des modèles (`test_02_model_detection.py`)
**Complexité:** Intermédiaire  
**Objectif:** Vérifier la détection des modèles existants localement

**Tests inclus:**
- ✅ Détection des modèles existants
- ✅ Statut détaillé des modèles
- ✅ Nettoyage des téléchargements incomplets

**Dépendances:** Niveau 1 + accès au système de fichiers

### 🟠 Niveau 3: Téléchargement des modèles (`test_03_model_download.py`)
**Complexité:** Avancé  
**Objectif:** Tester le téléchargement des modèles manquants

**Tests inclus:**
- ✅ Téléchargement d'un petit modèle
- ✅ Téléchargement asynchrone
- ✅ Vérification après téléchargement

**Dépendances:** Niveaux 1-2 + connexion internet

### 🔴 Niveau 4: Intégration du service (`test_04_service_integration.py`)
**Complexité:** Expert  
**Objectif:** Tester l'intégration complète avec le service de traduction

**Tests inclus:**
- ✅ Création du service de traduction
- ✅ Intégration de la vérification des modèles
- ✅ Initialisation du service
- ✅ Traduction avec modèles locaux

**Dépendances:** Tous les niveaux précédents + service complet

### 🔴 Niveau 5: Service quantifié (`test_05_quantized_service.py`)
**Complexité:** Expert  
**Objectif:** Tester le service avec quantification et métriques avancées

**Tests inclus:**
- ✅ Création du service quantifié
- ✅ Partage de modèles
- ✅ Système de fallback
- ✅ Qualité de traduction
- ✅ Métriques de performance

**Dépendances:** Tous les niveaux précédents + service complet

## Exécution des Tests

### 🚀 Script principal
```bash
# Exécuter tous les tests dans l'ordre
./test-translate.sh

# Afficher l'aide
./test-translate.sh --help

# Display complete log at the end
./test-translate.sh --log
```

### 🧪 Tests individuels
```bash
# Test de niveau 1
python3 tests/test_01_model_utils.py

# Test de niveau 2
python3 tests/test_02_model_detection.py

# Test de niveau 3
python3 tests/test_03_model_download.py

# Test de niveau 4
python3 tests/test_04_service_integration.py

# Test de niveau 5
python3 tests/test_05_quantized_service.py
```

## Résultats des Tests

### 📊 Format des résultats
Chaque test affiche :
- **Statut:** ✅ RÉUSSI ou ❌ ÉCHOUÉ
- **Détails:** Informations spécifiques au test
- **Résumé:** Statistiques du niveau de test

### 📝 Fichier de log
Tous les résultats sont enregistrés dans `test_results.log` à la racine du projet.

## Gestion des Erreurs

### ⚠️ Tests optionnels
- **Niveau 3:** Peut échouer si pas de connexion internet
- **Niveau 4:** Peut échouer si dépendances manquantes

### 🔧 Résolution des problèmes
1. **Vérifier les prérequis:** Python3, dépendances
2. **Consulter les logs:** `test_results.log`
3. **Tester individuellement:** Exécuter chaque test séparément
4. **Vérifier la configuration:** `src/config/settings.py`

## Configuration

### 🔧 Variables d'environnement
```bash
# Chemin des modèles
MODELS_PATH=/path/to/models

# Niveau de log
LOG_LEVEL=INFO
```

### 📁 Structure attendue
```
translator/
├── src/
│   ├── config/
│   ├── services/
│   └── utils/
├── tests/
├── models/
└── test-translate.sh
```

## Développement

### ➕ Ajouter un nouveau test
1. Créer le fichier `test_XX_description.py`
2. Implémenter la fonction `run_all_tests()`
3. Ajouter le test dans `test-translate.sh`
4. Mettre à jour ce README

### 🔄 Modifier un test existant
1. Modifier le fichier de test
2. Tester individuellement
3. Exécuter la suite complète
4. Mettre à jour la documentation si nécessaire

## Support

### 📋 Checklist de diagnostic
- [ ] Python3 installé et accessible
- [ ] Dépendances Python installées
- [ ] Répertoire `src/` présent
- [ ] Répertoire `models/` accessible
- [ ] Connexion internet (pour les tests de téléchargement)

### 🆘 Problèmes courants
1. **ImportError:** Vérifier le PYTHONPATH
2. **FileNotFoundError:** Vérifier les chemins de modèles
3. **ConnectionError:** Vérifier la connectivité réseau
4. **PermissionError:** Vérifier les droits d'accès

### 📞 Aide supplémentaire
- Consulter `docs/MODEL_MANAGEMENT.md`
- Vérifier `IMPLEMENTATION_SUMMARY.md`
- Examiner les logs détaillés
