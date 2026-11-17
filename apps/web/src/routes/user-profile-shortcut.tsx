import { useParams } from '@/lib/router';
import { UserProfileView } from '@/routes/user-profile';

/**
 * `/@$username` (#18878) — l'adresse courte d'une personne rend la MÊME vitrine que
 * `/u/$username` : la route lit l'adresse, la vue prend son sujet en paramètre.
 */
export default function UserProfileShortcutScreen() {
  const { username } = useParams<'/@$username'>();
  return <UserProfileView username={username} />;
}
