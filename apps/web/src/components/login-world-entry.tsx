import { useEffect, useState } from 'react';
import type { WorldEntry } from '@meeshy/shared/types/world';

import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import { loadWorldEntry, WORLD_FALLBACK_TITLE, WORLD_UNAVAILABLE } from '@/lib/api/world';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { Link } from '@/routes/route-table';

import { GlobeGlyph } from './globe-glyph';

/**
 * WORLD WIDE EN TÊTE DE LA CONNEXION (#10007, planche « Login ») — la carte
 * « Entrer dans World Wide — sans compte » au-dessus de « ou avec votre
 * compte », qui mène au parcours invité de `/world` (#10003 : nom, langue,
 * fil).
 *
 * La carte paraît TOUT DE SUITE : elle ne dépend d'aucun réseau pour être
 * vraie, puisque `/world` relit lui-même l'entrée et dit son refus. `GET /world`
 * (#10000) ne fait ici que deux choses — donner le titre SERVI, et RETIRER la
 * carte et son séparateur quand il répond `WORLD_UNAVAILABLE`, comme la landing
 * masque son entrée. Toute autre erreur (hors ligne, panne) la laisse : rien
 * ne dit alors que l'entrée est fermée.
 */
export type LoginWorldDeps = {
  readonly load: (signal: AbortSignal) => Promise<ApiResult<WorldEntry>>;
};

export const defaultLoginWorldDeps: LoginWorldDeps = {
  load: (signal) => loadWorldEntry({ ...apiDeps, signal }),
};

const CARD_BACKGROUND =
  'linear-gradient(135deg, color-mix(in srgb, var(--color-ios-brand) 30%, transparent), color-mix(in srgb, var(--color-ios-brand) 12%, transparent))';
const CARD_BORDER = '1px solid color-mix(in srgb, var(--color-ios-brand) 40%, transparent)';
const RULE = 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)';

type WorldDoor = { readonly open: boolean; readonly title: string };

/** Ce que la réponse de `GET /world` change à la carte — `null` : rien. */
function nextDoor(result: ApiResult<WorldEntry>): WorldDoor | null {
  if (result.ok) return { open: true, title: result.data.title };
  return result.code === WORLD_UNAVAILABLE ? { open: false, title: WORLD_FALLBACK_TITLE } : null;
}

export function LoginWorldEntry({
  language,
  world = defaultLoginWorldDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly world?: LoginWorldDeps;
}) {
  const [door, setDoor] = useState<WorldDoor>({ open: true, title: WORLD_FALLBACK_TITLE });

  useEffect(() => {
    const controller = new AbortController();
    world.load(controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        const next = nextDoor(result);
        if (next === null) return;
        /* Une entrée servie qui confirme la carte déjà peinte ne redessine
           rien : React abandonne une mise à jour égale avant de la planifier. */
        setDoor((current) => (current.open === next.open && current.title === next.title ? current : next));
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [world.load]);

  if (!door.open) return null;

  return (
    <>
      <Link
        to="world"
        data-login-world
        className="flex w-full items-center gap-3 rounded-card p-3"
        style={{ background: CARD_BACKGROUND, border: CARD_BORDER, color: 'var(--color-ios-ink)', minHeight: 72 }}
      >
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full text-ios-on-brand"
          style={{ backgroundColor: 'var(--color-ios-brand)' }}
        >
          <GlobeGlyph size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-extrabold">{translate(language, 'login.world.title', { title: door.title })}</span>
          <span className="block truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(language, 'login.world.subtitle')}
          </span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 rtl:-scale-x-100"
          style={{ color: 'var(--ios-indigo-400)' }}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </Link>

      <div data-login-world-separator className="flex w-full items-center gap-2.5 text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
        <span aria-hidden="true" className="h-px flex-1" style={{ backgroundColor: RULE }} />
        {translate(language, 'login.world.or')}
        <span aria-hidden="true" className="h-px flex-1" style={{ backgroundColor: RULE }} />
      </div>
    </>
  );
}
