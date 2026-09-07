# 🔧 Fix: Connexion MongoDB Translator - Python 3.12 + Prisma 0.15.0

**Date**: 18 Octobre 2025  
**Service**: Translator (FastAPI)  
**Problème**: Le service translator n'arrivait pas à se connecter à MongoDB  

## 🔍 Diagnostic

### Symptômes
- Le service translator bloquait à "Tentative de connexion à MongoDB..."
- Aucune erreur n'était loggée
- MongoDB était fonctionnel (testé avec mongosh)

### Causes identifiées

1. **Incompatibilité Python 3.13 + Prisma Python 0.15.0**
   - Prisma Python 0.15.0 passe des objets `Limits` et `Timeout` comme `dict` à httpx
   - httpx ≥ 0.24 attend des objets, pas des dict
   - Erreur: `AttributeError: 'dict' object has no attribute 'max_connections'`

2. **Environnement virtuel corrompu**
   - Le `.venv` avait des liens symboliques cassés pointant vers l'ancien emplacement du repo
   - Path: `/Users/smpceo/Downloads/Meeshy` → `/Users/smpceo/Documents/Services/Meeshy`

## ✅ Solution appliquée

### 1. Migration vers Python 3.12
```bash
cd translator
pyenv local 3.12.0
ln -sf $(pyenv which python) .venv/bin/python
ln -sf $(pyenv which python) .venv/bin/python3
```

### 2. Réinstallation des dépendances
```bash
/Users/smpceo/.pyenv/versions/3.12.0/bin/python3.12 -m pip install -r requirements.txt
```

### 3. Downgrade httpx pour compatibilité
```bash
/Users/smpceo/.pyenv/versions/3.12.0/bin/python3.12 -m pip install 'httpx==0.24.*' 'httpcore<0.18'
```

### 4. Patch Prisma Python pour fix httpx

**Fichier patché**: `/Users/smpceo/.pyenv/versions/3.12.0/lib/python3.12/site-packages/prisma/_async_http.py`

```python
@override
def open(self) -> None:
    # Fix: Convert dict to Limits/Timeout objects if needed
    kwargs = self.session_kwargs.copy()
    if 'limits' in kwargs and isinstance(kwargs['limits'], dict):
        kwargs['limits'] = httpx.Limits(**kwargs['limits'])
    if 'timeout' in kwargs and isinstance(kwargs['timeout'], dict):
        kwargs['timeout'] = httpx.Timeout(**kwargs['timeout'])
    self.session = httpx.AsyncClient(**kwargs)
```

**Script de patch**: `translator/patch_prisma.py`

### 5. Régénération du client Prisma
```bash
PATH=".venv/bin:$PATH" python -m prisma generate
```

## 📊 Tests de validation

### Test de connexion standalone
```bash
cd translator
python test_db_connection.py
```

**Résultat attendu**:
```
✅ Connexion réussie (tentative 1/3)
✅ Nombre d'utilisateurs: 4
✅ Base de données opérationnelle
✅ TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS !
```

### Test du service complet
```bash
cd translator
./translator.sh
```

**Logs attendus**:
```
[TRANSLATOR-DB] ✅ Connexion à MongoDB réussie
[TRANSLATOR] 🚀 Service prêt à recevoir des requêtes
```

## 🔄 Procédure de déploiement

### Production (Docker)
Le fix est automatiquement inclus dans l'image Docker via `requirements.txt` et le patch Prisma.

**Images Docker**:
- `isopen/meeshy-translator:v1.8.5`
- `isopen/meeshy-translator:latest`

### Développement local

1. **Vérifier Python 3.12**:
   ```bash
   python --version  # Doit afficher 3.12.x
   ```

2. **Appliquer le patch Prisma** (si nécessaire):
   ```bash
   cd translator
   python patch_prisma.py
   ```

3. **Démarrer le service**:
   ```bash
   ./translator.sh
   ```

## 📝 Notes techniques

### Versions compatibles testées
- **Python**: 3.12.0
- **Prisma Python**: 0.15.0
- **httpx**: 0.24.1
- **httpcore**: 0.17.3
- **MongoDB**: 7.x (replica set rs0)

### Dépendances critiques
```txt
prisma>=0.15.0
httpx==0.24.*
httpcore<0.18
python-dotenv>=1.1.1
```

### Variables d'environnement requises
```env
DATABASE_URL=mongodb://localhost:27017/meeshy?replicaSet=rs0&directConnection=true
ENVIRONMENT=development
LOG_LEVEL=DEBUG
```

## 🚨 Problèmes connus

### venv corrompu après migration
**Symptôme**: `bad interpreter: no such file or directory`

**Solution**:
```bash
cd translator
rm -rf .venv
pyenv local 3.12.0
python -m venv .venv
.venv/bin/pip install -r requirements.txt
PATH=".venv/bin:$PATH" python -m prisma generate
python patch_prisma.py
```

### httpx incompatibility
**Symptôme**: `AttributeError: 'dict' object has no attribute 'max_connections'`

**Solution**: Downgrade httpx + Apply patch
```bash
pip install 'httpx==0.24.*' 'httpcore<0.18'
python patch_prisma.py
```

## 📚 Références

- **Issue Prisma Python**: https://github.com/RobertCraigie/prisma-client-py/issues
- **httpx Breaking Changes**: https://www.python-httpx.org/compatibility/
- **Documentation Prisma MongoDB**: https://www.prisma.io/docs/orm/overview/databases/mongodb

## ✅ Checklist de vérification

- [x] Python 3.12 installé et configuré
- [x] httpx downgraded à 0.24.x
- [x] Patch Prisma appliqué
- [x] Client Prisma régénéré
- [x] Tests de connexion passent
- [x] Service translator démarre sans erreur
- [x] MongoDB accessible et opérationnel
- [x] Documentation mise à jour

---

**Auteur**: GitHub Copilot  
**Date**: 2025-10-18  
**Version**: 1.8.5
