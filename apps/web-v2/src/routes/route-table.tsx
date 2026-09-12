import { createRouter } from '@/lib/router';

/**
 * LA TABLE DES ROUTES — le seul endroit du depot qui connait les adresses.
 *
 * Elle est ecrite a la main plutot que generee par fichiers : le decoupage par
 * route est ce qui borne la premiere peinture, et ecrit ici chaque `import()`
 * est un arbitrage VISIBLE. Genere, il se subit.
 */
export const ROUTES = {
  list: { pattern: '/', screen: () => import('@/routes/conversations') },
  thread: { pattern: '/c/$conversation', screen: () => import('@/routes/thread') },
  /* NOUVELLE CONVERSATION (#5652) — nomenclature legacy reprise (D-5) :
     `apps/web/app/conversations/new` porte déjà ce chemin. */
  conversationsNew: { pattern: '/conversations/new', screen: () => import('@/routes/conversation-new') },
  login: { pattern: '/login', screen: () => import('@/routes/login') },
  signup: { pattern: '/signup', screen: () => import('@/routes/signup') },
  /* Le tableau de bord des streaks & badges (#5547) — sous `/me/`, l'espace
     du profil (inventaire de parité : `/me` est V4.0.0), privé (garde de
     session), découpé comme les autres : aucun octet avant le premier pixel. */
  progression: { pattern: '/me/progression', screen: () => import('@/routes/progression') },
  /* Les trois PAGES DÉDIÉES du hub (#5843). Chacune a sa route parce qu'elle a
     son propre retour, son propre titre et son propre compte — un panneau qui
     se déplie dans le hub n'aurait ni l'un ni les autres, et le bouton système
     « retour » refermerait l'écran entier au lieu du panneau. */
  progressionBadges: { pattern: '/me/progression/badges', screen: () => import('@/routes/progression-badges') },
  progressionDefis: { pattern: '/me/progression/defis', screen: () => import('@/routes/progression-defis') },
  progressionSucces: { pattern: '/me/progression/succes', screen: () => import('@/routes/progression-succes') },
  /* LES STORIES (#6080) — le rail de la liste ouvre ces DEUX adresses, et
     c'est ce qui en fait des contrôles plutôt que des promesses. Jusqu'ici
     chaque tuile du rail pointait vers un FIL sous un anneau de story, faute
     de route ; le doc-comment de l'écran l'avouait en toutes lettres.

     `?author=` filtre le plateau sur un auteur — la même adresse sert « tout
     voir » et « voir les siennes », parce que c'est le même écran avec un
     filtre, jamais deux écrans à faire diverger. */
  stories: { pattern: '/stories', screen: () => import('@/routes/stories') },
  storyCompose: { pattern: '/stories/new', screen: () => import('@/routes/story-compose') },
  /* L'ACCUEIL À DEUX PORTES (#5816) — soldé une fois par appareil
     (`welcomeStore`), miroir `WelcomeView.swift`. */
  welcome: { pattern: '/welcome', screen: () => import('@/routes/welcome') },
  /* LE LIEN MAGIQUE (#5816) — même adresse pour la SAISIE (`?token=` absent)
     et la VALIDATION du lien reçu par e-mail (`MagicLinkService.ts:548-549`
     vise exactement `/auth/magic-link?token=`) : `magic-link.tsx` distingue
     les deux au montage. `magicLinkValidate` est l'adresse du DIGEST
     (`jobs/notification-digest.ts:50`, `?token=&returnUrl=`) — même écran de
     validation, adresse SÉPARÉE. */
  magicLink: { pattern: '/auth/magic-link', screen: () => import('@/routes/magic-link') },
  magicLinkValidate: { pattern: '/auth/magic-link/validate', screen: () => import('@/routes/magic-link-validate') },
  /* MOT DE PASSE OUBLIÉ, flux E-MAIL (#5816) — le flux TÉLÉPHONE et
     `/reset-password` sont hors tranche (issues compagnons). */
  forgotPassword: { pattern: '/forgot-password', screen: () => import('@/routes/forgot-password') },
  /* LES HUIT DESTINATIONS DES MENUS FLOTTANTS (#6214) — le Flux pour le bouton
     de gauche, les six barreaux de l'échelle de droite, et le profil qu'ouvre
     l'avatar. Leurs libellés, teintes et glyphes vivent dans UNE table
     (`lib/view/floating-menu.ts`, miroir `RootMenuLadderEntry.swift`) ; ces
     lignes-ci n'en portent que l'adresse.

     Elles arrivent AVANT leur contenu, et c'est délibéré : un barreau qui
     viserait une adresse absente serait un contrôle qui ment (loi 4), défaut
     déjà payé par le rail des stories. Chaque écran est aujourd'hui un écran
     d'attente NOMMÉ, remplacé par son vrai contenu dans son issue à lui.

     Le nommage suit iOS (`Router.swift` § routes de hub), jamais le legacy :
     ces sept destinations n'existent pas dans `apps/web`. `/me` complète
     l'espace ouvert par `/me/progression` (#5547). */
  feed: { pattern: '/feed', screen: () => import('@/routes/feed') },
  links: { pattern: '/links', screen: () => import('@/routes/links') },
  notifications: { pattern: '/notifications', screen: () => import('@/routes/notifications') },
  calls: { pattern: '/calls', screen: () => import('@/routes/calls') },
  discover: { pattern: '/discover', screen: () => import('@/routes/discover') },
  communities: { pattern: '/communities', screen: () => import('@/routes/communities') },
  settings: { pattern: '/settings', screen: () => import('@/routes/settings') },
  profile: { pattern: '/me', screen: () => import('@/routes/profile') },
} as const;

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 pt-safe text-center">
      <div className="grid gap-3">
        <p className="text-screen font-bold">Cette href n’existe pas.</p>
        <a
          href="/"
          className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
          style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
        >
          Revenir aux conversations
        </a>
      </div>
    </div>
  );
}

export const { Router, Link, href, navigate } = createRouter(ROUTES, NotFound);
