import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';

export type ScriptedReplies = Readonly<Record<string, ApiResult<unknown>>>;

/**
 * UN TRANSPORT QUI RÉPOND SELON « MÉTHODE chemin » ET GARDE CHAQUE REQUÊTE
 * (#6714, #6715).
 *
 * Un témoin de port qui ne relit pas les requêtes ne peut pas dire ce qui est
 * PARTI — ni qu'aucun appel n'a eu lieu, ni que le corps ne porte que ce que
 * la passerelle attend. Une adresse non prévue répond 404 plutôt que de
 * lever : c'est la réponse que la passerelle ferait, et le témoin rougit sur
 * l'attendu, jamais sur une exception sans rapport.
 */
export function scriptedTransport(replies: ScriptedReplies): {
  readonly transport: HttpTransport;
  readonly calls: () => readonly HttpRequest[];
} {
  const calls: HttpRequest[] = [];
  const request = async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    calls.push(req);
    return replies[`${req.method} ${req.path}`] ?? { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  };
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = request as HttpTransport['request'];
  return { transport, calls: () => calls };
}

export function scriptedGateway(replies: ScriptedReplies) {
  const scripted = scriptedTransport(replies);
  return { ...scripted, deps: { source: 'gateway' as const, transport: scripted.transport } };
}
