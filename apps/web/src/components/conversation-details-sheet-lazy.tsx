import { lazy, Suspense, type ComponentProps } from 'react';

/**
 * LA FEUILLE DE DÉTAILS, À LA DEMANDE (#7829) — même discipline que les
 * feuilles de commentaires et de vues (`publication-comments-sheet-lazy.tsx`) :
 * le fil ne paie ni la feuille, ni son port de membres, ni la chaîne des liens
 * de partage tant qu'on ne touche pas le titre.
 */
const LazyConversationDetailsSheet = lazy(() =>
  import('@/components/conversation-details-sheet').then((m) => ({ default: m.ConversationDetailsSheet })),
);

type Props = ComponentProps<typeof LazyConversationDetailsSheet>;

export function ConversationDetailsPortal({ open, ...props }: Props & { readonly open: boolean }) {
  return open ? (
    <Suspense fallback={null}>
      <LazyConversationDetailsSheet {...props} />
    </Suspense>
  ) : null;
}
