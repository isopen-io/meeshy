import { MagicLinkFlow } from '@/components/magic-link-flow';
import { MagicLinkValidation } from '@/components/magic-link-validation';
import { useEmailLinkSearch } from '@/lib/links/email-link-search';

/**
 * `/auth/magic-link` (#5816) — DEUX usages d'une même adresse : la SAISIE
 * (aucun `?token=`, l'écran que `LoginScreen` ouvre) et la VALIDATION du
 * lien reçu par e-mail (`MagicLinkService.ts` vise
 * `${FRONTEND_URL}/auth/magic-link?via=email#token=` depuis #10859 — le jeton
 * dans le fragment ; l'ancien `?token=` reste lu pendant la transition).
 *
 * `next` (#6742) — même paramètre qu'à `/login` et `/signup`, lu ici pour la
 * SAISIE seulement : la VALIDATION lit `returnUrl`, la valeur que la gateway
 * a embarquée dans le lien envoyé (`MagicLinkPanel` la clampe et l'envoie
 * sous ce nom).
 */
export default function MagicLinkScreen() {
  const search = useEmailLinkSearch();
  const token = search.get('token');
  return token !== null
    ? <MagicLinkValidation token={token} returnUrl={search.get('returnUrl')} />
    : <MagicLinkFlow next={search.get('next')} />;
}
