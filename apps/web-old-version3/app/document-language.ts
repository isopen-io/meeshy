/**
 * Langue déclarée par la coquille racine (`<html lang>`).
 *
 * SITE UNIQUE. En App Router, `<html lang>` ne se pose que dans le layout
 * racine : aucun layout imbriqué ne peut le corriger, et le rattraper en JS
 * client — ce que fait `apps/web` avec `<HtmlLangSync />` — est un moteur de
 * plus, interdit ici.
 *
 * La résolution par `Accept-Language` (rang 4 du Prisme) n'est PAS posée dans
 * ce lot : `headers()` dans le layout racine bascule TOUT l'arbre de routes en
 * rendu dynamique, ce qui retire la génération statique aux routes de lecture
 * partagée dont le § 8.3 gate les octets et les requêtes. Elle relève du lot
 * i18n, qui la posera à ce seul endroit.
 */
export const DOCUMENT_LANGUAGE = 'fr';
