/**
 * Utilitaire professionnel pour les images Open Graph
 * Architecture simple avec 3 images SVG statiques
 * 
 * Images disponibles:
 * - meeshy-og-default.svg: Pages génériques et accueil
 * - meeshy-og-signin.svg: Pages de connexion/inscription sans affiliation
 * - meeshy-og-affiliate.svg: Pages avec liens d'affiliation/parrainage
 */

export type OgImageType = 'default' | 'signin' | 'affiliate';

/**
 * Configuration des images Open Graph
 */
export const OG_IMAGE_CONFIG = {
  default: {
    path: '/meeshy-og-default.svg',
    width: 1200,
    height: 630,
    alt: 'Meeshy - Messagerie Multilingue en Temps Réel',
  },
  signin: {
    path: '/meeshy-og-signin.svg',
    width: 1200,
    height: 630,
    alt: 'Inscription sur Meeshy - Rejoignez la communauté mondiale',
  },
  affiliate: {
    path: '/meeshy-og-affiliate.svg',
    width: 1200,
    height: 630,
    alt: 'Rejoignez Meeshy par invitation - Programme de parrainage',
  },
} as const;

/**
 * Obtient l'URL complète de l'image Open Graph
 * @param type Type d'image (default, signin, affiliate)
 * @param frontendUrl URL du frontend (optionnel, utilise NEXT_PUBLIC_FRONTEND_URL par défaut)
 * @returns URL complète de l'image
 */
export function getOgImageUrl(
  type: OgImageType = 'default',
  frontendUrl?: string
): string {
  const baseUrl = frontendUrl || process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://meeshy.me';
  const config = OG_IMAGE_CONFIG[type] || OG_IMAGE_CONFIG.default;
  return `${baseUrl}${config.path}`;
}

/**
 * Obtient la configuration complète de l'image OG
 * @param type Type d'image
 * @param frontendUrl URL du frontend (optionnel)
 * @returns Configuration complète (url, width, height, alt)
 */
export function getOgImageConfig(
  type: OgImageType = 'default',
  frontendUrl?: string
) {
  const config = OG_IMAGE_CONFIG[type] || OG_IMAGE_CONFIG.default;
  return {
    url: getOgImageUrl(type, frontendUrl),
    width: config.width,
    height: config.height,
    alt: config.alt,
  };
}

/**
 * Détermine le type d'image OG basé sur le contexte de la page
 * Logique de détection:
 * - /signin avec paramètre affiliate → affiliate
 * - /signin/affiliate/[token] → affiliate
 * - /signin ou /join sans affiliation → signin
 * - Autres pages → default
 * 
 * @param path Chemin de la page
 * @param searchParams Paramètres de recherche (pour détecter ?affiliate=xxx)
 * @returns Type d'image approprié
 */
export function getOgImageTypeFromContext(
  path: string,
  searchParams?: URLSearchParams | Record<string, string>
): OgImageType {
  // Vérifier si c'est un lien d'affiliation
  const hasAffiliateParam = searchParams 
    ? (searchParams instanceof URLSearchParams 
        ? searchParams.has('affiliate')
        : 'affiliate' in searchParams)
    : false;
    
  const isAffiliatePath = path.includes('/affiliate');
  
  if (hasAffiliateParam || isAffiliatePath) {
    return 'affiliate';
  }
  
  // Vérifier si c'est une page de connexion/inscription
  if (path.includes('/signin') || path.includes('/join')) {
    return 'signin';
  }
  
  // Par défaut
  return 'default';
}

/**
 * Utilitaire pour construire les métadonnées Open Graph complètes
 * @param type Type d'image OG
 * @param options Options de personnalisation
 * @returns Objet de métadonnées Open Graph
 */
export function buildOgMetadata(
  type: OgImageType,
  options: {
    title?: string;
    description?: string;
    url?: string;
    frontendUrl?: string;
  } = {}
) {
  const imageConfig = getOgImageConfig(type, options.frontendUrl);
  
  return {
    images: [
      {
        url: imageConfig.url,
        width: imageConfig.width,
        height: imageConfig.height,
        alt: imageConfig.alt,
      },
    ],
    ...(options.title && { title: options.title }),
    ...(options.description && { description: options.description }),
    ...(options.url && { url: options.url }),
    siteName: 'Meeshy',
    locale: 'fr_FR',
    type: 'website' as const,
  };
}
