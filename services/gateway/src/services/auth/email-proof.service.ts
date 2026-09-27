/**
 * LA PREUVE DE POSSESSION D'UNE ADRESSE — sortie d'`AuthService.verifyEmail`
 * par #8033, qui en change le sens.
 *
 * Avant #8033, `POST /auth/verify-email` ne faisait que DATER une adresse, et
 * répondait « déjà vérifiée » à quiconque nommait une adresse vérifiée — sans
 * rien lui demander. Depuis, le code et le lien OUVRENT une session (la
 * directive porteur fait de la vérification la porte d'entrée d'un compte créé
 * à la connexion, puis de toute connexion par « e-mail seul »). Ce qui était
 * une formalité devient un secret de connexion, et ce module le garde comme
 * tel :
 *
 * - **aucune réponse sans preuve** : un compte vérifié sans paire en cours ne
 *   rend plus rien de positif ;
 * - **comparaison sur l'empreinte, en temps constant** (`./email-code`) — la
 *   requête ne porte jamais le code saisi ;
 * - **usage unique** : chaque clé se consomme par une écriture CONDITIONNÉE à
 *   la paire lue ; deux présentations simultanées n'en valident qu'une ;
 * - **expiration** lue sur la ligne (15 min pour une connexion, la durée de
 *   vérification pour une inscription) ;
 * - **compte supprimé** : jamais cherché (`isActive: true`) ;
 * - **mot de passe** : posé avec le CODE seulement, et seulement sur un compte
 *   qui n'en a pas — cette porte ne remplace jamais un secret existant ;
 * - **second facteur** : l'état est RENDU, pour que l'appelant n'ouvre pas de
 *   session sur un compte qui en exige un ;
 * - **deux clés distinctes** (#8083, décision porteur « si et seulement
 *   si ») : le lien et le code ouvrent chacun UNE session, sur l'appareil qui
 *   s'en sert, et chacun ne consomme que LUI-MÊME. Le lien s'ouvre souvent sur
 *   un ORDINATEUR, et le téléphone qui a demandé le code ne se connecte qu'en
 *   le saisissant : ouvrir l'un laisse l'autre valable jusqu'à l'expiration de
 *   la paire, à usage unique, ses essais bornés par le débit de la route ;
 * - **les appareils en attente l'apprennent** (#8083) : toute preuve marque
 *   « prouvée » les attentes vivantes du compte — un ÉTAT, jamais une session ;
 * - **une clé que le détenteur ne reconnaît pas** est présentée aux
 *   revendications de l'adresse (#8214, `./email-claim`) : celle qui y répond
 *   reçoit l'adresse, dans la transaction qui la retire au détenteur.
 *
 * @module services/auth/email-proof.service
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { hashPassword } from '../../utils/password-hash';
import { normalizeEmail } from '../../utils/normalize';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { resolveSecondFactor, type SecondFactorState } from '../MagicLinkService';
import { emailCodeMatches, emailTokenMatches } from './email-code';
import { emailProofFields, settleEmailAddressProof } from './email-address-proof';
import { proveEmailClaim, type EmailClaimStore } from './email-claim';

const logger = enhancedLogger.child({ module: 'EmailProof' });

export type EmailProof = {
  readonly email: string;
  readonly code?: string;
  readonly token?: string;
  /** Appliqué avec `code` seulement, et seulement à un compte sans mot de passe. */
  readonly password?: string;
};

export type EmailProofResult =
  | {
      readonly success: true;
      readonly userId: string;
      readonly verifiedAt: Date;
      /** L'adresse l'était déjà : la preuve valait code de CONNEXION. */
      readonly alreadyVerified: boolean;
      readonly passwordSet: boolean;
      readonly secondFactor: SecondFactorState;
    }
  | { readonly success: false; readonly reason: 'invalid' | 'expired' | 'error'; readonly error: string };

const REFUS = {
  codeInvalide: { success: false, reason: 'invalid', error: 'Code de vérification invalide.' },
  lienInvalide: { success: false, reason: 'invalid', error: 'Lien de vérification invalide.' },
  codeExpire: { success: false, reason: 'expired', error: 'Le code de vérification a expiré. Veuillez en demander un nouveau.' },
  lienExpire: { success: false, reason: 'expired', error: 'Le lien de vérification a expiré. Veuillez en demander un nouveau.' },
  panne: { success: false, reason: 'error', error: 'Erreur lors de la vérification.' },
} as const satisfies Record<string, EmailProofResult>;

type ProofRow = {
  id: string;
  password: string | null;
  emailVerifiedAt: Date | null;
  twoFactorEnabledAt: Date | null;
  emailVerificationToken: string | null;
  emailVerificationCode: string | null;
  emailVerificationExpiry: Date | null;
};

/**
 * Une clé que le détenteur de l'adresse ne reconnaît pas peut répondre à une
 * REVENDICATION (#8214) : même preuve, même réponse, et c'est le compte
 * revendiquant qui s'ouvre.
 */
async function preuveDeRevendication(
  prisma: EmailClaimStore,
  proof: EmailProof,
  parCode: boolean,
): Promise<EmailProofResult> {
  const issue = await proveEmailClaim(prisma, proof);
  if (issue.kind === 'expired') return parCode ? REFUS.codeExpire : REFUS.lienExpire;
  if (issue.kind !== 'proven') return parCode ? REFUS.codeInvalide : REFUS.lienInvalide;
  return {
    success: true,
    userId: issue.userId,
    verifiedAt: issue.verifiedAt,
    alreadyVerified: false,
    passwordSet: issue.passwordSet,
    secondFactor: 'absent',
  };
}

export async function verifyEmailProof(
  prisma: Pick<PrismaClient, 'user'> & EmailClaimStore,
  proof: EmailProof,
): Promise<EmailProofResult> {
  const parCode = typeof proof.code === 'string' && proof.code.length > 0;
  const saisie = parCode ? proof.code ?? '' : proof.token ?? '';
  const invalide = parCode ? REFUS.codeInvalide : REFUS.lienInvalide;

  try {
    const ligne = (await prisma.user.findFirst({
      where: { email: { equals: normalizeEmail(proof.email), mode: 'insensitive' }, isActive: true },
      select: {
        id: true,
        password: true,
        emailVerifiedAt: true,
        twoFactorEnabledAt: true,
        emailVerificationToken: true,
        emailVerificationCode: true,
        emailVerificationExpiry: true,
      },
    })) as ProofRow | null;

    const correspond =
      ligne !== null &&
      (parCode
        ? emailCodeMatches(ligne.emailVerificationCode, saisie)
        : emailTokenMatches(ligne.emailVerificationToken, saisie));
    if (!ligne || !correspond) return preuveDeRevendication(prisma, proof, parCode);

    if (!ligne.emailVerificationExpiry || ligne.emailVerificationExpiry.getTime() <= Date.now()) {
      return parCode ? REFUS.codeExpire : REFUS.lienExpire;
    }

    const maintenant = new Date();
    const posePassword = parCode && typeof proof.password === 'string' && ligne.password === null;
    const password = posePassword ? await hashPassword(proof.password as string) : null;

    const consomme = await prisma.user.updateMany({
      where: {
        id: ligne.id,
        emailVerificationToken: ligne.emailVerificationToken,
        emailVerificationCode: ligne.emailVerificationCode,
      },
      data: {
        ...emailProofFields(ligne, maintenant),
        ...(parCode ? { emailVerificationCode: null } : { emailVerificationToken: null }),
        ...(password ? { password, lastPasswordChange: maintenant } : {}),
      },
    });

    if (consomme.count === 0) return invalide;

    // L'arrivée (#8105) est annoncée par la route, qui connaît `afterResponse`.
    await settleEmailAddressProof({ prisma }, { userId: ligne.id, now: maintenant, newlyProven: false });

    logger.info(`adresse prouvée (${parCode ? 'code' : 'lien'})`);
    return {
      success: true,
      userId: ligne.id,
      verifiedAt: ligne.emailVerifiedAt ?? maintenant,
      alreadyVerified: ligne.emailVerifiedAt !== null,
      passwordSet: password !== null,
      secondFactor: resolveSecondFactor(ligne.twoFactorEnabledAt),
    };
  } catch (error) {
    logger.error('vérification impossible', error as Error);
    return REFUS.panne;
  }
}
