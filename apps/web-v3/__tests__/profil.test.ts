/**
 * @jest-environment node
 */

import {
  bloqueUnParticipant,
  demarreUneConversation,
  envoieUneDemandeDAmi,
  langueDeLAuteurDansLeFil,
  profilDuParticipant,
} from '@/lib/api/profil';
import type { Fil, Message } from '@/lib/api/fil';

/**
 * `lib/api/profil.ts` — CE QUE LA V3 DEMANDE À LA PASSERELLE POUR LE PANNEAU
 * DE PROFIL (§ 12.10.3), CONTRE LA FORME QU'ELLE SERT RÉELLEMENT.
 *
 * `GET /api/v1/directory/people/:handle?expand=relation`
 * (`services/gateway/src/routes/directory/person.ts:175`) rend
 * `publicProfileSchema` (`routes/users/public-profile.ts:88-110`) plus
 * `relation` et `isSelf` (`person.ts:72-94`). Deux absences sont des RÈGLES,
 * gardées ici : aucune langue (#4161), aucune présence sans `expand=presence`
 * (jamais demandé par ce module).
 *
 * `POST /api/v1/conversations` (`routes/conversations/core-lifecycle.ts:73`),
 * `POST /api/v1/directory/friend-requests` (`friend-requests.ts:289`) et
 * `PUT /api/v1/directory/blocks/:userId` (`blocks.ts:301`) sont les TROIS
 * routes réelles des trois actions.
 */

const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

const PROFIL_SERVI = (extra: Record<string, unknown> = {}) => ({
  id: 'u-marta',
  username: 'marta',
  firstName: 'Marta',
  lastName: 'Ruiz',
  displayName: 'Marta Ruiz',
  avatar: null,
  banner: null,
  bio: 'Traductrice · Madrid. Je relis les revues trimestrielles.',
  role: 'USER',
  createdAt: '2024-03-01T00:00:00.000Z',
  voicePublic: false,
  voiceSampleUrl: null,
  voiceSampleDurationMs: null,
  voiceQuality: null,
  isAnonymous: false,
  isMeeshyer: true,
  relation: 'none',
  isSelf: false,
  ...extra,
});

describe('profilDuParticipant — GET /directory/people/:handle?expand=relation', () => {
  it('projette le profil, la relation et isSelf, sans langue ni présence', async () => {
    const recuperer = jest.fn(async () => json({ success: true, data: PROFIL_SERVI() }));
    const issue = await profilDuParticipant({ handle: 'u-marta', jeton: 'jwt', base: 'https://gate.test', recuperer });

    expect(issue).toEqual({
      genre: 'profil',
      profil: {
        id: 'u-marta',
        nom: 'Marta Ruiz',
        pseudonyme: 'marta',
        bio: 'Traductrice · Madrid. Je relis les revues trimestrielles.',
        membreDepuis: '2024-03-01T00:00:00.000Z',
        anonyme: false,
      },
      relation: 'none',
      estSoi: false,
    });
    // Ni `isOnline`, ni `lastActiveAt`, ni `systemLanguage` ne sont LUS — même
    // servis par erreur, ce module ne les rapporte pas dans le type qu'il rend.
    expect(Object.keys((issue as { profil: object }).profil)).not.toContain('langue');
  });

  it('lit la relation SERVIE, quelle qu’elle soit', async () => {
    const recuperer = jest.fn(async () => json({ success: true, data: PROFIL_SERVI({ relation: 'friend' }) }));
    const issue = await profilDuParticipant({ handle: 'u-marta', jeton: 'jwt', recuperer });
    expect(issue).toMatchObject({ genre: 'profil', relation: 'friend' });
  });

  it('rend isSelf et relation self quand la passerelle les sert', async () => {
    const recuperer = jest.fn(async () => json({ success: true, data: PROFIL_SERVI({ relation: 'self', isSelf: true }) }));
    const issue = await profilDuParticipant({ handle: 'u-moi', jeton: 'jwt', recuperer });
    expect(issue).toMatchObject({ genre: 'profil', relation: 'self', estSoi: true });
  });

  it('appelle SANS Authorization un lecteur anonyme — jeton null, jamais une session invitée', async () => {
    let entetes: Record<string, string> = {};
    const recuperer = async (_url: string, options: RequestInit): Promise<Response> => {
      entetes = options.headers as Record<string, string>;
      return json({ success: true, data: PROFIL_SERVI() });
    };
    await profilDuParticipant({ handle: 'u-marta', jeton: null, recuperer });
    expect(entetes.authorization).toBeUndefined();
  });

  it('rend introuvable sur un 404', async () => {
    const recuperer = async (): Promise<Response> => json({ success: false, error: 'NOT_FOUND' }, 404);
    expect(await profilDuParticipant({ handle: 'x', jeton: null, recuperer })).toEqual({ genre: 'introuvable' });
  });

  it('rend la PHRASE SERVIE sur un 429 — jamais une phrase inventée', async () => {
    const recuperer = async (): Promise<Response> =>
      json({ success: false, message: 'Trop de consultations de profil. Veuillez patienter une minute.' }, 429);
    expect(await profilDuParticipant({ handle: 'x', jeton: null, recuperer })).toEqual({
      genre: 'limite',
      message: 'Trop de consultations de profil. Veuillez patienter une minute.',
    });
  });

  it('rend panne sur une passerelle muette', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('ECONNREFUSED');
    };
    expect(await profilDuParticipant({ handle: 'x', jeton: null, recuperer })).toEqual({ genre: 'panne' });
  });

  it('rend panne sur une enveloppe malformée', async () => {
    const recuperer = async (): Promise<Response> => json({ success: true, data: { id: 'x' } });
    // Sans `displayName` NI `username`, le profil n'a pas de nom — jamais un repli inventé.
    expect(await profilDuParticipant({ handle: 'x', jeton: null, recuperer })).toEqual({ genre: 'panne' });
  });

  it('joint l’adresse exacte, avec ?expand=relation', async () => {
    let urlAppelee = '';
    const recuperer = async (url: string): Promise<Response> => {
      urlAppelee = url;
      return json({ success: true, data: PROFIL_SERVI() });
    };
    await profilDuParticipant({ handle: 'u-marta', jeton: null, base: 'https://gate.test', recuperer });
    expect(urlAppelee).toBe('https://gate.test/api/v1/directory/people/u-marta?expand=relation');
  });
});

describe('les trois actions — chacune sa route réelle', () => {
  it('demarreUneConversation POST /conversations type:direct, et lit l’id rendu', async () => {
    const vu: { valeur: { readonly url: string; readonly options: RequestInit } | null } = { valeur: null };
    const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
      vu.valeur = { url, options };
      return json({ success: true, data: { id: 'c-neuve' } });
    };
    const issue = await demarreUneConversation({ jeton: 'jwt', cible: 'u-marta', recuperer });
    expect(issue).toEqual({ genre: 'redirection', conversation: 'c-neuve' });
    expect(vu.valeur?.url).toContain('/api/v1/conversations');
    expect(vu.valeur?.options.method).toBe('POST');
    expect(JSON.parse(vu.valeur?.options.body as string)).toEqual({ type: 'direct', participantIds: ['u-marta'] });
  });

  it('envoieUneDemandeDAmi POST /directory/friend-requests avec receiverId', async () => {
    const vu: { valeur: { readonly url: string; readonly options: RequestInit } | null } = { valeur: null };
    const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
      vu.valeur = { url, options };
      return json({ success: true, data: {} }, 201);
    };
    const issue = await envoieUneDemandeDAmi({ jeton: 'jwt', cible: 'u-marta', recuperer });
    expect(issue).toEqual({ genre: 'fait' });
    expect(vu.valeur?.url).toContain('/api/v1/directory/friend-requests');
    expect(JSON.parse(vu.valeur?.options.body as string)).toEqual({ receiverId: 'u-marta' });
  });

  it('bloqueUnParticipant PUT /directory/blocks/:userId', async () => {
    const vu: { valeur: { readonly url: string; readonly options: RequestInit } | null } = { valeur: null };
    const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
      vu.valeur = { url, options };
      return json({ success: true, data: { blocked: true } });
    };
    const issue = await bloqueUnParticipant({ jeton: 'jwt', cible: 'u-marta', base: 'https://gate.test', recuperer });
    expect(issue).toEqual({ genre: 'fait' });
    expect(vu.valeur?.url).toBe('https://gate.test/api/v1/directory/blocks/u-marta');
    expect(vu.valeur?.options.method).toBe('PUT');
  });

  it('rend refus sur un 4xx, panne sur un 5xx — jamais la même issue', async () => {
    const recuperer4xx = async (): Promise<Response> => json({ success: false }, 409);
    expect(await envoieUneDemandeDAmi({ jeton: 'jwt', cible: 'x', recuperer: recuperer4xx })).toEqual({ genre: 'refus' });

    const recuperer5xx = async (): Promise<Response> => json({ success: false }, 500);
    expect(await envoieUneDemandeDAmi({ jeton: 'jwt', cible: 'x', recuperer: recuperer5xx })).toEqual({ genre: 'panne' });
  });
});

describe('langueDeLAuteurDansLeFil — la langue vient du FIL, jamais du profil', () => {
  const MESSAGE = (attributs: Partial<Message> = {}): Message => ({
    id: 'm1',
    clientMessageId: null,
    auteur: 'Marta',
    auteurId: 'u-marta',
    anonyme: false,
    deMoi: false,
    systeme: false,
    texte: 'Hola',
    texteOriginal: 'Hola',
    langueServie: null,
    langueOriginale: 'es',
    traductions: {},
    ecritA: '2026-09-01T12:00:00.000Z',
    protege: false,
    edite: false,
    supprime: false,
    pieces: [],
    citations: [],
    reactions: [],
    accuse: 'lu',
    ...attributs,
  });

  const FIL_DE = (messages: readonly Message[]): Fil => ({
    id: 'c1',
    titre: 'Équipe Lagos',
    membres: 4,
    presence: { participants: [], presents: [] },
    messages,
    plusAncien: null,
  });

  it('rend la langue d’origine du dernier message de cet auteur', () => {
    expect(langueDeLAuteurDansLeFil(FIL_DE([MESSAGE()]), 'u-marta')).toBe('es');
  });

  it('rend le PLUS RÉCENT quand l’auteur a écrit plusieurs fois dans des langues différentes', () => {
    const fil = FIL_DE([MESSAGE({ id: 'm1', langueOriginale: 'es' }), MESSAGE({ id: 'm2', langueOriginale: 'en' })]);
    expect(langueDeLAuteurDansLeFil(fil, 'u-marta')).toBe('en');
  });

  it('rend null sans message de cet auteur dans la tranche — jamais une devinette', () => {
    expect(langueDeLAuteurDansLeFil(FIL_DE([MESSAGE({ auteurId: 'u-autre' })]), 'u-marta')).toBeNull();
  });

  it('rend null pour un message ANONYME — un invité de lien n’a pas de « langue de profil »', () => {
    expect(langueDeLAuteurDansLeFil(FIL_DE([MESSAGE({ anonyme: true })]), 'u-marta')).toBeNull();
  });

  it('rend null sans fil chargé (la liste, par exemple)', () => {
    expect(langueDeLAuteurDansLeFil(null, 'u-marta')).toBeNull();
  });
});
