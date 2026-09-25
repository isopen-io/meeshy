import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **L'ISSUE D'UN GESTE SE VOIT** (revue #7083, défaut majeur 3) — la région
 * `role="status"` d'un écran n'est pas qu'un canal pour lecteurs d'écran :
 * c'est la seule surface qui dit si le geste a ABOUTI.
 *
 * **LE DÉFAUT, MESURÉ.** `/u/` et `/discover` partageaient les MÊMES clés
 * d'annonce et le MÊME hook, et rendaient deux produits : « Découvrir »
 * peignait une pastille dès que la région portait un texte
 * (`169 × 41`), `/u/` la laissait en `sr-only` INCONDITIONNELLEMENT
 * (`1 × 1`, `clip: inset(50%)`). Conséquence la plus lourde : un ÉCHEC était
 * totalement MUET pour un utilisateur voyant — `performSendRequest` refusé
 * défaisait l'état optimiste, le bouton revenait à « Ajouter », et rien ne
 * disait pourquoi. Écart de dimension 6 (même geste, même mot sur les deux
 * surfaces) doublé d'un trou de dimension 8.
 *
 * **POURQUOI UN COMPOSANT ET PAS UNE TROISIÈME RECOPIE.** La pastille était
 * déjà écrite deux fois ; c'est le motif que les 40 surfaces restantes vont
 * copier. Une classe recopiée diverge au premier réglage de l'une des copies —
 * le dépôt l'a déjà payé sur les encres de section et sur les trois familles
 * de résolveurs du Prisme.
 *
 * **ELLE ANNONCE, ELLE NE PREND AUCUN GESTE** (`pointer-events-none`) : un
 * geste refusé reste rejouable EN PLACE — le bouton d'action est revenu à son
 * libellé d'avant, et c'est LUI le « Réessayer ». Un second contrôle pour le
 * même geste serait précisément le doublon que D-11 interdit.
 *
 * **ELLE EST POSÉE `absolute`** : son hôte doit donc être `relative`. Au repos
 * (texte vide) elle retombe en `sr-only` — jamais une bande vide qui mangerait
 * le bas de l'écran.
 */

/**
 * Le point d'accroche des gates, en table FERMÉE : `check-discover.mjs` et
 * `check-profile.mjs` interrogent chacun le sien. Une table plutôt qu'une
 * chaîne libre parce qu'un attribut `data-*` calculé se poserait par une
 * assertion de type — et qu'une faute de frappe y rendrait un gate vert sur
 * une région qu'il ne trouve plus.
 */
const MARKERS = {
  discover: { 'data-discover-announce': '' },
  profile: { 'data-profile-announce': '' },
  invite: { 'data-invite-announce': '' },
  /* « Mes stories » (#6149) — l'issue d'une suppression : réussie, ou refusée
     et la rangée revenue. */
  myStories: { 'data-my-stories-announce': '' },
} as const;

export type AnnouncementMarker = keyof typeof MARKERS;

const VISIBLE_CLASS =
  'pointer-events-none absolute inset-x-0 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-chip px-4 py-2.5 text-center text-caption font-semibold';

/**
 * **L'ENCRE DIT LA NATURE : un refus ne se lit pas comme une réussite** — et
 * ELLE-MÊME doit rester lisible dans les DEUX schémas (revue-correction de
 * #6149, défaut majeur 1, issue #7859).
 *
 * `#fff` codé en dur ici tenait AA en CLAIR (`--color-danger` `#c81e1e`,
 * blanc à 5,74:1) mais PAS en SOMBRE : `--color-danger` y vaut `#f45b5b`
 * (`packages/design-tokens/dark.css`), luminance relative 0,275, sur lequel
 * du blanc ne contraste qu'à **3,23:1** — sous le 4,5:1 qu'exige
 * `text-caption font-semibold` (WCAG 1.4.3, texte normal). Chaque échec
 * qu'affiche cette pastille (profil, découvrir, invitation, et désormais
 * « Mes stories ») était donc illisible pour un contraste réduit en sombre.
 *
 * `--color-on-status` PORTE DÉJÀ cette loi ailleurs dans le dépôt
 * (`share-link-detail-parts.tsx`, une puce pleine `--color-success`) : blanc
 * en clair, `--color-bg` (quasi noir) en sombre — un jeton par schéma,
 * jamais une constante unique, parce qu'aucune encre fixe ne peut tenir AA
 * sur les DEUX rouges (`#c81e1e` en clair, `#f45b5b` en sombre, l'un presque
 * deux fois plus clair que l'autre). Mesuré ici : 5,74:1 en clair, 5,97:1 en
 * sombre — les deux dérivés de jetons déjà générés (D-4), sans valeur
 * nouvelle écrite à la main. */
const TONE_STYLE: Readonly<Record<AnnouncementTone, { readonly color: string; readonly backgroundColor: string }>> = {
  neutral: { color: 'var(--color-ios-card)', backgroundColor: 'var(--color-ios-ink)' },
  error: { color: 'var(--color-on-status)', backgroundColor: 'var(--color-error)' },
};

export function LiveAnnouncement({
  text,
  tone,
  marker,
}: {
  readonly text: string;
  readonly tone: AnnouncementTone;
  readonly marker: AnnouncementMarker;
}) {
  const silent = text === '';
  return (
    <p
      role="status"
      aria-live="polite"
      {...MARKERS[marker]}
      {...(silent ? {} : { 'data-announce-tone': tone })}
      className={silent ? 'sr-only' : VISIBLE_CLASS}
      style={silent ? undefined : { bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)', ...TONE_STYLE[tone] }}
    >
      {text}
    </p>
  );
}
