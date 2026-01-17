# MessageAttachments Component

Composant React pour afficher les attachments dans un message avec support multi-types, lightbox, suppression et responsive design.

## Installation

```bash
# Les dépendances sont déjà installées dans le monorepo
```

## Usage basique

```typescript
import { MessageAttachments } from '@/components/attachments';

function MyComponent() {
  return (
    <MessageAttachments
      attachments={attachments}
      currentUserId={userId}
      token={authToken}
      onAttachmentDeleted={(id) => console.log('Deleted:', id)}
      isOwnMessage={true}
    />
  );
}
```

## Props

| Prop | Type | Requis | Description |
|------|------|--------|-------------|
| `attachments` | `Attachment[]` | ✅ | Liste des attachments à afficher |
| `currentUserId` | `string` | ❌ | ID de l'utilisateur courant (pour permissions) |
| `token` | `string` | ❌ | Token d'authentification (pour suppression) |
| `onAttachmentDeleted` | `(id: string) => void` | ❌ | Callback appelé après suppression |
| `isOwnMessage` | `boolean` | ❌ | Si c'est le message de l'utilisateur (alignement) |
| `onImageClick` | `(id: string) => void` | ❌ | Callback appelé au clic sur une image |

## Types d'attachments supportés

### Images
- JPG, PNG, GIF, WebP, SVG
- Affichage adaptatif selon le nombre
- Thumbnails automatiques (sauf PNG)
- Lightbox avec navigation

### Vidéos
- MP4, WebM, OGG
- Player intégré
- Lightbox plein écran
- Métadonnées (durée, codec)

### Audios
- MP3, WAV, OGG, M4A
- Player simple avec waveform
- Métadonnées vocales (si disponibles)

### Documents
- **PDF**: Viewer intégré, lightbox
- **PowerPoint**: PPT, PPTX
- **Markdown**: MD avec rendu formaté
- **Texte**: TXT, code avec coloration syntaxique

### Fichiers génériques
- Tous les autres types
- Icône selon le MIME type
- Téléchargement direct

## Exemples

### Avec tous les types

```typescript
const attachments = [
  {
    id: '1',
    mimeType: 'image/jpeg',
    originalName: 'photo.jpg',
    fileUrl: '/uploads/photo.jpg',
    thumbnailUrl: '/uploads/photo_thumb.jpg',
    fileSize: 1024000,
    width: 1920,
    height: 1080,
    uploadedBy: 'user-123',
    // ...
  },
  {
    id: '2',
    mimeType: 'video/mp4',
    originalName: 'video.mp4',
    fileUrl: '/uploads/video.mp4',
    fileSize: 5120000,
    duration: 30,
    uploadedBy: 'user-123',
    // ...
  },
  {
    id: '3',
    mimeType: 'application/pdf',
    originalName: 'document.pdf',
    fileUrl: '/uploads/document.pdf',
    fileSize: 2048000,
    uploadedBy: 'user-123',
    // ...
  }
];

<MessageAttachments
  attachments={attachments}
  currentUserId="user-123"
  token="auth-token"
  onAttachmentDeleted={(id) => {
    console.log('Supprimé:', id);
    // Mettre à jour l'état
  }}
  isOwnMessage={true}
/>
```

### Avec permissions de suppression

```typescript
// L'utilisateur peut supprimer uniquement ses propres attachments
<MessageAttachments
  attachments={attachments}
  currentUserId="user-123" // ✅ Requis pour suppression
  token="auth-token"        // ✅ Requis pour suppression
  onAttachmentDeleted={(id) => {
    // Supprimer de l'état local
    setAttachments(prev => prev.filter(a => a.id !== id));
  }}
/>
```

### Mode lecture seule

```typescript
// Sans currentUserId et token, pas de bouton de suppression
<MessageAttachments
  attachments={attachments}
  isOwnMessage={false}
/>
```

## Hooks réutilisables

### useAttachmentLightbox

Gérer l'état des lightbox.

```typescript
import { useAttachmentLightbox } from '@/components/attachments';

function MyComponent() {
  const lightbox = useAttachmentLightbox();

  return (
    <>
      <button onClick={() => lightbox.openImageLightbox(0)}>
        Ouvrir image
      </button>

      <ImageLightbox
        images={images}
        initialIndex={lightbox.imageLightbox.index}
        isOpen={lightbox.imageLightbox.isOpen}
        onClose={lightbox.closeImageLightbox}
      />
    </>
  );
}
```

### useAttachmentDeletion

Gérer la suppression d'attachments.

```typescript
import { useAttachmentDeletion } from '@/components/attachments';

function MyComponent() {
  const deletion = useAttachmentDeletion({
    token: 'auth-token',
    onAttachmentDeleted: (id) => console.log('Deleted:', id)
  });

  return (
    <>
      <button onClick={() => deletion.handleOpenDeleteConfirm(attachment)}>
        Supprimer
      </button>

      <AttachmentDeleteDialog
        attachment={deletion.attachmentToDelete}
        isDeleting={deletion.isDeleting}
        onConfirm={deletion.handleDeleteConfirm}
        onCancel={deletion.handleDeleteCancel}
      />
    </>
  );
}
```

### useResponsiveDetection

Détecter les écrans mobiles.

```typescript
import { useResponsiveDetection } from '@/components/attachments';

function MyComponent() {
  const { isMobile } = useResponsiveDetection(768);

  return (
    <div className={isMobile ? 'mobile-layout' : 'desktop-layout'}>
      {/* ... */}
    </div>
  );
}
```

## Composants individuels

Si vous avez besoin d'afficher un seul type d'attachment:

```typescript
import { ImageAttachment, VideoAttachment } from '@/components/attachments';

function MyComponent() {
  return (
    <>
      <ImageAttachment
        attachment={imageAttachment}
        canDelete={true}
        imageCount={1}
        isMobile={false}
        isOwnMessage={true}
        onImageClick={(att) => console.log('Clicked:', att)}
        onDeleteClick={(att) => console.log('Delete:', att)}
      />

      <VideoAttachment
        attachment={videoAttachment}
        canDelete={true}
        onOpenLightbox={(att) => console.log('Open lightbox:', att)}
        onDeleteClick={(att) => console.log('Delete:', att)}
      />
    </>
  );
}
```

## Utilitaires

### separateAttachmentsByType

Séparer les attachments par type.

```typescript
import { separateAttachmentsByType } from '@/components/attachments';

const attachments = [...];
const byType = separateAttachmentsByType(attachments);

console.log(byType);
// {
//   images: [...],
//   videos: [...],
//   audios: [...],
//   pdfs: [...],
//   pptxs: [...],
//   markdowns: [...],
//   texts: [...],
//   others: [...]
// }
```

## Personnalisation

### Layout personnalisé

```typescript
import { AttachmentGridLayout } from '@/components/attachments';

<AttachmentGridLayout
  attachmentCount={5}
  isOwnMessage={true}
  className="custom-class"
>
  {/* Vos composants */}
</AttachmentGridLayout>
```

### Dialog personnalisé

```typescript
import { AttachmentDeleteDialog } from '@/components/attachments';

<AttachmentDeleteDialog
  attachment={attachment}
  isDeleting={false}
  onConfirm={() => console.log('Confirmed')}
  onCancel={() => console.log('Cancelled')}
/>
```

## Performance

### Dynamic imports

Les viewers et lightbox lourds sont chargés à la demande:

```typescript
// Chargement automatique uniquement quand nécessaire
const PDFViewerWrapper = dynamic(() => import('@/components/pdf/PDFViewerWrapper'));
const ImageLightbox = dynamic(() => import('./ImageLightbox'));
```

### Lazy loading

Les images utilisent `loading="lazy"`:

```tsx
<img loading="lazy" decoding="async" ... />
```

### Memoization

Tous les composants sont optimisés:

```typescript
export const ImageAttachment = React.memo(function ImageAttachment({ ... }) {
  // ...
});
```

## Accessibilité

- Tous les boutons ont `aria-label`
- Navigation au clavier supportée
- Focus visible avec `focus-visible:ring`
- Rôles ARIA appropriés
- Tooltips informatifs

## Responsive

- Mobile: colonnes adaptatives
- Desktop: grilles optimales
- Breakpoint personnalisable (défaut: 768px)
- Tailles d'images adaptatives

## Migration depuis l'ancien composant

Aucune migration nécessaire. L'interface publique est identique:

```typescript
// Avant (857 lignes)
import { MessageAttachments } from '@/components/attachments/MessageAttachments';

// Après (250 lignes, même interface)
import { MessageAttachments } from '@/components/attachments';
```

## Troubleshooting

### Les images ne s'affichent pas

Vérifiez que `buildAttachmentsUrls()` retourne des URLs valides:

```typescript
import { buildAttachmentsUrls } from '@/utils/attachment-url';

const attachmentsWithUrls = buildAttachmentsUrls(attachments);
console.log(attachmentsWithUrls);
```

### La suppression ne fonctionne pas

Vérifiez que `currentUserId` et `token` sont fournis:

```typescript
<MessageAttachments
  attachments={attachments}
  currentUserId={userId}  // ✅ Requis
  token={authToken}       // ✅ Requis
  onAttachmentDeleted={...}
/>
```

### Le lightbox ne s'ouvre pas

Vérifiez que les imports dynamiques fonctionnent:

```bash
# Build pour vérifier le code splitting
npm run build
```

## Support

Pour toute question ou problème:

1. Consultez [ARCHITECTURE.md](./ARCHITECTURE.md)
2. Consultez [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md)
3. Ouvrez une issue sur le repo

## License

Propriétaire - Meeshy
