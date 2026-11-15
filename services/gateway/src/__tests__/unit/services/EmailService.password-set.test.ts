/**
 * Le courriel « Mot de passe oublié » dit DÉFINIR à un compte qui n'a jamais eu
 * de mot de passe (#6642).
 *
 * `sendPasswordResetEmail` servait « Réinitialisez votre mot de passe » à tout
 * le monde, y compris à un compte créé par e-mail seul (#6424). La variante se
 * choisit par `intent` — `'set'` pour un compte sans mot de passe, `'reset'`
 * sinon — et la variante RÉINITIALISER reste mot pour mot celle d'avant.
 *
 * Témoin par l'API publique : ce qui part chez le fournisseur (sujet, HTML,
 * texte), jamais la table de traduction. Les libellés sont écrits en clair ici
 * parce que les trois clients s'alignent dessus.
 *
 * Fichier séparé : `EmailService.test.ts` est gelé au cliquet de taille des
 * suites (`gateway-test-file-size-budget.test.ts`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

const mockAxiosPost = jest.fn(async (_url: string, _body: Record<string, unknown>) => ({
  status: 200,
  data: { messageId: 'msg-6642' },
  headers: {}
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: { post: (url: string, body: Record<string, unknown>) => mockAxiosPost(url, body) }
}));

import { EmailService } from '../../../services/EmailService';

type Intention = 'set' | 'reset';
type Envoi = { subject: string; html: string; text: string };
type Libelles = { subject: string; title: string; intro: string; button: string };

const envoyer = async (intent: Intention, language: string): Promise<Envoi> => {
  process.env.BREVO_API_KEY = 'test-brevo-key';
  const service = new EmailService();

  await service.sendPasswordResetEmail({
    to: 'awa@example.com',
    name: 'Awa',
    resetLink: 'https://meeshy.test/lien?token=abc',
    expiryMinutes: 15,
    language,
    intent
  });

  const corps = mockAxiosPost.mock.calls.at(-1)?.[1] ?? {};
  return { subject: String(corps.subject), html: String(corps.htmlContent), text: String(corps.textContent) };
};

const DEFINIR: Readonly<Record<string, Libelles>> = {
  fr: {
    subject: 'Définissez votre mot de passe - Meeshy',
    title: 'Définir votre mot de passe',
    intro: 'Vous avez demandé à définir un mot de passe pour votre compte Meeshy :',
    button: 'Définir mon mot de passe'
  },
  en: {
    subject: 'Set your password - Meeshy',
    title: 'Set your password',
    intro: 'You have requested to set a password for your Meeshy account:',
    button: 'Set my password'
  },
  es: {
    subject: 'Establece tu contraseña - Meeshy',
    title: 'Establecer tu contraseña',
    intro: 'Has solicitado establecer una contraseña para tu cuenta de Meeshy:',
    button: 'Establecer mi contraseña'
  },
  pt: {
    subject: 'Defina sua senha - Meeshy',
    title: 'Definir sua senha',
    intro: 'Você solicitou definir uma senha para sua conta Meeshy:',
    button: 'Definir minha senha'
  },
  it: {
    subject: 'Imposta la tua password - Meeshy',
    title: 'Imposta la tua password',
    intro: 'Hai richiesto di impostare una password per il tuo account Meeshy:',
    button: 'Imposta la mia password'
  },
  de: {
    subject: 'Lege dein Passwort fest - Meeshy',
    title: 'Passwort festlegen',
    intro: 'Du hast angefordert, ein Passwort für dein Meeshy-Konto festzulegen:',
    button: 'Mein Passwort festlegen'
  }
};

const REINITIALISER: Readonly<Record<'fr' | 'en', Libelles>> = {
  fr: {
    subject: 'Réinitialisez votre mot de passe - Meeshy',
    title: 'Réinitialisation de mot de passe',
    intro: 'Vous avez demandé à réinitialiser votre mot de passe Meeshy :',
    button: 'Réinitialiser le mot de passe'
  },
  en: {
    subject: 'Reset your password - Meeshy',
    title: 'Password Reset',
    intro: 'You have requested to reset your Meeshy password:',
    button: 'Reset password'
  }
};

const porteLesLibelles = (envoi: Envoi, libelles: Libelles) => {
  expect(envoi.subject).toBe(libelles.subject);
  expect(envoi.html).toContain(libelles.title);
  expect(envoi.html).toContain(libelles.intro);
  expect(envoi.html).toContain(libelles.button);
  expect(envoi.text).toContain(libelles.title);
  expect(envoi.text).toContain(libelles.intro);
};

describe("courriel « Mot de passe oublié » d'un compte sans mot de passe (#6642)", () => {
  it.each(Object.entries(DEFINIR))('dit « définir » en %s : sujet, titre, intro et bouton', async (language, libelles) => {
    porteLesLibelles(await envoyer('set', language), libelles);
  });

  it.each(Object.entries(REINITIALISER))(
    'garde la variante RÉINITIALISER mot pour mot en %s pour un compte qui a un mot de passe',
    async (language, libelles) => {
      porteLesLibelles(await envoyer('reset', language), libelles);
    }
  );

  it.each(Object.entries(REINITIALISER))(
    'la variante DÉFINIR ne reprend en %s aucun libellé de la réinitialisation',
    async (language, libelles) => {
      const envoi = await envoyer('set', language);

      expect(envoi.subject).not.toBe(libelles.subject);
      for (const libelle of [libelles.title, libelles.intro, libelles.button]) {
        expect(envoi.html).not.toContain(libelle);
        expect(envoi.text).not.toContain(libelle);
      }
    }
  );

  it("garde l'expiration et la mention « ignorer » de la réinitialisation", async () => {
    const envoi = await envoyer('set', 'fr');

    expect(envoi.html).toContain('Ce lien expire dans 15 minutes.');
    expect(envoi.html).toContain("Si vous n'avez pas fait cette demande, ignorez cet email");
    expect(envoi.html).toContain('https://meeshy.test/lien?token=abc');
  });
});
