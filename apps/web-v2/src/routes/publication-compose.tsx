import { useSearch } from '@/lib/router';
import { publicationKindFromSearch, type PublicationKind } from '@/lib/stories/publication-kind';
import StoryComposeScreen from '@/routes/story-compose';

/**
 * **LES DEUX PORTES DU COMPOSER UNIQUE** (#7497) — `/stories/new` et
 * `/posts/new` montent le MÊME studio ; seule change le format que la
 * capsule `[Publier … | ▾]` publie si l'auteur ne touche pas au chevron.
 * `?type=story|post|reel` le précise (la porte « Réel » du fil ouvre
 * `/posts/new?type=reel`).
 */
function ComposeAt({ fallback }: { readonly fallback: PublicationKind }) {
  const [search] = useSearch();
  const initialKind = publicationKindFromSearch(search, fallback);
  return <StoryComposeScreen key={initialKind} initialKind={initialKind} />;
}

export function StoryComposeRoute() {
  return <ComposeAt fallback="STORY" />;
}

export function PostComposeRoute() {
  return <ComposeAt fallback="POST" />;
}
