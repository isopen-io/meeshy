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
import { appelNatif, coqueCourante } from './native-shell';

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
  syncBars();
}

/**
 * LA BARRE DU NAVIGATEUR (#7776), jumelle web de la barre d'état de la coque.
 * `index.html` pose une meta `theme-color` par schéma, gardée par
 * `prefers-color-scheme` : laissée seule, la barre suit le SYSTÈME et se
 * peint claire au-dessus d'une app réglée en sombre. Chaque meta porte son
 * schéma (`data-scheme`) ; on active celle du schéma PEINT et on éteint
 * l'autre, sans recopier ses couleurs ici.
 */
function syncBrowserBar(scheme: ColorScheme): void {
  document.querySelectorAll('meta[name="theme-color"][data-scheme]').forEach((meta) => {
    (meta as HTMLMetaElement).media = meta.getAttribute('data-scheme') === scheme ? 'all' : 'not all';
  });
}

function themeColorOf(scheme: ColorScheme): string | null {
  let color: string | null = null;
  document.querySelectorAll('meta[name="theme-color"][data-scheme]').forEach((meta) => {
    if (meta.getAttribute('data-scheme') === scheme) color = meta.getAttribute('content');
  });
  return color;
}

/**
 * LA BARRE D'ÉTAT DE LA COQUE (#7731). `SystemBars` (Capacitor 8) règle ses
 * icônes sur le thème du SYSTÈME ; ce module peint le thème CHOISI. Sombre
 * dans l'app sur un téléphone clair, les icônes sombres se posaient sur le
 * fond sombre et l'heure disparaissait. `DARK` = icônes claires, `LIGHT` =
 * icônes sombres. Hors coque, la barre appartient au navigateur : rien à faire.
 *
 * LE FOND DES BARRES (#9533). Sous Android 15, la coque n'est pas bord à
 * bord : le thème natif peint les barres selon le SYSTÈME, et des icônes
 * sombres se posaient sur une barre noire. `MeeshySystemBars` reçoit la
 * couleur `theme-color` du schéma peint, celle que Chrome donne à sa barre ;
 * la coque décide seule des versions où elle peint.
 *
 * UN PLEIN ÉCRAN SOMBRE TIENT LA BARRE (#10917). Sous Android 15 et plus, la
 * page passe sous la barre d'état : en thème clair, des icônes sombres se
 * posaient sur le noir de la visionneuse, d'une story ou d'un appel. Tant
 * qu'une de ces surfaces est montée, la barre prend le schéma sombre.
 */
let mediaSurfaces = 0;

/**
 * ET LE NAVIGATEUR SUIT LA COQUE (#10922) : la PWA installée prend sa barre
 * d'état de `theme-color`, et Chrome Android sa barre d'outils. Les deux
 * barres lisent le même schéma.
 */
function syncBars(): void {
  const scheme: ColorScheme = mediaSurfaces > 0 ? 'dark' : currentScheme();
  syncBrowserBar(scheme);
  syncShellSystemBars(scheme);
}

function syncShellSystemBars(scheme: ColorScheme): void {
  const color = themeColorOf(scheme);
  const coque = coqueCourante();
  const paint = appelNatif(coque, 'MeeshySystemBars');
  if (paint !== null && color) {
    paint('paint', { color }).catch(() => {
      /* Fond non peint : les icônes, elles, suivent déjà le thème. */
    });
  }
  const systemBars = appelNatif(coque, 'SystemBars');
  if (systemBars === null) return;
  systemBars('setStyle', { style: scheme === 'light' ? 'LIGHT' : 'DARK' }).catch(() => {
    /* Barre non réglée : le thème de l'app, lui, est déjà peint. */
  });
}

/** Tient les barres de la coque et du navigateur en schéma sombre jusqu'à l'appel de la fonction rendue. */
export function holdMediaSystemBars(): () => void {
  mediaSurfaces += 1;
  if (mediaSurfaces === 1) syncBars();
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    mediaSurfaces -= 1;
    if (mediaSurfaces === 0) syncBars();
  };
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
  syncBars();
  const query = window.matchMedia('(prefers-color-scheme: light)');
  const onSchemeChange = (e: MediaQueryListEvent) => {
    if (currentThemePreference() === 'system') applyScheme(e.matches ? 'light' : 'dark');
  };
  query.addEventListener('change', onSchemeChange);
  return () => query.removeEventListener('change', onSchemeChange);
}
