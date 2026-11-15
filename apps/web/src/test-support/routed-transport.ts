import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';

export type RoutedReply = (req: HttpRequest) => ApiResult<unknown> | undefined;

/**
 * UN TRANSPORT QUI RÉPOND PAR CHEMIN, et garde chaque appel (#7999).
 *
 * `scriptedTransport` compare l'adresse ENTIÈRE, chaîne de requête comprise ;
 * celui-ci laisse chaque répondeur lire la requête et rendre `undefined` pour
 * « pas moi » — le suivant est essayé, et faute de preneur la réponse est le
 * 404 que ferait la passerelle.
 */
export function routedTransport(...repondeurs: readonly RoutedReply[]): {
  readonly transport: HttpTransport;
  readonly calls: () => readonly HttpRequest[];
} {
  const calls: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    calls.push(req);
    for (const repondre of repondeurs) {
      const reponse = repondre(req);
      if (reponse !== undefined) return reponse;
    }
    return { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  }) as HttpTransport['request'];
  return { transport, calls: () => calls };
}

/** Le chemin SANS sa chaîne de requête. */
export const pathOf = (req: HttpRequest): string => req.path.split('?')[0] ?? req.path;
