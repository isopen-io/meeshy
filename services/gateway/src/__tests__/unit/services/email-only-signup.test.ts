/**
 * S'INSCRIRE AVEC UNE ADRESSE, ET RIEN D'AUTRE (#6424).
 *
 * Directive porteur 2026-09-14 : « on met un e-mail, tu crées un compte avec le
 * pseudo pris de la première partie de l'e-mail, le display name pareil […]
 * Tant qu'on n'a pas le mot de passe défini, le seul moyen de se connecter
 * c'est par lien magique. »
 *
 * ## Ce que ces témoins mesurent, et pourquoi ce niveau-là
 *
 * Les LOIS de dérivation sont gardées chez elles
 * (`registration-identity.test.ts`, 58 témoins). Ce fichier mesure ce qu'AUCUN
 * témoin unitaire ne peut voir : ce que le service ÉCRIT dans la ligne, et ce
 * qu'il REMET au gabarit d'e-mail. C'est un défaut entre deux collaborateurs,
 * la seule famille qu'un unitaire ne voit jamais.
 *
 * Trois questions, une par section :
 *
 * 1. la ligne créée porte-t-elle une identité RECEVABLE et un mot de passe
 *    ABSENT — pas une chaîne vide, pas un hash inventé ?
 * 2. l'e-mail de validation PORTE-t-il ce que la personne n'a jamais vu ?
 * 3. un mot de passe FOURNI produit-il toujours exactement l'ancien
 *    comportement — la régression la plus coûteuse serait là, sur le chemin
 *    que tout le monde emprunte déjà.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockSendEmailVerification = jest.fn() as jest.Mock<any>;
jest.mock('../../../services/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendEmailVerification: mockSendEmailVerification,
  })),
}));

jest.mock('../../../services/SessionService', () => ({
  generateSessionToken: jest.fn(() => 'session-token'),
  createSession: jest.fn(async () => ({ id: 'session-1' })),
  initSessionService: jest.fn(),
  validateSession: jest.fn(),
  getUserSessions: jest.fn(),
  invalidateSession: jest.fn(),
  invalidateAllSessions: jest.fn(),
  logout: jest.fn(),
}));

// Le hachage réel coûte des centaines de millisecondes par témoin (coût 12) ;
// sa propriété est gardée chez lui (`utils/password-hash`). Le double rend une
// valeur RECONNAISSABLE : c'est elle qui permet d'affirmer, plus bas, qu'un
// compte sans mot de passe ne l'a pas reçue par accident.
jest.mock('../../../utils/password-hash', () => ({
  ...(jest.requireActual('../../../utils/password-hash') as Record<string, unknown>),
  hashPassword: jest.fn(async () => '$2b$12$hash-de-test'),
}));

import { AuthService, type RegisterData } from '../../../services/AuthService';

const passerelle = () => {
  const findFirst = jest.fn() as jest.Mock<any>;
  const create = jest.fn(async (args: unknown) => ({
    id: 'user-cree',
    ...((args as { data: Record<string, unknown> }).data),
  }));
  findFirst.mockResolvedValue(null);

  return {
    findFirst,
    create,
    prisma: {
      user: { findFirst, findMany: jest.fn(async () => []), create, update: jest.fn() },
      conversation: { findFirst: jest.fn(async () => null) },
      participant: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'part-1' })),
        update: jest.fn(async () => ({ id: 'part-1' })),
      },
    },
  };
};

const inscrire = async (data: RegisterData) => {
  const { prisma, create } = passerelle();
  const resultat = await new AuthService(prisma as never, 'secret').register(data);
  const ligne = (create.mock.calls[0] as [{ data: Record<string, unknown> }] | undefined)?.[0].data;
  const courriel = mockSendEmailVerification.mock.calls[0]?.[0] as Record<string, any> | undefined;
  return { resultat, ligne, courriel, create };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSendEmailVerification.mockResolvedValue({ success: true, provider: 'test', messageId: 'm' });
});

describe("la ligne créée depuis une ADRESSE SEULE", () => {
  it('existe — une adresse suffit à ouvrir un compte', async () => {
    const { resultat, create } = await inscrire({ email: 'marie.dupont@example.com' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(resultat?.user).toBeDefined();
  });

  it('porte un pseudo tiré de la partie locale, sous le contrat du schéma', async () => {
    const { ligne } = await inscrire({ email: 'marie.dupont@example.com' });

    expect(ligne?.username).toBe('marie-dupont');
    expect(String(ligne?.username)).toMatch(/^[a-zA-Z0-9_-]{2,16}$/);
  });

  it('porte un nom affiché qui se LIT — pas le pseudo recopié', async () => {
    const { ligne } = await inscrire({ email: 'marie.dupont@example.com' });

    expect(ligne?.displayName).toBe('Marie Dupont');
    expect(ligne?.firstName).toBe('Marie');
    expect(ligne?.lastName).toBe('Dupont');
  });

  it('laisse le mot de passe ABSENT — jamais une chaîne vide, jamais un hash', async () => {
    const { ligne } = await inscrire({ email: 'marie@example.com' });

    expect(ligne?.password).toBeNull();
    expect(ligne?.password).not.toBe('');
    expect(ligne?.password).not.toBe('$2b$12$hash-de-test');
  });

  it('indexe le compte sur son nom DÉRIVÉ — sinon il resterait introuvable', async () => {
    const { ligne } = await inscrire({ email: 'marie.dupont@example.com' });

    expect(ligne?.searchTokens).toEqual(expect.arrayContaining(['marie', 'dupont']));
  });

  it('retombe sur le PSEUDO quand l’adresse ne donne aucun nom lisible', async () => {
    // `a@example.com` : la partie locale fait UN caractère, sous la borne basse
    // du contrat de pseudo — `displayNameDepuisEmail` rend donc `''`.
    // Persister le vide donnerait une ligne de conversation sans nom et un
    // avatar sans initiale ; le pseudo, lui, existe toujours.
    const { ligne } = await inscrire({ email: 'a@example.com' });

    expect(ligne?.displayName).toBe(ligne?.username);
    expect(String(ligne?.displayName ?? '')).not.toBe('');
  });

  it('une adresse NON-ASCII est refusée par le schéma, jamais dérivée en silence', async () => {
    // Mesuré, pas supposé : `emailSchema` rejette `李雷@example.com` AVANT
    // toute dérivation. Le cas « aucun caractère slugifiable » ne peut donc pas
    // atteindre la création par la porte HTTP — le repli ci-dessus garde
    // l'autre forme, la partie locale trop COURTE, qui elle passe.
    const { prisma } = passerelle();

    await expect(
      new AuthService(prisma as never, 'secret').register({ email: '李雷@example.com' }),
    ).rejects.toThrow(/Email invalide/);
  });

  it('accepte le NUMÉRO à côté de l’adresse — la directive le demande en plus', async () => {
    const { ligne } = await inscrire({ email: 'marie@example.com', phoneNumber: '+33698765432' });

    expect(ligne?.phoneNumber).toBe('+33698765432');
    expect(ligne?.phoneVerifiedAt).toBeInstanceOf(Date);
  });
});

describe("l'e-mail de validation DIT ce que la personne n'a jamais vu", () => {
  it('porte le pseudo et le nom affiché RÉELLEMENT écrits', async () => {
    const { ligne, courriel } = await inscrire({ email: 'marie.dupont@example.com' });

    expect(courriel?.identity?.username).toBe(ligne?.username);
    expect(courriel?.identity?.displayName).toBe(ligne?.displayName);
  });

  it('porte les DEUX liens d’édition — un contrôle sans destination n’en est pas un', async () => {
    const { courriel } = await inscrire({ email: 'marie@example.com' });

    expect(courriel?.identity?.profileUrl).toMatch(/\/settings#profile$/);
    expect(courriel?.identity?.passwordUrl).toMatch(/\/settings#security$/);
  });

  it('dit hasPassword=false quand aucun mot de passe n’a été posé', async () => {
    const { courriel } = await inscrire({ email: 'marie@example.com' });

    expect(courriel?.identity?.hasPassword).toBe(false);
  });

  it('dit hasPassword=true dès qu’un mot de passe a été posé', async () => {
    const { courriel } = await inscrire({ email: 'marie@example.com', password: 'SecurePass123!' });

    expect(courriel?.identity?.hasPassword).toBe(true);
  });

  it('le HASH ne voyage JAMAIS jusqu’au gabarit', async () => {
    const { courriel } = await inscrire({ email: 'marie@example.com', password: 'SecurePass123!' });

    expect(JSON.stringify(courriel)).not.toContain('$2b$12$hash-de-test');
    expect(JSON.stringify(courriel)).not.toContain('SecurePass123!');
  });
});

describe("le chemin AVEC mot de passe est inchangé — c'est celui que tout le monde emprunte", () => {
  const HERITE: RegisterData = {
    username: 'newuser',
    password: 'SecurePass123!',
    firstName: 'New',
    lastName: 'User',
    email: 'newuser@example.com',
  };

  it('hache le mot de passe fourni', async () => {
    const { ligne } = await inscrire(HERITE);

    expect(ligne?.password).toBe('$2b$12$hash-de-test');
  });

  it('respecte le pseudo DEMANDÉ plutôt que de le dériver', async () => {
    const { ligne } = await inscrire(HERITE);

    expect(ligne?.username).toBe('newuser');
  });

  it('respecte le couple firstName/lastName plutôt que de le dériver', async () => {
    const { ligne } = await inscrire(HERITE);

    expect(ligne?.firstName).toBe('New');
    expect(ligne?.lastName).toBe('User');
    expect(ligne?.displayName).toBe('New User');
  });

  it('respecte un displayName FOURNI — la dérivation ne s’applique qu’au silence', async () => {
    const { ligne } = await inscrire({ email: 'marie.dupont@example.com', displayName: 'Marie D.' });

    expect(ligne?.displayName).toBe('Marie D.');
  });
});
