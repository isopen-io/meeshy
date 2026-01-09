import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { logError } from '../utils/logger';

// Schemas de validation
const joinAnonymousSchema = z.object({
  firstName: z.string().min(1, 'Le prenom est requis').max(50),
  lastName: z.string().min(1, 'Le nom est requis').max(50),
  username: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  birthday: z.string().datetime().optional().or(z.literal('')),
  language: z.string().default('fr'),
  deviceFingerprint: z.string().optional()
});

const refreshSessionSchema = z.object({
  sessionToken: z.string().min(1, 'Session token requis')
});

// Helper pour generer un sessionToken unique
function generateSessionToken(deviceFingerprint?: string): string {
  const timestamp = Date.now().toString();
  const randomPart = crypto.randomBytes(16).toString('hex');
  const devicePart = deviceFingerprint ? crypto.createHash('md5').update(deviceFingerprint).digest('hex').slice(0, 8) : '';
  return `anon_${timestamp}_${randomPart}_${devicePart}`;
}

// Helper pour generer un username automatique
function generateNickname(firstName: string, lastName: string): string {
  const cleanFirstName = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const lastNameInitials = lastName.toLowerCase().replace(/[^a-z]/g, '').slice(0, 2);
  const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${cleanFirstName}_${lastNameInitials}${randomSuffix}`;
}

// Helper pour verifier l'IP et extraire le pays (simulation)
function extractCountryFromIP(ipAddress: string): string | null {
  // En production, utiliser un service de geolocalisation IP comme MaxMind ou IP2Location
  // Pour le developpement, on simule quelques cas
  if (ipAddress.startsWith('192.168.') || ipAddress.startsWith('127.') || ipAddress.startsWith('::1')) {
    return 'FR'; // IP locale = France par defaut
  }

  // Simulation de quelques plages IP pour les tests
  const ipNum = parseInt(ipAddress.split('.')[0]) || 0;
  if (ipNum >= 1 && ipNum <= 50) return 'FR';
  if (ipNum >= 51 && ipNum <= 100) return 'GB';
  if (ipNum >= 101 && ipNum <= 150) return 'US';
  if (ipNum >= 151 && ipNum <= 200) return 'DE';

  return 'FR'; // Defaut France
}

// Helper pour verifier si une IP est dans une plage
function isIpInRange(ip: string, range: string): boolean {
  // Implementation basique pour les CIDR et plages d'IP
  if (range.includes('/')) {
    // Format CIDR (ex: 192.168.1.0/24)
    const [networkIp, prefixLength] = range.split('/');
    // Implementation simplifiee - en production utiliser une librairie dediee
    return ip.startsWith(networkIp.split('.').slice(0, Math.floor(parseInt(prefixLength) / 8)).join('.'));
  } else if (range.includes('-')) {
    // Format plage (ex: 192.168.1.1-192.168.1.100)
    const [startIp, endIp] = range.split('-');
    // Implementation simplifiee
    return ip >= startIp && ip <= endIp;
  } else {
    // IP exacte
    return ip === range;
  }
}

export async function anonymousRoutes(fastify: FastifyInstance) {
  /**
   * Resout l'ID de ConversationShareLink reel a partir d'un identifiant (peut etre un ObjectID ou un identifier)
   */
  async function resolveShareLinkId(identifier: string): Promise<string | null> {
    // Si c'est deja un ObjectID valide (24 caracteres hexadecimaux), le retourner directement
    if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
      return identifier;
    }

    // Sinon, chercher par le champ identifier
    const shareLink = await fastify.prisma.conversationShareLink.findFirst({
      where: { identifier: identifier }
    });

    return shareLink ? shareLink.id : null;
  }

  // Route pour rejoindre une conversation de maniere anonyme
  fastify.post('/anonymous/join/:linkId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { linkId } = request.params as { linkId: string };
      const body = joinAnonymousSchema.parse(request.body);
      const clientIP = request.ip || (request.headers['x-forwarded-for'] as string) || '127.0.0.1';


      // 1. Verifier que le lien existe et est valide
      const shareLink = await fastify.prisma.conversationShareLink.findUnique({
        where: { linkId },
        include: {
          conversation: {
            select: { id: true, title: true, type: true }
          }
        }
      });

      if (!shareLink) {
        return reply.status(404).send({
          success: false,
          message: 'Lien de conversation introuvable'
        });
      }

      // 2. Verifications de validite du lien
      if (!shareLink.isActive) {
        return reply.status(410).send({
          success: false,
          message: 'Ce lien n\'est plus actif'
        });
      }

      if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
        return reply.status(410).send({
          success: false,
          message: 'Ce lien a expire'
        });
      }

      if (shareLink.maxUses && shareLink.currentUses >= shareLink.maxUses) {
        return reply.status(410).send({
          success: false,
          message: 'Ce lien a atteint sa limite d\'utilisation'
        });
      }

      if (shareLink.maxConcurrentUsers && shareLink.currentConcurrentUsers >= shareLink.maxConcurrentUsers) {
        return reply.status(429).send({
          success: false,
          message: 'Nombre maximum d\'utilisateurs concurrent atteint'
        });
      }

      // 3. Verifications de securite/restrictions
      const country = extractCountryFromIP(clientIP);

      // Verifier pays autorises
      if (shareLink.allowedCountries.length > 0 && country && !shareLink.allowedCountries.includes(country)) {
        return reply.status(403).send({
          success: false,
          message: 'Acces non autorise depuis votre region'
        });
      }

      // Verifier langues autorisees
      if (shareLink.allowedLanguages.length > 0 && !shareLink.allowedLanguages.includes(body.language)) {
        return reply.status(403).send({
          success: false,
          message: 'Langue non autorisee pour ce lien'
        });
      }

      // Verifier plages IP autorisees
      if (shareLink.allowedIpRanges.length > 0) {
        const isIpAllowed = shareLink.allowedIpRanges.some(range => isIpInRange(clientIP, range));
        if (!isIpAllowed) {
          return reply.status(403).send({
            success: false,
            message: 'Acces non autorise depuis votre adresse IP'
          });
        }
      }

      // 4. Verifier si un compte est requis (bloque l'acces anonyme)
      if (shareLink.requireAccount) {
        return reply.status(403).send({
          success: false,
          message: 'Un compte est requis pour rejoindre cette conversation',
          requiresAccount: true
        });
      }

      // 5. Verifier si l'email est requis
      if (shareLink.requireEmail && (!body.email || body.email.trim() === '')) {
        return reply.status(400).send({
          success: false,
          message: 'L\'email est obligatoire pour rejoindre cette conversation'
        });
      }

      // 6. Verifier si la date de naissance est requise
      if (shareLink.requireBirthday && (!body.birthday || body.birthday.trim() === '')) {
        return reply.status(400).send({
          success: false,
          message: 'La date de naissance est obligatoire pour rejoindre cette conversation'
        });
      }

      // 7. Verifier si l'username est requis et generer le username
      let username: string;
      if (shareLink.requireNickname) {
        // Si l'username est requis, il doit etre fourni
        if (!body.username || body.username.trim() === '') {
          return reply.status(400).send({
            success: false,
            message: 'Le nom d\'utilisateur est obligatoire pour rejoindre cette conversation'
          });
        }
        username = body.username.trim();
      } else {
        // Si l'username n'est pas requis, generer automatiquement
        username = body.username?.trim() || generateNickname(body.firstName, body.lastName);
      }

      // 6. Verifier que le username n'est pas deja pris par un utilisateur enregistre
      const existingUser = await fastify.prisma.user.findFirst({
        where: {
          username: username,
          isActive: true
        }
      });

      if (existingUser) {
        // Generer un username alternatif qui ne soit pas pris par un utilisateur enregistre
        let suggestedUsername = generateNickname(body.firstName, body.lastName);
        let counter = 1;

        // Verifier si le username suggere est deja pris par un utilisateur enregistre
        while (true) {
          const existingSuggestedUser = await fastify.prisma.user.findFirst({
            where: {
              username: suggestedUsername,
              isActive: true
            }
          });

          if (!existingSuggestedUser) {
            break; // Username disponible
          }

          // Ajouter un suffixe numerique
          suggestedUsername = `${generateNickname(body.firstName, body.lastName)}${counter}`;
          counter++;
        }

        return reply.status(409).send({
          success: false,
          message: 'Ce nom d\'utilisateur est deja utilise par un membre du site',
          suggestedNickname: suggestedUsername
        });
      }

      // 7. Verifier que le username n'est pas deja pris dans cette conversation
      const existingParticipant = await fastify.prisma.anonymousParticipant.findFirst({
        where: {
          conversationId: shareLink.conversationId,
          username: username,
          isActive: true
        }
      });

      if (existingParticipant) {
        // Generer un username alternatif unique pour cette conversation
        let suggestedUsername = generateNickname(body.firstName, body.lastName);
        let counter = 1;

        // Verifier si le username suggere est deja pris et generer une alternative
        while (true) {
          // Verifier d'abord contre les utilisateurs enregistres
          const existingSuggestedUser = await fastify.prisma.user.findFirst({
            where: {
              username: suggestedUsername,
              isActive: true
            }
          });

          // Puis verifier contre les participants anonymes de cette conversation
          const existingSuggestedParticipant = await fastify.prisma.anonymousParticipant.findFirst({
            where: {
              conversationId: shareLink.conversationId,
              username: suggestedUsername,
              isActive: true
            }
          });

          if (!existingSuggestedUser && !existingSuggestedParticipant) {
            break; // Username disponible
          }

          // Ajouter un suffixe numerique
          suggestedUsername = `${generateNickname(body.firstName, body.lastName)}${counter}`;
          counter++;
        }

        return reply.status(409).send({
          success: false,
          message: 'Ce nom d\'utilisateur est deja utilise dans cette conversation',
          suggestedNickname: suggestedUsername
        });
      }

      // 8. Generer le sessionToken unique
      const sessionToken = generateSessionToken(body.deviceFingerprint);

      // 9. Creer le participant anonyme
      const anonymousParticipant = await fastify.prisma.anonymousParticipant.create({
        data: {
          conversationId: shareLink.conversationId,
          shareLinkId: shareLink.id,
          firstName: body.firstName,
          lastName: body.lastName,
          username: username,
          email: body.email || null,
          birthday: body.birthday ? new Date(body.birthday) : null,
          sessionToken: sessionToken,
          ipAddress: clientIP,
          country: country,
          language: body.language,
          deviceFingerprint: body.deviceFingerprint,
          canSendMessages: shareLink.allowAnonymousMessages,
          canSendFiles: shareLink.allowAnonymousFiles,
          canSendImages: shareLink.allowAnonymousImages
        }
      });

      // 10. Mettre a jour les compteurs du lien
      await fastify.prisma.conversationShareLink.update({
        where: { id: shareLink.id },
        data: {
          currentUses: { increment: 1 },
          currentConcurrentUsers: { increment: 1 },
          currentUniqueSessions: { increment: 1 }
        }
      });


      return reply.status(201).send({
        success: true,
        data: {
          sessionToken: sessionToken,
          participant: {
            id: anonymousParticipant.id,
            username: anonymousParticipant.username, // nickname -> username pour l'uniformite
            firstName: anonymousParticipant.firstName,
            lastName: anonymousParticipant.lastName,
            language: anonymousParticipant.language,
            isMeeshyer: false, // Utilisateur anonyme
            canSendMessages: anonymousParticipant.canSendMessages,
            canSendFiles: anonymousParticipant.canSendFiles,
            canSendImages: anonymousParticipant.canSendImages
          },
          conversation: {
            id: shareLink.conversation.id,
            title: shareLink.conversation.title,
            type: shareLink.conversation.type,
            allowViewHistory: shareLink.allowViewHistory
          },
          linkId: shareLink.linkId,
          id: shareLink.id // ID pour l'acces authentifie aux endpoints /links
        }
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Donnees invalides',
          errors: error.errors
        });
      }

      logError(fastify.log, 'Anonymous join error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Route pour rafraichir une session anonyme (maintenir la session active)
  fastify.post('/anonymous/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = refreshSessionSchema.parse(request.body);
      const clientIP = request.ip || (request.headers['x-forwarded-for'] as string) || '127.0.0.1';

      // Trouver le participant anonyme
      const participant = await fastify.prisma.anonymousParticipant.findUnique({
        where: { sessionToken: body.sessionToken },
        include: {
          shareLink: {
            include: {
              conversation: {
                select: { id: true, title: true, type: true }
              }
            }
          }
        }
      });

      if (!participant || !participant.isActive) {
        return reply.status(401).send({
          success: false,
          message: 'Session invalide ou expiree'
        });
      }

      // Verifier que le lien est toujours valide
      if (!participant.shareLink.isActive) {
        return reply.status(410).send({
          success: false,
          message: 'Le lien a ete desactive'
        });
      }

      if (participant.shareLink.expiresAt && participant.shareLink.expiresAt < new Date()) {
        return reply.status(410).send({
          success: false,
          message: 'Le lien a expire'
        });
      }

      // Mettre a jour lastActiveAt
      await fastify.prisma.anonymousParticipant.update({
        where: { id: participant.id },
        data: {
          lastActiveAt: new Date(),
          isOnline: true
        }
      });

      return reply.send({
        success: true,
        data: {
          participant: {
            id: participant.id,
            username: participant.username, // nickname -> username pour l'uniformite
            firstName: participant.firstName,
            lastName: participant.lastName,
            language: participant.language,
            isMeeshyer: false, // Utilisateur anonyme
            canSendMessages: participant.canSendMessages,
            canSendFiles: participant.canSendFiles,
            canSendImages: participant.canSendImages
          },
          conversation: {
            id: participant.shareLink.conversation.id,
            title: participant.shareLink.conversation.title,
            type: participant.shareLink.conversation.type,
            allowViewHistory: participant.shareLink.allowViewHistory
          }
        }
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Donnees invalides',
          errors: error.errors
        });
      }

      logError(fastify.log, 'Anonymous refresh error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Route pour quitter une session anonyme
  fastify.post('/anonymous/leave', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = refreshSessionSchema.parse(request.body);

      const participant = await fastify.prisma.anonymousParticipant.findUnique({
        where: { sessionToken: body.sessionToken },
        include: { shareLink: true }
      });

      if (!participant) {
        return reply.status(404).send({
          success: false,
          message: 'Session introuvable'
        });
      }

      // Marquer comme inactif et deconnecte
      await fastify.prisma.anonymousParticipant.update({
        where: { id: participant.id },
        data: {
          isActive: false,
          isOnline: false,
          leftAt: new Date()
        }
      });

      // Decrementer les compteurs du lien
      await fastify.prisma.conversationShareLink.update({
        where: { id: participant.shareLink.id },
        data: {
          currentConcurrentUsers: { decrement: 1 }
        }
      });

      return reply.send({
        success: true,
        data: { message: 'Session fermee avec succes' }
      });

    } catch (error) {
      logError(fastify.log, 'Anonymous leave error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Route pour verifier les informations d'un lien (avant de rejoindre)
  // Accepte soit un linkId (format mshy_...) soit un conversationShareLinkId (ID de base de donnees)
  fastify.get('/anonymous/link/:identifier', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { identifier } = request.params as { identifier: string };

      // Resoudre l'ID de ConversationShareLink reel
      let shareLink;

      // Si c'est un linkId au format mshy_..., chercher directement
      if (identifier.startsWith('mshy_')) {
        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { linkId: identifier },
          include: {
            conversation: {
              select: {
                id: true,
                title: true,
                description: true,
                type: true,
                createdAt: true
              }
            },
            creator: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true
              }
            }
          }
        });
      } else {
        // Sinon, resoudre l'ID (peut etre un ObjectID ou un identifier)
        const shareLinkId = await resolveShareLinkId(identifier);
        if (!shareLinkId) {
          return reply.status(404).send({
            success: false,
            message: 'Lien de partage non trouve'
          });
        }

        shareLink = await fastify.prisma.conversationShareLink.findUnique({
          where: { id: shareLinkId },
          include: {
            conversation: {
              select: {
                id: true,
                title: true,
                description: true,
                type: true,
                createdAt: true
              }
            },
            creator: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true
              }
            }
          }
        });
      }

      if (!shareLink) {
        return reply.status(404).send({
          success: false,
          message: 'Lien de conversation introuvable'
        });
      }

      // Verifications de base
      if (!shareLink.isActive) {
        return reply.status(410).send({
          success: false,
          message: 'Ce lien n\'est plus actif'
        });
      }

      if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
        return reply.status(410).send({
          success: false,
          message: 'Ce lien a expire'
        });
      }

      if (shareLink.maxUses && shareLink.currentUses >= shareLink.maxUses) {
        return reply.status(410).send({
          success: false,
          message: 'Ce lien a atteint sa limite d\'utilisation'
        });
      }

      // Recuperer les statistiques de la conversation
      const [memberCount, anonymousCount, activeMembers, activeAnonymous] = await Promise.all([
        // Nombre de membres actifs
        fastify.prisma.conversationMember.count({
          where: {
            conversationId: shareLink.conversation.id,
            isActive: true
          }
        }),
        // Nombre de participants anonymes actifs
        fastify.prisma.anonymousParticipant.count({
          where: {
            conversationId: shareLink.conversation.id,
            isActive: true
          }
        }),
        // Membres actifs avec leurs langues
        fastify.prisma.conversationMember.findMany({
          where: {
            conversationId: shareLink.conversation.id,
            isActive: true
          },
          select: {
            user: {
              select: {
                systemLanguage: true,
                regionalLanguage: true,
                customDestinationLanguage: true
              }
            }
          }
        }),
        // Participants anonymes actifs avec leurs langues
        fastify.prisma.anonymousParticipant.findMany({
          where: {
            conversationId: shareLink.conversation.id,
            isActive: true
          },
          select: {
            language: true
          }
        })
      ]);

      // Calculer le total des participants
      const totalParticipants = memberCount + anonymousCount;

      // Collecter toutes les langues uniques des participants
      const languageSet = new Set<string>();

      // Langues des membres (systeme, regionale, custom)
      activeMembers.forEach(member => {
        if (member.user.systemLanguage) languageSet.add(member.user.systemLanguage);
        if (member.user.regionalLanguage) languageSet.add(member.user.regionalLanguage);
        if (member.user.customDestinationLanguage) languageSet.add(member.user.customDestinationLanguage);
      });

      // Langues des participants anonymes
      activeAnonymous.forEach(participant => {
        if (participant.language) languageSet.add(participant.language);
      });

      // Convertir en tableau et trier
      const spokenLanguages = Array.from(languageSet).sort();
      const languageCount = spokenLanguages.length;

      return reply.send({
        success: true,
        data: {
          id: shareLink.id, // ID de la conversationShareLink pour les appels ulterieurs
          linkId: shareLink.linkId,
          name: shareLink.name,
          description: shareLink.description,
          expiresAt: shareLink.expiresAt,
          maxUses: shareLink.maxUses,
          currentUses: shareLink.currentUses,
          maxConcurrentUsers: shareLink.maxConcurrentUsers,
          currentConcurrentUsers: shareLink.currentConcurrentUsers,
          requireAccount: shareLink.requireAccount,
          requireNickname: shareLink.requireNickname,
          requireEmail: shareLink.requireEmail,
          requireBirthday: shareLink.requireBirthday,
          allowedLanguages: shareLink.allowedLanguages,
          conversation: shareLink.conversation,
          creator: shareLink.creator,
          // Nouvelles statistiques
          stats: {
            totalParticipants,
            memberCount,
            anonymousCount,
            languageCount,
            spokenLanguages
          }
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get anonymous link error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });
}
