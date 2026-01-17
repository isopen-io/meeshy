# AttachmentCarousel Module

Système modulaire pour afficher et gérer les pièces jointes dans un carousel compact.

## Architecture

### Composant Principal
- `AttachmentCarousel.tsx` (192 lignes) - Point d'entrée orchestrant les hooks et rendus

### Composants UI
- `FilePreviewCard.tsx` - Carte de prévisualisation pour chaque fichier
- `AudioFilePreview.tsx` - Lecteur audio inline avec contrôles
- `MediaViewers.tsx` - Viewers pour images, vidéos et documents
- `LightboxRenderers.tsx` - Gestion dynamique des lightbox (PDF, Text, PPTX, Markdown)

### Hooks Personnalisés
- `useThumbnails.ts` - Génération et cleanup des miniatures d'images
- `useFileUrls.ts` - Gestion des URLs blob pour différents types de fichiers
- `useLightboxState.ts` - État centralisé pour toutes les lightbox

### Types
- `types.ts` - Interfaces TypeScript partagées

## Fonctionnalités

### Optimisations Performance
- Génération asynchrone de miniatures en batch
- Détection d'appareils bas de gamme pour adapter la qualité
- React.memo sur tous les composants
- Cleanup automatique des URLs blob
- Dynamic import des lightbox (SSR-safe)

### Types de Fichiers Supportés
- **Images** : Aperçu miniature + lightbox
- **Vidéos** : Player compact + lightbox plein écran
- **Audio** : Lecteur inline avec forme d'onde
- **PDF** : Icône + lightbox avec viewer
- **Texte** : Icône + lightbox avec coloration syntaxique
- **PPTX** : Icône + lightbox de présentation
- **Markdown** : Icône + lightbox avec rendu

### Accessibilité
- Rôles ARIA appropriés
- Navigation clavier complète
- Tooltips informatifs
- Focus management

## API

### Props du Composant Principal

```typescript
interface AttachmentCarouselProps {
  files: File[];
  onRemove: (index: number) => void;
  uploadProgress?: { [key: number]: number };
  disabled?: boolean;
  audioRecorderSlot?: React.ReactNode;
}
```

### Utilisation

```tsx
import { AttachmentCarousel } from '@/components/attachments/AttachmentCarousel';

<AttachmentCarousel
  files={files}
  onRemove={(index) => handleRemove(index)}
  uploadProgress={{ 0: 50, 1: 100 }}
  disabled={false}
  audioRecorderSlot={<AudioRecorder />}
/>
```

## Métriques

- **Fichier principal** : 192 lignes (vs 905 avant)
- **Réduction** : ~78% du fichier principal
- **Total module** : 1037 lignes réparties sur 9 fichiers
- **Maintenabilité** : Chaque fichier < 250 lignes

## Avantages de la Structure

1. **Séparation des responsabilités** : Chaque composant a un rôle unique
2. **Réutilisabilité** : Hooks et composants isolés réutilisables
3. **Testabilité** : Chaque module peut être testé indépendamment
4. **Code splitting** : Dynamic imports réduisent le bundle initial
5. **Type safety** : Types centralisés et réutilisés
6. **Maintenabilité** : Modifications localisées, impacts réduits
