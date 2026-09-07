import { demande } from '@/lib/api/publication';

/**
 * `demande()` DÉCLARE `x-canvas-caps: 0` sur CHAQUE appel (#5195) — web-v3 ne
 * rend aucun canvas, et l'absence de déclaration serait lue par la passerelle
 * comme « client qui n'a rien dit », traité comme un legacy présumé plutôt
 * que comme un client qui décide explicitement de ne jamais l'implémenter
 * (`services/gateway/src/services/posts/storyEffectsV3.ts`, règle 5 bis).
 */
describe('demande() — déclaration de capacités canvas (#5195)', () => {
  it('pose x-canvas-caps: 0 par défaut', async () => {
    const appels: RequestInit[] = [];
    const recuperer = async (_url: string, options: RequestInit): Promise<Response> => {
      appels.push(options);
      return new Response('{}', { status: 200 });
    };

    await demande('https://gate.test/api/v1/posts/s1', 'JWT.xyz', recuperer);

    expect(appels).toHaveLength(1);
    const entetes = new Headers(appels[0]!.headers);
    expect(entetes.get('x-canvas-caps')).toBe('0');
    expect(entetes.get('authorization')).toBe('Bearer JWT.xyz');
  });

  it('un appelant peut ENCORE surclasser l\'en-tête via ses propres options', async () => {
    const appels: RequestInit[] = [];
    const recuperer = async (_url: string, options: RequestInit): Promise<Response> => {
      appels.push(options);
      return new Response('{}', { status: 200 });
    };

    await demande('https://gate.test/api/v1/posts/s1', 'JWT.xyz', recuperer, {
      headers: { 'x-canvas-caps': '3' },
    });

    const entetes = new Headers(appels[0]!.headers);
    expect(entetes.get('x-canvas-caps')).toBe('3');
  });
});
