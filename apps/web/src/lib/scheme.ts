/**
 * Le schema clair/sombre — UNE source, trois lecteurs (le script inline de
 * index.html au demarrage, celui des pages institutionnelles prechauffees, ce
 * module ensuite). La clé est importée de `inline-scheme-bootstrap.js` — pas
 * recopiée ici — pour que les trois ne puissent plus diverger (#5588).
 *
 * La table de jetons fait tout le travail de couleur : basculer le schema, ici,
 * revient a poser une CLASSE. Aucun composant n'a a connaitre le schema courant
 * pour se peindre juste — c'est la raison pour laquelle ce POC n'ecrit presque
 * aucune variante `light:`.
 */
import { SCHEME_KEY } from './inline-scheme-bootstrap.js';

export type ColorScheme = 'light' | 'dark';

const KEY = SCHEME_KEY;

export function currentScheme(): ColorScheme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

/** Peint le schema — sans le PERSISTER. Le seul geste que `followSystem` doit faire :
 * persister ici transformerait un suivi automatique en choix explicite, et le
 * PROCHAIN changement systeme se trouverait ignore (defaut trouve par T1). */
function applyScheme(scheme: ColorScheme): void {
  const light = scheme === 'light';
  document.documentElement.classList.toggle('light', light);
  document.documentElement.classList.toggle('dark', !light);
}

export function setScheme(scheme: ColorScheme): void {
  applyScheme(scheme);
  try {
    localStorage.setItem(KEY, scheme);
  } catch {
    /* Stockage refuse : le schema tient pour la session, sans se souvenir. */
  }
}

/**
 * LA PRÉFÉRENCE (#5563) — ce que l'utilisateur a CHOISI, miroir
 * `ThemePreference` (iOS) : clair, sombre, ou « système », qui n'est pas un
 * schéma mais l'ABSENCE de choix stocké. Une valeur stockée inconnue n'est pas
 * un choix.
 */
export type ThemePreference = ColorScheme | 'system';

function storedChoice(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function currentThemePreference(): ThemePreference {
  const stored = storedChoice();
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

const systemScheme = (): ColorScheme =>
  window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

/**
 * Bascule À CHAUD — la classe change, rien ne se recharge. « Système » RETIRE
 * le choix stocké avant de peindre le schéma du système : sans ce retrait,
 * `followSystem` relirait l'ancien choix et ignorerait pour toujours le
 * prochain changement du système.
 */
export function setThemePreference(preference: ThemePreference): void {
  if (preference !== 'system') {
    setScheme(preference);
    return;
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Stockage refuse : le suivi du systeme tient pour la session. */
  }
  applyScheme(systemScheme());
}

/**
 * Suit la preference SYSTEME tant que l'utilisateur n'a rien choisi lui-meme.
 * Rend la fonction de desabonnement.
 *
 * N'appelle jamais `setScheme()` : persister l'application automatique la
 * ferait relire comme un choix EXPLICITE au prochain evenement `change`, et un
 * seul basculement systeme suffirait a arreter tout suivi ulterieur.
 */
export function followSystem(): () => void {
  const query = window.matchMedia('(prefers-color-scheme: light)');
  const onSchemeChange = (e: MediaQueryListEvent) => {
    if (currentThemePreference() === 'system') applyScheme(e.matches ? 'light' : 'dark');
  };
  query.addEventListener('change', onSchemeChange);
  return () => query.removeEventListener('change', onSchemeChange);
}
