# Images Open Graph Simplifiées - Meeshy

## 📖 Vue d'ensemble

Le système d'images Open Graph de Meeshy a été **simplifié** pour utiliser 3 images SVG statiques au lieu de générer des images dynamiquement. Cette approche offre de meilleures performances et une maintenance simplifiée.

## 🎨 Images Statiques Disponibles

### 1. **meeshy-og-default.svg**
- **Usage**: Page d'accueil, pages génériques
- **Chemin**: `/images/meeshy-og-default.svg`
- **Description**: Image par défaut avec le logo Meeshy

### 2. **meeshy-og-signin.svg**
- **Usage**: Pages de connexion/inscription, liens de jointure
- **Chemin**: `/images/meeshy-og-signin.svg`
- **Description**: Image optimisée pour l'inscription

### 3. **meeshy-og-affiliate.svg**
- **Usage**: Liens d'affiliation
- **Chemin**: `/images/meeshy-og-affiliate.svg`
- **Description**: Image pour les invitations parrainage

## 🛠️ Utilisation

### Import de l'utilitaire

```typescript
import { getOgImageUrl, OgImageType } from '@/lib/og-images';
```

### Obtenir une URL d'image OG

```typescript
// Image par défaut
const imageUrl = getOgImageUrl('default');
// https://meeshy.me/images/meeshy-og-default.svg

// Image signin
const signinUrl = getOgImageUrl('signin');
// https://meeshy.me/images/meeshy-og-signin.svg

// Image affiliate
const affiliateUrl = getOgImageUrl('affiliate');
// https://meeshy.me/images/meeshy-og-affiliate.svg

// Avec URL frontend personnalisée
const customUrl = getOgImageUrl('default', 'https://custom-domain.com');
// https://custom-domain.com/images/meeshy-og-default.svg
```

### Détection automatique basée sur le chemin

```typescript
import { getOgImageTypeFromPath } from '@/lib/og-images';

const type = getOgImageTypeFromPath('/signin/affiliate/abc123');
// Retourne: 'affiliate'

const type2 = getOgImageTypeFromPath('/join/xyz789');
// Retourne: 'signin'

const type3 = getOgImageTypeFromPath('/conversation/myconv');
// Retourne: 'default'
```

## 📋 Métadonnées Open Graph

### Exemple de métadonnées complètes

```typescript
import { Metadata } from 'next';
import { getOgImageUrl } from '@/lib/og-images';

export const metadata: Metadata = {
  title: 'Titre de la page',
  description: 'Description de la page',
  openGraph: {
    title: 'Titre OG',
    description: 'Description OG',
    url: 'https://meeshy.me/page',
    siteName: 'Meeshy',
    images: [
      {
        url: getOgImageUrl('default'),
        width: 1200,
        height: 630,
        alt: 'Description de l\'image',
      },
    ],
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Titre Twitter',
    description: 'Description Twitter',
    images: [getOgImageUrl('default')],
    creator: '@meeshy_app',
  },
};
```

## 🚀 Migration depuis le système dynamique

### Ancien système (à supprimer)
```typescript
// ❌ Ancien: Génération dynamique complexe
const imageUrl = `/api/og-image-dynamic?type=affiliate&title=${title}&subtitle=${subtitle}&userAvatar=${avatar}`;
```

### Nouveau système (simplifié)
```typescript
// ✅ Nouveau: Images statiques
import { getOgImageUrl } from '@/lib/og-images';
const imageUrl = getOgImageUrl('affiliate');
```

## 📁 Structure des fichiers

```
frontend/
├── public/
│   └── images/
│       ├── meeshy-og-default.svg      ← Image par défaut
│       ├── meeshy-og-signin.svg       ← Image inscription
│       └── meeshy-og-affiliate.svg    ← Image affiliation
├── lib/
│   └── og-images.ts                   ← Utilitaire simplifié
└── app/
    ├── api/
    │   └── metadata/
    │       └── route.ts               ← API métadonnées (simplifié)
    └── [pages]/
        └── layout.tsx                 ← Utilise getOgImageUrl()
```

## ✅ Avantages de l'approche simplifiée

### 1. **Performance**
- ✅ Pas de génération d'image à la volée
- ✅ Images servies directement depuis les assets statiques
- ✅ Cache HTTP natif
- ✅ Chargement ultra-rapide

### 2. **Maintenance**
- ✅ Fichiers SVG facilement modifiables
- ✅ Pas de logique de génération complexe
- ✅ Design centralisé et cohérent

### 3. **Fiabilité**
- ✅ Pas de risque d'échec de génération
- ✅ Comportement prévisible
- ✅ Tests simplifiés

### 4. **Simplicité**
- ✅ 3 images au lieu de code complexe
- ✅ Facile à comprendre et maintenir
- ✅ Moins de dépendances

## 🎯 Cas d'usage par type

### Type: `default`
**Quand l'utiliser:**
- Page d'accueil
- Pages de conversation
- Toutes les pages qui ne nécessitent pas d'image spéciale

**Exemple:**
```typescript
export const metadata: Metadata = {
  openGraph: {
    images: [{ url: getOgImageUrl('default') }],
  },
};
```

### Type: `signin`
**Quand l'utiliser:**
- Pages de connexion/inscription
- Pages de jointure (`/join/[linkId]`)
- Création de compte

**Exemple:**
```typescript
export const metadata: Metadata = {
  openGraph: {
    images: [{ url: getOgImageUrl('signin') }],
  },
};
```

### Type: `affiliate`
**Quand l'utiliser:**
- Liens d'affiliation (`/signin/affiliate/[token]`)
- Invitations de parrainage
- Programmes d'affiliation

**Exemple:**
```typescript
export const metadata: Metadata = {
  openGraph: {
    images: [{ url: getOgImageUrl('affiliate') }],
  },
};
```

## 🔧 Personnalisation des images

Pour modifier les images, éditez les fichiers SVG dans `public/images/`:

1. **meeshy-og-default.svg**: Logo et branding principal
2. **meeshy-og-signin.svg**: Visuel d'inscription/connexion
3. **meeshy-og-affiliate.svg**: Visuel d'invitation/parrainage

### Recommandations pour les images

- **Dimensions**: 1200x630 pixels (ratio 1.91:1)
- **Format**: SVG pour la scalabilité
- **Couleurs**: Respecter la charte graphique Meeshy
- **Texte**: Minimal, lisible sur tous les fonds

## 📊 Comparaison Ancien vs Nouveau

| Aspect | Ancien (Dynamique) | Nouveau (Statique) |
|--------|-------------------|-------------------|
| **Performance** | Génération à chaque requête | Serveur statique |
| **Complexité** | Code de génération complexe | 3 fichiers SVG |
| **Maintenance** | Difficile à modifier | Édition directe SVG |
| **Fiabilité** | Risque d'échec | 100% fiable |
| **Cache** | Cache API | Cache HTTP natif |
| **Personnalisation** | Par paramètres URL | Par image |

## 🧹 Nettoyage de l'ancien système

### Fichiers à supprimer (optionnel)
- `/app/api/og-image-dynamic/route.tsx` - Génération dynamique
- `/app/test-dynamic-images/page.tsx` - Page de test

### Fichiers à conserver
- `/app/api/metadata/route.ts` - API métadonnées (mise à jour)
- `/lib/og-images.ts` - Nouvel utilitaire simplifié
- `/public/images/meeshy-og-*.svg` - Images statiques

## 📝 Checklist de migration

- [x] Créer l'utilitaire `/lib/og-images.ts`
- [x] Mettre à jour `/app/api/metadata/route.ts`
- [x] Mettre à jour `/app/signin/layout.tsx`
- [x] Mettre à jour `/app/signin/affiliate/[token]/page.tsx`
- [ ] Vérifier toutes les pages utilisant des images OG
- [ ] Tester le partage sur Facebook/Twitter/LinkedIn
- [ ] Supprimer l'ancien système de génération dynamique
- [ ] Mettre à jour la documentation du projet

## 🧪 Tests

### Test manuel
1. Ouvrir l'outil de validation Facebook: https://developers.facebook.com/tools/debug/
2. Tester les URLs:
   - `https://meeshy.me` (default)
   - `https://meeshy.me/signin` (signin)
   - `https://meeshy.me/signin/affiliate/[token]` (affiliate)

### Vérifications
- ✅ L'image s'affiche correctement
- ✅ Les dimensions sont 1200x630
- ✅ Le texte est lisible
- ✅ Les couleurs respectent la charte

## 💡 Conseils

1. **Images SVG**: Préférez SVG pour la scalabilité
2. **Fallback JPG**: Gardez des versions JPG pour compatibilité
3. **Texte dans l'image**: Minimum de texte, l'essentiel est dans les métadonnées
4. **Test social**: Testez sur plusieurs plateformes (Facebook, Twitter, LinkedIn)

---

**Meeshy - Messagerie Multilingue Simplifiée** 🌐
