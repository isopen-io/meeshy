import { documentDuSite } from '@/app/enveloppe/vue';
import { FEUILLE_CONNECTEE } from '@/app/connecte/feuille';
import { echappe } from '@/app/socle';
import { ADHESION_DU_MEMBRE, REFUS_DU_MEMBRE } from '@/lib/contenu/fil';

import { phraseDeRefus } from './choix-vue';

/**
 * CE QU'ON LIT quand `/chat/:lien` ne peut ouvrir NI le fil NI la modale.
 *
 * Deux cas, un seul gabarit — une phrase, une action qui mène quelque part :
 *
 *   • UN MEMBRE que le lien refuse — clos avant tout choix (410 à l'aperçu), ou
 *     jonction canonique refusée pour toute raison autre qu'un jeton périmé
 *     (410, 409, 403, 404…). JAMAIS LA MODALE : « vous venez en anonyme, ou
 *     avec votre compte ? », « Se connecter », « Créer un compte » n'ont aucun
 *     sens pour qui est déjà connecté (conception § 12.3 : « un lecteur
 *     connecté ne voit donc jamais la modale »). La raison est la même phrase
 *     que la modale aurait servie à un visiteur, prise à la même table, et
 *     l'action mène à ce que le membre possède : ses conversations.
 *   • UN LIEN QUE PERSONNE NE CONNAÎT (404 à l'aperçu, `routes/anonymous.ts:
 *     592-597`) — pour tout lecteur. Ce n'est pas une panne : la passerelle a
 *     répondu, et elle a dit qu'il n'y a rien derrière cette adresse. La page
 *     le dit sans rien révéler d'autre (§ 5.1 : l'existence d'une conversation
 *     ne se devine pas par ses refus) et ramène à l'accueil.
 */

export const LIEN_INTROUVABLE = {
  titre: 'Ce lien ne mène nulle part',
  corps: 'Vérifiez l’adresse reçue, ou demandez un nouveau lien à qui vous l’a envoyé.',
  action: 'Retour à l’accueil',
} as const;

const documentDeRefus = ({
  titre,
  phrase,
  action,
}: {
  readonly titre: string;
  readonly phrase: string;
  readonly action: { readonly libelle: string; readonly href: string };
}): string =>
  documentDuSite({
    titre: `${titre} — Meeshy`,
    description: phrase,
    feuille: FEUILLE_CONNECTEE,
    corps:
      '<div class="bonjour">' +
      `<h1>${echappe(titre)}</h1>` +
      `<p>${echappe(phrase)}</p>` +
      '</div>' +
      `<section class="acces" aria-label="${echappe(action.libelle)}"><nav>` +
      `<a class="action primaire" href="${echappe(action.href)}">${echappe(action.libelle)}</a>` +
      '</nav></section>',
    retour: true,
  });

export const documentDuRefusDuMembre = ({ code, message }: { readonly code: string; readonly message: string | null }): string =>
  documentDeRefus({
    titre: REFUS_DU_MEMBRE.titre,
    phrase: phraseDeRefus(code, message),
    action: { libelle: REFUS_DU_MEMBRE.action, href: '/chats' },
  });

/**
 * L'ADHÉSION DEMANDÉE — un membre dont la navigation ne vaut pas un geste
 * (`navigationEtrangere`, `app/provenance.ts`) : le nom du lien, une phrase, et
 * UN bouton de 56 px qui POSTE vers la même adresse. Le formulaire est gardé
 * par `origineEtrangere` à l'arrivée ; rien n'a été joint pour le composer.
 */
export const documentDeLAdhesion = ({ segment, nom }: { readonly segment: string; readonly nom: string }): string =>
  documentDuSite({
    titre: `${ADHESION_DU_MEMBRE.titre(nom)} — Meeshy`,
    description: ADHESION_DU_MEMBRE.corps,
    feuille: FEUILLE_CONNECTEE,
    corps:
      '<div class="bonjour">' +
      `<h1>${echappe(ADHESION_DU_MEMBRE.titre(nom))}</h1>` +
      `<p>${echappe(ADHESION_DU_MEMBRE.corps)}</p>` +
      '</div>' +
      `<section class="acces" aria-label="${echappe(ADHESION_DU_MEMBRE.action(nom))}"><nav>` +
      `<form method="post" action="/chat/${encodeURIComponent(segment)}">` +
      `<input type="hidden" name="${CHAMP_DE_L_ADHESION}" value="1"/>` +
      `<button class="action primaire" type="submit">${echappe(ADHESION_DU_MEMBRE.action(nom))}</button>` +
      '</form>' +
      `<a class="action contour" href="/chats">${echappe(ADHESION_DU_MEMBRE.autre)}</a>` +
      '</nav></section>',
    retour: true,
  });

/** Le champ que le formulaire d'adhésion poste — lu par la route, jamais deviné. */
export const CHAMP_DE_L_ADHESION = 'rejoindre';

export const documentDuLienIntrouvable = (): string =>
  documentDeRefus({
    titre: LIEN_INTROUVABLE.titre,
    phrase: LIEN_INTROUVABLE.corps,
    action: { libelle: LIEN_INTROUVABLE.action, href: '/' },
  });
