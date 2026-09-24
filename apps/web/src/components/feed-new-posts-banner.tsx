import '@/styles/feed-new-posts.css';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * « N NOUVELLES PUBLICATIONS » (#7182) — le compte de ce que le fil a reçu
 * pendant qu'on lisait, tenu par `FEED_NEW_COUNT_KEY` (`lib/api/feed-new-count.ts`)
 * et alimenté par l'écoute de `post:created`.
 *
 * ## ELLE FLOTTE, ET C'EST UNE EXCEPTION ARBITRÉE À D-50
 *
 * D-50 pose que « aucun flottant ne recouvre un texte au repos ». La première
 * forme de ce composant s'y pliait — elle prenait sa place dans le flux, en
 * tête de liste — et le porteur a tranché l'inverse le 2026-09-20 : elle
 * flotte, comme iOS (`FeedView.swift:1200-1235`).
 *
 * **Le motif de l'exception, et il est dans la nature de l'objet.** Les
 * flottants que D-50 vise sont PERMANENTS et PASSIFS : la pilule de jour, les
 * disques du Flux sont là quoi qu'il arrive, et recouvrir devient leur état
 * normal. Celle-ci n'existe QUE lorsqu'il y a quelque chose à annoncer, ne dure
 * QUE jusqu'au geste qui la congédie, et ce geste est sa raison d'être : dans
 * le flux, elle n'aurait été visible qu'en haut du fil — c'est-à-dire là où son
 * information est déjà sous les yeux, et son geste sans objet. Un flottant
 * qu'on peut faire disparaître d'un tap ne prive personne d'un texte : il le
 * diffère de la durée d'un tap.
 *
 * Le SINGULIER a sa clé : sans elle, le français dirait « 1 nouvelles
 * publications ». Forme déjà tenue par le dépôt (`stories.count.one`).
 */
export function FeedNewPostsBanner({
  count,
  topPx,
  onTap,
}: {
  readonly count: number;
  readonly topPx: number;
  readonly onTap: () => void;
}) {
  if (count <= 0) return null;

  const language = currentInterfaceLanguage();
  const label = translate(language, count === 1 ? 'feed.newPosts.one' : 'feed.newPosts.other', {
    count: String(count),
  });

  return (
    /* La COUCHE ne capte pas le pointeur — seule la pilule le fait. Sans quoi
       une bande invisible pleine largeur mangerait les gestes du fil sur toute
       sa hauteur, le défaut classique d'un overlay centré. */
    <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3" style={{ top: topPx }}>
      <button
        type="button"
        data-feed-new-posts
        onClick={onTap}
        className="feed-new-posts pointer-events-auto flex items-center gap-1.5 rounded-full px-4 text-check font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
      >
        {label}
      </button>
    </div>
  );
}
