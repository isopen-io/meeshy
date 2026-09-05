/**
 * La CRÉATION D'UN COMPTE — sortie d'`AuthService` (#5216).
 *
 * ## Pourquoi un module, et pas une méthode de plus
 *
 * `AuthService.ts` est hors budget depuis #4426 (1281 lignes pour un plafond de
 * 1000), et l'inscription y pesait 230 lignes qui n'utilisaient de `this` que
 * quatre choses : Prisma, le service d'e-mail, l'URL du front et le résolveur
 * de manager Socket.IO. **Un fichier hors budget est interdit d'ajout** ; ce lot
 * en ajoute beaucoup (identité dérivée, refus typés, différé post-réponse), donc
 * il extrait d'abord.
 *
 * `AuthService.register` reste, en délégation fine : les appelants historiques
 * (`InitService`, les routes) ne bougent pas.
 *
 * ## Ce que l'extraction a changé de COMPORTEMENT, et pourquoi
 *
 * 1. **Le service LÈVE ses refus.** Il rendait `null` sur TOUT — pseudo pris,
 *    e-mail pris, numéro invalide, panne Mongo — et la route branchait sur le
 *    TEXTE d'erreurs qui ne remontaient jamais (`errorMessage.includes('déjà
 *    utilisé')`, `AuthService.ts:711-714`). Ces branches étaient inatteignables :
 *    un pseudo pris et une panne rendaient le même 400 sans code ni champ. Le
 *    refus est désormais une valeur typée (`RegistrationRefusal`) que la route
 *    traduit ; une panne reste une erreur ordinaire, donc un 500.
 * 2. **L'e-mail de vérification part APRÈS la réponse.** Il ne conditionne
 *    rien — le compte existe, le jeton est émis — et il coûtait à l'inscription
 *    tout le temps d'un aller-retour SMTP.
 * 3. **Le nom affiché, le pseudo et les deux noms se DÉRIVENT** quand le
 *    formulaire ne les donne pas (`registration-identity.ts`).
 * 4. **Les CGU sont gravées** : l'acte de création vaut acceptation, les clients
 *    l'écrivent sous le bouton.
 *
 * @module services/auth/registration.service
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SocketIOUser } from '@meeshy/shared/types';
import { CURRENT_TERMS_VERSION } from '@meeshy/shared/types/terms';
import { emailSchema } from '@meeshy/shared/types/validation';

import type { RequestContext } from '../GeoIPService';
import {
  ensureGlobalConversationMembership,
  type GlobalMembershipSocketManager,
} from '../conversations/ensureGlobalConversationMembership';
import { maskEmail, maskUsername, maskDisplayName } from '../PhonePasswordResetService';
import {
  normalizeEmail,
  normalizeUsername,
  capitalizeName,
  normalizeDisplayName,
  normalizePhoneWithCountry,
} from '../../utils/normalize';
import { SecuritySanitizer } from '../../utils/sanitize.js';
import { searchTokensFor } from '../../utils/search-tokens';
import { hashPassword } from '../../utils/password-hash';
import { candidatsDePseudo } from '../../utils/username-candidates';
import type { AfterResponse } from '../../utils/after-response';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { registrationLanguages } from './registration-languages';
import { derivedNames, generateUsername } from './registration-identity';
import { RegistrationRefusal } from './registration-refusal';

const logger = enhancedLogger.child({ module: 'RegistrationService' });

/** Combien de pseudos de rechange accompagnent un refus `USERNAME_TAKEN`. */
const SUGGESTIONS_RENDUES = 3;

/** Le pays par défaut quand ni la saisie ni la géolocalisation n'en donnent un. */
const PAYS_PAR_DEFAUT = 'FR';

/** Durée de validité du jeton de vérification d'e-mail, en heures. */
const heuresDeValidite = (): number =>
  parseInt(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || '86400', 10) / 3600;

/**
 * La charge d'inscription — TOUS les champs d'identité sont facultatifs sauf
 * l'adresse et le mot de passe. Ce que le formulaire n'envoie pas, le service
 * le dérive ; le contrat HTTP (`registerRequestSchema`) garantit qu'il reste
 * assez d'information pour le faire.
 */
export type RegisterData = {
  readonly username?: string;
  readonly password: string;
  readonly displayName?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email: string;
  readonly phoneNumber?: string;
  /** ISO 3166-1 alpha-2 (ex. « FR », « US »). */
  readonly phoneCountryCode?: string;
  readonly systemLanguage?: string;
  readonly regionalLanguage?: string;
  readonly customDestinationLanguage?: string;
  /** Rang 4 du Prisme : `X-Device-Locale`, ou l'étiquette la mieux notée d'`Accept-Language`. */
  readonly deviceLocale?: string;
  /** Jeton prouvant la vérification SMS d'un transfert de numéro. */
  readonly phoneTransferToken?: string;
  /** Posé quand le jeton de transfert a été validé — le conflit de numéro ne se pose plus. */
  readonly skipPhoneConflictCheck?: boolean;
};

/**
 * Le résultat d'une inscription.
 *
 * `phoneOwnershipConflict` n'est PAS un refus : aucun compte n'est créé, mais
 * la réponse est un 200 porteur d'un CHOIX (se connecter, continuer sans le
 * numéro, transférer). Un refus ferme la porte ; celui-ci en ouvre trois.
 */
export type RegisterResult = {
  readonly user?: SocketIOUser;
  readonly phoneOwnershipConflict?: boolean;
  readonly phoneOwnerInfo?: {
    readonly maskedDisplayName: string;
    readonly maskedUsername: string;
    readonly maskedEmail: string;
    readonly avatar?: string;
    readonly phoneNumber: string;
    readonly phoneCountryCode: string;
  };
};

export type RegistrationDeps = {
  readonly prisma: PrismaClient;
  readonly emailService: {
    sendEmailVerification(params: {
      to: string;
      name: string;
      verificationLink: string;
      verificationCode: string;
      expiryHours: number;
      language: string;
    }): Promise<{ success: boolean; error?: string; provider?: string; messageId?: string }>;
  };
  readonly frontendUrl: string;
  /** Résolu à l'appel, jamais capturé : le manager n'existe pas à l'enregistrement des routes. */
  readonly resolveSocketManager?: () => GlobalMembershipSocketManager | null | undefined;
  /** La projection `User` → `SocketIOUser`, qui vit avec les autres portes d'auth. */
  readonly toSocketIOUser: (user: unknown) => SocketIOUser;
  /** Jeton + code de vérification d'e-mail — passés pour rester testables sans stub de `crypto`. */
  readonly verificationToken: () => { raw: string; hash: string };
  readonly verificationCode: () => string;
  /**
   * Où partent les travaux qui ne conditionnent pas la réponse — l'e-mail de
   * vérification, l'annonce d'arrivée dans le salon global.
   *
   * **Absent ⇒ EN LIGNE**, et c'est le bon défaut : différer est une décision de
   * la surface HTTP, seule à avoir une réponse à rendre. Le seed (`InitService`)
   * et la création par un administrateur appellent ce service sans requête en
   * cours ; leur faire perdre le déterminisme pour une latence que personne ne
   * mesure serait un mauvais échange.
   */
  readonly afterResponse?: AfterResponse;
};

/** Le nom affiché tel qu'il sera PERSISTÉ : la saisie normalisée, casse conservée. */
function displayNamePersiste(data: RegisterData, firstName: string, lastName: string): string {
  const saisi = data.displayName?.trim();
  const source = saisi && saisi !== '' ? saisi : `${firstName} ${lastName}`;
  return SecuritySanitizer.sanitizeText(normalizeDisplayName(source));
}

/**
 * Les deux noms de la ligne `User`.
 *
 * Un formulaire hérité les fournit ; le formulaire court ne donne qu'un nom
 * affiché, dont ils se DÉRIVENT. La casse passe par `capitalizeName` dans les
 * deux cas — c'est ce que faisait déjà l'inscription, et changer la règle pour
 * le seul chemin dérivé ferait diverger deux portes du même produit.
 */
function nomsDeLInscription(data: RegisterData): { firstName: string; lastName: string } {
  if (data.firstName && data.lastName) {
    return {
      firstName: SecuritySanitizer.sanitizeText(capitalizeName(data.firstName)),
      lastName: SecuritySanitizer.sanitizeText(capitalizeName(data.lastName)),
    };
  }

  const derives = derivedNames(data.displayName ?? '');
  return {
    firstName: SecuritySanitizer.sanitizeText(derives.firstName),
    lastName: SecuritySanitizer.sanitizeText(derives.lastName),
  };
}

/**
 * Le numéro NORMALISÉ, ou `null` quand l'inscription n'en donne pas.
 *
 * Un numéro illisible est un REFUS de formulaire (400, champ `phoneNumber`),
 * pas une panne : c'est une saisie à corriger, et le client doit savoir où.
 */
function telephoneDeLInscription(
  data: RegisterData,
  requestContext?: RequestContext,
): { phoneNumber: string | null; phoneCountryCode: string | null } {
  if (!data.phoneNumber || data.phoneNumber.trim() === '') {
    return { phoneNumber: null, phoneCountryCode: null };
  }

  const paysParDefaut = data.phoneCountryCode || requestContext?.geoData?.country || PAYS_PAR_DEFAUT;
  const resultat = normalizePhoneWithCountry(data.phoneNumber, paysParDefaut);

  if (!resultat || !resultat.isValid) {
    throw new RegistrationRefusal('PHONE_INVALID', 'Numéro de téléphone invalide');
  }

  return { phoneNumber: resultat.phoneNumber, phoneCountryCode: resultat.countryCode };
}

/**
 * Les trois pseudos de rechange servis avec un refus `USERNAME_TAKEN`.
 *
 * En UNE requête, comme la porte d'annuaire : proposer un remède coûte le même
 * aller-retour que constater le problème.
 */
async function suggestionsDePseudo(prisma: PrismaClient, demande: string): Promise<string[]> {
  const candidats = candidatsDePseudo(demande);
  const dejaPris = await prisma.user.findMany({
    where: { username: { in: candidats, mode: 'insensitive' } },
    select: { username: true },
  });
  const occupes = new Set(dejaPris.map((u) => u.username.toLowerCase()));
  return candidats.filter((c) => !occupes.has(c.toLowerCase())).slice(0, SUGGESTIONS_RENDUES);
}

/**
 * Le pseudo du compte : celui que l'inscription DEMANDE, ou celui que le
 * serveur génère.
 *
 * La distinction gouverne ce qui arrive en cas de collision. Un pseudo DEMANDÉ
 * qui est pris est un refus, avec ses suggestions : renommer quelqu'un dans son
 * dos serait pire que le refuser. Un pseudo GÉNÉRÉ, lui, n'a été demandé par
 * personne — il se re-tire jusqu'à en trouver un libre.
 */
async function pseudoDeLInscription(
  prisma: PrismaClient,
  data: RegisterData,
  displayName: string,
): Promise<string> {
  if (data.username && data.username.trim() !== '') {
    return normalizeUsername(data.username);
  }

  return generateUsername(prisma.user, { displayName, email: data.email });
}

/**
 * Crée un compte.
 *
 * Lève un `RegistrationRefusal` sur un refus de formulaire (pseudo pris,
 * adresse prise, numéro illisible) ; toute autre erreur se propage telle
 * quelle et vaut 500 chez l'appelant. Rend un `phoneOwnershipConflict` — un
 * 200 — quand le numéro appartient à un autre compte VÉRIFIÉ : aucun compte
 * n'est créé, et l'utilisateur choisit.
 */
export async function registerAccount(
  deps: RegistrationDeps,
  data: RegisterData,
  requestContext?: RequestContext,
): Promise<RegisterResult> {
  const parsed = emailSchema.safeParse(data.email);
  if (!parsed.success) {
    // Ce n'est PAS un refus de formulaire : Ajv puis Zod ont déjà gardé la
    // forme de l'adresse avant que la route n'appelle ce service, donc une
    // adresse illisible ici vient d'un appelant INTERNE (seed, création admin)
    // qui n'a traversé ni l'un ni l'autre. La faute est chez lui, pas chez la
    // personne qui s'inscrit — d'où une erreur ordinaire, qui vaut 500.
    throw new Error(
      `Email invalide: ${parsed.error.issues[0]?.message ?? "Format d'email invalide"}`,
    );
  }

  // Le numéro se lit AVANT toute requête : c'est le seul refus qui se décide
  // sans lire la base, et le décider en premier évite de payer la génération de
  // pseudo pour une charge qu'on va refuser.
  const telephone = telephoneDeLInscription(data, requestContext);

  const normalizedEmail = normalizeEmail(data.email);
  const { firstName, lastName } = nomsDeLInscription(data);
  const normalizedDisplayName = displayNamePersiste(data, firstName, lastName);
  const normalizedUsername = await pseudoDeLInscription(deps.prisma, data, normalizedDisplayName);

  const existant = await deps.prisma.user.findFirst({
    where: {
      OR: [
        { username: { equals: normalizedUsername, mode: 'insensitive' } },
        { email: { equals: normalizedEmail, mode: 'insensitive' } },
      ],
    },
    select: { username: true, email: true },
  });

  if (existant) {
    if (existant.email.toLowerCase() === normalizedEmail.toLowerCase()) {
      throw new RegistrationRefusal('EMAIL_TAKEN', 'Email déjà utilisé');
    }
    // Le pseudo GÉNÉRÉ a déjà été vérifié libre ; cette branche ne se
    // rencontre donc que pour un pseudo DEMANDÉ — ou dans la course entre la
    // génération et cette lecture, où un refus reste la bonne réponse.
    throw new RegistrationRefusal('USERNAME_TAKEN', "Nom d'utilisateur déjà utilisé", {
      suggestions: await suggestionsDePseudo(deps.prisma, normalizedUsername),
    });
  }

  if (telephone.phoneNumber && !data.skipPhoneConflictCheck) {
    const proprietaire = await deps.prisma.user.findFirst({
      where: {
        phoneNumber: telephone.phoneNumber,
        isActive: true,
        // Seuls les numéros VÉRIFIÉS déclenchent le conflit.
        phoneVerifiedAt: { not: null },
      },
      select: { id: true, displayName: true, username: true, email: true, avatar: true },
    });

    if (proprietaire) {
      logger.info('numéro détenu par un autre compte — aucun compte créé');
      return {
        phoneOwnershipConflict: true,
        phoneOwnerInfo: {
          maskedDisplayName: maskDisplayName(proprietaire.displayName),
          maskedUsername: maskUsername(proprietaire.username),
          maskedEmail: maskEmail(proprietaire.email),
          avatar: proprietaire.avatar || undefined,
          phoneNumber: telephone.phoneNumber,
          phoneCountryCode: telephone.phoneCountryCode || PAYS_PAR_DEFAUT,
        },
      };
    }
  }

  const hashedPassword = await hashPassword(data.password);
  const { raw: verificationToken, hash: verificationTokenHash } = deps.verificationToken();
  const verificationCode = deps.verificationCode();
  const expiryHours = heuresDeValidite();
  const verificationExpiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  const languages = registrationLanguages(data);

  const user = await deps.prisma.user.create({
    data: {
      username: normalizedUsername,
      password: hashedPassword,
      firstName,
      lastName,
      // Écrits en MÊME TEMPS que les noms — un compte créé sans jetons serait
      // introuvable jusqu'à sa prochaine modification de profil (#4159).
      searchTokens: searchTokensFor({
        username: normalizedUsername,
        displayName: normalizedDisplayName,
        firstName,
        lastName,
      }),
      email: normalizedEmail,
      phoneNumber: telephone.phoneNumber,
      phoneCountryCode: telephone.phoneCountryCode,
      // Un numéro donné à l'inscription vaut vérifié (il ouvre la
      // réinitialisation par SMS).
      phoneVerifiedAt: telephone.phoneNumber ? new Date() : null,
      systemLanguage: languages.systemLanguage,
      regionalLanguage: languages.regionalLanguage,
      customDestinationLanguage: languages.customDestinationLanguage,
      deviceLocale: languages.deviceLocale,
      displayName: normalizedDisplayName,
      isOnline: true,
      lastActiveAt: new Date(),
      // L'acte de CRÉATION vaut acceptation des conditions : les trois clients
      // l'écrivent sous le bouton. La version dit à QUOI la date se rapporte.
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
      emailVerificationToken: verificationTokenHash,
      emailVerificationCode: verificationCode,
      emailVerificationExpiry: verificationExpiry,
      registrationIp: requestContext?.ip || null,
      registrationLocation: requestContext?.geoData?.location || null,
      registrationDevice: requestContext?.userAgent || null,
      registrationCountry: requestContext?.geoData?.country || null,
      timezone: requestContext?.geoData?.timezone || null,
      lastLoginIp: requestContext?.ip || null,
      lastLoginLocation: requestContext?.geoData?.location || null,
      lastLoginDevice: requestContext?.userAgent || null,
    },
  });

  /**
   * Programme un travail qui ne conditionne pas le résultat — différé si
   * l'appelant a une réponse à rendre, EN LIGNE sinon. Dans les deux cas son
   * échec est journalisé et jamais propagé : une inscription réussie ne doit
   * pas devenir un échec parce qu'un e-mail n'est pas parti.
   */
  const aCote = async (task: () => Promise<void>, label: string): Promise<void> => {
    if (deps.afterResponse) {
      deps.afterResponse(task, label);
      return;
    }
    try {
      await task();
    } catch (error) {
      logger.error(`travail post-inscription échoué (${label})`, error as Error);
    }
  };

  // L'e-mail de vérification ne conditionne RIEN : le compte existe, le jeton
  // sera émis, et l'utilisateur peut en redemander un. Le faire attendre à la
  // requête ajoutait un aller-retour SMTP au chemin d'entrée du produit.
  await aCote(async () => {
    const verificationLink = `${deps.frontendUrl}/auth/verify-email?token=${verificationToken}&email=${encodeURIComponent(normalizedEmail)}`;

    const resultat = await deps.emailService.sendEmailVerification({
      to: normalizedEmail,
      name: normalizedDisplayName,
      verificationLink,
      verificationCode,
      expiryHours,
      // Le rang SERVI, pas `data.systemLanguage` : le premier e-mail d'un
      // compte partait en français à qui n'avait renseigné que son rang 2.
      language: languages.systemLanguage,
    });

    if (!resultat.success) {
      logger.error("échec de l'envoi de l'e-mail de vérification", { error: resultat.error });
    }
  }, 'registration-verification-email');

  // La CRÉATION du participant reste SYNCHRONE — le nouveau compte doit voir la
  // conversation « meeshy » dès sa première liste. Seules l'annonce d'arrivée
  // et le décompte de membres partent après la réponse.
  try {
    await ensureGlobalConversationMembership(
      {
        prisma: deps.prisma,
        resolveSocketManager: deps.resolveSocketManager,
        afterResponse: deps.afterResponse,
      },
      { userId: user.id, displayName: user.displayName || user.username },
    );
  } catch (error) {
    logger.error('ajout à la conversation globale impossible', error as Error);
    // L'inscription n'échoue pas pour autant : le compte existe.
  }

  return { user: deps.toSocketIOUser(user) };
}
