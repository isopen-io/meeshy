/**
 * LES LIBELLÉS DE `/account/deletion` VUE DÉCONNECTÉ (#9921), dans les sept
 * langues du produit. Importés statiquement par la seule page qui les rend
 * (`routes/account-deletion-guide.tsx`) : ils voyagent dans son chunk, jamais
 * dans les catalogues d'interface que chaque lecteur télécharge (budget
 * `interface_catalogs`, `scripts/measure-weight.mjs`).
 *
 * Aucun repli : une clé absente d'une langue est une erreur de compilation
 * (`satisfies AccountDeletionGuideCatalog`).
 */
import ar from './interface-catalogs/catalog-account-deletion-guide-ar';
import de from './interface-catalogs/catalog-account-deletion-guide-de';
import en from './interface-catalogs/catalog-account-deletion-guide-en';
import es from './interface-catalogs/catalog-account-deletion-guide-es';
import fr from './interface-catalogs/catalog-account-deletion-guide-fr';
import it from './interface-catalogs/catalog-account-deletion-guide-it';
import pt from './interface-catalogs/catalog-account-deletion-guide-pt';
import type { InterfaceLanguage } from './interface-language';

export type AccountDeletionGuideKey = keyof typeof fr;

export type AccountDeletionGuideCatalog = Readonly<Record<AccountDeletionGuideKey, string>>;

const CATALOGS: Readonly<Record<InterfaceLanguage, AccountDeletionGuideCatalog>> = { fr, en, es, pt, de, it, ar };

export const ACCOUNT_DELETION_GUIDE_KEYS = Object.keys(fr) as readonly AccountDeletionGuideKey[];

export function translateAccountDeletionGuide(language: InterfaceLanguage, key: AccountDeletionGuideKey): string {
  return CATALOGS[language][key];
}
