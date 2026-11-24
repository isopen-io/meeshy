import { meeshEarnLabel, meeshShortfallLine } from '@/lib/packs/shortfall';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

/**
 * **CE QUI MANQUE, ET LE CHEMIN** (#20527) — sous un pack payant que le solde
 * ne couvre pas : l'écart en Meeshes, puis le lien vers la frappe (la fiche de
 * l'Héritage). Le lien passe AU-DESSUS du bouton qui ouvre la rangée
 * (`relative z-[1]`), et sa cible fait 44 pt.
 */
export function MeeshShortfall({ language, missing }: { readonly language: InterfaceLanguage; readonly missing: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <p data-shop-short className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {meeshShortfallLine(language, missing)}
      </p>
      <Link
        to="progressionConcept"
        params={{ concept: 'meesh' }}
        data-shop-earn
        className="btn-press relative z-[1] inline-flex min-h-11 items-center text-caption font-semibold underline focus-visible:outline-2"
        style={{ color: 'var(--accent, var(--color-ios-brand))', outlineColor: 'var(--color-ios-brand)' }}
      >
        {meeshEarnLabel(language)}
      </Link>
    </div>
  );
}
