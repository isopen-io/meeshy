import { PrismaClient } from '@meeshy/shared/prisma/client';
import { TrackingLink, TrackingLinkClick } from '@meeshy/shared/types/tracking-link';

/**
 * Service pour gérer les liens de tracking
 */
export class TrackingLinkService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Génère un token unique de 6 caractères
   */
  private generateToken(): string {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < 6; i++) {
      token += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return token;
  }

  /**
   * Construit l'URL complète d'un lien de tracking selon l'environnement
   * Utilise FRONTEND_URL de l'environnement ou fallback sur localhost
   */
  public buildTrackingUrl(token: string): string {
    const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3100';
    return `${frontendUrl}/l/${token}`;
  }

  /**
   * Construit le format court m+<token> pour les messages
   */
  public buildShortFormat(token: string): string {
    return `m+${token}`;
  }

  /**
   * Vérifie si un token existe déjà
   */
  private async tokenExists(token: string): Promise<boolean> {
    const existing = await this.prisma.trackingLink.findUnique({
      where: { token }
    });
    return !!existing;
  }

  /**
   * Génère un token unique qui n'existe pas encore
   */
  private async generateUniqueToken(): Promise<string> {
    let token: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      token = this.generateToken();
      attempts++;
      
      if (attempts >= maxAttempts) {
        throw new Error('Unable to generate unique token after maximum attempts');
      }
    } while (await this.tokenExists(token));

    return token;
  }

  /**
   * Crée un lien de tracking pour une URL
   */
  async createTrackingLink(params: {
    originalUrl: string;
    name?: string;
    campaign?: string;
    source?: string;
    medium?: string;
    createdBy?: string;
    conversationId?: string;
    messageId?: string;
    expiresAt?: Date;
    customToken?: string;
  }): Promise<TrackingLink> {
    let token: string;

    if (params.customToken) {
      if (await this.tokenExists(params.customToken)) {
        throw new Error('Token already exists');
      }
      token = params.customToken;
    } else {
      token = await this.generateUniqueToken();
    }
    // Ne stocker que le chemin relatif, pas le domaine complet
    // Cela permet une flexibilité totale (dev, staging, production, custom domains)
    const shortUrl = `/l/${token}`;

    const trackingLink = await this.prisma.trackingLink.create({
      data: {
        token,
        name: params.name,
        campaign: params.campaign,
        source: params.source,
        medium: params.medium,
        originalUrl: params.originalUrl,
        shortUrl,
        createdBy: params.createdBy,
        conversationId: params.conversationId,
        messageId: params.messageId,
        expiresAt: params.expiresAt,
        isActive: true,
        totalClicks: 0,
        uniqueClicks: 0
      }
    });

    return trackingLink as TrackingLink;
  }

  /**
   * Récupère un lien de tracking par son token
   */
  async getTrackingLinkByToken(token: string): Promise<TrackingLink | null> {
    const trackingLink = await this.prisma.trackingLink.findUnique({
      where: { token }
    });

    return trackingLink as TrackingLink | null;
  }

  /**
   * Vérifie si un lien de tracking existe pour une URL donnée
   */
  async findExistingTrackingLink(originalUrl: string, conversationId?: string): Promise<TrackingLink | null> {
    const where: any = {
      originalUrl,
      isActive: true
    };

    if (conversationId) {
      where.conversationId = conversationId;
    }

    const trackingLink = await this.prisma.trackingLink.findFirst({
      where
    });

    return trackingLink as TrackingLink | null;
  }

  /**
   * Enregistre un clic sur un lien de tracking
   */
  async recordClick(params: {
    token: string;
    userId?: string;
    anonymousId?: string;
    ipAddress?: string;
    country?: string;
    city?: string;
    region?: string;
    userAgent?: string;
    browser?: string;
    os?: string;
    device?: string;
    language?: string;
    languages?: string;
    referrer?: string;
    deviceFingerprint?: string;
    screenResolution?: string;
    viewportSize?: string;
    pixelRatio?: number;
    colorDepth?: number;
    timezone?: string;
    connectionType?: string;
    connectionSpeed?: number;
    touchSupport?: boolean;
    platform?: string;
    cookiesEnabled?: boolean;
    hardwareConcurrency?: number;
    deviceMemory?: number;
    socialSource?: string;
    utmClickSource?: string;
    utmClickMedium?: string;
    utmClickCampaign?: string;
    utmClickTerm?: string;
    utmClickContent?: string;
  }): Promise<{ trackingLink: TrackingLink; click: TrackingLinkClick }> {
    // Vérifier que le lien existe et est actif
    const trackingLink = await this.getTrackingLinkByToken(params.token);
    
    if (!trackingLink) {
      throw new Error('Tracking link not found');
    }

    if (!trackingLink.isActive) {
      throw new Error('Tracking link is inactive');
    }

    if (trackingLink.expiresAt && new Date() > trackingLink.expiresAt) {
      throw new Error('Tracking link has expired');
    }

    // Vérifier si c'est un clic unique (basé sur IP + device fingerprint)
    const isUnique = await this.isUniqueClick(
      trackingLink.id,
      params.ipAddress,
      params.deviceFingerprint
    );

    // Enregistrer le clic
    const click = await this.prisma.trackingLinkClick.create({
      data: {
        trackingLinkId: trackingLink.id,
        userId: params.userId,
        anonymousId: params.anonymousId,
        ipAddress: params.ipAddress,
        country: params.country,
        city: params.city,
        region: params.region,
        userAgent: params.userAgent,
        browser: params.browser,
        os: params.os,
        device: params.device,
        language: params.language,
        languages: params.languages,
        referrer: params.referrer,
        deviceFingerprint: params.deviceFingerprint,
        screenResolution: params.screenResolution,
        viewportSize: params.viewportSize,
        pixelRatio: params.pixelRatio,
        colorDepth: params.colorDepth,
        timezone: params.timezone,
        connectionType: params.connectionType,
        connectionSpeed: params.connectionSpeed,
        touchSupport: params.touchSupport,
        platform: params.platform,
        cookiesEnabled: params.cookiesEnabled,
        hardwareConcurrency: params.hardwareConcurrency,
        deviceMemory: params.deviceMemory,
        socialSource: params.socialSource,
        utmClickSource: params.utmClickSource,
        utmClickMedium: params.utmClickMedium,
        utmClickCampaign: params.utmClickCampaign,
        utmClickTerm: params.utmClickTerm,
        utmClickContent: params.utmClickContent,
      }
    });

    // Mettre à jour les statistiques du lien
    const updatedLink = await this.prisma.trackingLink.update({
      where: { id: trackingLink.id },
      data: {
        totalClicks: { increment: 1 },
        uniqueClicks: isUnique ? { increment: 1 } : undefined,
        lastClickedAt: new Date()
      }
    });

    return {
      trackingLink: updatedLink as TrackingLink,
      click: click as TrackingLinkClick
    };
  }

  /**
   * Vérifie si un clic est unique
   */
  private async isUniqueClick(
    trackingLinkId: string,
    ipAddress?: string,
    deviceFingerprint?: string
  ): Promise<boolean> {
    if (!ipAddress && !deviceFingerprint) {
      return false;
    }

    const where: any = {
      trackingLinkId
    };

    if (deviceFingerprint) {
      where.deviceFingerprint = deviceFingerprint;
    } else if (ipAddress) {
      where.ipAddress = ipAddress;
    }

    const existingClick = await this.prisma.trackingLinkClick.findFirst({
      where
    });

    return !existingClick;
  }

  /**
   * Met à jour le statut de redirection d'un clic
   */
  async updateRedirectStatus(clickId: string, trackingLinkId: string, status: string): Promise<void> {
    await this.prisma.trackingLinkClick.update({
      where: { id: clickId, trackingLinkId },
      data: { redirectStatus: status }
    });
  }

  /**
   * Récupère les statistiques d'un lien de tracking
   */
  async getTrackingLinkStats(token: string, params?: {
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    trackingLink: TrackingLink;
    totalClicks: number;
    uniqueClicks: number;
    clicksByCountry: { [country: string]: number };
    clicksByDevice: { [device: string]: number };
    clicksByBrowser: { [browser: string]: number };
    clicksByOS: { [os: string]: number };
    clicksByLanguage: { [language: string]: number };
    clicksByHour: { [hour: string]: number };
    clicksBySocialSource: { [source: string]: number };
    clicksByDate: { [date: string]: number };
    topReferrers: { referrer: string; count: number }[];
    confirmedClicks: number;
  }> {
    const trackingLink = await this.getTrackingLinkByToken(token);
    
    if (!trackingLink) {
      throw new Error('Tracking link not found');
    }

    // Construire la requête de filtrage
    const where: any = {
      trackingLinkId: trackingLink.id
    };

    if (params?.startDate || params?.endDate) {
      where.clickedAt = {};
      if (params.startDate) {
        where.clickedAt.gte = params.startDate;
      }
      if (params.endDate) {
        where.clickedAt.lte = params.endDate;
      }
    }

    // Récupérer tous les clics
    const clicks = await this.prisma.trackingLinkClick.findMany({
      where
    });

    // Calculer les statistiques
    const clicksByCountry: { [country: string]: number } = {};
    const clicksByDevice: { [device: string]: number } = {};
    const clicksByBrowser: { [browser: string]: number } = {};
    const clicksByOS: { [os: string]: number } = {};
    const clicksByLanguage: { [language: string]: number } = {};
    const clicksByHour: { [hour: string]: number } = {};
    const clicksBySocialSource: { [source: string]: number } = {};
    const clicksByDate: { [date: string]: number } = {};
    const referrerCounts: { [referrer: string]: number } = {};

    clicks.forEach(click => {
      // Par pays
      if (click.country) {
        clicksByCountry[click.country] = (clicksByCountry[click.country] || 0) + 1;
      }

      // Par appareil
      if (click.device) {
        clicksByDevice[click.device] = (clicksByDevice[click.device] || 0) + 1;
      }

      // Par navigateur
      if (click.browser) {
        clicksByBrowser[click.browser] = (clicksByBrowser[click.browser] || 0) + 1;
      }

      // Par OS
      if (click.os) {
        clicksByOS[click.os] = (clicksByOS[click.os] || 0) + 1;
      }

      // Par langue
      if (click.language) {
        clicksByLanguage[click.language] = (clicksByLanguage[click.language] || 0) + 1;
      }

      // Par heure (0-23)
      const hour = click.clickedAt.getHours().toString().padStart(2, '0');
      clicksByHour[hour] = (clicksByHour[hour] || 0) + 1;

      // Par source sociale
      if (click.socialSource) {
        clicksBySocialSource[click.socialSource] = (clicksBySocialSource[click.socialSource] || 0) + 1;
      }

      // Par date
      const dateKey = click.clickedAt.toISOString().split('T')[0];
      clicksByDate[dateKey] = (clicksByDate[dateKey] || 0) + 1;

      // Par referrer
      if (click.referrer) {
        referrerCounts[click.referrer] = (referrerCounts[click.referrer] || 0) + 1;
      }
    });

    // Top referrers
    const topReferrers = Object.entries(referrerCounts)
      .map(([referrer, count]) => ({ referrer, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Compter les clics uniques
    const uniqueIps = new Set<string>();
    const uniqueFingerprints = new Set<string>();
    clicks.forEach(click => {
      if (click.ipAddress) uniqueIps.add(click.ipAddress);
      if (click.deviceFingerprint) uniqueFingerprints.add(click.deviceFingerprint);
    });

    const uniqueClicks = Math.max(uniqueIps.size, uniqueFingerprints.size);

    const confirmedClicks = clicks.filter(click => click.redirectStatus === 'confirmed').length;

    return {
      trackingLink: trackingLink as TrackingLink,
      totalClicks: clicks.length,
      uniqueClicks,
      confirmedClicks,
      clicksByCountry,
      clicksByDevice,
      clicksByBrowser,
      clicksByOS,
      clicksByLanguage,
      clicksByHour,
      clicksBySocialSource,
      clicksByDate,
      topReferrers
    };
  }

  /**
   * Récupère tous les liens de tracking d'un utilisateur
   */
  async getUserTrackingLinks(userId: string): Promise<TrackingLink[]> {
    const links = await this.prisma.trackingLink.findMany({
      where: {
        createdBy: userId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return links as TrackingLink[];
  }

  /**
   * Récupère tous les liens de tracking d'une conversation
   */
  async getConversationTrackingLinks(conversationId: string): Promise<TrackingLink[]> {
    const links = await this.prisma.trackingLink.findMany({
      where: {
        conversationId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return links as TrackingLink[];
  }

  /**
   * Désactive un lien de tracking
   */
  async deactivateTrackingLink(token: string): Promise<TrackingLink> {
    const updatedLink = await this.prisma.trackingLink.update({
      where: { token },
      data: {
        isActive: false
      }
    });

    return updatedLink as TrackingLink;
  }

  /**
   * Supprime un lien de tracking (et ses clics associés)
   */
  async deleteTrackingLink(token: string): Promise<void> {
    const trackingLink = await this.getTrackingLinkByToken(token);
    
    if (!trackingLink) {
      throw new Error('Tracking link not found');
    }

    // Supprimer d'abord tous les clics associés
    await this.prisma.trackingLinkClick.deleteMany({
      where: {
        trackingLinkId: trackingLink.id
      }
    });

    // Puis supprimer le lien
    await this.prisma.trackingLink.delete({
      where: {
        token
      }
    });
  }

  /**
   * Récupère tous les tracking links (admin) avec pagination et recherche
   */
  async getAllTrackingLinks(params: {
    limit: number;
    offset: number;
    search?: string;
  }): Promise<{ trackingLinks: any[]; total: number }> {
    const where: any = {};

    if (params.search) {
      where.OR = [
        { token: { contains: params.search, mode: 'insensitive' } },
        { name: { contains: params.search, mode: 'insensitive' } },
        { originalUrl: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [trackingLinks, total] = await Promise.all([
      this.prisma.trackingLink.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.offset,
        take: params.limit,
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
            }
          }
        }
      }),
      this.prisma.trackingLink.count({ where })
    ]);

    return { trackingLinks, total };
  }

  /**
   * Récupère les clics individuels d'un tracking link (admin)
   */
  async getTrackingLinkClicks(trackingLinkId: string, limit: number, offset: number): Promise<{ clicks: TrackingLinkClick[]; total: number }> {
    const where = { trackingLinkId };

    const [clicks, total] = await Promise.all([
      this.prisma.trackingLinkClick.findMany({
        where,
        orderBy: { clickedAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.trackingLinkClick.count({ where })
    ]);

    return { clicks: clicks as TrackingLinkClick[], total };
  }

  /**
   * Traite le contenu d'un message : détecte les liens, crée des TrackingLinks, et remplace les liens par mshy://<token>
   */
  /**
   * Process [[url]] and <url> syntax in message content to create tracking links
   * This method only processes URLs wrapped in [[]] or <>, not raw URLs
   * Reuses existing tokens for identical URLs within the same message
   */
  async processExplicitLinksInContent(params: {
    content: string;
    conversationId: string;
    messageId?: string;
    createdBy?: string;
  }): Promise<{ processedContent: string; trackingLinks: TrackingLink[] }> {
    const { content, conversationId, messageId, createdBy } = params;

    let processedContent = content;
    const trackingLinks: TrackingLink[] = [];
    const protectedItems: Array<{ placeholder: string; original: string }> = [];
    let placeholderCounter = 0;

    // Track URLs already processed in this message to reuse tokens
    const urlTokenMap = new Map<string, string>();

    // STEP 1: Protect markdown links [text](url) from conversion
    const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
    processedContent = processedContent.replace(MARKDOWN_LINK_REGEX, (match) => {
      const placeholder = `__PROTECTED_MD_${placeholderCounter++}__`;
      protectedItems.push({ placeholder, original: match });
      return placeholder;
    });

    // STEP 2: Process [[url]] - Force tracking
    const DOUBLE_BRACKET_REGEX = /\[\[(https?:\/\/[^\]]+)\]\]/gi;
    const doubleBracketMatches = [...processedContent.matchAll(DOUBLE_BRACKET_REGEX)];

    for (const match of doubleBracketMatches) {
      const fullMatch = match[0];
      const url = match[1];

      try {
        let token: string;

        // Check if we already processed this URL in this message
        if (urlTokenMap.has(url)) {
          token = urlTokenMap.get(url)!;
          console.log(`[TrackingLinkService] Reusing token ${token} for duplicate URL: ${url}`);
        } else {
          // Find or create tracking link
          let trackingLink = await this.findExistingTrackingLink(url, conversationId);

          if (!trackingLink) {
            trackingLink = await this.createTrackingLink({
              originalUrl: url,
              conversationId,
              messageId,
              createdBy
            });
          }

          token = trackingLink.token;
          trackingLinks.push(trackingLink);
          urlTokenMap.set(url, token);
        }

        const meeshyShortLink = `m+${token}`;
        processedContent = processedContent.replace(fullMatch, meeshyShortLink);
      } catch (linkError) {
        console.error(`[TrackingLinkService] Error processing [[url]]:`, linkError);
        // On error, replace with URL without brackets
        processedContent = processedContent.replace(fullMatch, url);
      }
    }

    // STEP 3: Process <url> - Force tracking
    const ANGLE_BRACKET_REGEX = /<(https?:\/\/[^>]+)>/gi;
    const angleBracketMatches = [...processedContent.matchAll(ANGLE_BRACKET_REGEX)];

    for (const match of angleBracketMatches) {
      const fullMatch = match[0];
      const url = match[1];

      try {
        let token: string;

        // Check if we already processed this URL in this message
        if (urlTokenMap.has(url)) {
          token = urlTokenMap.get(url)!;
          console.log(`[TrackingLinkService] Reusing token ${token} for duplicate URL: ${url}`);
        } else {
          // Find or create tracking link
          let trackingLink = await this.findExistingTrackingLink(url, conversationId);

          if (!trackingLink) {
            trackingLink = await this.createTrackingLink({
              originalUrl: url,
              conversationId,
              messageId,
              createdBy
            });
          }

          token = trackingLink.token;
          trackingLinks.push(trackingLink);
          urlTokenMap.set(url, token);
        }

        const meeshyShortLink = `m+${token}`;
        processedContent = processedContent.replace(fullMatch, meeshyShortLink);
      } catch (linkError) {
        console.error(`[TrackingLinkService] Error processing <url>:`, linkError);
        // On error, replace with URL without angle brackets
        processedContent = processedContent.replace(fullMatch, url);
      }
    }

    // STEP 4: Restore protected markdown links
    for (const { placeholder, original } of protectedItems) {
      processedContent = processedContent.replace(placeholder, original);
    }

    return { processedContent, trackingLinks };
  }

  async processMessageLinks(params: {
    content: string;
    conversationId?: string;
    messageId?: string;
    createdBy?: string;
  }): Promise<{ processedContent: string; trackingLinks: TrackingLink[] }> {
    const { content, conversationId, messageId, createdBy } = params;

    // Regex pour détecter les liens HTTP(S)
    const urlRegex = /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*))/gi;
    
    // Regex pour détecter les liens de tracking existants (à ignorer)
    // Support n'importe quel domaine avec /l/<token> (flexible pour dev, staging, production)
    const trackingLinkRegex = /https?:\/\/[^\/]+\/l\/([a-zA-Z0-9_-]{2,50})/gi;
    const mshyShortRegex = /\bm\+([a-zA-Z0-9_-]{2,50})\b/gi;

    const trackingLinks: TrackingLink[] = [];
    let processedContent = content;

    // Trouver tous les liens dans le message
    const matches = content.match(urlRegex);
    
    if (!matches || matches.length === 0) {
      return { processedContent: content, trackingLinks: [] };
    }


    // Traiter chaque lien
    for (const url of matches) {
      // Ignorer les liens de tracking existants (n'importe quel domaine/l/<token> ou m+<token>)
      trackingLinkRegex.lastIndex = 0;
      mshyShortRegex.lastIndex = 0;
      
      if (trackingLinkRegex.test(url) || mshyShortRegex.test(url)) {
        continue;
      }

      try {
        // Vérifier si un lien existe déjà pour cette URL dans cette conversation
        let trackingLink = await this.findExistingTrackingLink(url, conversationId);

        if (!trackingLink) {
          // Créer un nouveau lien de tracking
          trackingLink = await this.createTrackingLink({
            originalUrl: url,
            conversationId,
            messageId, // Note: messageId n'est pas encore disponible, sera null
            createdBy
          });
        } else {
        }

        trackingLinks.push(trackingLink);

        // Remplacer le lien par m+<token> (format court)
        const replacement = `m+${trackingLink.token}`;
        processedContent = processedContent.replace(url, replacement);

      } catch (error) {
        console.error(`[TrackingLinkService] Error processing link ${url}:`, error);
        // En cas d'erreur, on garde le lien original
      }
    }


    return { processedContent, trackingLinks };
  }

  /**
   * Met à jour le messageId d'un ou plusieurs TrackingLinks après création du message
   */
  async updateTrackingLinksMessageId(tokens: string[], messageId: string): Promise<void> {
    if (!tokens || tokens.length === 0) return;

    await this.prisma.trackingLink.updateMany({
      where: {
        token: { in: tokens }
      },
      data: {
        messageId
      }
    });

  }

  /**
   * Met à jour un lien de tracking
   */
  async updateTrackingLink(params: {
    token: string;
    originalUrl?: string;
    expiresAt?: Date | null;
    isActive?: boolean;
    newToken?: string;
  }): Promise<TrackingLink> {
    const trackingLink = await this.getTrackingLinkByToken(params.token);

    if (!trackingLink) {
      throw new Error('Tracking link not found');
    }

    // Si un nouveau token est fourni, vérifier qu'il n'existe pas déjà
    if (params.newToken && params.newToken !== params.token) {
      const existingWithNewToken = await this.tokenExists(params.newToken);
      if (existingWithNewToken) {
        throw new Error('Token already exists');
      }
    }

    // Mettre à jour le lien
    const updateData: any = {};

    if (params.originalUrl !== undefined) {
      updateData.originalUrl = params.originalUrl;
    }
    if (params.expiresAt !== undefined) {
      updateData.expiresAt = params.expiresAt;
    }
    if (params.isActive !== undefined) {
      updateData.isActive = params.isActive;
    }
    if (params.newToken && params.newToken !== params.token) {
      updateData.token = params.newToken;
      updateData.shortUrl = `/l/${params.newToken}`;
    }

    const updatedLink = await this.prisma.trackingLink.update({
      where: { token: params.token },
      data: updateData
    });

    return updatedLink as TrackingLink;
  }

  /**
   * Vérifie si un token est disponible
   */
  async isTokenAvailable(token: string): Promise<boolean> {
    return !(await this.tokenExists(token));
  }
}

