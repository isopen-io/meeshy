/**
 * La langue d'INTERFACE — UNE source, deux lecteurs (le script inline de
 * `index.html` au démarrage, ce module ensuite), même patron que
 * `scheme.ts` (#5588). La clé et la liste supportée sont importées de
 * `inline-interface-language-bootstrap.js` — pas recopiées ici — pour que les
 * deux ne puissent plus diverger (#6206).
 *
 * DISTINCTE du Prisme de CONTENU (`resolveUserLanguage()`,
 * `packages/shared/utils/conversation-helpers.ts`) : celui-là résout la
 * langue d'un MESSAGE pour son lecteur ; celle-ci résout la langue des
 * libellés SYSTÈME (menus, annonces d'accessibilité, `<html lang>`). Les deux
 * résolveurs ne doivent jamais se confondre — voir CLAUDE.md racine
 * § Prisme Linguistique.
 *
 * `document.documentElement.lang` EST la source pour le code applicatif : le
 * script inline l'a déjà posée avant la première peinture, donc ce module ne
 * RÉ-EXÉCUTE PAS la résolution (localStorage → navigateur → défaut) — il la
 * LIT. Ré-implémenter la même règle ici aurait recréé exactement la jumelle
 * divergente que #5588 a fermée pour le schéma clair/sombre.
 */
import { loadInterfaceCatalog } from './i18n-catalog';
import {
  DEFAULT_INTERFACE_LANGUAGE,
  INTERFACE_LANGUAGE_KEY,
  SUPPORTED_INTERFACE_LANGUAGES,
  resolveInterfaceLanguageCode,
} from './inline-interface-language-bootstrap.js';

export type InterfaceLanguage = (typeof SUPPORTED_INTERFACE_LANGUAGES)[number];

const KEY = INTERFACE_LANGUAGE_KEY;
const SUPPORTED: readonly string[] = SUPPORTED_INTERFACE_LANGUAGES;
const DEFAULT: InterfaceLanguage = DEFAULT_INTERFACE_LANGUAGE;

function isSupported(code: string): code is InterfaceLanguage {
  return SUPPORTED.includes(code);
}

/**
 * La langue d'interface COURANTE — lue sur `document.documentElement.lang`,
 * posée par le script inline au démarrage. Un attribut absent, vide, ou
 * portant une langue non cataloguée retombe sur {@link DEFAULT_INTERFACE_LANGUAGE}
 * plutôt que d'exposer une clé de catalogue nue à l'utilisateur.
 */
export function currentInterfaceLanguage(): InterfaceLanguage {
  /* Hors navigateur (rendu serveur, témoin sans DOM) : le document du HTML
     statique porte `lang="fr"`, c'est donc la langue que ce rendu sert. */
  if (typeof document === 'undefined') return DEFAULT;
  const declared = document.documentElement.lang;
  return isSupported(declared) ? declared : DEFAULT;
}

/**
 * Pose la langue d'interface — PERSISTE le choix (contrairement à
 * `applyScheme`/`followSystem`, qui ne persiste jamais un simple suivi
 * système) : un changement de langue d'interface est TOUJOURS un choix
 * explicite, il n'existe pas de « préférence système » à suivre pour cette
 * valeur au sens où `prefers-color-scheme` en est une pour le schéma.
 *
 * Le catalogue de la langue est CHARGÉ AVANT qu'elle ne soit posée (#6206) :
 * un libellé rendu entre les deux lirait une langue sans aucun texte. Les
 * abonnés sont prévenus ENSUITE (#5563) : la racine de l'application se
 * redessine alors dans la nouvelle langue, sans rechargement — là où iOS
 * attend le relancement (`settings.interface_language.restart`).
 */
export async function setInterfaceLanguage(language: InterfaceLanguage): Promise<void> {
  await loadInterfaceCatalog(language);
  document.documentElement.lang = language;
  try {
    localStorage.setItem(KEY, language);
  } catch {
    /* Stockage refusé : la langue tient pour la session, sans se souvenir. */
  }
  notify();
}

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/**
 * S'abonne aux changements de langue d'interface (#5563) — la forme que
 * `useSyncExternalStore` attend. Rend la fonction de désabonnement.
 */
export function subscribeInterfaceLanguage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Le choix EXPLICITE de l'utilisateur, ou `null` quand l'interface est en
 * « Automatique » — miroir `UILanguageOverride.explicitChoice` (iOS). Une
 * langue stockée non cataloguée n'est pas un choix.
 */
export function interfaceLanguageChoice(): InterfaceLanguage | null {
  try {
    const stored = localStorage.getItem(KEY);
    return stored !== null && isSupported(stored) ? stored : null;
  } catch {
    return null;
  }
}

const browserLanguages = (): readonly string[] =>
  typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];

/**
 * « AUTOMATIQUE » (#5563) — retire le choix et suit le navigateur, par la
 * règle du script d'amorçage (`resolveInterfaceLanguageCode`), jamais une
 * seconde écriture de cette règle. Le choix n'est retiré qu'une fois le
 * catalogue de la langue résolue CHARGÉ : un échec de chargement laisse
 * l'interface telle qu'elle était, choix compris.
 */
export async function followBrowserInterfaceLanguage(languages: readonly string[] = browserLanguages()): Promise<void> {
  const resolved = resolveInterfaceLanguageCode(null, languages);
  const language: InterfaceLanguage = isSupported(resolved) ? resolved : DEFAULT;
  await loadInterfaceCatalog(language);
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Stockage refusé : rien n'était retenu. */
  }
  document.documentElement.lang = language;
  notify();
}
