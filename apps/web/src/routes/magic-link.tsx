import { MagicLinkFlow } from '@/components/magic-link-flow';
import { MagicLinkValidation } from '@/components/magic-link-validation';
import { useSearch } from '@/lib/router';

/**
 * `/auth/magic-link` (#5816) — DEUX usages d'une même adresse : la SAISIE
 * (aucun `?token=`, l'écran que `LoginScreen` ouvre) et la VALIDATION du
 * lien reçu par e-mail (`MagicLinkService.ts:548-549` vise exactement
 * `${FRONTEND_URL}/auth/magic-link?token=`).
 *
 * `next` (#6742) — même paramètre qu'à `/login` et `/signup`, lu ici pour la
 * SAISIE seulement : la VALIDATION lit `returnUrl`, la valeur que la gateway
 * a embarquée dans le lien envoyé (`MagicLinkPanel` la clampe et l'envoie
 * sous ce nom).
 */
export default function MagicLinkScreen() {
  const [search] = useSearch();
  const token = search.get('token');
  return token !== null
    ? <MagicLinkValidation token={token} returnUrl={search.get('returnUrl')} />
    : <MagicLinkFlow next={search.get('next')} />;
}
