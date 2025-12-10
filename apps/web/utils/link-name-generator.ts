/**
 * Générateur de noms de liens de partage automatiques
 * Génère des noms descriptifs basés sur le type de canal/destinataires
 * Format: "Canal [type] - [durée]" ou "Lien [limite] - [durée]"
 * Limite automatiquement à 32 caractères maximum
 */

export interface LinkNameOptions {
  conversationTitle: string;
  language?: string;
  durationDays?: number;
  maxParticipants?: number;
  maxUses?: number;
  isPublic?: boolean;
  /**
   * Contexte de partage du lien (où il sera diffusé)
   * Exemples: 'linkedin', 'whatsapp', 'facebook', 'family', 'community', 'team', 'public', 'private'
   */
  sharingContext?: string;
}

const MAX_LINK_NAME_LENGTH = 32;

/**
 * Génère un nom de lien basé sur le canal de diffusion et les destinataires
 * Format attendu: "Lien LinkedIn (Titre conversation) - 7j"
 * Contient le titre de la conversation entre parenthèses
 */
export function generateLinkName(options: LinkNameOptions): string {
  const {
    conversationTitle,
    language = 'fr',
    durationDays,
    maxParticipants,
    maxUses,
    isPublic = true,
    sharingContext
  } = options;

  // Déterminer le type de canal/destinataires
  const channelType = getChannelType(maxParticipants, maxUses, isPublic, language, sharingContext);

  // Déterminer la durée courte
  const shortDuration = getShortDuration(durationDays, language);

  // Tronquer le titre de la conversation si trop long
  const maxTitleLength = 20;
  let truncatedTitle = conversationTitle;
  if (conversationTitle.length > maxTitleLength) {
    truncatedTitle = conversationTitle.substring(0, maxTitleLength - 3) + '...';
  }

  // Construire le nom avec le titre de la conversation entre parenthèses
  const linkName = `${channelType} (${truncatedTitle}) - ${shortDuration}`;

  // S'assurer que le résultat ne dépasse pas 60 caractères (augmenté pour inclure le titre)
  const MAX_TOTAL_LENGTH = 60;
  if (linkName.length > MAX_TOTAL_LENGTH) {
    return linkName.substring(0, MAX_TOTAL_LENGTH - 3) + '...';
  }

  return linkName;
}

/**
 * Retourne le nom du contexte de partage selon la langue
 * Contextes supportés: linkedin, whatsapp, facebook, instagram, twitter, 
 * telegram, email, family, community, team, work, friends, public, private
 */
function getSharingContextName(context: string, language: string): string {
  const ctx = context.toLowerCase();
  
  // Mapping des contextes de partage par langue
  const contextMap: Record<string, Record<string, string>> = {
    fr: {
      linkedin: 'Lien LinkedIn',
      whatsapp: 'Lien WhatsApp',
      facebook: 'Lien Facebook',
      instagram: 'Lien Instagram',
      twitter: 'Lien Twitter/X',
      telegram: 'Lien Telegram',
      email: 'Lien Email',
      family: 'Lien Famille',
      community: 'Lien Communauté',
      team: 'Lien Équipe',
      work: 'Lien Travail',
      friends: 'Lien Amis',
      public: 'Lien Public',
      private: 'Lien Privé',
    },
    en: {
      linkedin: 'LinkedIn Link',
      whatsapp: 'WhatsApp Link',
      facebook: 'Facebook Link',
      instagram: 'Instagram Link',
      twitter: 'Twitter/X Link',
      telegram: 'Telegram Link',
      email: 'Email Link',
      family: 'Family Link',
      community: 'Community Link',
      team: 'Team Link',
      work: 'Work Link',
      friends: 'Friends Link',
      public: 'Public Link',
      private: 'Private Link',
    },
    es: {
      linkedin: 'Enlace LinkedIn',
      whatsapp: 'Enlace WhatsApp',
      facebook: 'Enlace Facebook',
      instagram: 'Enlace Instagram',
      twitter: 'Enlace Twitter/X',
      telegram: 'Enlace Telegram',
      email: 'Enlace Email',
      family: 'Enlace Familia',
      community: 'Enlace Comunidad',
      team: 'Enlace Equipo',
      work: 'Enlace Trabajo',
      friends: 'Enlace Amigos',
      public: 'Enlace Público',
      private: 'Enlace Privado',
    },
    de: {
      linkedin: 'LinkedIn-Link',
      whatsapp: 'WhatsApp-Link',
      facebook: 'Facebook-Link',
      instagram: 'Instagram-Link',
      twitter: 'Twitter/X-Link',
      telegram: 'Telegram-Link',
      email: 'E-Mail-Link',
      family: 'Familien-Link',
      community: 'Community-Link',
      team: 'Team-Link',
      work: 'Arbeits-Link',
      friends: 'Freunde-Link',
      public: 'Öffentlich',
      private: 'Privat',
    },
    it: {
      linkedin: 'Link LinkedIn',
      whatsapp: 'Link WhatsApp',
      facebook: 'Link Facebook',
      instagram: 'Link Instagram',
      twitter: 'Link Twitter/X',
      telegram: 'Link Telegram',
      email: 'Link Email',
      family: 'Link Famiglia',
      community: 'Link Comunità',
      team: 'Link Team',
      work: 'Link Lavoro',
      friends: 'Link Amici',
      public: 'Link Pubblico',
      private: 'Link Privato',
    },
    pt: {
      linkedin: 'Link LinkedIn',
      whatsapp: 'Link WhatsApp',
      facebook: 'Link Facebook',
      instagram: 'Link Instagram',
      twitter: 'Link Twitter/X',
      telegram: 'Link Telegram',
      email: 'Link Email',
      family: 'Link Família',
      community: 'Link Comunidade',
      team: 'Link Equipe',
      work: 'Link Trabalho',
      friends: 'Link Amigos',
      public: 'Link Público',
      private: 'Link Privado',
    },
    zh: {
      linkedin: 'LinkedIn链接',
      whatsapp: 'WhatsApp链接',
      facebook: 'Facebook链接',
      instagram: 'Instagram链接',
      twitter: 'Twitter/X链接',
      telegram: 'Telegram链接',
      email: '邮件链接',
      family: '家庭链接',
      community: '社区链接',
      team: '团队链接',
      work: '工作链接',
      friends: '朋友链接',
      public: '公开链接',
      private: '私密链接',
    },
    ja: {
      linkedin: 'LinkedInリンク',
      whatsapp: 'WhatsAppリンク',
      facebook: 'Facebookリンク',
      instagram: 'Instagramリンク',
      twitter: 'Twitter/Xリンク',
      telegram: 'Telegramリンク',
      email: 'メールリンク',
      family: '家族リンク',
      community: 'コミュニティリンク',
      team: 'チームリンク',
      work: '仕事リンク',
      friends: '友達リンク',
      public: '公開リンク',
      private: '非公開リンク',
    },
    ar: {
      linkedin: 'رابط LinkedIn',
      whatsapp: 'رابط WhatsApp',
      facebook: 'رابط Facebook',
      instagram: 'رابط Instagram',
      twitter: 'رابط Twitter/X',
      telegram: 'رابط Telegram',
      email: 'رابط البريد',
      family: 'رابط العائلة',
      community: 'رابط المجتمع',
      team: 'رابط الفريق',
      work: 'رابط العمل',
      friends: 'رابط الأصدقاء',
      public: 'رابط عام',
      private: 'رابط خاص',
    },
  };

  const langMap = contextMap[language] || contextMap['en'];
  return langMap[ctx] || langMap['public'] || 'Public Link';
}

/**
 * Retourne le mot "Lien" traduit selon la langue
 */
function getLinkWord(language: string): string {
  const translations: Record<string, string> = {
    fr: 'Lien',
    en: 'Link',
    es: 'Enlace',
    de: 'Link',
    it: 'Link',
    pt: 'Link',
    zh: '链接',
    ja: 'リンク',
    ar: 'رابط'
  };
  return translations[language] || translations['en'];
}

/**
 * Retourne le type de canal/destinataires selon les limites et le contexte de partage
 */
function getChannelType(
  maxParticipants: number | undefined,
  maxUses: number | undefined,
  isPublic: boolean,
  language: string,
  sharingContext?: string
): string {
  // Si un contexte de partage est spécifié, l'utiliser en priorité
  if (sharingContext) {
    return getSharingContextName(sharingContext, language);
  }

  // Pour les liens rapides sans contexte, retourner simplement "Lien" traduit
  return getLinkWord(language);
}

/**
 * Retourne la durée en format court selon la langue
 */
function getShortDuration(durationDays: number | undefined, language: string): string {
  if (!durationDays) {
    switch (language) {
      case 'fr':
        return '∞';
      case 'en':
        return '∞';
      case 'es':
        return '∞';
      case 'de':
        return '∞';
      case 'it':
        return '∞';
      case 'pt':
        return '∞';
      case 'zh':
        return '∞';
      case 'ja':
        return '∞';
      case 'ar':
        return '∞';
      default:
        return '∞';
    }
  }

  switch (language) {
    case 'fr':
      return `${durationDays}j`;
    
    case 'en':
      return `${durationDays}d`;
    
    case 'es':
      return `${durationDays}d`;
    
    case 'de':
      return `${durationDays}T`;
    
    case 'it':
      return `${durationDays}g`;
    
    case 'pt':
      return `${durationDays}d`;
    
    case 'zh':
      return `${durationDays}天`;
    
    case 'ja':
      return `${durationDays}日`;
    
    case 'ar':
      return `${durationDays}ي`;
    
    default:
      return `${durationDays}d`;
  }
}

/**
 * Génère un nom de lien simple (pour retrocompatibilité)
 * @deprecated Utilisez generateLinkName à la place
 */
export function generateSimpleLinkName(conversationTitle: string, language: string = 'fr'): string {
  return generateLinkName({
    conversationTitle,
    language,
    durationDays: 7,
    isPublic: true
  });
}
