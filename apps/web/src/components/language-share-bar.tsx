import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import type { LanguageShare } from '@/lib/links/invitation-view';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LA BARRE DES LANGUES** (#7796, #7797) — une barre proportionnelle et sa
 * légende, lue par la page d'accueil d'invitation (« On y parle ») et par la
 * page du créateur (« Langues des arrivants »).
 *
 * Chaque langue est nommée DANS SA PROPRE écriture (« 한국어 », « العربية »),
 * comme le sélecteur de langue du produit. La barre est DÉCORATIVE : sa
 * légende porte les mêmes informations en texte, lisibles par un lecteur
 * d'écran et sans dépendre de la couleur (WCAG 1.4.1). Sans comptes servis,
 * les segments sont égaux et AUCUN pourcentage ne s'affiche.
 *
 * Les teintes viennent des jetons iOS (`packages/design-tokens`), dans un
 * ordre fixe : la couleur ne désigne pas une langue, elle distingue des
 * segments voisins.
 */

const SEGMENT_TINTS = [
  'var(--ios-indigo-500)',
  'var(--ios-warning)',
  'var(--ios-info)',
  'var(--ios-purple-500)',
  'var(--ios-success)',
  'var(--ios-neutral-400)',
] as const;

export const segmentTint = (index: number): string => SEGMENT_TINTS[index % SEGMENT_TINTS.length] ?? 'var(--ios-neutral-400)';

export const endonymOf = (code: string): string => {
  const info = getLanguageInfo(code);
  return info.code === code ? (info.nativeName ?? info.name ?? code) : code.toUpperCase();
};

export function LanguageShareBar({
  language,
  shares,
  compose,
}: {
  readonly language: InterfaceLanguage;
  readonly shares: readonly LanguageShare[];
  /** Compose « Français 29 % » — la phrase vit dans le catalogue de l'hôte. */
  readonly compose: (name: string, percent: string) => string;
}) {
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 0 });
  return (
    <div className="grid gap-3" data-language-shares>
      <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-chip">
        {shares.map((share, index) => (
          <span key={share.code} className="block h-full" style={{ flexGrow: share.weight, flexBasis: 0, backgroundColor: segmentTint(index) }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3.5 gap-y-2 text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {shares.map((share, index) => {
          const name = endonymOf(share.code);
          return (
            <li key={share.code} data-language-share={share.code} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="block size-2 shrink-0 rounded-full" style={{ backgroundColor: segmentTint(index) }} />
              {share.percent === null ? <span lang={share.code}>{name}</span> : <span>{compose(name, percent.format(share.percent / 100))}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
