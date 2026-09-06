/**
 * @jest-environment node
 */
import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { bandeauDesEpingles } from '@/app/connecte/epingles-vue';
import { menuDeLigne } from '@/app/connecte/fil-lignes';
import { soumissionDuFil as soumissionDePorte, traiteLaSoumission } from '@/app/connecte/fil-porte';
import { message, type Message } from '@/lib/api/fil';
import { desepingle, epingle } from '@/lib/api/fil-mutations';
import { FIL } from '@/lib/contenu/fil';

/**
 * ÉPINGLER / DÉSÉPINGLER UN MESSAGE (issue #5385) — le bandeau des épinglés
 * en tête du fil, et l'action dans le menu d'une ligne. Chemin PAUVRE
 * (§ 12.4) : un `<form method="post">`, une route relue avant tout code
 * (`services/gateway/src/routes/conversations/messages-pin.ts`), aucun
 * module.
 */

const LANGUES = ['fr'];
const ORIGINE = 'https://gate.test';

const brutDe = (id: string, contenu: string, attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  content: contenu,
  originalLanguage: 'fr',
  createdAt: '2026-09-01T12:00:00.000Z',
  senderId: 'u1',
  sender: { id: 'p1', displayName: 'Amina' },
  ...attributs,
});

const unMessage = (id: string, contenu: string, attributs: Record<string, unknown> = {}): Message =>
  message(brutDe(id, contenu, attributs), 'u1', LANGUES, ORIGINE)!;

describe('message() lit pinnedAt (issue #5385)', () => {
  it('épinglé quand `pinnedAt` est servi', () => {
    expect(unMessage('m1', 'x', { pinnedAt: '2026-09-06T10:00:00.000Z' }).epingle).toBe(true);
  });

  it('pas épinglé sans `pinnedAt`', () => {
    expect(unMessage('m1', 'x').epingle).toBe(false);
  });
});

describe('soumissionDuFil lit epingler/desepingler (issue #5385)', () => {
  const formulaire = (entrees: Readonly<Record<string, string>>): FormData => {
    const donnees = new FormData();
    Object.entries(entrees).forEach(([cle, valeur]) => donnees.set(cle, valeur));
    return donnees;
  };

  it('le bouton "epingler", posté seul', () => {
    expect(soumissionDePorte(formulaire({ epingler: 'm1' }))).toEqual({ genre: 'epingler', messageId: 'm1' });
  });

  it('le bouton "desepingler", posté seul', () => {
    expect(soumissionDePorte(formulaire({ desepingler: 'm1' }))).toEqual({ genre: 'desepingler', messageId: 'm1' });
  });

  it('retirer l’emporte sur epingler, qui l’emporte sur modifie', () => {
    expect(soumissionDePorte(formulaire({ retirer: 'm9', epingler: 'm1', modifie: 'm2', texte: 'x' }))).toEqual({
      genre: 'retrait',
      messageId: 'm9',
    });
    expect(soumissionDePorte(formulaire({ epingler: 'm1', modifie: 'm2', texte: 'x' }))).toEqual({ genre: 'epingler', messageId: 'm1' });
  });
});

describe('traiteLaSoumission bascule l’épingle — n’importe quel membre, n’importe quel message', () => {
  const appels: { url: string; methode: string }[] = [];
  const original = globalThis.fetch;

  beforeEach(() => {
    appels.length = 0;
    globalThis.fetch = (async (url: string | URL | Request, options: RequestInit = {}) => {
      appels.push({ url: String(url), methode: options.method ?? 'GET' });
      return new Response(JSON.stringify({ success: true, data: { pinnedAt: '2026-09-06T10:00:00.000Z' } }), { status: 200 });
    }) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = original;
  });

  it('epingler PUT .../messages/:id/pin, et redirige vers le message VISÉ', async () => {
    const issue = await traiteLaSoumission({
      soumission: { genre: 'epingler', messageId: 'm5' },
      creance: { genre: 'membre', jeton: 'JWT' },
      conversation: 'c1',
      adresse: '/chats/c1',
    });
    expect(issue).toEqual({ genre: 'redirection', vers: '/chats/c1#m-m5' });
    expect(appels[0]?.methode).toBe('PUT');
    expect(appels[0]?.url).toContain('/conversations/c1/messages/m5/pin');
  });

  it('desepingler DELETE .../messages/:id/pin', async () => {
    const issue = await traiteLaSoumission({
      soumission: { genre: 'desepingler', messageId: 'm5' },
      creance: { genre: 'membre', jeton: 'JWT' },
      conversation: 'c1',
      adresse: '/chats/c1',
    });
    expect(issue).toEqual({ genre: 'redirection', vers: '/chats/c1#m-m5' });
    expect(appels[0]?.methode).toBe('DELETE');
  });

  it('un invité est refusé SANS qu’aucune requête ne parte (fail-closed, dimension 1)', async () => {
    const issue = await traiteLaSoumission({
      soumission: { genre: 'epingler', messageId: 'm5' },
      creance: { genre: 'invite', jeton: 'SESSION' },
      conversation: 'c1',
      adresse: '/chat/lnk',
    });
    expect(issue.genre).toBe('erreur');
    expect(appels).toEqual([]);
  });

  it('un refus de la passerelle revient en erreur', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: false, error: { message: 'Message not found' } }), { status: 404 })) as typeof fetch;
    const issue = await traiteLaSoumission({
      soumission: { genre: 'epingler', messageId: 'm5' },
      creance: { genre: 'membre', jeton: 'JWT' },
      conversation: 'c1',
      adresse: '/chats/c1',
    });
    expect(issue).toEqual({ genre: 'erreur', message: 'Message not found', brouillon: '', statut: 404 });
  });
});

describe('lib/api/fil-mutations — epingle/desepingle', () => {
  it('epingle refuse un invité sans requête', async () => {
    const appels: string[] = [];
    const issue = await epingle({
      creance: { genre: 'invite', jeton: 'x' },
      conversation: 'c1',
      messageId: 'm1',
      recuperer: async (url) => {
        appels.push(url);
        throw new Error('ne devrait jamais être appelé');
      },
    });
    expect(issue).toEqual({ genre: 'refus', message: expect.any(String), statut: 403 });
    expect(appels).toEqual([]);
  });

  it('desepingle rend "fait" sur un 200', async () => {
    const issue = await desepingle({
      creance: { genre: 'membre', jeton: 'x' },
      conversation: 'c1',
      messageId: 'm1',
      recuperer: async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    });
    expect(issue).toEqual({ genre: 'fait' });
  });

  it('rend un refus quand la passerelle est injoignable', async () => {
    const issue = await epingle({
      creance: { genre: 'membre', jeton: 'x' },
      conversation: 'c1',
      messageId: 'm1',
      recuperer: async () => null as never,
    });
    expect(issue).toEqual({ genre: 'refus', message: expect.any(String), statut: null });
  });
});

describe('menuDeLigne — épingler/désépingler, sans distinction d’auteur', () => {
  const M_DE_MOI = unMessage('m1', 'Mon message');
  const M_DE_QUELQUUN_D_AUTRE = message(
    { id: 'm2', content: 'Le sien', originalLanguage: 'fr', createdAt: '2026-09-01T12:00:00.000Z', senderId: 'u2', sender: { id: 'p2', displayName: 'Ibrahim' } },
    'u1',
    LANGUES,
    ORIGINE,
  )!;
  const M_EPINGLE = unMessage('m3', 'Déjà épinglé', { pinnedAt: '2026-09-06T10:00:00.000Z' });

  const OPTIONS = { composeurOuvert: true, maintenant: Date.parse('2026-09-01T12:30:00.000Z'), estInvite: false };

  it('un membre peut épingler le message d’un AUTRE — la passerelle ne borne pas à l’auteur', () => {
    const html = menuDeLigne(M_DE_QUELQUUN_D_AUTRE, '/chats/c1', OPTIONS);
    expect(html).toContain('name="epingler"');
    expect(html).toContain(FIL.epingler);
  });

  it('un message DÉJÀ épinglé montre "Désépingler", jamais "Épingler"', () => {
    const html = menuDeLigne(M_EPINGLE, '/chats/c1', OPTIONS);
    expect(html).toContain('name="desepingler"');
    expect(html).toContain(FIL.desepingler);
    expect(html).not.toContain('name="epingler"');
  });

  it('un invité ne voit ni "Épingler" ni "Désépingler"', () => {
    const html = menuDeLigne(M_DE_MOI, '/chats/c1', { ...OPTIONS, estInvite: true });
    expect(html).not.toContain('name="epingler"');
    expect(html).not.toContain('name="desepingler"');
  });

  it('le bouton se POSTE (formmethod="post"), le formulaire englobant restant en GET', () => {
    const html = menuDeLigne(M_DE_MOI, '/chats/c1', OPTIONS);
    expect(html).toContain('<form method="get"');
    expect(html).toMatch(/name="epingler"[^>]*formmethod="post"/);
  });
});

describe('bandeauDesEpingles — le bandeau en tête du fil', () => {
  it('ne rend rien sans épingle', () => {
    expect(bandeauDesEpingles([], '/chats/c1')).toBe('');
  });

  it('rend le compte et le texte du plus RÉCEMMENT épinglé, avec un lien vers lui', () => {
    const recent = unMessage('m9', 'La réunion est déplacée à 15h');
    const html = bandeauDesEpingles([recent, unMessage('m3', 'Un autre')], '/chats/c1');
    expect(html).toContain(FIL.messageEpingle(2));
    expect(html).toContain('La réunion est déplacée à 15h');
    expect(html).toContain('href="/chats/c1?autour=m9#m-m9"');
  });

  it('échappe le texte du message épinglé — jamais de HTML injecté', () => {
    const html = bandeauDesEpingles([unMessage('m1', '<script>alert(1)</script>')], '/chats/c1');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('le bandeau des épinglés est SERVI par le document du fil, MEMBRE seul', () => {
  const etat = (extra: Partial<EtatDuFil['fil']> = {}): EtatDuFil => ({
    porte: { genre: 'membre', cle: 'c1' },
    fil: {
      id: 'c1',
      titre: 'T',
      membres: 2,
      presence: { participants: ['u2'], presents: [] },
      messages: [unMessage('m1', 'Un message')],
      plusAncien: null,
      ...extra,
    },
    lecteur: { id: 'u1', nom: 'Amina', langues: LANGUES },
    erreur: null,
    brouillon: '',
    maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
    composeur: { genre: 'ouvert' },
    contexte: null,
    tempsReel: null,
    plein: null,
    profil: null,
  });

  it('aucun bandeau sans `epingles` (le cas nominal, et celui de l’invité)', () => {
    expect(documentDuFil(etat())).not.toContain('bandeau epingles');
  });

  it('le bandeau apparaît dès qu’`epingles` est peuplé', () => {
    const html = documentDuFil(etat({ epingles: [unMessage('m9', 'Message épinglé')] }));
    expect(html).toContain('bandeau epingles');
    expect(html).toContain(FIL.messageEpingle(1));
  });
});
