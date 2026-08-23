import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  generateConversationIdentifier as sharedGenerateConversationIdentifier,
  generateCompactConversationIdentifier
} from '@meeshy/shared/utils/conversation-helpers';

export { generateCompactConversationIdentifier };

// Les identifiants de LIEN DE PARTAGE sont ré-exportés depuis leur domicile
// unique, `routes/links/utils/link-helpers.ts` — ils y sont définis, testés et
// documentés. Ce fichier en portait une COPIE mot pour mot jusqu'au
// 2026-08-23 : deux implémentations d'une même loi, dont l'une pouvait dériver
// sans que rien ne rougisse. `sharing.ts` importait la copie, `creation.ts`
// l'original ; le raccourcissement du linkId n'aurait touché qu'un des deux
// chemins de création.
export {
  generateShareLinkId,
  generateUniqueShareLinkId,
  ensureUniqueShareLinkIdentifier,
  SHARE_LINK_ID_PREFIX,
  SHARE_LINK_ID_LENGTH
} from '../../links/utils/link-helpers';

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
 * Fonction utilitaire pour prédire le type de modèle
 */
export function getPredictedModelType(textLength: number): 'basic' | 'medium' | 'premium' {
  if (textLength < 20) return 'basic';
  if (textLength <= 100) return 'medium';
  return 'premium';
}
