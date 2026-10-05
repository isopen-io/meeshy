import { VerifyEmailFlow } from '@/components/verify-email-flow';
import { useSearch } from '@/lib/router';

/**
 * `/auth/verify-email?email=&token=&next=` (T-verify, #5672 ; #8034) —
 * nomenclature legacy reprise (D-5, `apps/web/app/auth/verify-email`).
 * L'e-mail voyage en QUERY STRING : un lien reçu par courriel reste valide
 * après un rafraîchissement de la page, jamais une navigation en mémoire
 * seule. `token` est le jeton du lien de l'e-mail (contrat #8033,
 * `${FRONTEND_URL}/auth/verify-email?token=…&email=…`), consommé au montage ;
 * `next` est l'adresse où revenir une fois connecté.
 */
export default function VerifyEmailScreen() {
  const [search] = useSearch();
  return <VerifyEmailFlow email={search.get('email')} token={search.get('token')} next={search.get('next')} />;
}
