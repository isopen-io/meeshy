# Debug : Liens Non Cliquables dans les Messages

## 🐛 Problème Signalé

Les liens dans les messages ne sont pas cliquables dans la conversation :
`http://localhost:3100/conversations/68c1820be96c1b1c944351a7`

## ✅ Correctifs Appliqués

### 1. Ajout de Classes CSS Explicites
**Fichier**: `frontend/components/chat/message-with-links.tsx`

```typescript
// Ajout de cursor-pointer et pointer-events-auto
className={cn(
  'inline-flex items-center gap-1 font-medium underline decoration-2',
  'break-all cursor-pointer pointer-events-auto', // ← Ajouté
  linkClassName
)}
```

### 2. Z-Index pour les Liens
**Fichier**: `frontend/components/common/bubble-message.tsx`

```typescript
// Ajout de z-index pour s'assurer que les liens sont au-dessus
<div className="mb-2" style={{ position: 'relative', zIndex: 1 }}>
  <motion.div style={{ position: 'relative', zIndex: 1 }}>
    <MessageWithLinks
      linkClassName={cn(
        "relative z-10", // ← Ajouté
        // ... autres classes
      )}
    />
  </motion.div>
</div>
```

### 3. Logs de Debug Ajoutés

```typescript
console.log('[MessageWithLinks] Content:', content);
console.log('[MessageWithLinks] Parsed parts:', parts);
console.log('[MessageWithLinks] Link clicked:', part);
```

## 🧪 Page de Test Créée

**URL**: `http://localhost:3100/test-links`

Cette page teste :
- ✅ Liens HTTP normaux
- ✅ Liens `mshy://<token>`
- ✅ Liens `https://meeshy.me/l/<token>`
- ✅ Messages avec plusieurs liens
- ✅ Messages sans liens

## 🔍 Checklist de Debug

### 1. Ouvrir la Console du Navigateur (F12)

```bash
# Vous devriez voir ces logs quand un message s'affiche :
[MessageWithLinks] Content: "Regarde https://example.com"
[MessageWithLinks] Parsed parts: [{type: 'text', ...}, {type: 'url', ...}]

# Quand vous cliquez sur un lien :
[MessageWithLinks] Link clicked: {type: 'url', content: 'https://example.com', ...}
```

### 2. Vérifier que les Liens sont Rendus comme `<a>`

Ouvrir les DevTools → Elements → Inspecter un lien dans un message

**Attendu** :
```html
<a 
  href="https://example.com" 
  target="_blank" 
  rel="noopener noreferrer"
  class="... cursor-pointer pointer-events-auto ..."
>
  <span>
    <svg>...</svg> <!-- Icône -->
    <span>example.com</span>
  </span>
</a>
```

### 3. Vérifier les Styles CSS

Dans la console, tapez :
```javascript
// Sélectionner un lien
const link = document.querySelector('a[href*="http"]');

// Vérifier les styles
console.log(window.getComputedStyle(link).pointerEvents); // Devrait être "auto"
console.log(window.getComputedStyle(link).cursor); // Devrait être "pointer"
console.log(window.getComputedStyle(link).zIndex); // Devrait être > 0
```

### 4. Test Manuel des Clics

1. **Hover** sur le lien → Devrait changer de couleur
2. **Clic** sur le lien → Devrait ouvrir dans un nouvel onglet
3. **Console** → Devrait afficher `[MessageWithLinks] Link clicked`

## 🔧 Si les Liens ne Sont Toujours Pas Cliquables

### Cause Possible #1 : Overlay Transparent

Un élément parent pourrait bloquer les clics. Testez :

```javascript
// Dans la console, sur la page de conversation
document.addEventListener('click', (e) => {
  console.log('Clicked element:', e.target);
  console.log('Event path:', e.composedPath());
}, true);

// Puis cliquez sur un lien
// Vérifiez que e.target est bien le <a> et non un parent
```

### Cause Possible #2 : Event Handler qui Bloque

Vérifiez si un `onClick` parent appelle `e.stopPropagation()` :

```javascript
// Chercher dans le code
grep -r "stopPropagation" frontend/components/common/
```

### Cause Possible #3 : CSS Global

Vérifiez les styles globaux :

```bash
# Chercher des règles qui pourraient bloquer les liens
grep -r "pointer-events: none" frontend/
grep -r "user-select: none" frontend/
```

## 🚀 Solution Rapide

Si rien ne fonctionne, testez avec un lien minimal :

```typescript
// Remplacer temporairement MessageWithLinks par :
<div>
  Regarde ce site <a 
    href="https://example.com" 
    target="_blank"
    style={{ color: 'blue', textDecoration: 'underline', cursor: 'pointer', zIndex: 9999, position: 'relative' }}
    onClick={(e) => {
      e.stopPropagation();
      console.log('LINK CLICKED!');
    }}
  >
    https://example.com
  </a>
</div>
```

Si ce lien minimal fonctionne, le problème est dans MessageWithLinks.
Si ce lien minimal ne fonctionne pas, le problème est dans un parent.

## 📊 Tests à Effectuer

### Test 1 : Page de Test Isolée
```
URL: http://localhost:3100/test-links
Résultat attendu: Tous les liens sont cliquables et en bleu
```

### Test 2 : Message avec Lien Normal
```
1. Envoyer: "Regarde https://google.com"
2. Le message devrait s'afficher avec "Regarde mshy://<token>"
3. Le lien mshy:// devrait être cliquable en bleu
4. Clic → Enregistre le clic → Redirige vers google.com
```

### Test 3 : Message Existant
```
1. Aller sur: http://localhost:3100/conversations/68c1820be96c1b1c944351a7
2. Trouver un message avec un lien
3. Hover → La couleur change
4. Clic → S'ouvre dans nouvel onglet
```

## 🔍 Commandes de Debug Utiles

### Vérifier le Parsing
```javascript
// Dans la console
import { parseMessageLinks } from '@/lib/utils/link-parser';

const content = "Regarde https://example.com et mshy://abc123";
const parts = parseMessageLinks(content);
console.log(parts);

// Devrait retourner:
// [
//   {type: 'text', content: 'Regarde '},
//   {type: 'url', content: 'https://example.com', originalUrl: '...'},
//   {type: 'text', content: ' et '},
//   {type: 'mshy-link', content: 'mshy://abc123', token: 'abc123'}
// ]
```

### Vérifier les TrackingLinks en BD
```bash
# Se connecter à MongoDB
mongo meeshy

# Compter les TrackingLinks
db.TrackingLink.countDocuments()

# Voir les derniers liens créés
db.TrackingLink.find().sort({createdAt: -1}).limit(5).pretty()

# Voir les messages avec des liens
db.Message.find({content: /mshy:\/\//}).limit(5).pretty()
```

## ✅ Validation Finale

Quand tout fonctionne, vous devriez voir :

1. ✅ Les liens sont **bleus** (ou blancs pour vos propres messages)
2. ✅ Les liens ont une **icône** (🔗)
3. ✅ Au **hover**, la couleur change
4. ✅ Le **curseur** devient une main
5. ✅ Au **clic**, logs dans la console
6. ✅ Le lien **s'ouvre** dans un nouvel onglet
7. ✅ Pour les liens `mshy://`, le clic est **enregistré** en BD

## 📝 Rapport de Bug

Si le problème persiste, fournir :

1. **Screenshot** du message avec le lien
2. **Console logs** (F12 → Console)
3. **HTML inspect** (F12 → Elements → copier le HTML du lien)
4. **Computed styles** (F12 → Elements → Computed)
5. **Network tab** lors du clic (pour voir si l'API est appelée)

---

**Date**: 14 Octobre 2025  
**Status**: 🔧 En Debug

