/**
 * LE CŒUR DE LA MARQUE MEESHY (#5606) — chemins d'actifs et libellés,
 * agnostiques du runtime.
 *
 * TS pur : aucun JSX, aucun import de `preact`/`react`. C'est ce que TOUT
 * consommateur — les cinq pages institutionnelles aujourd'hui
 * (`src/institutional/brand-signature.tsx`, `src/institutional/page.tsx`),
 * l'écran de connexion demain — importe plutôt que de recopier un chemin ou
 * un libellé. Reprend `BrandSignature.swift`
 * (`apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift`), avec les
 * adaptations que la spécification #5606 nomme :
 *
 *   · le web n'a pas de `CFBundleVersion` — pas de numéro de build (§ 9 Q3) ;
 *   · `renderingMode(.template)` devient un masque CSS côté consommateur, ce
 *     module ne fait que nommer le fichier gabarit qui le nourrit.
 */

/**
 * Le logo in-app — projection de `MeeshyLogo.imageset` (copie octet pour
 * octet par `scripts/generate-icons.py`, cible `MeeshyLogo@3x.png`). Rendu à
 * la taille logique iOS, 40 px CSS.
 */
export const BRAND_LOGO_PATH = '/brand/logo.png';

/**
 * Le glyphe-GABARIT de la signature — projection de `AppIconFooter.imageset`
 * (`template-rendering-intent: template` côté iOS : seul l'alpha compte, le
 * consommateur le teinte). Rendu à 28 px CSS, en `mask-image` teinté
 * `var(--ios-error)` — la même couleur que `MeeshyColors.error` sur iOS.
 */
export const BRAND_SIGNATURE_MASK_PATH = '/brand/signature-mask.png';

/**
 * `brand.signature.credit` (`apps/ios/Meeshy/Localizable.xcstrings`) —
 * IDENTIQUE dans les 7 locales iOS (ar, de, en, es, fr, it, pt-BR) : un nom
 * propre, pas une chaîne à faire descendre le Prisme.
 */
export const BRAND_CREDIT = 'Services CEO';

/**
 * `Meeshy {version}` — la ligne de version de `BrandSignature.swift`, sans
 * numéro de build (le web n'en a pas d'équivalent). La version ENTRE en
 * paramètre plutôt que d'être lue ici : une seule lecture de
 * `package.json`, au point de préchauffage (`scripts/prerender-institutional.tsx`).
 */
export function brandVersionLine(version: string): string {
  return `Meeshy ${version}`;
}

/*
 * CE MODULE NE PORTE PAS DE LIBELLÉ D'ACCESSIBILITÉ, et c'est une décision.
 *
 * `BrandSignature.swift:45-52` combine ses trois lignes en UN élément
 * d'accessibilité (`brand.signature.accessibilityLabel`) parce que SwiftUI
 * ferait sinon trois arrêts de balayage. Le web n'a pas ce problème — deux
 * `<p>` se lisent d'affilée — et un `aria-label` posé sur un conteneur sans
 * rôle y est IGNORÉ (« ARIA in HTML » : nommage interdit sur le rôle
 * `generic`). Un helper rendant ce libellé n'aurait donc eu qu'un seul usage
 * possible : peindre une conformité sans effet. Le texte VISIBLE est le texte
 * LU — voir le doc-comment de `src/institutional/brand-signature.tsx`.
 */
