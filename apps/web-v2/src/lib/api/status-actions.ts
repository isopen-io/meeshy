import type { QueryClient } from '@tanstack/react-query';

import { publishStatusMood, type StatusDeps } from './status';
import { STATUS_MOODS_QUERY_KEY, type StatusMoodPost } from './stories';

/**
 * **POSER UNE HUMEUR, INSTANTANÉMENT** (#6150) — motif `performPreferenceEdit`
 * (`app-preferences-actions.ts`), et pour la même raison : la pastille du rail
 * lit `STATUS_MOODS_QUERY_KEY`, donc sans écriture LOCALE l'emoji n'apparaîtrait
 * qu'au retour du réseau. « Une action sans feedback immédiat » est un bug, pas
 * une dette (§ Roadmap, dimension 4).
 *
 * Quatre temps, dans cet ordre : on refuse hors ligne (rien qu'on ne puisse
 * tenir), on prend l'instantané, on écrit local, on envoie — et un refus REMET
 * exactement l'instantané. Laisser l'humeur affichée après un refus mentirait
 * sur l'état du serveur, et la prochaine lecture la ferait disparaître sans que
 * personne ne puisse l'expliquer.
 */
export type MoodActionDeps = StatusDeps & {
  readonly queryClient: QueryClient;
  /** L'auteur de l'humeur — la ligne locale doit porter le MÊME id que celui
   * que `selfRailEntry` cherche, sinon la pastille ne la voit pas. */
  readonly viewerId: string;
  readonly isOnline: () => boolean;
};

export type MoodPostOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'offline' }
  | { readonly status: 'refused'; readonly error: string };

/** L'id LOCAL d'une humeur pas encore confirmée — préfixé, pour qu'une lecture
 * ne le confonde jamais avec un ObjectId servi par la passerelle. */
const localMoodId = (): string => `mood-local-${Date.now()}`;

export async function performMoodPost(params: {
  readonly moodEmoji: string;
  readonly note?: string;
  readonly deps: MoodActionDeps;
}): Promise<MoodPostOutcome> {
  const { deps, moodEmoji } = params;
  if (!deps.isOnline()) return { status: 'offline' };

  /* L'ÉCRITURE LOCALE EST SYNCHRONE, ET C'EST TOUT LE POINT (défaut trouvé par
     son propre témoin). `performPreferenceEdit` attend `cancelQueries` AVANT
     d'écrire ; sur un réglage invisible, un tour de boucle d'écart ne se voit
     pas. Ici, ce tour est celui qui sépare le doigt de l'emoji : `await` avant
     `setQueryData` rendait la pastille en retard d'une micro-tâche sur le
     geste, exactement la « action sans feedback immédiat » que la roadmap
     range dans les BUGS.

     L'annulation est LANCÉE, pas attendue : elle empêche une lecture en vol de
     réécraser l'humeur, et l'invalidation finale corrige de toute façon le cas
     où elle arriverait trop tard. */
  void deps.queryClient.cancelQueries({ queryKey: STATUS_MOODS_QUERY_KEY });
  const snapshot = deps.queryClient.getQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY);

  /* EN TÊTE, et mes lignes précédentes retirées : le corpus servi est trié
     `createdAt desc` et `selfRailEntry` prend ma PREMIÈRE ligne. Une humeur
     posée derrière l'ancienne serait écrite sans jamais être vue. */
  const mienne: StatusMoodPost = { id: localMoodId(), authorId: deps.viewerId, moodEmoji };
  const autres = (snapshot ?? []).filter((m) => (m.author?.id ?? m.authorId) !== deps.viewerId);
  deps.queryClient.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, [mienne, ...autres]);

  const result = await publishStatusMood({
    source: deps.source,
    transport: deps.transport,
    moodEmoji,
    ...(params.note === undefined ? {} : { note: params.note }),
  });

  if (!result.ok) {
    deps.queryClient.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, snapshot);
    return { status: 'refused', error: result.error };
  }

  /* La ligne locale prend l'id SERVI — sans quoi une invalidation ultérieure
     et la ligne locale coexisteraient, et mon humeur apparaîtrait deux fois
     dans un corpus qui n'en attend qu'une par auteur. */
  deps.queryClient.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, [
    { ...mienne, id: result.data.id },
    ...autres,
  ]);
  void deps.queryClient.invalidateQueries({ queryKey: STATUS_MOODS_QUERY_KEY });
  return { status: 'saved' };
}
