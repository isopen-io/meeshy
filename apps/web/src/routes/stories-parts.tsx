import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

/**
 * **LA COQUILLE COMMUNE DES ÉCRANS DE STORIES** (#6149) — extraite de
 * `routes/stories.tsx` (#6080) pour que `/stories/mine` puisse l'importer
 * SANS tirer `StoriesScreen` (`useStoryTray`, `groupStoriesByAuthor`,
 * `useSearch`…) dans son propre chunk : chaque route est son propre
 * `import()` (`route-table.tsx`), et importer un export NOMMÉ de
 * `routes/stories.tsx` depuis un AUTRE point d'entrée aurait lié tout ce
 * module — le rail complet — au listing « Mes stories », qui n'en a besoin
 * d'aucune ligne.
 */
export function StoriesHeader({ language, title }: { readonly language: InterfaceLanguage; readonly title: string }) {
  return (
    <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
      <Link
        to="list"
        aria-label={translate(language, 'pending.back')}
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--color-ios-brand)' }}
      >
        <span aria-hidden="true" className="text-lg leading-none">‹</span>
      </Link>
      <h1 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {title}
      </h1>
    </header>
  );
}

export function StoriesLoading({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <p role="status" className="py-8 text-center text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
      {translate(language, 'stories.loading')}
    </p>
  );
}

export function StoriesLoadError({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <p role="alert" className="py-8 text-center text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
      {translate(language, 'stories.error')}
    </p>
  );
}
