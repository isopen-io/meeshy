import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { generateConversationIdentifier as sharedGenerateConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';

/**
 * Fonction utilitaire pour générer le linkId avec le format demandé
 * Étape 1: génère yymmddhhm_<random>
 * Étape 2: sera mis à jour avec mshy_<conversationShareLink.Id>.yymmddhhm_<random> après création
 */
export function generateInitialLinkId(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hour = now.getHours().toString().padStart(2, '0');
  const minute = now.getMinutes().toString().padStart(2, '0');

  const timestamp = `${year}${month}${day}${hour}${minute}`;
  const randomSuffix = Math.random().toString(36).slice(2, 10);

  return `${timestamp}_${randomSuffix}`;
}

export function generateFinalLinkId(conversationShareLinkId: string, initialId: string): string {
  return `mshy_${conversationShareLinkId}.${initialId}`;
}

/**
 * Génère un identifiant unique pour une conversation
 * Format: mshy_<titre_sanitisé>-YYYYMMDDHHMMSS ou mshy_<unique_id>-YYYYMMDDHHMMSS si pas de titre
 * @deprecated Utiliser sharedGenerateConversationIdentifier de shared/utils/conversation-helpers
 */
export function generateConversationIdentifier(title?: string): string {
  return sharedGenerateConversationIdentifier(title);
}

/**
 * Vérifie l'unicité d'un identifiant de conversation et génère une variante avec suffixe hexadécimal si nécessaire
 */
export async function ensureUniqueConversationIdentifier(prisma: PrismaClient, baseIdentifier: string): Promise<string> {
  // Si l'identifiant a déjà un suffixe hexadécimal (8 caractères après le dernier tiret)
  const hexPattern = /-[a-f0-9]{8}$/;
  const hasHexSuffix = hexPattern.test(baseIdentifier);

  // Si pas de suffixe hex, vérifier l'unicité de l'identifiant tel quel
  let identifier = baseIdentifier;

  const existing = await prisma.conversation.findFirst({
    where: { identifier }
  });

  if (!existing) {
    return identifier;
  }

  // Si l'identifiant existe, ajouter/régénérer un suffixe hexadécimal aléatoire de 4 bytes (8 caractères)
  // Enlever l'ancien suffixe s'il existe
  const baseWithoutSuffix = hasHexSuffix ? baseIdentifier.replace(hexPattern, '') : baseIdentifier;

  // Générer un nouveau suffixe hexadécimal
  const crypto = require('crypto');
  const hexSuffix = crypto.randomBytes(4).toString('hex'); // 4 bytes = 8 caractères hex

  identifier = `${baseWithoutSuffix}-${hexSuffix}`;

  // Vérifier que le nouvel identifiant avec hex suffix n'existe pas non plus
  const existingWithHex = await prisma.conversation.findFirst({
    where: { identifier }
  });

  if (!existingWithHex) {
    return identifier;
  }

  // Si par une chance extrême le hex existe aussi, régénérer récursivement
  return ensureUniqueConversationIdentifier(prisma, baseWithoutSuffix);
}

/**
 * Vérifie l'unicité d'un identifiant de ConversationShareLink et génère une variante avec timestamp si nécessaire
 */
export async function ensureUniqueShareLinkIdentifier(prisma: PrismaClient, baseIdentifier: string): Promise<string> {
  // Si l'identifiant est vide, générer un identifiant par défaut
  if (!baseIdentifier || baseIdentifier.trim() === '') {
    const timestamp = Date.now().toString();
    const randomPart = Math.random().toString(36).substring(2, 8);
    baseIdentifier = `mshy_link-${timestamp}-${randomPart}`;
  }

  let identifier = baseIdentifier.trim();

  // Vérifier si l'identifiant existe déjà
  const existing = await prisma.conversationShareLink.findFirst({
    where: { identifier }
  });

  if (!existing) {
    return identifier;
  }

  // Si l'identifiant existe, ajouter un suffixe timestamp YYYYmmddHHMMSS
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');

  identifier = `${baseIdentifier}-${timestamp}`;

  // Vérifier que le nouvel identifiant avec timestamp n'existe pas non plus
  const existingWithTimestamp = await prisma.conversationShareLink.findFirst({
    where: { identifier }
  });

  if (!existingWithTimestamp) {
    return identifier;
  }

  // Si même avec le timestamp il y a un conflit, ajouter un suffixe numérique
  let counter = 1;
  while (true) {
    const newIdentifier = `${baseIdentifier}-${timestamp}-${counter}`;
    const existingWithCounter = await prisma.conversationShareLink.findFirst({
      where: { identifier: newIdentifier }
    });

    if (!existingWithCounter) {
      return newIdentifier;
    }

    counter++;
  }
}

/**
 * Fonction utilitaire pour prédire le type de modèle
 */
export function getPredictedModelType(textLength: number): 'basic' | 'medium' | 'premium' {
  if (textLength < 20) return 'basic';
  if (textLength <= 100) return 'medium';
  return 'premium';
}
