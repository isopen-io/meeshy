import { Glyph } from '@/components/glyph';
import type { GlyphName } from '@/components/glyphs';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { StudioUploadState } from '@/lib/stories/studio';
import { Link } from '@/routes/route-table';

/**
 * LES PIÈCES DU STUDIO DE STORY (#6900) — présentation pure, sans état ni
 * réseau : l'orchestration vit dans `story-compose.tsx`. Cibles ≥ 44 px
 * partout (loi des cibles, `check-story-studio` à venir), couleurs par jetons
 * CONSCIENTS du schéma (`--color-error` : 5,74:1 en clair, 6,15:1 en sombre —
 * `--ios-error` n'a aucune redéfinition claire et mesure 2,77:1,
 * `pull-indicator.tsx`).
 */

const TARGET = 44;

/** Une PORTE du couloir gauche (« à GAUCHE ce qu'on POSE sur la scène »,
 * `meeshy-composer-modele.md` § 6) — un `<label>` autour d'un `<input
 * type=file>` masqué, motif `composer-tray.tsx` : un bouton qui appellerait
 * `input.click()` imbriquerait un contrôle dans un autre. Icône seule comme
 * les rails iOS, NOMMÉE pour le lecteur d'écran et au survol. */
export function StudioDoorButton({
  label,
  glyph,
  accept,
  door,
  onSelect,
}: {
  readonly label: string;
  readonly glyph: GlyphName;
  readonly accept: string;
  readonly door: 'visual' | 'sound';
  readonly onSelect: (file: File) => void;
}) {
  return (
    <label
      title={label}
      className="grid cursor-pointer place-items-center rounded-full focus-within:outline-2 focus-within:outline-offset-2"
      style={{
        width: TARGET,
        height: TARGET,
        color: 'var(--color-ios-ink)',
        backgroundColor: 'var(--color-ios-card)',
        outlineColor: 'var(--color-ios-brand)',
      }}
    >
      <input
        type="file"
        accept={accept}
        data-door={door}
        className="sr-only"
        aria-label={label}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file !== undefined) onSelect(file);
        }}
      />
      <Glyph name={glyph} size={22} />
    </label>
  );
}

/** L'état d'un média posé — son NOM (« Fond », « Son de fond »), sa montée,
 * sa cause d'échec et ses deux gestes, chacun nommé pour CE média : deux
 * boutons « Retirer » identiques ne disaient pas au lecteur d'écran lequel
 * des deux ils retiraient. */
export function StudioAssetRow({
  lang,
  glyph,
  label,
  removeLabel,
  upload,
  onRetry,
  onRemove,
}: {
  readonly lang: InterfaceLanguage;
  readonly glyph: GlyphName;
  readonly label: string;
  readonly removeLabel: string;
  readonly upload: StudioUploadState;
  readonly onRetry: (() => void) | undefined;
  readonly onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2 text-caption" data-asset-phase={upload.phase}>
      <Glyph name={glyph} size={16} style={{ color: 'var(--color-ios-ink-2)' }} />
      <span className="font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {label}
      </span>
      <span role={upload.phase === 'failed' ? 'alert' : 'status'} className="min-w-0 flex-1 truncate" style={{ color: upload.phase === 'failed' ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}>
        {upload.phase === 'uploading'
          ? translate(lang, 'story.studio.upload.progress', { percent: String(Math.round(upload.progress * 100)) })
          : upload.phase === 'ready'
            ? translate(lang, 'story.studio.upload.ready')
            : translate(lang, upload.reasonKey)}
      </span>
      {upload.phase === 'failed' && onRetry !== undefined ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-chip px-3 font-semibold"
          style={{ minHeight: TARGET, color: 'var(--color-ios-brand)' }}
        >
          {translate(lang, 'story.studio.upload.retry')}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="grid shrink-0 place-items-center rounded-full"
        style={{ width: TARGET, height: TARGET, color: 'var(--color-ios-ink-2)' }}
      >
        <Glyph name="x" size={16} />
      </button>
    </li>
  );
}

/** L'état REFUS — un invité de lien (`X-Session-Token`) ne peut pas monter de
 * `PostMedia` (`tus-handler.ts:326-333`) : il le lit AVANT d'avoir composé,
 * jamais après un envoi refusé. */
export function StudioRefusal({ lang }: { readonly lang: InterfaceLanguage }) {
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center" data-story-studio-refusal>
      <Glyph name="lock" size={40} style={{ color: 'var(--color-ios-ink-2)' }} />
      <p className="text-body" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(lang, 'story.studio.refusal.title')}
      </p>
      <Link
        to="login"
        className="grid place-items-center rounded-chip px-5 font-semibold text-white"
        style={{ minHeight: TARGET, backgroundColor: 'var(--color-ios-brand)' }}
      >
        {translate(lang, 'story.studio.refusal.login')}
      </Link>
    </div>
  );
}
