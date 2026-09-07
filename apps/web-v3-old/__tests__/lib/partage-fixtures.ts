import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '@/lib/api/cookies';

/**
 * LES FIXTURES PARTAGÉES DE `/stories/:id`, `/reels/:id`, `/moods/:id` — la
 * MÊME porte (`app/(public)/partage-porte.ts`), donc les MÊMES formes de
 * requête, de réponse et de passerelle simulée.
 *
 * EXTRAITES de `story.test.ts`, qui les recopiait telles quelles : une
 * fixture recopiée dans `story-fail.test.ts` (issue #4967) aurait été la
 * JUMELLE que la leçon 465 interdit. `story.test.ts` importe désormais depuis
 * ce module ; aucun de ses témoins ne change de verdict (redite mesurée, pas
 * seulement affirmée : la suite reste verte à l'identique après l'extraction).
 */

export const ORIGINE = 'https://gate.test';
export const MAINTENANT = Date.parse('2026-09-02T12:00:00.000Z');

export const brute = (attributs: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 's1',
  type: 'STORY',
  content: 'Three charts, two surprises. The review lands tomorrow.',
  originalLanguage: 'en',
  createdAt: '2026-09-02T09:00:00.000Z',
  // UNE DATE RELATIVE, ET C'EST UN CORRECTIF — voir `story.test.ts` pour
  // l'explication complète (§ « échéance échue le lendemain »).
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  authorId: 'u2',
  author: { id: 'u2', displayName: 'Ibrahim', username: 'ibrahim' },
  translations: {
    fr: { text: 'Trois graphiques, deux surprises. La revue arrive demain.' },
    es: { text: 'Tres gráficos, dos sorpresas. La revisión llega mañana.' },
  },
  isLikedByMe: false,
  media: [],
  ...attributs,
});

export const json = (corps: unknown, statut = 200): Response => new Response(JSON.stringify(corps), { status: statut });

export const AVEC_JETON = `${COOKIE_DE_SESSION}=ouverte; ${COOKIE_DE_JETON}=JWT.xyz`;

export const requete = (chemin: string, cookie?: string): Request =>
  new Request(`https://meeshy.me${chemin}`, cookie === undefined ? {} : { headers: { cookie } });

export const soumission = (
  chemin: string,
  champs: Readonly<Record<string, string>>,
  entetes: Readonly<Record<string, string>> = {},
): Request => {
  const corps = new URLSearchParams(champs);
  return new Request(`https://meeshy.me${chemin}`, {
    method: 'POST',
    headers: { cookie: AVEC_JETON, 'content-type': 'application/x-www-form-urlencoded', ...entetes },
    body: corps.toString(),
  });
};

export type Appel = { readonly methode: string; readonly chemin: string; readonly corps: string };

export const passerelle = (
  parChemin: Readonly<Record<string, () => Response>>,
): { readonly appels: Appel[]; readonly recuperer: (url: string, options?: RequestInit) => Promise<Response> } => {
  const appels: Appel[] = [];
  const recuperer = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const adresse = new URL(url);
    appels.push({
      methode: options.method ?? 'GET',
      chemin: `${adresse.pathname}${adresse.search}`,
      corps: typeof options.body === 'string' ? options.body : '',
    });
    const reponse = parChemin[adresse.pathname];
    if (reponse === undefined) throw new Error(`chemin non simulé : ${adresse.pathname}`);
    return reponse();
  };
  return { appels, recuperer };
};

export const MONDE = {
  '/api/v1/auth/me': () => json({ success: true, data: { id: 'u1', displayName: 'Amina', systemLanguage: 'fr' } }),
  '/api/v1/posts/s1': () => json({ success: true, data: brute() }),
  '/api/v1/social/posts': () => json({ success: true, data: [brute()] }),
};
