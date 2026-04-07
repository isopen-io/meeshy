# 🚀 Scripts de Déploiement Meeshy iOS

Scripts automatisés pour compiler et déployer l'application Meeshy sur le simulateur iOS.

## 📋 Scripts Disponibles

### 1. `deploy.sh` - Déploiement Complet ⭐

**Script principal** qui effectue un déploiement complet de zéro :

```bash
./deploy.sh
```

**Étapes effectuées** :
1. Navigation vers le projet
2. Régénération du projet avec XcodeGen
3. Nettoyage des builds précédents
4. Recherche du simulateur
5. **Arrêt du simulateur**
6. Compilation du projet
7. **Redémarrage du simulateur**
8. Installation et lancement de l'app

**Durée** : ~60 secondes

---

### 2. `build.sh` - Compilation Rapide

Compile le projet sans toucher au simulateur :

```bash
./build.sh
```

**Utilisation** : Pour compiler après des modifications de code  
**Durée** : ~45 secondes

---

### 3. `redeploy.sh` - Redéploiement Rapide

Redéploie l'app déjà compilée (sans recompiler) :

```bash
./redeploy.sh
```

**Utilisation** : Pour tester rapidement après une compilation  
**Durée** : ~5 secondes

---

### 4. `simulator.sh` - Gestion du Simulateur

Contrôle le simulateur :

```bash
# Démarrer le simulateur
./simulator.sh start

# Arrêter le simulateur
./simulator.sh stop

# Redémarrer le simulateur
./simulator.sh restart

# Lister les simulateurs disponibles
./simulator.sh list
```

---

### 5. `logs.sh` - Logs en Temps Réel

Affiche les logs de l'application en temps réel :

```bash
./logs.sh
```

Appuyez sur `Ctrl+C` pour quitter.

---

## 🔄 Workflows Typiques

### Premier Déploiement

```bash
./deploy.sh
```

### Développement Itératif

```bash
# 1. Modifier le code
# 2. Compiler
./build.sh

# 3. Redéployer
./redeploy.sh
```

### Débogage

```bash
# Terminal 1 : Logs
./logs.sh

# Terminal 2 : Déploiement
./deploy.sh
```

### Problème de Simulateur

```bash
# Redémarrer complètement
./simulator.sh restart

# Puis redéployer
./deploy.sh
```

---

## ⚙️ Configuration

Les scripts utilisent les paramètres suivants (modifiables dans chaque script) :

```bash
PROJECT_DIR="/Users/smpceo/Documents/Services/Meeshy/ios"
APP_NAME="Meeshy"
BUNDLE_ID="me.meeshy.app"
SCHEME="Meeshy"
SIMULATOR_NAME="iPhone 16 Pro"
```

Pour utiliser un autre simulateur, modifiez `SIMULATOR_NAME` dans les scripts.

---

## 🎯 Exemples d'Utilisation

### Scénario 1 : Modifications Majeures

```bash
# Déploiement complet avec redémarrage
./deploy.sh
```

### Scénario 2 : Modifications Mineures

```bash
# Compilation + Redéploiement rapide
./build.sh && ./redeploy.sh
```

### Scénario 3 : Test d'une Feature

```bash
# Terminal 1
./logs.sh

# Terminal 2
./deploy.sh
```

### Scénario 4 : Debug d'un Crash

```bash
# Redémarrer proprement
./simulator.sh restart
sleep 5
./deploy.sh
```

---

## 📊 Comparaison des Scripts

| Script | Compilation | Clean | Restart Sim | Durée | Usage |
|--------|-------------|-------|-------------|-------|-------|
| `deploy.sh` | ✅ | ✅ | ✅ | ~60s | Déploiement complet |
| `build.sh` | ✅ | ❌ | ❌ | ~45s | Compilation seule |
| `redeploy.sh` | ❌ | ❌ | ❌ | ~5s | Redéploiement rapide |
| `simulator.sh` | ❌ | ❌ | ✅ | ~5s | Contrôle simulateur |
| `logs.sh` | ❌ | ❌ | ❌ | - | Affichage logs |

---

## 🐛 Résolution de Problèmes

### Erreur : Simulateur non trouvé

```bash
# Lister les simulateurs disponibles
./simulator.sh list

# Modifier le nom dans les scripts si nécessaire
```

### Erreur : XcodeGen non trouvé

```bash
# Installer XcodeGen
brew install xcodegen
```

### Erreur : Build échoue

```bash
# Nettoyer et recompiler
rm -rf DerivedData
./deploy.sh
```

### Application ne se lance pas

```bash
# Redémarrer le simulateur
./simulator.sh restart

# Puis redéployer
./deploy.sh
```

### Simulateur bloqué

```bash
# Forcer l'arrêt
killall Simulator

# Attendre 5 secondes
sleep 5

# Redémarrer
./simulator.sh start
```

---

## 💡 Astuces

### Alias Bash

Ajoutez ces alias dans votre `~/.zshrc` ou `~/.bashrc` :

```bash
alias md="cd /Users/smpceo/Documents/Services/Meeshy/ios"
alias mdeploy="cd /Users/smpceo/Documents/Services/Meeshy/ios && ./deploy.sh"
alias mbuild="cd /Users/smpceo/Documents/Services/Meeshy/ios && ./build.sh"
alias mlogs="cd /Users/smpceo/Documents/Services/Meeshy/ios && ./logs.sh"
```

Puis :

```bash
source ~/.zshrc  # ou ~/.bashrc
```

### Watch Mode

Pour recompiler automatiquement à chaque modification :

```bash
# Installer fswatch
brew install fswatch

# Lancer le watch
fswatch -o Meeshy/ | xargs -n1 -I{} ./build.sh
```

### Clean Total

Pour un clean complet :

```bash
rm -rf DerivedData/
rm -rf ~/Library/Developer/Xcode/DerivedData/Meeshy-*
./deploy.sh
```

---

## 📝 Notes

- Les scripts utilisent des couleurs pour une meilleure lisibilité
- Tous les scripts gèrent les erreurs avec `set -e`
- Les logs sont filtrés pour ne montrer que les informations importantes
- Le simulateur est automatiquement démarré si nécessaire

---

## 🎉 Scripts Prêts !

Tous les scripts sont maintenant exécutables et prêts à l'emploi.

**Commencez par** :

```bash
./deploy.sh
```

---

*Scripts créés pour Meeshy iOS v1.0.0*

