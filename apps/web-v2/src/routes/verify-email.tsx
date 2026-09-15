import { VerifyEmailFlow } from '@/components/verify-email-flow';
import { useSearch } from '@/lib/router';

/**
 * `/auth/verify-email?email=` (T-verify, #5672) — nomenclature legacy reprise
 * (D-5, `apps/web/app/auth/verify-email`). L'e-mail voyage en QUERY STRING :
 * un lien reçu par courriel reste valide après un rafraîchissement de la
 * page, jamais une navigation en mémoire seule.
 */
export default function VerifyEmailScreen() {
  const [search] = useSearch();
  return <VerifyEmailFlow email={search.get('email')} />;
}
