import { useEffect } from 'react';

import { useParams } from '@/lib/router';
import { href, navigate } from '@/routes/route-table';

/**
 * LA PAGE D'UN LIEN DE PARRAINAGE (#6584) — `/signup/affiliate/:token`.
 *
 * C'est l'adresse que le legacy sert (`apps/web/app/signup/affiliate/[token]/page.tsx`)
 * et que tout lien d'invitation déjà partagé vise. Elle ne rend pas un second
 * écran d'inscription : elle REMET le code dans l'adresse de l'inscription, et
 * s'efface.
 *
 * ## Pourquoi une redirection plutôt qu'un écran
 *
 * Un écran d'inscription « avec parrain » serait une JUMELLE de `/signup` —
 * les mêmes champs, la même loi de dépliage, les mêmes refus — qui divergerait
 * au premier correctif porté à l'un des deux. Le legacy a payé ce prix
 * exactement : sa page d'affiliation est une seconde implémentation du
 * formulaire. Ici, le lien d'invitation n'apporte qu'UNE donnée — un code — et
 * une donnée se transporte dans l'adresse.
 *
 * `replace` : la redirection ne doit pas s'insérer dans l'historique, sans
 * quoi le bouton « retour » depuis l'inscription rejouerait la redirection en
 * boucle.
 */
export default function SignupAffiliateScreen() {
  const { token } = useParams<'/signup/affiliate/$token'>();

  useEffect(() => {
    navigate(token === '' ? href('signup') : href('signup', undefined, { ref: token }), true);
  }, [token]);

  /* Ce qui s'affiche le temps d'une image — jamais un écran vide, qui
     ressemblerait à une page cassée sur un réseau lent. */
  return (
    <div className="grid h-dvh place-items-center px-8 pt-safe pb-safe text-center">
      <p className="text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
        Ouverture de votre invitation…
      </p>
    </div>
  );
}
