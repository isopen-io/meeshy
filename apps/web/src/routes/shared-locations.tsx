import { SharedLocationsMap } from '@/components/shared-locations-map';
import { Glyph } from '@/components/glyph';
import { Link } from '@/routes/route-table';
import { translate } from '@/lib/i18n-catalog';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';

/**
 * **LES POSITIONS QUE MES LIENS ME PARTAGENT** (#16984) — `/positions`, la carte des
 * partages temporaires reçus (spec cercles § 1.3, § 1.5). Le web reçoit sans émettre :
 * la page le dit (voir `SharedLocationsMapView`). L'écran n'ajoute rien à la carte, il
 * lui donne un titre et un retour vers « Découvrir › Cercles », où l'on choisit à qui
 * on ouvre quoi.
 */
export default function SharedLocationsScreen() {
  const language = currentInterfaceLanguage();
  const ready = useCirclesCatalog(language);
  return (
    <main className="relative flex min-h-dvh flex-col gap-4 px-4 pb-8 pt-safe">
      <header className="flex shrink-0 items-center gap-2" style={{ height: 64 }}>
        <Link to="discover" aria-label={translate(language, 'pending.back')} className="grid min-h-[44px] min-w-[44px] place-items-center focus-visible:outline-2 focus-visible:outline-offset-2" style={{ color: 'var(--color-brand)' }}>
          <Glyph name="caretLeft" size={16} className="rtl:-scale-x-100" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-title font-bold" style={{ color: 'var(--color-ink)' }}>
          {ready ? translateCircles(language, 'positions.title') : ''}
        </h1>
      </header>
      <SharedLocationsMap language={language} />
    </main>
  );
}
