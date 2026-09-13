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
 * un libellé rendu entre les deux lirait une langue sans aucun texte. Ce qui
 * est déjà monté garde sa langue jusqu'à son prochain rendu — iOS applique de
 * même le changement au relancement (`settings.interface_language.restart`).
 */
export async function setInterfaceLanguage(language: InterfaceLanguage): Promise<void> {
  await loadInterfaceCatalog(language);
  document.documentElement.lang = language;
  try {
    localStorage.setItem(KEY, language);
  } catch {
    /* Stockage refusé : la langue tient pour la session, sans se souvenir. */
  }
}
