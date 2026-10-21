import { BRAND_CREDIT, BRAND_CREDIT_LINK, BRAND_SIGNATURE_MASK_PATH, brandCreditHint, brandVersionLine } from '../lib/brand';
import type { InterfaceLanguage } from '../lib/interface-language';

/**
 * LE PIED DE MARQUE — miroir de `BrandSignature.swift`
 * (`apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift`) : la ligne
 * de version, le crédit « by services.ceo » (un lien vers la plateforme,
 * #10096), le glyphe `AppIconFooter` teinté
 * erreur, empilés avec le même interligne (`VStack(spacing: 4)` → `gap-1`) et
 * le même retrait de 2 px au-dessus du glyphe.
 *
 * QUATRE ÉCARTS ASSUMÉS avec iOS, chacun avec sa raison — un écart sans raison
 * écrite redevient une dérive au cycle suivant :
 *
 * 1. PAS DE NUMÉRO DE BUILD. Le web n'a pas de `CFBundleVersion` ; la ligne se
 *    réduit à `Meeshy {version}` (`src/lib/brand.ts`).
 *
 * 2. `renderingMode(.template)` DEVIENT UN MASQUE CSS. `AppIconFooter` est une
 *    image gabarit côté iOS — seul son alpha compte, le consommateur la teinte.
 *    Le web fait la même chose avec `mask-image` sur un fond `var(--ios-error)`,
 *    le jeton DÉRIVÉ de `MeeshyColors.error` (D-4), et non une couleur écrite.
 *
 * 3. LA HIÉRARCHIE PASSE PAR L'ENCRE ET LE POIDS, PAS PAR L'OPACITÉ. iOS
 *    distingue les deux lignes en posant 0,9 et 0,7 d'opacité sur `textMuted`.
 *    MESURÉ sur les jetons dérivés (`--ios-ink-3` = `textMuted`), ces opacités
 *    donnent 4,44:1 pour la version et 3,09:1 pour le crédit en schéma SOMBRE,
 *    4,12:1 et 2,86:1 en CLAIR — sous le seuil AA de 4,5:1 dans les DEUX
 *    schémas, sur du texte de 14 px. iOS n'est pas tenu par ce seuil, le web
 *    l'est. Les deux niveaux de lecture sont donc rendus par l'ENCRE (`ink-2`
 *    puis `ink-3`, pleines : 9,98:1 et 5,26:1 en sombre, 4,98:1 dans les deux
 *    cas en clair) et par le POIDS `medium` du crédit — le même `.medium` que
 *    `BrandSignature.swift:29-33`, qui portait déjà cette distinction et que la
 *    première version web avait perdu.
 *
 * 4. LA TAILLE VIENT DE L'UTILITAIRE NATIF. `BrandSignature.swift` rend ses
 *    deux lignes à 14 pt ; le jeton correspondant est `--text-sm`, le MÊME que
 *    l'utilitaire natif `text-sm` de Tailwind (`tokens.css` pose `--text-sm`
 *    à la racine, hors de tout `@theme` — donc sans collision de nom avec le
 *    thème du projet). Corrigé à la revue de #5606 (défaut 2) : la feuille des
 *    pages institutionnelles ne déclarait alors AUCUN des rôles typographiques
 *    du projet (`text-body`, `text-screen`, …) dans son `@theme`, ce qui avait
 *    fait poser `fontSize: var(--text-sm)` en ligne ici plutôt que la classe —
 *    `institutional.css` les déclare désormais, et `text-sm` fonctionnait déjà
 *    (utilitaire Tailwind natif, jamais dépendant d'un `@theme` de rôle).
 *
 * ACCESSIBILITÉ — POURQUOI IL N'Y A PAS D'`aria-label` ICI.
 * La ligne de version et le crédit se lisent d'affilée, dans l'ordre, et le
 * texte VISIBLE est exactement le texte LU. Un `aria-label` posé sur le
 * conteneur SANS rôle serait IGNORÉ — « ARIA in HTML » interdit le nommage sur
 * le rôle `generic`, que `<div>` porte. La première version en posait un : il
 * avait la FORME d'une conformité sans en avoir l'EFFET. Le crédit, devenu un
 * lien (#10096), a un rôle et donc un nom : son texte, suivi d'une phrase
 * réservée au lecteur d'écran (`brandCreditHint`, `sr-only`, dans la langue de la page) qui dit où il
 * mène — le pendant de l'`accessibilityHint` d'iOS. Seul le glyphe, décoratif,
 * est masqué.
 */
export function BrandSignature({ version, language }: { version: string; language: InterfaceLanguage }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-1 text-center text-sm">
      <p style={{ color: 'var(--color-ios-ink-2)' }}>{brandVersionLine(version)}</p>
      {/* Le crédit est un LIEN (#10096) : 44 px de cible par `min-h`, rendus au
          flux par une marge négative de 12 px de chaque côté — la ligne occupe
          toujours ses 20 px (`text-sm`), rien du pied ne bouge. `relative`
          le pose au-dessus du glyphe, qu'il chevauche de quelques pixels. */}
      <a
        {...BRAND_CREDIT_LINK}
        className="relative -my-[12px] flex min-h-[44px] items-center px-3 font-medium"
        style={{ color: 'var(--color-ios-ink-3)' }}
      >
        {BRAND_CREDIT}
        <span className="sr-only">{brandCreditHint(language)}</span>
      </a>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 28,
          height: 28,
          marginTop: 2,
          opacity: 0.9,
          backgroundColor: 'var(--ios-error)',
          maskImage: `url(${BRAND_SIGNATURE_MASK_PATH})`,
          WebkitMaskImage: `url(${BRAND_SIGNATURE_MASK_PATH})`,
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
        }}
      />
    </div>
  );
}
