import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * « N NOUVELLES PUBLICATIONS » (#7182) — le compte de ce que le fil a reçu
 * pendant qu'on lisait, tenu par `FEED_NEW_COUNT_KEY` (`lib/api/feed-realtime.ts`)
 * et alimenté par l'écoute de `post:created`.
 *
 * **ELLE N'EST PAS FLOTTANTE, ET C'EST UNE DÉCISION, PAS UN OUBLI.** iOS la
 * pose par-dessus le fil (`FeedView.swift:1200-1235`) ; D-50 l'interdit ici —
 * « aucun flottant ne recouvre un texte au repos » — et écarte nommément
 * l'argument qui l'aurait sauvée : « "iOS fait pareil" dit que la cible porte
 * le même défaut, pas qu'il est souhaitable ». Elle prend donc sa place DANS
 * le flux, en tête de liste, et ne recouvre jamais rien.
 *
 * Le SINGULIER a sa clé : sans elle, le français dirait « 1 nouvelles
 * publications ». Forme déjà tenue par le dépôt (`stories.count.one`).
 */
export function FeedNewPostsBanner({
  count,
  onTap,
}: {
  readonly count: number;
  readonly onTap: () => void;
}) {
  if (count <= 0) return null;

  const language = currentInterfaceLanguage();
  const label = translate(language, count === 1 ? 'feed.newPosts.one' : 'feed.newPosts.other', {
    count: String(count),
  });

  return (
    <button
      type="button"
      data-feed-new-posts
      onClick={onTap}
      className="flex w-full items-center justify-center gap-1.5 rounded-chip text-check font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minHeight: 44,
        color: 'var(--color-ios-brand)',
        backgroundColor: 'var(--color-ios-card)',
        outlineColor: 'var(--color-ios-brand)',
      }}
    >
      {label}
    </button>
  );
}
