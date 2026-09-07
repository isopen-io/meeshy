/**
 * Le schema clair/sombre — UNE source, deux lecteurs (le script inline de
 * index.html au demarrage, ce module ensuite).
 *
 * La table de jetons fait tout le travail de couleur : basculer le schema, ici,
 * revient a poser une CLASSE. Aucun composant n'a a connaitre le schema courant
 * pour se peindre juste — c'est la raison pour laquelle ce POC n'ecrit presque
 * aucune variante `light:`.
 */
export type ColorScheme = 'light' | 'dark';

const KEY = 'meeshy.scheme';

export function currentScheme(): ColorScheme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

export function setScheme(scheme: ColorScheme): void {
  const light = scheme === 'light';
  document.documentElement.classList.toggle('light', light);
  document.documentElement.classList.toggle('dark', !light);
  try {
    localStorage.setItem(KEY, scheme);
  } catch {
    /* Stockage refuse : le schema tient pour la session, sans se souvenir. */
  }
}

/**
 * Suit la preference SYSTEME tant que l'utilisateur n'a rien choisi lui-meme.
 * Rend la fonction de desabonnement.
 */
export function followSystem(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: light)');
  const onSchemeChange = (e: MediaQueryListEvent) => {
    let chosen: string | null = null;
    try {
      chosen = localStorage.getItem(KEY);
    } catch {
      chosen = null;
    }
    if (chosen === null) setScheme(e.matches ? 'light' : 'dark');
  };
  query.addEventListener('change', onSchemeChange);
  return () => query.removeEventListener('change', onSchemeChange);
}
