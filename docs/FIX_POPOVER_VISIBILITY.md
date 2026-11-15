# Fix Popover Visibility - Toujours Visible à l'Écran

**Date**: 20 Octobre 2025  
**Branch**: feature/selective-improvements  
**Status**: ✅ COMPLETE

## 🎯 Problème

Les popovers de réaction (emoji picker) et de traduction sortaient de l'écran, particulièrement sur mobile, rendant certaines fonctionnalités inaccessibles.

## 🔧 Solution Implémentée

### 1. Popover de Traduction (`bubble-message.tsx`)

**Changements**:
- ✅ Largeur réduite sur mobile : `w-[min(calc(100vw-24px),280px)]` au lieu de `w-[calc(100vw-32px)]`
- ✅ Padding de collision optimisé : `{ top: 80, right: 12, bottom: 80, left: 12 }`
- ✅ Style inline pour forcer `maxWidth: 'calc(100vw - 24px)'`

**Résultat**: Le popover de traduction reste toujours visible avec une marge de 12px de chaque côté sur mobile.

### 2. Popover de Réaction / Emoji Picker (`bubble-message.tsx`)

**Changements**:
- ✅ Classe `max-w-[calc(100vw-24px)]` ajoutée au PopoverContent
- ✅ Padding de collision ajouté : `{ top: 80, right: 12, bottom: 80, left: 12 }`
- ✅ Style inline pour garantir `maxWidth: 'calc(100vw - 24px)'`
- ✅ Classe passée au composant EmojiPicker

### 3. Composant EmojiPicker (`emoji-picker.tsx`)

**Changements**:
- ✅ Largeur responsive : `max-w-[min(320px,calc(100vw-24px))]`
- ✅ Style inline avec `maxWidth: 'min(320px, calc(100vw - 24px))'`

**Résultat**: L'emoji picker a une largeur maximale de 320px sur desktop, mais se réduit automatiquement sur mobile pour laisser 24px de marge.

### 4. Composant Popover Base (`popover.tsx`)

**Changements**:
- ✅ Support du prop `style` pour permettre les surcharges
- ✅ Défaut `maxWidth: 'calc(100vw - 24px)'` pour tous les popovers
- ✅ Merge avec les styles personnalisés via spread operator

**Résultat**: Protection globale pour tous les popovers de l'application.

## 📱 Comportement Responsive

### Desktop (>640px)
- Popover de traduction : 270-294px de largeur
- Emoji picker : 320px de largeur max
- Positionnement libre avec collision detection

### Mobile (<640px)
- Popover de traduction : max 280px avec marge 12px de chaque côté
- Emoji picker : max 320px avec marge 12px de chaque côté
- Repositionnement automatique si collision détectée
- Toujours visible grâce aux contraintes CSS

## 🎨 CSS Classes Utilisées

```css
/* Traduction Popover */
w-[min(calc(100vw-24px),280px)] /* Mobile: min(viewport - 24px, 280px) */
sm:w-[270px]                     /* Small: 270px */
md:w-[294px]                     /* Medium: 294px */

/* Emoji Picker */
max-w-[min(320px,calc(100vw-24px))] /* Toujours visible avec marge */

/* Popover Base */
style={{ maxWidth: 'calc(100vw - 24px)' }} /* Protection globale */
```

## ✅ Tests Recommandés

1. **Mobile (iPhone SE, 375px)**:
   - ✅ Ouvrir popover de traduction depuis un message à gauche
   - ✅ Ouvrir popover de traduction depuis un message à droite
   - ✅ Ouvrir emoji picker depuis un message à gauche
   - ✅ Ouvrir emoji picker depuis un message à droite

2. **Tablet (iPad, 768px)**:
   - ✅ Vérifier le positionnement optimal
   - ✅ Tester la collision detection

3. **Desktop (>1024px)**:
   - ✅ Vérifier que la largeur normale est respectée
   - ✅ Tester tous les côtés (top, bottom, left, right)

## 🔍 Détails Techniques

### Collision Detection (Radix UI)
```typescript
avoidCollisions={true}          // Active la détection de collision
sticky="always"                 // Reste collé au trigger
collisionPadding={{             // Marges minimales
  top: 80, 
  right: 12, 
  bottom: 80, 
  left: 12 
}}
```

### Calcul de Largeur Dynamique
```typescript
// CSS calc() avec min() pour garantir la visibilité
width: min(
  320px,                        // Largeur idéale
  calc(100vw - 24px)           // Largeur maximale (viewport - marges)
)
```

## 🚀 Impact

- ✅ **Accessibilité**: Toutes les fonctionnalités sont accessibles sur mobile
- ✅ **UX**: Pas de frustration avec des popovers coupés
- ✅ **Performance**: Pas d'impact (calculs CSS natifs)
- ✅ **Maintenabilité**: Solution simple et réutilisable

## 📝 Notes

- La solution utilise CSS natif (`min()`, `calc()`) pour éviter le JavaScript
- Les marges de 12px garantissent une lisibilité même sur les plus petits écrans
- Le `collisionPadding` évite que les popovers touchent les bords du viewport
- La propriété `avoidCollisions` de Radix UI gère automatiquement le repositionnement

## 🎉 Résultat Final

**TOUS LES POPOVERS RESTENT TOUJOURS VISIBLES À L'ÉCRAN**, quelle que soit la taille de l'écran ou la position du message déclencheur.
