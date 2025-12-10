# Fonctionnalité de Recadrage d'Avatar

## Vue d'ensemble

Cette fonctionnalité permet aux utilisateurs de recadrer, zoomer et tourner leurs images de profil avant de les télécharger. Elle offre une expérience utilisateur optimale pour créer des avatars parfaitement cadrés.

## Technologies utilisées

- **react-easy-crop** (v5.5.3) - Bibliothèque légère pour le recadrage d'images
- **@radix-ui/react-slider** (v1.3.6) - Composant de curseur pour les contrôles de zoom et rotation
- **Canvas API** - Pour générer l'image recadrée

## Architecture

### Composants

#### 1. `AvatarCropDialog` (`frontend/components/settings/avatar-crop-dialog.tsx`)

Dialogue modal qui permet le recadrage interactif de l'image.

**Props:**
- `open: boolean` - Contrôle l'affichage du dialogue
- `onClose: () => void` - Callback appelé à la fermeture
- `imageSrc: string` - URL de l'image source (data URL)
- `onCropComplete: (file: File) => void` - Callback avec le fichier recadré
- `isUploading?: boolean` - État de téléchargement

**Fonctionnalités:**
- Zone de recadrage circulaire (1:1)
- Contrôle de zoom (1x - 3x)
- Contrôle de rotation (0° - 360°)
- Bouton de réinitialisation
- Prévisualisation en temps réel
- Instructions utilisateur

#### 2. Utilitaires de recadrage (`frontend/utils/image-crop.ts`)

Fonctions helper pour le traitement d'images:

- `createImage(url: string): Promise<HTMLImageElement>` - Crée une image à partir d'une URL
- `getRadianAngle(degreeValue: number): number` - Convertit les degrés en radians
- `rotateSize(width, height, rotation)` - Calcule les dimensions après rotation
- `getCroppedImg(imageSrc, pixelCrop, rotation, fileName): Promise<CroppedPixels>` - Génère l'image recadrée
- `cleanupObjectUrl(url: string): void` - Nettoie les URLs blob

#### 3. Composant Slider (`frontend/components/ui/slider.tsx`)

Composant UI basé sur Radix UI pour les contrôles de zoom et rotation.

### Intégration dans UserSettings

Le composant `UserSettings` a été mis à jour pour intégrer le dialogue de recadrage:

```typescript
// Flux de téléchargement d'avatar
1. L'utilisateur sélectionne une image
2. L'image est validée (type, taille)
3. Le dialogue de recadrage s'ouvre
4. L'utilisateur ajuste l'image (zoom, rotation, position)
5. L'image recadrée est générée en tant que File
6. Le fichier est uploadé vers l'API Next.js (/api/upload/avatar)
7. L'URL est envoyée au backend (/users/me/avatar)
8. L'avatar de l'utilisateur est mis à jour
```

## Traductions

Les traductions pour le dialogue de recadrage sont disponibles en anglais et français:

### Clés de traduction (dans `settings` namespace)

- `cropAvatarTitle` - Titre du dialogue
- `zoom` - Label du contrôle de zoom
- `rotation` - Label du contrôle de rotation
- `reset` - Bouton de réinitialisation
- `cancel` - Bouton d'annulation
- `saveAvatar` - Bouton de sauvegarde
- `uploading` - Texte pendant le téléchargement
- `processing` - Texte pendant le traitement
- `cropInstructions` - Instructions d'utilisation

## Fichiers créés/modifiés

### Nouveaux fichiers
- `frontend/components/settings/avatar-crop-dialog.tsx` - Composant de dialogue de recadrage
- `frontend/utils/image-crop.ts` - Utilitaires de traitement d'images
- `frontend/components/ui/slider.tsx` - Composant Slider UI
- `frontend/locales/fr/settings.json` - Traductions françaises
- `frontend/docs/AVATAR_CROP_FEATURE.md` - Cette documentation

### Fichiers modifiés
- `frontend/components/settings/user-settings.tsx` - Intégration du dialogue de recadrage
- `frontend/locales/en/settings.json` - Ajout des traductions anglaises
- `frontend/components/ui/index.ts` - Export du composant Slider
- `frontend/package.json` - Ajout des dépendances

## Dépendances ajoutées

```json
{
  "react-easy-crop": "^5.5.3",
  "@radix-ui/react-slider": "^1.3.6"
}
```

## Utilisation

### Pour l'utilisateur final

1. Allez dans **Paramètres** → **Profil**
2. Cliquez sur **"Télécharger une image"**
3. Sélectionnez une image depuis votre ordinateur
4. Le dialogue de recadrage s'ouvre automatiquement
5. Ajustez l'image:
   - Déplacez l'image avec la souris
   - Utilisez le curseur "Zoom" pour agrandir/réduire
   - Utilisez le curseur "Rotation" pour tourner l'image
   - Cliquez sur "Réinitialiser" pour revenir aux valeurs par défaut
6. Cliquez sur "Enregistrer" pour télécharger l'image recadrée
7. L'avatar est automatiquement mis à jour

### Pour les développeurs

Pour utiliser le composant AvatarCropDialog dans d'autres contextes:

```typescript
import { AvatarCropDialog } from '@/components/settings/avatar-crop-dialog';

function MyComponent() {
  const [showDialog, setShowDialog] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);

  const handleCropComplete = async (croppedFile: File) => {
    setIsUploading(true);
    try {
      // Télécharger le fichier recadré
      await uploadFile(croppedFile);
      setShowDialog(false);
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AvatarCropDialog
      open={showDialog}
      onClose={() => setShowDialog(false)}
      imageSrc={imageSrc}
      onCropComplete={handleCropComplete}
      isUploading={isUploading}
    />
  );
}
```

## Optimisations

### Performance
- L'image recadrée est générée en qualité JPEG 95% pour un bon équilibre taille/qualité
- Les URLs blob sont nettoyées après utilisation pour éviter les fuites mémoire
- Le composant utilise `useCallback` pour optimiser les rendus

### UX
- Prévisualisation en temps réel des ajustements
- Indication visuelle pendant le traitement et le téléchargement
- Instructions claires pour guider l'utilisateur
- Validation de fichier avant l'ouverture du dialogue

### Accessibilité
- Tous les contrôles sont accessibles au clavier
- Labels descriptifs pour les lecteurs d'écran
- Contraste de couleurs respectant les standards WCAG

## Tests recommandés

### Tests fonctionnels
- [ ] Sélection d'une image déclenche le dialogue
- [ ] Zoom fonctionne correctement (1x - 3x)
- [ ] Rotation fonctionne correctement (0° - 360°)
- [ ] Réinitialisation restaure les valeurs par défaut
- [ ] L'image recadrée est correctement générée
- [ ] Le téléchargement fonctionne avec l'image recadrée
- [ ] L'avatar est mis à jour après le téléchargement

### Tests de validation
- [ ] Fichiers invalides sont rejetés avant le dialogue
- [ ] Fichiers trop volumineux sont rejetés
- [ ] Types de fichiers non supportés sont rejetés

### Tests d'interface
- [ ] Le dialogue est responsive (mobile, tablette, desktop)
- [ ] Les traductions s'affichent correctement (EN/FR)
- [ ] Les boutons sont désactivés pendant le téléchargement
- [ ] Les messages d'erreur s'affichent correctement

### Tests de performance
- [ ] Pas de fuite mémoire avec de multiples uploads
- [ ] Performance acceptable avec des images de grande taille
- [ ] Génération de l'image recadrée < 2s

## Améliorations futures possibles

1. **Support de plus de formats**
   - Permettre PNG avec transparence
   - Support de WebP

2. **Préréglages de recadrage**
   - Formats Instagram (1:1)
   - Formats Twitter (400x400)
   - Formats LinkedIn (300x300)

3. **Filtres d'image**
   - Luminosité
   - Contraste
   - Saturation

4. **Ajustements avancés**
   - Recadrage libre (non carré)
   - Redimensionnement automatique
   - Compression personnalisable

5. **Drag & drop**
   - Permettre le glisser-déposer d'images
   - Support de plusieurs images

## Support

Pour toute question ou problème:
- Consultez les logs du navigateur pour les erreurs
- Vérifiez que les dépendances sont correctement installées
- Assurez-vous que les traductions sont chargées
- Vérifiez les permissions de l'API pour /api/upload/avatar

## Licence

Ce composant fait partie du projet Meeshy et suit la même licence que le projet principal.

