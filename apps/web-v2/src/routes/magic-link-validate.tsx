import { MagicLinkValidation } from '@/components/magic-link-validation';
import { useSearch } from '@/lib/router';

/**
 * `/auth/magic-link/validate` (#5816) — l'adresse du DIGEST
 * (`jobs/notification-digest.ts:50` : `?token=&returnUrl=`). Même écran de
 * validation que `/auth/magic-link?token=`, adresse SÉPARÉE : le digest la
 * compose avec un `returnUrl` explicite, la relance e-mail non.
 */
export default function MagicLinkValidateScreen() {
  const [search] = useSearch();
  return <MagicLinkValidation token={search.get('token')} returnUrl={search.get('returnUrl')} />;
}
