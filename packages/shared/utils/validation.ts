/**
 * Utilitaires de validation pour les routes API
 * Utilisables dans Gateway
 */

import { z } from 'zod';
import { ErrorCode } from '../types/errors';
import { createError } from './errors';

/**
 * Valider un schéma Zod et retourner une erreur standardisée
 */
export function validateSchema<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues.map((err: any) => ({
      path: err.path.join('.'),
      message: err.message,
    }));
    
    throw createError(
      ErrorCode.VALIDATION_ERROR,
      'Données invalides',
      { errors, context }
    );
  }
  
  return result.data;
}

/**
 * Schémas de validation réutilisables
 */
export const CommonSchemas = {
  // Pagination
  pagination: z.object({
    limit: z.string().optional().transform((val: any) => parseInt(val || '20', 10)),
    offset: z.string().optional().transform((val: any) => parseInt(val || '0', 10)),
  }),
  
  // Message pagination
  messagePagination: z.object({
    limit: z.string().optional().transform((val: any) => parseInt(val || '20', 10)),
    offset: z.string().optional().transform((val: any) => parseInt(val || '0', 10)),
    before: z.string().optional(),
  }),
  
  // ID MongoDB
  mongoId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID MongoDB invalide'),
  
  // Langue
  language: z.string().min(2).max(5).regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Code langue invalide'),
  
  // Type de conversation
  conversationType: z.enum(['direct', 'group', 'public', 'global']),
  
  // Type de message
  messageType: z.enum(['text', 'image', 'file', 'system']),
  
  // Contenu de message
  messageContent: z.string().min(1, 'Le message ne peut pas être vide').max(10000, 'Message trop long'),
  
  // Titre de conversation
  conversationTitle: z.string().min(1, 'Le titre ne peut pas être vide').max(100, 'Titre trop long'),
  
  // Description
  description: z.string().max(500, 'Description trop longue').optional(),
  
  // Email
  email: z.string().email('Email invalide'),
  
  // Username
  username: z.string().min(3, 'Username trop court').max(30, 'Username trop long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username invalide'),
  
  // Conversation identifier (custom identifier for conversations)
  conversationIdentifier: z.string()
    .min(1, 'L\'identifiant ne peut pas être vide')
    .max(50, 'Identifiant trop long')
    .regex(/^[a-zA-Z0-9\-_@]*$/, 'L\'identifiant ne peut contenir que des lettres, chiffres, tirets, underscores et @')
    .optional(),
};

/**
 * Schémas pour les routes de conversations
 */
export const ConversationSchemas = {
  // Créer une conversation
  create: z.object({
    type: CommonSchemas.conversationType,
    title: CommonSchemas.conversationTitle.optional(),
    description: CommonSchemas.description,
    participantIds: z.array(z.string()).optional().default([]),
    communityId: z.string().optional(),
    identifier: CommonSchemas.conversationIdentifier,
  }),
  
  // Mettre à jour une conversation
  update: z.object({
    title: CommonSchemas.conversationTitle.optional(),
    description: CommonSchemas.description,
    type: CommonSchemas.conversationType.optional(),
  }).refine((data: any) => Object.keys(data).length > 0, {
    message: 'Au moins un champ doit être fourni pour la mise à jour',
  }),
  
  // Envoyer un message
  sendMessage: z.object({
    content: CommonSchemas.messageContent,
    originalLanguage: CommonSchemas.language.optional().default('fr'),
    messageType: CommonSchemas.messageType.optional().default('text'),
    replyToId: z.string().optional(),
  }),
  
  // Éditer un message
  editMessage: z.object({
    content: CommonSchemas.messageContent,
    originalLanguage: CommonSchemas.language.optional(),
  }),
  
  // Ajouter un participant
  addParticipant: z.object({
    userId: z.string().min(1, 'userId requis'),
  }),
  
  // Recherche
  search: z.object({
    q: z.string().min(1, 'Terme de recherche requis'),
  }),
  
  // Filtres participants
  participantsFilters: z.object({
    onlineOnly: z.string().optional(),
    role: z.string().optional(),
    search: z.string().optional(),
    limit: z.string().optional().transform((val: any) => parseInt(val || '50', 10)),
  }),
};
