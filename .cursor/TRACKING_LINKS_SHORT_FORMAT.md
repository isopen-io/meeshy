# Format Court pour les Liens de Tracking : m+<token>

## 🎯 Nouveau Format

Au lieu de `mshy://<token>` (13 caractères), nous utilisons maintenant **`m+<token>`** (8 caractères).

### Exemples
- ❌ Ancien : `mshy://aB3xY9` (13 caractères)
- ✅ Nouveau : `m+aB3xY9` (8 caractères)
- 💾 Gain : **38% plus court !**

## 📝 Modifications Apportées

### 1. Backend - TrackingLinkService

**Fichier**: `gateway/src/services/TrackingLinkService.ts`

```typescript
// Ancien
const replacement = `mshy://${trackingLink.token}`;

// Nouveau
const replacement = `m+${trackingLink.token}`;
```

**Regex mise à jour** :
```typescript
const mshyShortRegex = /\bm\+([a-zA-Z0-9+\-_=]{6})\b/gi;
```

### 2. Frontend - Parser

**Fichier**: `frontend/lib/utils/link-parser.ts`

```typescript
// Nouvelle regex pour détecter m+<token>
const MSHY_SHORT_REGEX = /\bm\+([a-zA-Z0-9+\-_=]{6})\b/gi;

// Parsing mis à jour
while ((mshyMatch = mshyRegex.exec(message)) !== null) {
  matches.push({ match: mshyMatch, type: 'mshy' });
}
```

### 3. Frontend - Affichage

**Fichier**: `frontend/components/chat/message-with-links.tsx`

**Style amélioré** :
```typescript
<a className={cn(
  'inline-flex items-center gap-0.5',
  'font-semibold underline decoration-2',
  'cursor-pointer pointer-events-auto',
  'hover:scale-105 transition-all',
  linkClassName
)}>
  <Link2 className="h-3.5 w-3.5" />
  <span className="font-mono text-xs">{part.content}</span>
</a>
```

**Caractéristiques** :
- Police monospace pour `m+<token>`
- Icône Link2 (🔗)
- Effet de zoom au hover (scale-105)
- Gras et souligné
- Cursor pointer

## 🎨 Apparence Finale

### Messages Propres (Own Messages)
```
Regarde m+aB3xY9 pour info
         ↑
    🔗 m+aB3xY9 (blanc, gras, souligné, mono)
```

### Messages d'Autres Utilisateurs
```
Regarde m+aB3xY9 pour info
         ↑
    🔗 m+aB3xY9 (bleu, gras, souligné, mono)
```

### Hover
- Zoom léger (scale 105%)
- Couleur plus intense
- Soulignage plus prononcé

## 🔄 Flux Complet

### Envoi de Message

```
Utilisateur écrit : "Regarde https://example.com"
         ↓
Backend détecte : https://example.com
         ↓
Crée TrackingLink : token = "aB3xY9"
         ↓
Remplace par : "Regarde m+aB3xY9"
         ↓
Sauvegarde en BD : content = "Regarde m+aB3xY9"
         ↓
Frontend parse : Détecte "m+aB3xY9"
         ↓
Affiche : 🔗 m+aB3xY9 (bleu, cliquable)
         ↓
Clic : Enregistre → Redirige vers https://example.com
```

## 📊 Avantages du Format Court

1. **Plus Compact** : 38% plus court que `mshy://`
2. **Plus Lisible** : Moins de caractères = plus facile à lire
3. **Plus Élégant** : Format moderne et minimaliste
4. **Plus Rapide** : Moins de caractères à taper/afficher
5. **SEO-Friendly** : Format court et mémorable

## 🔍 Regex Complètes

### Backend (Ignorer les liens existants)
```typescript
const meeshyLinkRegex = /https?:\/\/(?:www\.)?meeshy\.me\/l\/([a-zA-Z0-9+\-_=]{6})/gi;
const mshyShortRegex = /\bm\+([a-zA-Z0-9+\-_=]{6})\b/gi;
```

### Frontend (Parser les liens)
```typescript
const MSHY_SHORT_REGEX = /\bm\+([a-zA-Z0-9+\-_=]{6})\b/gi;
const TRACKING_LINK_REGEX = /https?:\/\/(?:www\.)?meeshy\.me\/l\/([a-zA-Z0-9+\-_=]{6})/gi;
const URL_REGEX = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*))/gi;
```

### Ordre de Priorité
1. `m+<token>` (plus haute priorité)
2. `https://meeshy.me/l/<token>`
3. URLs normales (plus basse priorité)

## 🧪 Tests

### Test 1 : Format Court
```
Message : "Regarde m+aB3xY9"
Parsing : {type: 'mshy-link', token: 'aB3xY9'}
Affichage : 🔗 m+aB3xY9 (bleu, cliquable)
```

### Test 2 : Mélange de Formats
```
Message : "Regarde https://example.com et m+test12"
Parsing : 
  - {type: 'url', originalUrl: 'https://example.com'}
  - {type: 'mshy-link', token: 'test12'}
Affichage : 
  - 🔗 example.com (lien normal)
  - 🔗 m+test12 (lien tracking)
```

### Test 3 : Conversion Automatique
```
Envoi : "Regarde https://google.com"
Backend : Crée TrackingLink token="xyz123"
BD : "Regarde m+xyz123"
Affichage : 🔗 m+xyz123 (bleu, cliquable)
Clic : Redirige vers https://google.com
```

## 📱 Responsive

- **Mobile** : Format compact idéal pour petits écrans
- **Desktop** : Affichage clair et lisible
- **Hover** : Effet visuel (zoom)

## 🎨 Styles CSS

```css
/* Classes appliquées aux liens m+<token> */
.inline-flex.items-center.gap-0.5 {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem; /* 2px */
}

.font-semibold {
  font-weight: 600;
}

.font-mono {
  font-family: ui-monospace, monospace;
}

.text-xs {
  font-size: 0.75rem; /* 12px */
}

.underline.decoration-2 {
  text-decoration: underline;
  text-decoration-thickness: 2px;
}

.hover\:scale-105:hover {
  transform: scale(1.05);
}
```

## ✅ Validation

Les liens `m+<token>` devraient :
- [x] Être détectés par la regex
- [x] Être parsés correctement
- [x] Être affichés en bleu (ou blanc pour own messages)
- [x] Avoir l'icône Link2 (🔗)
- [x] Avoir le cursor pointer
- [x] Être cliquables
- [x] Enregistrer le clic en BD
- [x] Rediriger vers l'URL originale

## 🐛 Debug

Si les liens ne sont toujours pas cliquables :

1. **Console** → Vérifier les logs de parsing
2. **Inspect Element** → Vérifier que c'est bien une balise `<a>`
3. **Computed Styles** → Vérifier `pointer-events: auto`
4. **Test page** → `http://localhost:3100/test-links`

---

**Date**: 14 Octobre 2025  
**Format**: `m+<token>` (8 caractères)  
**Status**: ✅ Implémenté

