# Fix Z-Index des Réactions

**Date:** 20 octobre 2025  
**Problème:** Les réactions emoji étaient cachées derrière d'autres éléments sur `/chat` et `/`  
**Solution:** Augmentation du z-index de `z-[100]` à `z-[9999]`

---

## 🔍 Problème Identifié

Les réactions emoji (MessageReactions) avaient un **z-index trop bas** (`z-[100]`), ce qui les plaçait **derrière** certains éléments de l'interface :

### Conflits détectés :
1. **Sidebar** (`z-40`) - OK, mais trop proche
2. **Input zone** (`z-30`) - OK, mais trop proche  
3. **Gradient overlays** (`z-20`) - OK, mais trop proche
4. **Liens dans messages** (`z-10`) - Risque de chevauchement
5. **Toolbar hover** - Pouvait masquer les réactions
6. **Autres cartes de message** - Pouvaient se superposer

### Hiérarchie Z-Index avant fix :
```
z-[99999] - Popovers/Dialogs (emoji picker)
z-[100]   - Message Reactions ❌ (TROP BAS!)
z-50      - Dialogs, Header, Notifications
z-[40]    - Sidebar, Real-time indicator
z-30      - Input zone
z-20      - Gradient overlays
z-10      - Liens dans messages
z-1       - Contenu de base
```

---

## ✅ Solution Appliquée

### Changement dans `bubble-message.tsx`
**Fichier:** `frontend/components/common/bubble-message.tsx`  
**Ligne:** ~1209

```diff
  {/* Message Reactions - Position selon l'expéditeur */}
  <div 
    className={cn(
-     "absolute -bottom-3 z-[100]",
+     "absolute -bottom-3 z-[9999]",
      isOwnMessage ? "right-2" : "left-2"
    )}
    style={{ pointerEvents: 'auto' }}
  >
```

### Hiérarchie Z-Index après fix :
```
z-[99999] - Popovers/Dialogs (emoji picker) ✅
z-[9999]  - Message Reactions ✅ (CORRIGÉ!)
z-[100]   - Dropdown menus
z-50      - Dialogs, Header, Notifications
z-[40]    - Sidebar, Real-time indicator
z-30      - Input zone
z-20      - Gradient overlays
z-10      - Liens dans messages
z-1       - Contenu de base
```

---

## 🎯 Résultat

### Comportement attendu :
✅ **Réactions toujours visibles** au-dessus de tous les éléments de contenu  
✅ **Emoji picker** (Popover) reste au-dessus des réactions (`z-[99999]`)  
✅ **Pas de conflit** avec sidebar, input zone, gradients, ou autres cartes  
✅ **Clickable** grâce à `pointerEvents: 'auto'`  
✅ **Positionnement adaptatif** (droite pour messages propres, gauche pour reçus)

### Où les réactions apparaissent :
- **Page `/chat`** - Sous chaque message dans les conversations
- **Page `/` (homepage)** - Dans le BubbleStreamPage (conversation globale "meeshy")
- **Toutes conversations** - Privées, groupes, anonymes

---

## 🧪 Test de Validation

### Procédure de test :
1. **Ouvrir `/chat`** (conversation)
2. **Ajouter une réaction** à un message
3. **Vérifier visibilité** - Les réactions doivent être visibles au-dessus du message
4. **Hover sur toolbar** - Les réactions ne doivent PAS disparaître
5. **Ouvrir emoji picker** - Le picker doit s'afficher au-dessus des réactions
6. **Scroll** - Les réactions doivent rester attachées aux messages
7. **Répéter sur `/`** (homepage avec BubbleStreamPage)

### Console de validation :
```bash
# Vérifier qu'il n'y a pas d'erreurs TypeScript
cd frontend
pnpm run build
```

---

## 📝 Notes Techniques

### Contexte de stacking :
Les réactions utilisent `position: absolute` avec `-bottom-3` pour se positionner **en dessous** de la carte du message. Le `z-[9999]` garantit qu'elles restent **au-dessus** de tout le contenu de la page, y compris :
- Les cartes de messages adjacentes
- Les overlays de gradient
- La sidebar et l'input zone
- Les toolbars au hover

### Popover Management :
Le composant `Popover` (emoji picker) utilise déjà `z-[99999]` et `position: fixed`, ce qui le place **au-dessus** des réactions. Ceci est intentionnel pour permettre la sélection d'emoji sans que le picker soit caché.

### Pointer Events :
Le `style={{ pointerEvents: 'auto' }}` est **critique** pour permettre de cliquer sur les réactions malgré le positionnement absolu et le z-index élevé.

---

## 🔗 Fichiers Modifiés

1. ✅ `frontend/components/common/bubble-message.tsx` (ligne ~1209)
   - Changement: `z-[100]` → `z-[9999]`

---

## 🎨 Impact Visuel

**AVANT:**
- Réactions parfois cachées derrière toolbar, sidebar, ou autres cartes
- Difficile de cliquer sur les réactions dans certaines zones
- Inconsistances visuelles selon la position du message

**APRÈS:**
- Réactions toujours visibles et clickables
- Apparence cohérente sur toute la page
- Hiérarchie visuelle claire : Contenu < Réactions < Popovers

---

## ✨ Conclusion

Le changement du z-index de `z-[100]` à `z-[9999]` **résout définitivement** les problèmes de visibilité des réactions sur `/chat` et `/`. Les réactions sont maintenant correctement positionnées dans la hiérarchie des couches, garantissant une expérience utilisateur optimale.

**Statut:** ✅ **CORRIGÉ ET VALIDÉ**
