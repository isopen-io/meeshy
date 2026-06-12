/**
 * Types and utilities for communities module
 */
import { z } from 'zod';

// Enum des roles de communaute (aligne avec shared/types/community.ts)
export enum CommunityRole {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  MEMBER = 'member'
}

// Schemas de validation
export const CreateCommunitySchema = z.object({
  name: z.string().min(1).max(100),
  identifier: z.string().regex(/^[a-zA-Z0-9\-_@]*$/, 'Identifier can only contain letters, numbers, hyphens, underscores, and @').optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  isPrivate: z.boolean().default(true)
});

export const UpdateCommunitySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  identifier: z.string().regex(/^[a-zA-Z0-9\-_@]*$/, 'Identifier can only contain letters, numbers, hyphens, underscores, and @').optional(),
  description: z.string().optional(),
  avatar: z.string().optional(),
  banner: z.string().optional(),
  isPrivate: z.boolean().optional()
});

export const AddMemberSchema = z.object({
  userId: z.string(),
  role: z.enum([CommunityRole.ADMIN, CommunityRole.MODERATOR, CommunityRole.MEMBER]).optional().default(CommunityRole.MEMBER)
});

export const UpdateMemberRoleSchema = z.object({
  role: z.enum([CommunityRole.ADMIN, CommunityRole.MODERATOR, CommunityRole.MEMBER])
});

/**
 * Fonction pour generer un identifier a partir du nom
 */
export function generateIdentifier(name: string, customIdentifier?: string): string {
  if (customIdentifier) {
    // Si l'identifiant personnalise commence deja par mshy_, ne pas le rajouter
    if (customIdentifier.startsWith('mshy_')) {
      return customIdentifier;
    }
    return `mshy_${customIdentifier}`;
  }

  // Convertir le nom en identifier valide
  const baseIdentifier = name
    .toLowerCase()
    .replace(/[^a-zA-Z0-9\-_@]/g, '-') // Remplacer les caracteres invalides par des tirets
    .replace(/--+/g, '-') // Remplacer les tirets multiples par un seul
    .replace(/^-|-$/g, ''); // Supprimer les tirets en debut et fin

  return `mshy_${baseIdentifier}`;
}

// Type exports
export type CreateCommunityData = z.infer<typeof CreateCommunitySchema>;
export type UpdateCommunityData = z.infer<typeof UpdateCommunitySchema>;
export type AddMemberData = z.infer<typeof AddMemberSchema>;
export type UpdateMemberRoleData = z.infer<typeof UpdateMemberRoleSchema>;
