# Fix: Fichiers .sh non visibles et non coloriés

## 🐛 Problème

Les fichiers `.sh` (et autres fichiers code) n'étaient ni visibles ni coloriés car :

1. **Types MIME limités** : Seulement quelques types MIME étaient acceptés pour le code
2. **Détection par extension ignorée** : `getAttachmentType()` n'était pas appelé avec le `filename`
3. **Variations MIME** : Les fichiers `.sh` peuvent avoir différents MIME types selon le système

## ✅ Solution

### 1. Extension des types MIME code acceptés

**Fichier**: `shared/types/attachment.ts`

**Avant** : 10 types MIME
```typescript
export type CodeMimeType =
  | 'text/markdown'
  | 'application/x-sh'
  | 'text/javascript'
  // ... 10 types au total
```

**Après** : **45+ types MIME**
```typescript
export type CodeMimeType =
  // Shell scripts (toutes les variations)
  | 'application/x-sh'
  | 'application/x-shellscript'
  | 'text/x-sh'
  | 'text/x-shellscript'
  | 'text/x-script.sh'

  // JavaScript/TypeScript (toutes les variations)
  | 'text/javascript'
  | 'application/javascript'
  | 'application/x-javascript'
  | 'text/typescript'
  | 'application/typescript'

  // Python, HTML, CSS, XML, C/C++, Java, PHP, Ruby, Go, Rust, SQL, JSON, YAML
  // ... 45+ types au total
```

### 2. Correction de l'appel à `getAttachmentType()`

**Fichier**: `gateway/src/services/AttachmentService.ts`

**Problème** : Le filename n'était pas passé à `getAttachmentType()`

**Ligne 121** (dans `validateFile`) :
```typescript
// Avant
const attachmentType = getAttachmentType(file.mimeType);

// Après
const attachmentType = getAttachmentType(file.mimeType, file.filename);
```

**Ligne 443** (dans `uploadFile`) :
```typescript
// Avant
const attachmentType = getAttachmentType(file.mimeType);

// Après
const attachmentType = getAttachmentType(file.mimeType, file.filename);
```

## 📋 Types MIME Shell supportés

Les fichiers `.sh` peuvent avoir différents MIME types selon le système d'exploitation :

| MIME Type | Système | Support |
|-----------|---------|---------|
| `application/x-sh` | Linux/macOS | ✅ |
| `application/x-shellscript` | macOS | ✅ |
| `text/x-sh` | Certains Linux | ✅ |
| `text/x-shellscript` | Certains éditeurs | ✅ |
| `text/x-script.sh` | Anciens systèmes | ✅ |
| `text/plain` | Fallback | ✅ (via extension) |
| `application/octet-stream` | Générique | ✅ (via extension) |

## 🎨 Coloration syntaxique

Tous les fichiers shell bénéficient maintenant de la coloration Bash :

```bash
#!/bin/bash

# Script de démarrage
echo "Démarrage de l'application..."

if [ -f ".env" ]; then
    source .env
    echo "Variables d'environnement chargées"
fi

npm run dev
```

## 🔍 Fonctionnement

### Détection en 3 étapes

1. **MIME type** (prioritaire)
   - Si le MIME type est reconnu comme code → type = 'code'

2. **Extension de fichier** (fallback)
   - Si le MIME type est inconnu, vérifier l'extension
   - `.sh` → type = 'code'

3. **Nom de fichier** (cas spéciaux)
   - Dockerfile, Makefile, etc. → type = 'code'

### Exemple pour test.sh

```
Upload: test.sh
MIME type: application/x-sh
Extension: .sh

Étape 1: MIME reconnu comme 'code' ✅
→ Type final: 'code'
→ Affichage: TextViewer
→ Coloration: Bash
```

### Exemple pour test.sh (MIME inconnu)

```
Upload: test.sh
MIME type: application/octet-stream
Extension: .sh

Étape 1: MIME non reconnu comme 'code'
Étape 2: Extension .sh détectée ✅
→ Type final: 'code'
→ Affichage: TextViewer
→ Coloration: Bash
```

## 🧪 Test

1. **Créer un fichier test** :
```bash
echo '#!/bin/bash
echo "Hello, World!"
for i in {1..5}; do
  echo "Iteration $i"
done' > test.sh
```

2. **Uploader le fichier** dans un message

3. **Résultat attendu** :
   - ✅ Fichier visible dans le message
   - ✅ Preview avec TextViewer
   - ✅ Coloration syntaxique Bash
   - ✅ Numéro de lignes
   - ✅ Bouton copier
   - ✅ Bouton plein écran
   - ✅ Fichier non exécutable (chmod 644)

## 📊 Impact

### Avant le fix
- Fichiers `.sh` → Type: 'document' → Icône simple, pas de preview
- Fichiers `.graphql` → Type: 'document' → Icône simple, pas de preview
- Fichiers `.c` → Type: 'document' → Icône simple, pas de preview

### Après le fix
- Fichiers `.sh` → Type: 'code' → TextViewer + coloration Bash ✅
- Fichiers `.graphql` → Type: 'code' → TextViewer + coloration GraphQL ✅
- Fichiers `.c` → Type: 'code' → TextViewer + coloration C ✅
- **90+ extensions** → Preview avec coloration ✅

## 🔧 Fichiers modifiés

1. **`shared/types/attachment.ts`**
   - Extension de `CodeMimeType` (10 → 45+ types)
   - Extension de `ACCEPTED_MIME_TYPES.CODE` (10 → 45+ types)

2. **`gateway/src/services/AttachmentService.ts`**
   - Ligne 121: Ajout du `filename` dans `validateFile()`
   - Ligne 443: Ajout du `filename` dans `uploadFile()`

## ✅ Checklist de vérification

- [x] Types MIME shell ajoutés (5 variations)
- [x] Types MIME HTML/CSS/JS/etc. ajoutés (40+ types)
- [x] `getAttachmentType()` appelé avec filename
- [x] Détection par extension fonctionnelle
- [x] Coloration syntaxique Bash dans TextViewer
- [x] Coloration syntaxique Bash dans TextLightbox
- [x] Fichiers chmod 644 (non exécutables)

---

**Date** : 2025-11-19
**Fix** : Fichiers .sh maintenant visibles et coloriés
**Impact** : 90+ types de fichiers code maintenant supportés
