import { APP_STORE_URL, GOOGLE_PLAY_URL } from '@/lib/store-links';

/**
 * LES LOGOS DES DEUX BOUTIQUES (#15120) — dessinés en ligne, sans fichier ni
 * requête : ils servent `/download` et la landing prérendue, qui n'a aucune
 * ressource externe à attendre pour peindre ses badges.
 *
 * `StoreBadge` est LE badge (#16407) : un seul markup pour la landing et
 * `/download`, une seule feuille (`styles/store-badge.css`, CSS écrit à la
 * main — la landing prérendue ne charge pas Tailwind). Chaque hôte ne passe
 * que ses mots, tirés de son propre catalogue.
 */
export function AppleLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

export function GooglePlayLogo() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24">
      {/* harmony-exempt: logo Google Play, couleurs de la marque tierce */}
      <path fill="#4285F4" d="M3.61 1.81 13.4 12 3.61 22.19C3.24 22 3 21.6 3 21.1V2.9c0-.5.24-.9.61-1.09Z" />
      {/* harmony-exempt: logo Google Play */}
      <path fill="#34A853" d="M3.61 1.81c.36-.19.82-.18 1.27.08l11.72 6.73L13.4 12Z" />
      {/* harmony-exempt: logo Google Play */}
      <path fill="#EA4335" d="M3.61 22.19 13.4 12l3.2 3.38-11.72 6.73c-.45.26-.91.27-1.27.08Z" />
      {/* harmony-exempt: logo Google Play */}
      <path fill="#FBBC04" d="m16.6 8.62 3.8 2.18c.9.52.9 1.88 0 2.4l-3.8 2.18L13.4 12Z" />
    </svg>
  );
}

export type Store = 'app-store' | 'google-play';

const STORES = {
  'app-store': { href: APP_STORE_URL, name: 'App Store', Logo: AppleLogo },
  'google-play': { href: GOOGLE_PLAY_URL, name: 'Google Play', Logo: GooglePlayLogo },
} as const satisfies Record<Store, { readonly href: string; readonly name: string; readonly Logo: () => unknown }>;

export type StoreBadgeProps = {
  readonly store: Store;
  /** Le nom que lit un lecteur d'écran (« Télécharger dans l'App Store »). */
  readonly label: string;
  /** La petite ligne au-dessus du nom de la boutique (« Télécharger dans »). */
  readonly caption: string;
};

export function StoreBadge({ store, label, caption }: StoreBadgeProps) {
  const { href, name, Logo } = STORES[store];
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" data-store={store} aria-label={label} className="ld-store">
      <Logo />
      <span className="ld-store-name">
        <span className="ld-store-caption">{caption}</span>
        {name}
      </span>
    </a>
  );
}
