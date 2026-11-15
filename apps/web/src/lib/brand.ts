/**
 * LE CŒUR DE LA MARQUE MEESHY (#5606) — chemins d'actifs et libellés,
 * agnostiques du runtime.
 *
 * TS pur : aucun JSX, aucun import de `preact`/`react`. C'est ce que TOUT
 * consommateur — les sept pages institutionnelles aujourd'hui
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
import { translate } from './i18n-catalog';
import type { InterfaceLanguage } from './interface-language';

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
 * LE CRÉDIT DU PIED DE MARQUE (#10096) — « by services.ceo », une MARQUE : il
 * ne se traduit dans aucune langue et ne descend pas le Prisme. iOS l'écrit
 * à l'identique, en verbatim (`BrandSignature.credit`).
 */
export const BRAND_CREDIT = 'by services.ceo';

/**
 * OÙ MÈNE LE CRÉDIT (#10096) — la plateforme, dans un nouvel onglet : le
 * visiteur ne perd pas la page qu'il lisait. `noopener noreferrer` coupe
 * `window.opener` (la plateforme ne peut pas renvoyer cet onglet ailleurs) et
 * ne lui dit pas d'où il vient. Les deux pieds (`institutional/brand-signature.tsx`,
 * `components/auth-chrome.tsx`) l'ÉTALENT tel quel : la destination n'est
 * écrite qu'ici, comme `BrandSignature.creditDestination` côté iOS.
 */
export const BRAND_CREDIT_LINK = {
  href: 'https://services.ceo',
  target: '_blank',
  rel: 'noopener noreferrer',
} as const;

/**
 * CE QUE LE LIEN FAIT, dit au lecteur d'écran À LA SUITE du texte visible
 * (#10096). Le nom accessible COMMENCE par le crédit lu (WCAG 2.5.3, le libellé
 * dans le nom : « by services.ceo » dicté à la commande vocale l'active), puis
 * annonce la sortie de page — dans la langue d'interface (#10827), au
 * catalogue (`brand.credit.hint`, pendant web de
 * `brand.signature.credit.accessibilityHint` d'iOS : « dans un nouvel onglet »
 * plutôt que « dans le navigateur », le visiteur y est déjà).
 */
export function brandCreditHint(language: InterfaceLanguage): string {
  return ` — ${translate(language, 'brand.credit.hint')}`;
}

/**
 * LES TROIS TRAITS DE LA MARQUE, dans le repère 1024 de
 * `MeeshyDashesShape.path(in:)` (`AnimatedLogoView.swift:12-34`) : chaque
 * trait part de `x1` et finit à `x2`, bouts ronds, à l'opacité de l'état au
 * repos (0,7 · 1 · 0,75). UNE table, que le glyphe SVG (`BrandMark`) et le
 * peintre de canevas des cadres de capture (#8743) lisent tous deux.
 */
export const BRAND_DASH_BOX = 1024;

export const BRAND_DASHES = [
  { x1: 262, x2: 762, y: 384, opacity: 0.7 },
  { x1: 262, x2: 662, y: 512, opacity: 1 },
  { x1: 262, x2: 562, y: 640, opacity: 0.75 },
] as const;

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
 * CE MODULE NE PORTE PAS DE LIBELLÉ D'ACCESSIBILITÉ DU BLOC, et c'est une
 * décision. (Le CRÉDIT, lui, est un lien depuis #10096 : un lien a un rôle, et
 * son nom se complète par `brandCreditHint`, en texte, jamais en `aria-label`.)
 *
 * `BrandSignature.swift` combinait ses trois lignes en UN élément
 * d'accessibilité ; depuis que le crédit est un lien (#10096), il en rend
 * deux — la version (`brand.signature.accessibilityLabel`), puis le lien. Le
 * web n'a jamais eu besoin du premier : la version et le crédit se lisent
 * d'affilée, et un `aria-label` posé sur un conteneur sans rôle y est IGNORÉ
 * (« ARIA in HTML » : nommage interdit sur le rôle `generic`). Un helper
 * rendant ce libellé n'aurait donc eu qu'un seul usage
 * possible : peindre une conformité sans effet. Le texte VISIBLE est le texte
 * LU — voir le doc-comment de `src/institutional/brand-signature.tsx`.
 */
