import { MagicLinkValidation } from '@/components/magic-link-validation';
import { useEmailLinkSearch } from '@/lib/links/email-link-search';

/**
 * `/auth/magic-link/validate` (#5816) — l'adresse du DIGEST
 * (`jobs/notification-digest.ts` : `?returnUrl=…#token=`, le jeton dans le
 * fragment depuis #10859). Même écran de
 * validation que `/auth/magic-link?token=`, adresse SÉPARÉE : le digest la
 * compose avec un `returnUrl` explicite, la relance e-mail non.
 */
export default function MagicLinkValidateScreen() {
  const search = useEmailLinkSearch();
  return <MagicLinkValidation token={search.get('token')} returnUrl={search.get('returnUrl')} />;
}
