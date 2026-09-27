/**
 * UNE ADRESSE NON VÉRIFIÉE NE REÇOIT QUE LES E-MAILS DONT L'USAGE LA PROUVE
 * (#8238, directive porteur 2026-09-27 et sa précision du même jour).
 *
 * « Chaque compte non actif / non vérifié ne reçoit plus d'e-mail sauf celui
 * d'activation de son compte » — précisé : les e-mails dont l'USAGE prouve
 * l'adresse (vérification / activation, code de connexion, réinitialisation du
 * mot de passe, lien magique) peuvent partir vers une adresse non vérifiée ;
 * le résumé, les notifications, les diffusions, les invitations, les alertes
 * restent coupés tant que l'adresse n'est pas vérifiée.
 *
 * La garde est CENTRALE : `EmailService.sendEmail`, le passage de tout envoi,
 * l'appelle avec la famille de l'e-mail (`trackingType`). Aucun site ne la
 * répète — un nouvel e-mail est gardé par construction.
 *
 * Deux familles hors énumération de l'issue sont probantes, et c'est une
 * décision : `email_change` part vers la NOUVELLE adresse pour la prouver, et
 * `deletion_confirm` est demandé par la personne, son lien prouvant l'adresse
 * — le couper empêcherait un compte non vérifié de se fermer.
 *
 * Fail-CLOSED : sans lecteur d'adresses (processus qui n'a pas appelé
 * `registerEmailRecipientLookup`), sur une lecture qui lève, ou pour un envoi
 * sans famille déclarée, une famille non probante ne part pas.
 *
 * @module services/email/recipient-policy
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'EmailRecipientPolicy' });

export const ADDRESS_PROVING_EMAIL_KINDS: ReadonlySet<string> = new Set([
  'verification',
  'login_code',
  'password_reset',
  'magic_link',
  'email_change',
  'deletion_confirm',
]);

/** `unknown-recipient` : aucun compte ne porte l'adresse (une invitation, une nouvelle adresse). */
export type RecipientAddressState = 'verified' | 'unverified' | 'unknown-recipient';

export type RecipientAddressLookup = (address: string) => Promise<RecipientAddressState>;

export function prismaRecipientAddressLookup(prisma: Pick<PrismaClient, 'user'>): RecipientAddressLookup {
  return async (address) => {
    const account = await prisma.user.findFirst({
      where: { email: { equals: address.trim().toLowerCase(), mode: 'insensitive' } },
      select: { emailVerifiedAt: true },
    });
    if (!account) return 'unknown-recipient';
    return account.emailVerifiedAt ? 'verified' : 'unverified';
  };
}

let registeredLookup: RecipientAddressLookup | null = null;

/** Posé une fois au démarrage (`server.ts`) ; `null` le retire (témoins). */
export function registerEmailRecipientLookup(lookup: RecipientAddressLookup | null): void {
  registeredLookup = lookup;
}

export function registeredEmailRecipientLookup(): RecipientAddressLookup | null {
  return registeredLookup;
}

export async function emailMayLeave(input: {
  readonly to: string;
  readonly kind: string | undefined;
  readonly lookup: RecipientAddressLookup | null;
}): Promise<boolean> {
  if (input.kind && ADDRESS_PROVING_EMAIL_KINDS.has(input.kind)) return true;
  if (!input.lookup) {
    logger.error("aucun lecteur d'adresses enregistré — envoi non probant coupé", { kind: input.kind });
    return false;
  }
  try {
    return (await input.lookup(input.to)) !== 'unverified';
  } catch (error) {
    logger.error("lecture de l'adresse impossible — envoi non probant coupé", error as Error);
    return false;
  }
}
