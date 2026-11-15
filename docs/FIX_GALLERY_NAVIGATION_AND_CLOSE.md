# Fix: Navigation et bouton de fermeture dans la galerie d'images

## Problèmes

1. **Bouton "Aller au message" ne fonctionnait pas** : Cliquer dessus ne menait pas au message dans la conversation
2. **Deux croix de fermeture** : Une croix superflue s'affichait par-dessus la croix personnalisée

## Causes

### Problème 1 : Navigation non implémentée

**Fichier:** `frontend/components/common/bubble-stream-page.tsx` (lignes 237-241)

Le handler `handleNavigateToMessageFromGallery` était un placeholder qui ne faisait qu'un `console.log` :

```typescript
const handleNavigateToMessageFromGallery = useCallback((messageId: string) => {
  setGalleryOpen(false);
  // TODO: Implémenter le scroll vers le message et le highlight
  console.log('Navigate to message from gallery:', messageId);  // ❌ Pas de navigation réelle
}, []);
```

### Problème 2 : Bouton de fermeture par défaut

**Fichier:** `frontend/components/attachments/AttachmentGallery.tsx` (ligne 133)

Le composant `DialogContent` de Radix UI affiche **par défaut** un bouton de fermeture dans le coin supérieur droit, qui s'ajoutait à notre bouton personnalisé :

```typescript
<DialogContent className="...">  {/* showCloseButton = true par défaut */}
  {/* Notre header avec bouton de fermeture personnalisé */}
  <div className="...">
    <Button onClick={onClose}>
      <X />  {/* Notre croix personnalisée */}
    </Button>
  </div>
</DialogContent>
```

Résultat : **Deux croix affichées** 🔴🔴

## Solutions

### 1. Implémenter la navigation vers le message

**Fichier:** `frontend/components/common/bubble-stream-page.tsx` (lignes 237-266)

```typescript
const handleNavigateToMessageFromGallery = useCallback((messageId: string) => {
  console.log('🖼️ Navigation vers le message depuis la galerie:', messageId);
  
  // Fermer la galerie
  setGalleryOpen(false);
  
  // Attendre que la galerie se ferme avant de scroller
  setTimeout(() => {
    // Chercher l'élément du message dans le DOM
    const messageElement = document.getElementById(`message-${messageId}`);
    
    if (messageElement) {
      // Scroll vers le message avec animation
      messageElement.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
      
      // Highlight temporaire du message (2 secondes)
      messageElement.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
      setTimeout(() => {
        messageElement.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
      }, 2000);
      
      console.log('✅ Scroll vers le message effectué');
    } else {
      console.warn('⚠️ Message non trouvé dans le DOM:', messageId);
    }
  }, 300); // Délai pour laisser le dialog se fermer
}, []);
```

**Fonctionnement :**
1. Ferme la galerie
2. Attend 300ms (temps pour l'animation de fermeture)
3. Cherche le message dans le DOM via `document.getElementById(`message-${messageId}`)`
4. Scroll vers le message avec animation douce
5. Ajoute un highlight bleu temporaire (2 secondes)
6. Retire le highlight automatiquement

### 2. Désactiver le bouton de fermeture par défaut

**Fichier:** `frontend/components/attachments/AttachmentGallery.tsx` (ligne 133)

```typescript
<DialogContent 
  className="max-w-6xl h-[90vh] p-0 bg-black/95 dark:bg-black border-none" 
  showCloseButton={false}  // ✅ AJOUTÉ: Désactiver le bouton par défaut
>
  {/* Notre header avec bouton de fermeture personnalisé */}
  <div className="...">
    <Button onClick={onClose} title="Fermer">  {/* Ajout du title */}
      <X />
    </Button>
  </div>
</DialogContent>
```

**Résultat :** Une seule croix affichée ✅

## Validation

Le composant `DialogContent` dans `frontend/components/ui/dialog.tsx` (ligne 52) supporte bien le prop `showCloseButton` :

```typescript
function DialogContent({
  className,
  children,
  showCloseButton = true,  // Par défaut: true
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content {...props}>
        {children}
        {showCloseButton && (  // ✅ Conditionnel
          <DialogPrimitive.Close>
            <XIcon />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}
```

## Résultat

✅ **Bouton "Aller au message" fonctionnel** : Scroll vers le message avec highlight  
✅ **Une seule croix de fermeture** : Bouton par défaut désactivé  
✅ **Animation fluide** : Scroll doux et highlight temporaire  
✅ **Feedback visuel** : L'utilisateur voit clairement où est le message  
✅ **Logs de debug** : Console logs pour tracer les actions  

## Flux de navigation

```
1. Utilisateur clique sur "Aller au message" dans la galerie
   ↓
2. handleGoToMessage() appelé
   ├─ onNavigateToMessage(currentAttachment.messageId)
   ├─ onClose()
   ↓
3. handleNavigateToMessageFromGallery() appelé avec messageId
   ├─ setGalleryOpen(false) → Ferme la galerie
   ↓
4. setTimeout(300ms) → Attend que le dialog se ferme
   ↓
5. document.getElementById(`message-${messageId}`)
   ├─ Cherche le message dans le DOM
   ↓
6. messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
   ├─ Scroll vers le message
   ↓
7. Ajout des classes CSS pour highlight
   ├─ ring-2, ring-blue-500, ring-offset-2
   ├─ Visible pendant 2 secondes
   ↓
8. Retrait automatique des classes
   ├─ setTimeout(2000ms)
   ✅ Message trouvé et highlighté
```

## Tests à effectuer

### Test 1 : Navigation depuis la galerie
1. Ouvrir la galerie d'images dans `/chat`
2. Cliquer sur "Aller au message"
3. Vérifier :
   - ✅ La galerie se ferme
   - ✅ Le scroll va vers le message
   - ✅ Le message est highlighté en bleu pendant 2 secondes
   - ✅ Logs dans console : `🖼️ Navigation vers le message depuis la galerie: ...`

### Test 2 : Bouton de fermeture unique
1. Ouvrir la galerie
2. Vérifier visuellement :
   - ✅ Une seule croix (X) dans le coin supérieur droit
   - ✅ Pas de deuxième croix par-dessus

### Test 3 : Navigation avec plusieurs images
1. Conversation avec 5 images
2. Ouvrir la galerie sur l'image 3
3. Naviguer vers l'image 5 avec les flèches
4. Cliquer "Aller au message"
5. Vérifier :
   - ✅ Va vers le message contenant l'image 5 (pas l'image 3)

### Test 4 : Message hors de la vue
1. Scroller en bas de la conversation
2. Ouvrir une image d'un message en haut
3. Cliquer "Aller au message"
4. Vérifier :
   - ✅ Scroll vers le haut
   - ✅ Message centré dans la vue
   - ✅ Highlight visible

## Détails techniques

### ID des messages dans le DOM

Chaque message a un ID unique dans le DOM grâce à `BubbleMessage` :

```typescript
// frontend/components/common/bubble-message.tsx (ligne 470)
<div 
  id={`message-${message.id}`}  // ✅ ID unique pour chaque message
  ref={messageRef}
  className="..."
>
  {/* Contenu du message */}
</div>
```

### Classes CSS pour le highlight

Le highlight utilise les classes Tailwind :
- `ring-2` : Bordure de 2px
- `ring-blue-500` : Couleur bleue
- `ring-offset-2` : Espace entre la bordure et l'élément

**Effet visuel :** Une bordure bleue lumineuse autour du message pendant 2 secondes.

### Timing

- **300ms** : Délai pour laisser le dialog se fermer complètement
- **2000ms** : Durée du highlight visuel

Ces valeurs peuvent être ajustées si nécessaire.

## Code modifié

### Frontend modifié
- `frontend/components/attachments/AttachmentGallery.tsx` (ligne 133)
- `frontend/components/common/bubble-stream-page.tsx` (lignes 237-266)

### Pas de modification backend
Ce fix est purement frontend.

## Fixes liés

Cette correction complète la galerie d'images :

| Problème | Fix | Document |
|----------|-----|----------|
| **Accès refusé pour anonymes** | Utiliser attachments des messages | `FIX_GALLERY_USE_MESSAGE_ATTACHMENTS.md` |
| **Navigation non fonctionnelle** | Implémenter scroll + highlight | `FIX_GALLERY_NAVIGATION_AND_CLOSE.md` (ce document) |
| **Deux boutons de fermeture** | Désactiver le bouton par défaut | `FIX_GALLERY_NAVIGATION_AND_CLOSE.md` (ce document) |

## Date

2025-10-16

