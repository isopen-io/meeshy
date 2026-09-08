# Fix: Interpolation dans les traductions i18n

## 🐛 Problème détecté

Sur la page `/join`, le texte affiché était :
```
Participants: 5 Members (including {1} anonymous)
```

Au lieu de :
```
Participants : 5 membres (dont 1 anonymes)
```

## 🔍 Analyse du problème

### 1. **Fichier de traduction manquant**
Le fichier `/apps/web/locales/fr/joinPage.json` n'existait pas, causant un fallback vers l'anglais.

### 2. **Syntaxe d'interpolation incorrecte**
- **Hook `useI18n`** (ligne 220 de `/apps/web/hooks/use-i18n.ts`) utilise la regex : `/\{(\w+)\}/g`
  - ✅ Syntaxe attendue : `{count}`, `{username}`, `{size}` (simple accolades)
  
- **Fichiers de traduction** utilisaient la syntaxe i18next :
  - ❌ Syntaxe trouvée : `{{count}}`, `{{username}}`, `{{size}}` (double accolades)

### 3. **Conséquence**
La regex du hook ne reconnaissait pas `{{count}}` et laissait la valeur non remplacée → `{1}` s'affichait littéralement.

## ✅ Solution appliquée

### 1. Création du fichier français manquant
**Fichier créé** : `/apps/web/locales/fr/joinPage.json`
- Traduction complète de toutes les clés
- Utilisation de la syntaxe `{count}` conforme au hook

### 2. Correction de la syntaxe d'interpolation

#### Fichiers corrigés :
1. **`/apps/web/locales/en/joinPage.json`**
   - `{{count}}` → `{count}`
   - `{{username}}` → `{username}`

2. **`/apps/web/locales/fr/attachments.json`**
   - `{{size}}` → `{size}`
   - `{{count}}` → `{count}`
   - `{{length}}` → `{length}`

3. **`/apps/web/locales/en/attachments.json`**
   - `{{size}}` → `{size}`
   - `{{count}}` → `{count}`
   - `{{length}}` → `{length}`

## 📋 Résultat attendu

### Avant :
```
Participants: 5 Members (including {1} anonymous)
```

### Après :
```
Participants : 5 membres (dont 1 anonymes)
```

## 🔧 Fonctionnement de l'interpolation

### Code dans `/apps/web/app/join/[linkId]/page.tsx` (ligne 558) :
```typescript
{t('includingAnonymous', { count: conversationLink.stats.anonymousCount })}
```

### Traduction dans `/apps/web/locales/fr/joinPage.json` :
```json
{
  "includingAnonymous": "(dont {count} anonymes)"
}
```

### Mécanisme dans `/apps/web/hooks/use-i18n.ts` (ligne 220) :
```typescript
if (params) {
  return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
    return params[paramKey]?.toString() || match;
  });
}
```

## 📚 Convention d'interpolation pour Meeshy

### ✅ Syntaxe CORRECTE (à utiliser partout) :
```json
{
  "welcome": "Bienvenue {username} !",
  "filesCount": "{count} fichiers",
  "maxSize": "Taille max : {size}"
}
```

### ❌ Syntaxe INCORRECTE (à éviter) :
```json
{
  "welcome": "Bienvenue {{username}} !",
  "filesCount": "{{count}} fichiers",
  "maxSize": "Taille max : {{size}}"
}
```

## 🔍 Vérification des autres fichiers

Pour vérifier s'il reste des occurrences incorrectes :
```bash
cd frontend
grep -r "{{[a-zA-Z_]\+}}" locales/
```

## 🎯 Points clés à retenir

1. **Une seule accolade** : `{variable}` (pas `{{variable}}`)
2. **Variables alphanumériques** : `{count}`, `{username}`, `{size}` (pas d'espaces ni caractères spéciaux)
3. **Fichiers bilingues** : Toujours créer les versions `fr` et `en` simultanément
4. **Test local** : Vérifier que les valeurs sont bien remplacées dans l'interface

## 📁 Fichiers modifiés

```
frontend/
├── locales/
│   ├── fr/
│   │   ├── joinPage.json        ← CRÉÉ (traduction complète)
│   │   └── attachments.json     ← Syntaxe corrigée
│   └── en/
│       ├── joinPage.json        ← Syntaxe corrigée
│       └── attachments.json     ← Syntaxe corrigée
└── docs/
    └── FIX_I18N_INTERPOLATION.md ← Cette documentation
```

---

**Date** : 16 octobre 2025  
**Auteur** : GitHub Copilot  
**Statut** : ✅ Résolu
