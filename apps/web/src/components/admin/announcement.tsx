import { EDGE, INK, SURFACE } from './tone';

/**
 * CE QU'UN GESTE D'ADMINISTRATION A FAIT, DIT À VOIX HAUTE (#6819, repris par le kit en #9463).
 *
 * Une écriture réussie ne change parfois qu'une ligne d'une fiche — un rôle,
 * un interrupteur. Sans annonce, un lecteur d'écran ne signale RIEN : le geste
 * a eu lieu, personne ne l'apprend. `role="status"` + `aria-live="polite"`
 * énonce le résultat sans voler le focus.
 *
 * Jumeau de `LinksAnnouncement`, et non son import : celui-là vit dans les
 * pièces des LIENS. Emprunter un composant à une autre famille pour son
 * comportement crée une dépendance que son nom dément — et c'est le genre de
 * lien qu'on ne défait plus.
 *
 * Le texte VIDE reste monté en `sr-only` : démonter la région la retirerait de
 * l'arbre d'accessibilité, et la remonter avec du texte ne serait plus une
 * MISE À JOUR de région vivante — beaucoup de lecteurs ne l'annonceraient pas.
 */
export function AdminAnnouncement({ text }: { readonly text: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      data-admin-announcement
      className={
        text === ''
          ? 'sr-only'
          : 'pointer-events-none fixed inset-x-0 bottom-24 z-20 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-chip px-4 py-2.5 text-center text-caption font-semibold'
      }
      style={
        text === ''
          ? undefined
          : { backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK }
      }
    >
      {text}
    </p>
  );
}
