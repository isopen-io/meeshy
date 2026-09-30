import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useState } from 'react';

import type { ApiFailure, ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

type ActionState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'running' }
  | { readonly phase: 'done'; readonly message: string }
  | { readonly phase: 'error'; readonly message: string };

export type AdminGesture<Result> = {
  readonly call: () => Promise<ApiResult<Result>>;
  /** Le message du succès — une clé sans paramètre : le geste dit ce qu'il a fait, pas un « OK ». */
  readonly success: AdminPlainCatalogKey;
  /** L'effet immédiat sur le cache, défait si la passerelle refuse. `apply` ne reçoit que du cache NON vide. */
  readonly optimistic?: { readonly key: QueryKey; readonly apply: (before: unknown) => unknown };
  /** Les lectures à relire après le geste : la vérité vient du serveur, l'optimiste n'est qu'un avant-goût. */
  readonly invalidate?: readonly QueryKey[];
};

/**
 * **REFUS TRADUITS** (#8876) — un refus se dit en mots, jamais par son code ni
 * par un message d'infrastructure : 403 → « vous n'avez pas le droit » ; 400 →
 * le message servi s'il est une chaîne lisible, sinon « informations
 * invalides » ; 409 → conflit avec l'état courant ; échec réseau (statut 0) →
 * « réessayez » ; tout le reste → le serveur n'a pas pu.
 */
function refusal(failure: ApiFailure, language: InterfaceLanguage): string {
  if (failure.status === 403) return translateAdmin(language, 'admin.kit.refused.permission');
  if (failure.status === 400) {
    const served = failure.error.trim();
    return served === '' ? translateAdmin(language, 'admin.kit.refused.invalid') : served;
  }
  if (failure.status === 409) return translateAdmin(language, 'admin.kit.refused.conflict');
  if (failure.status === 0) return translateAdmin(language, 'admin.kit.refused.network');
  return translateAdmin(language, 'admin.kit.refused.server');
}

/**
 * **UN GESTE D'ADMINISTRATION, générique** (#8876) — instantané → effet
 * optimiste → réseau → retour arrière si refus. Chaque geste de fiche (activer,
 * fermer, résoudre, envoyer…) passe par ici : même annonce (région vivante),
 * mêmes refus traduits, même relecture.
 *
 * `onAnnounce` est celui d'`useLiveAnnouncer` : le résultat se DIT à voix haute,
 * succès comme refus — un geste sans retour ne se tait pas.
 */
export function useAdminAction<Result>(params: {
  readonly language: InterfaceLanguage;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ActionState>({ phase: 'idle' });

  const run = async (gesture: AdminGesture<Result>): Promise<Result | null> => {
    setState({ phase: 'running' });

    const snapshot = gesture.optimistic === undefined ? undefined : queryClient.getQueryData(gesture.optimistic.key);
    if (gesture.optimistic !== undefined && snapshot !== undefined) {
      await queryClient.cancelQueries({ queryKey: gesture.optimistic.key });
      queryClient.setQueryData(gesture.optimistic.key, gesture.optimistic.apply(snapshot));
    }

    const outcome: ApiResult<Result> = await gesture.call().catch(
      (): ApiFailure => ({ ok: false, status: 0, error: '' }),
    );

    if (outcome.ok) {
      const message = translateAdmin(params.language, gesture.success);
      setState({ phase: 'done', message });
      params.onAnnounce(message, 'neutral');
      await Promise.all((gesture.invalidate ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      return outcome.data;
    }

    if (gesture.optimistic !== undefined && snapshot !== undefined) {
      queryClient.setQueryData(gesture.optimistic.key, snapshot);
    }
    const message = refusal(outcome, params.language);
    setState({ phase: 'error', message });
    params.onAnnounce(message, 'error');
    return null;
  };

  return { state, run, reset: () => setState({ phase: 'idle' }) };
}
