/**
 * @jest-environment node
 *
 * LE LIEN D'UNE FICHE SE DÉPLIE EN CARTE DE PROFIL CHEZ LES ROBOTS D'APERÇU (#18865).
 *
 * `GET /people/:username/og` est ce que Traefik sert aux robots qui déplient
 * `/u/<pseudo>` ou `/@<pseudo>`. Le robot est un lecteur ANONYME, et un profil ne se
 * montre qu'à un membre connecté (#10205) : PAR DÉFAUT la page est l'aperçu GÉNÉRIQUE de
 * Meeshy, quel que soit le pseudo, sans aucune lecture de `User`. La carte nommée (niveau
 * PUBLIC : nom, pseudo, bannière sinon avatar, bio, ville d'un cercle PUBLIC) ne vit que
 * derrière le drapeau serveur `PERSON_UNFURL_NAMED_CARD`, éteint, en attendant la
 * décision du porteur. Jamais l'e-mail, le téléphone, la présence, le pays, le fuseau.
 * Les témoins lisent la page RENDUE (`app.inject`).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

import { registerLinkUnfurlRoute } from '../../../../routes/links/unfurl';
import { personUnfurlNamedCardEnabled } from '../../../../services/linkUnfurl/person';
import { clearPrivacyPreferencesCache } from '../../../../services/preferences/privacy-cache';

const ORIGIN = 'https://staging.meeshy.me';
const BANNER_KEY = '2026/10/66f0c0ffee0000000000abcd/banniere.jpg';
const AVATAR_URL = 'https://gate.meeshy.me/api/v1/attachments/file/2026%2F10%2Favatar.png';
const GENERIQUE_FR = 'Meeshy — la messagerie qui traduit';
const IMAGE_DE_MARQUE = `${ORIGIN}/og/invitation-v1.png`;

type Fiche = {
  readonly id?: string;
  readonly username?: string;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
  readonly banner?: string | null;
  readonly bio?: string;
  readonly city?: string | null;
  readonly cityCircle?: string | null;
  readonly isActive?: boolean;
  readonly deletedAt?: Date | null;
  readonly deactivatedAt?: Date | null;
  readonly systemLanguage?: string | null;
};

const fiche = (o: Fiche = {}) => ({
  id: o.id ?? '66f0c0ffee0000000000aaaa',
  username: o.username ?? 'amani',
  displayName: o.displayName === undefined ? 'Amani Diallo' : o.displayName,
  avatar: o.avatar === undefined ? AVATAR_URL : o.avatar,
  banner: o.banner === undefined ? BANNER_KEY : o.banner,
  bio: o.bio ?? 'Je traduis des poèmes wolof.',
  city: o.city === undefined ? 'Dakar' : o.city,
  cityCircle: o.cityCircle === undefined ? 'PUBLIC' : o.cityCircle,
  isActive: o.isActive ?? true,
  deletedAt: o.deletedAt ?? null,
  deactivatedAt: o.deactivatedAt ?? null,
  systemLanguage: o.systemLanguage === undefined ? 'fr' : o.systemLanguage,
  regionalLanguage: null,
  customDestinationLanguage: null,
  deviceLocale: null,
  email: 'amani@example.org',
  phoneNumber: '+33600000000',
  isOnline: true,
  lastActiveAt: new Date('2026-10-13T10:00:00Z'),
  registrationCountry: 'SN',
  timezone: 'Africa/Dakar',
});

type Ligne = ReturnType<typeof fiche> | null;

const prismaStrict = (ligne: Ligne, options: { readonly hides?: boolean; readonly privacyFails?: boolean } = {}) => {
  const findFirst = jest.fn(async (args: { where: { username?: { equals: string } } }) =>
    ligne !== null && args.where.username?.equals.toLowerCase() === ligne.username.toLowerCase() ? ligne : null);
  const prefsFindMany = jest.fn(async (args: { where: { userId: { in: string[] } } }) => {
    if (options.privacyFails) throw new Error('privacy read down');
    return args.where.userId.in.map((userId) => ({ userId, privacy: { hideProfileFromSearch: options.hides === true } }));
  });
  const strict = <T extends object>(target: T, nom: string): T =>
    new Proxy(target, {
      get(cible, prop) {
        if (prop in cible) return cible[prop as keyof T];
        if (prop === 'then') return undefined;
        throw new Error(`${nom}.${String(prop)} n'est pas une lecture de l'aperçu`);
      },
    });
  return {
    prisma: strict({
      user: strict({ findFirst }, 'user'),
      userPreferences: strict({ findMany: prefsFindMany }, 'userPreferences'),
      userPreference: strict({ findMany: jest.fn(async () => []) }, 'userPreference'),
    }, 'prisma'),
    findFirst,
  };
};

type Drapeau = { readonly nommee?: boolean | 'absent' };

const monter = async (ligne: Ligne, options: Parameters<typeof prismaStrict>[1] & Drapeau = {}) => {
  const { prisma, findFirst } = prismaStrict(ligne, options);
  const app: FastifyInstance = Fastify({ logger: false });
  await app.register(rateLimit, { global: false, skipOnError: true });
  const nommee = options.nommee ?? true;
  registerLinkUnfurlRoute(app, nommee === 'absent'
    ? { prisma: prisma as never, origin: ORIGIN }
    : { prisma: prisma as never, origin: ORIGIN, namedPersonCard: nommee });
  await app.ready();
  return { app, findFirst };
};

const page = async (
  ligne: Ligne = fiche(),
  options: { readonly username?: string; readonly acceptLanguage?: string; readonly hides?: boolean; readonly privacyFails?: boolean } & Drapeau = {},
) => {
  const { app, findFirst } = await monter(ligne, options);
  const reponse = await app.inject({
    method: 'GET',
    url: `/people/${encodeURIComponent(options.username ?? 'amani')}/og`,
    headers: options.acceptLanguage ? { 'accept-language': options.acceptLanguage } : {},
  });
  await app.close();
  return { reponse, findFirst };
};

const meta = (html: string, cle: string): string | undefined => {
  const echappee = cle.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
  return html.match(new RegExp(`<meta (?:property|name)="${echappee}" content="([^"]*)"`))?.[1];
};

beforeEach(() => clearPrivacyPreferencesCache());

describe('Par défaut, un profil ne se montre pas hors de Meeshy (#10205) : l’aperçu est générique', () => {
  const generiqueSansLecture = (body: string) => {
    expect(meta(body, 'og:title')).toBe(GENERIQUE_FR);
    expect(meta(body, 'og:image')).toBe(IMAGE_DE_MARQUE);
    for (const trace of ['amani', 'Amani', 'Dakar', 'wolof', 'banniere', 'avatar.png']) expect(body).not.toContain(trace);
  };

  it('sans drapeau, une fiche vivante rend l’aperçu générique sans lire User', async () => {
    const { reponse, findFirst } = await page(fiche(), { nommee: 'absent' });
    expect(reponse.statusCode).toBe(200);
    generiqueSansLecture(reponse.body);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('drapeau éteint : la même page pour un pseudo vivant et un pseudo inconnu', async () => {
    const vivante = await page(fiche(), { nommee: false });
    const inconnue = await page(null, { nommee: false, username: 'personne' });
    generiqueSansLecture(vivante.reponse.body);
    expect(vivante.findFirst).not.toHaveBeenCalled();
    expect(vivante.reponse.body).toBe(inconnue.reponse.body);
  });

  it('le drapeau serveur ne s’allume que sur « true » explicite', () => {
    expect(personUnfurlNamedCardEnabled({})).toBe(false);
    expect(personUnfurlNamedCardEnabled({ PERSON_UNFURL_NAMED_CARD: '' })).toBe(false);
    expect(personUnfurlNamedCardEnabled({ PERSON_UNFURL_NAMED_CARD: '1' })).toBe(false);
    expect(personUnfurlNamedCardEnabled({ PERSON_UNFURL_NAMED_CARD: 'false' })).toBe(false);
    expect(personUnfurlNamedCardEnabled({ PERSON_UNFURL_NAMED_CARD: 'true' })).toBe(true);
  });
});

describe('Drapeau allumé : une fiche vivante se déplie en carte de profil au niveau Public', () => {
  it('nomme la personne, montre sa bannière et sa bio, et ouvre /u/<pseudo>', async () => {
    const { reponse } = await page();
    const html = reponse.body;

    expect(reponse.statusCode).toBe(200);
    expect(reponse.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(meta(html, 'og:title')).toBe('Amani Diallo (@amani) sur Meeshy');
    expect(meta(html, 'og:description')).toContain('Je traduis des poèmes wolof.');
    expect(meta(html, 'og:url')).toBe(`${ORIGIN}/u/amani`);
    expect(meta(html, 'og:image')).toContain('banniere.jpg');
    expect(meta(html, 'twitter:card')).toBe('summary_large_image');
  });

  it('montre l’avatar en carte carrée quand il n’y a pas de bannière', async () => {
    const { reponse } = await page(fiche({ banner: null }));
    expect(meta(reponse.body, 'og:image')).toBe(AVATAR_URL);
    expect(meta(reponse.body, 'twitter:card')).toBe('summary');
  });

  it('retombe sur l’image de marque sans bannière ni avatar', async () => {
    const { reponse } = await page(fiche({ banner: null, avatar: null }));
    expect(meta(reponse.body, 'og:image')).toBe(IMAGE_DE_MARQUE);
  });

  it('sert la ville seulement quand son cercle est PUBLIC', async () => {
    const ouverte = await page(fiche({ city: 'Dakar', cityCircle: 'PUBLIC' }));
    expect(meta(ouverte.reponse.body, 'og:description')).toContain('Dakar');
    for (const cercle of ['FRIEND', 'COMMUNITY', 'BLOOD', null, 'N’IMPORTE QUOI']) {
      const fermee = await page(fiche({ city: 'Dakar', cityCircle: cercle }));
      expect(fermee.reponse.body).not.toContain('Dakar');
    }
  });

  it('ne sert rien au-delà du niveau Public : ni e-mail, ni téléphone, ni présence, ni pays, ni fuseau', async () => {
    const { reponse } = await page();
    for (const secret of ['amani@example.org', '+33600000000', 'SN', 'Africa/Dakar', '2026-10-13', 'isOnline']) {
      expect(reponse.body).not.toContain(secret);
    }
  });

  it('lit la fiche par pseudo sans tenir compte de la casse, et sert le pseudo canonique', async () => {
    const { reponse } = await page(fiche(), { username: 'AMANI' });
    expect(meta(reponse.body, 'og:url')).toBe(`${ORIGIN}/u/amani`);
  });

  it('choisit la langue de la carte d’après le lecteur (Accept-Language), la bio restant dans sa langue d’origine', async () => {
    const { reponse } = await page(fiche({ systemLanguage: 'fr' }), { acceptLanguage: 'en-US,en;q=0.9' });
    expect(meta(reponse.body, 'og:title')).toBe('Amani Diallo (@amani) on Meeshy');
    expect(meta(reponse.body, 'og:description')).toContain('Je traduis des poèmes wolof.');
  });

  it('sans bio, dit la promesse de Meeshy', async () => {
    const { reponse } = await page(fiche({ bio: '   ', city: null }));
    expect(meta(reponse.body, 'og:description')).toBe('Écris dans ta langue, lis dans la tienne : Meeshy traduit chaque message en temps réel.');
  });

  it('assainit la bio : balisage échappé, caractères invisibles retirés, longueur bornée', async () => {
    const bio = `<script>alert(1)</script>‮abc​ ${'x'.repeat(400)}`;
    const { reponse } = await page(fiche({ bio }));
    expect(reponse.body).not.toContain('<script>alert');
    expect(reponse.body).not.toContain('‮');
    expect(reponse.body).not.toContain('​');
    expect([...(meta(reponse.body, 'og:description') ?? '')].length).toBeLessThanOrEqual(200);
  });

  it('un nom affiché absent laisse le pseudo seul pour titre', async () => {
    const { reponse } = await page(fiche({ displayName: null }));
    expect(meta(reponse.body, 'og:title')).toBe('@amani sur Meeshy');
  });
});

describe('Drapeau allumé : tout ce qui n’a pas à être nommé rend l’aperçu générique, indiscernable d’une fiche inconnue', () => {
  const generique = (body: string) => {
    expect(meta(body, 'og:title')).toBe(GENERIQUE_FR);
    expect(meta(body, 'og:image')).toBe(IMAGE_DE_MARQUE);
    expect(body).not.toContain('amani');
    expect(body).not.toContain('Amani');
  };

  it('pseudo inconnu', async () => {
    const { reponse } = await page(null);
    expect(reponse.statusCode).toBe(200);
    generique(reponse.body);
  });

  it('compte désactivé, supprimé ou inactif', async () => {
    for (const ligne of [
      fiche({ isActive: false }),
      fiche({ deletedAt: new Date('2026-10-01') }),
      fiche({ deactivatedAt: new Date('2026-10-01') }),
    ]) {
      const { reponse } = await page(ligne);
      generique(reponse.body);
    }
  });

  it('personne qui se cache de la recherche, ou dont la préférence est illisible (fail-closed)', async () => {
    generique((await page(fiche(), { hides: true })).reponse.body);
    generique((await page(fiche(), { privacyFails: true })).reponse.body);
  });

  it('un pseudo qui n’en est pas un ne déclenche aucune lecture', async () => {
    for (const mauvais of ['a/b', '..%2Fx', 'x'.repeat(65), 'a b', '']) {
      const { reponse, findFirst } = await page(fiche(), { username: mauvais });
      expect(reponse.statusCode === 200 || reponse.statusCode === 404).toBe(true);
      expect(findFirst).not.toHaveBeenCalled();
      if (reponse.statusCode === 200) generique(reponse.body);
    }
  });

  it('une lecture qui échoue rend le générique, jamais une erreur', async () => {
    const { app } = await monter(fiche());
    const casse = Fastify({ logger: false });
    await casse.register(rateLimit, { global: false, skipOnError: true });
    registerLinkUnfurlRoute(casse, {
      prisma: { user: { findFirst: async () => { throw new Error('db down'); } } } as never,
      origin: ORIGIN,
      namedPersonCard: true,
    });
    await casse.ready();
    const reponse = await casse.inject({ method: 'GET', url: '/people/amani/og' });
    await casse.close();
    await app.close();
    expect(reponse.statusCode).toBe(200);
    generique(reponse.body);
  });

  it('ne sert aucune autre donnée que celle du niveau Public dans l’en-tête de cache', async () => {
    const { reponse } = await page();
    expect(reponse.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(reponse.headers['referrer-policy']).toBe('no-referrer');
  });
});
