/**
 * @jest-environment node
 */

import { relacheMediaDePost, televerseMediaDePost } from '@/lib/api/medias-de-post';

/**
 * `lib/api/medias-de-post.ts` (#5390) — LE TRANSPORT TUS d'un média de post,
 * opposé à un serveur cousu qui joue les DEUX visages de
 * `services/gateway/src/routes/uploads/tus-handler.ts` : le corps de fin
 * rendu directement (creation-with-upload complet, déjà couvert par
 * `composer.test.ts`), et le REPLI — création sans corps de fin, complétée
 * par un `PATCH` sur le `Location` rendu (`:581-622`, dernier paragraphe).
 */

const JETON = 'jeton-de-test';
const BASE = 'https://meeshy.test';

const json = (corps: unknown, statut = 200, entetes: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json', ...entetes } });

const fichier = { nom: 'vue.png', type: 'image/png', octets: new Uint8Array([1, 2, 3, 4]) };

describe('televerseMediaDePost — le repli PATCH', () => {
  /**
   * P8, premier témoin — LE POST NE PORTE AUCUN CORPS DE FIN (`Location` +
   * `Upload-Offset: 0`, comme un serveur TUS qui n'a pas encore traité
   * l'octet à la création) : un `PATCH <Location>` porte `upload-offset: 0`
   * et l'INTÉGRALITÉ des octets, et l'id est lu sur LA RÉPONSE DU PATCH.
   */
  it('complète par un PATCH quand le POST ne rend aucun corps de fin', async () => {
    const appels: { readonly methode: string; readonly url: string; readonly entetes: Record<string, string>; readonly corps: unknown }[] = [];

    const recuperer = async (url: string, init?: RequestInit): Promise<Response> => {
      const entetes = Object.fromEntries(new Headers(init?.headers).entries());
      appels.push({ methode: init?.method ?? 'GET', url, entetes, corps: init?.body });

      if (url.endsWith('/api/v1/uploads')) {
        return new Response(null, {
          status: 201,
          headers: { location: '/api/v1/uploads/abc123', 'upload-offset': '0' },
        });
      }
      if (url.endsWith('/api/v1/uploads/abc123')) {
        return json({ success: true, data: { attachment: { id: 'media-du-patch' } } });
      }
      throw new Error(`appel non prévu : ${url}`);
    };

    const issue = await televerseMediaDePost({ jeton: JETON, fichier, base: BASE, recuperer });

    expect(issue).toEqual({ genre: 'televerse', id: 'media-du-patch' });
    expect(appels.map((a) => a.methode)).toEqual(['POST', 'PATCH']);
    expect(appels[1]?.url).toBe(`${BASE}/api/v1/uploads/abc123`);
    expect(appels[1]?.entetes['upload-offset']).toBe('0');
    expect(appels[1]?.entetes['tus-resumable']).toBe('1.0.0');
    expect(appels[1]?.entetes['content-type']).toBe('application/offset+octet-stream');
  });

  /** Second témoin — le POST COMPLET (le corps de fin est là) : AUCUN PATCH ne part. */
  it('n’envoie aucun PATCH quand le POST porte déjà le corps de fin', async () => {
    const appels: string[] = [];
    const recuperer = async (url: string): Promise<Response> => {
      appels.push(url);
      return json({ success: true, data: { attachment: { id: 'media-direct' } } });
    };

    const issue = await televerseMediaDePost({ jeton: JETON, fichier, base: BASE, recuperer });

    expect(issue).toEqual({ genre: 'televerse', id: 'media-direct' });
    expect(appels).toHaveLength(1);
  });

  it('en-têtes de création : upload-length et upload-metadata en base64', async () => {
    let entetesDeCreation: Record<string, string> = {};
    const recuperer = async (_url: string, init?: RequestInit): Promise<Response> => {
      entetesDeCreation = Object.fromEntries(new Headers(init?.headers).entries());
      return json({ success: true, data: { attachment: { id: 'media-1' } } });
    };

    await televerseMediaDePost({ jeton: JETON, fichier, base: BASE, recuperer });

    expect(entetesDeCreation['upload-length']).toBe(String(fichier.octets.byteLength));
    expect(entetesDeCreation['tus-resumable']).toBe('1.0.0');
    const metadonnees = entetesDeCreation['upload-metadata'] ?? '';
    expect(metadonnees).toContain(`filename ${Buffer.from(fichier.nom).toString('base64')}`);
    expect(metadonnees).toContain(`filetype ${Buffer.from(fichier.type).toString('base64')}`);
    expect(metadonnees).toContain(`uploadcontext ${Buffer.from('post').toString('base64')}`);
  });

  /** Un refus (403, corps texte brut — comme `onUploadCreate`) rend son message TEL QUEL. */
  it('rend le refus texte brut d’un onUploadCreate', async () => {
    const recuperer = async (): Promise<Response> =>
      new Response('Post media upload requires an identifiable registered account\n', { status: 403 });

    const issue = await televerseMediaDePost({ jeton: JETON, fichier, base: BASE, recuperer });

    expect(issue).toEqual({
      genre: 'refus',
      message: 'Post media upload requires an identifiable registered account',
      statut: 403,
    });
  });

  it('rend un refus générique quand le réseau ne répond pas', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };

    const issue = await televerseMediaDePost({ jeton: JETON, fichier, base: BASE, recuperer: recuperer as never });

    expect(issue.genre).toBe('refus');
    expect(issue.genre === 'refus' && issue.statut).toBe(null);
  });
});

describe('relacheMediaDePost — meilleur effort', () => {
  it('appelle DELETE /api/v1/posts/media/:id', async () => {
    const appels: { readonly methode: string; readonly url: string }[] = [];
    const recuperer = async (url: string, init?: RequestInit): Promise<Response> => {
      appels.push({ methode: init?.method ?? 'GET', url });
      return json({ success: true, data: { message: 'Media deleted' } });
    };

    await relacheMediaDePost({ jeton: JETON, id: 'media-1', base: BASE, recuperer });

    expect(appels).toEqual([{ methode: 'DELETE', url: `${BASE}/api/v1/posts/media/media-1` }]);
  });

  it('n’échoue jamais — une panne réseau est avalée', async () => {
    const recuperer = async (): Promise<Response> => {
      throw new Error('réseau coupé');
    };

    await expect(relacheMediaDePost({ jeton: JETON, id: 'media-1', base: BASE, recuperer: recuperer as never })).resolves.toBeUndefined();
  });
});
