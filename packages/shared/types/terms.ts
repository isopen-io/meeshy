/**
 * La version des CONDITIONS GÉNÉRALES en vigueur — **un seul site, pour les
 * deux côtés de la frontière de confiance** (#5216).
 *
 * ## Pourquoi une constante partagée, et pas un littéral au point d'écriture
 *
 * L'acte de création d'un compte VAUT acceptation : les trois clients l'écrivent
 * sous le bouton (« en créant un compte, vous acceptez les conditions »), et le
 * serveur grave donc `termsAcceptedAt` / `termsVersion` dans la ligne `User` au
 * moment du `create`. Une version gravée qui ne désigne AUCUN texte publié ne
 * prouve rien : ce que la colonne doit porter est la version du document que la
 * personne avait sous les yeux.
 *
 * La date est celle qu'affiche la page des conditions
 * (`apps/web-v3/app/terms/contenu.ts`, « Dernière mise à jour : 23 août 2026 »).
 * Elle vit ici pour que la page, le serveur et un futur écran de ré-acceptation
 * citent la MÊME valeur — c'est la leçon de `CONSENT_POLICY_VERSION_DEFAULT`
 * (`types/consents.ts`), où deux côtés tenant la valeur séparément ont fini par
 * diverger sans qu'aucun témoin ne rougisse.
 *
 * ## Ce que ce fichier NE fait pas
 *
 * Il ne dit pas qu'un compte doit RÉ-ACCEPTER quand la version change : la
 * colonne enregistre ce qui a été accepté, elle n'arbitre rien. Comparer la
 * version gravée à celle-ci — et décider quoi faire de l'écart — est un lot à
 * part, qui commence par une décision produit.
 *
 * Format : `YYYY-MM-DD`, la date de publication du texte. Une version qui
 * n'avance pas quand le texte change est pire qu'une absence de version.
 *
 * @module @meeshy/shared/types/terms
 */

/** La version des CGU que l'inscription grave dans `User.termsVersion`. */
export const CURRENT_TERMS_VERSION = '2026-08-23';
