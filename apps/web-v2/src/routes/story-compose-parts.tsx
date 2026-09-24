import type { CSSProperties, ReactNode } from 'react';

import { Glyph } from '@/components/glyph';
import type { GlyphName } from '@/components/glyphs';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { MEDIA_CAPTION_MAX } from '@/lib/stories/media-caption';
import type { StudioPlane } from '@/lib/stories/story-document';
import type { StudioDoor, StudioUploadState } from '@/lib/stories/studio';
import { Link } from '@/routes/route-table';

/**
 * LES PIÈCES DU STUDIO DE STORY (#6900, élargies par #6943/#6944) —
 * présentation pure, sans état ni réseau : l'orchestration vit dans
 * `story-compose.tsx`. Cibles ≥ 44 px partout (loi des cibles,
 * `check-story-studio`), couleurs par jetons CONSCIENTS du schéma
 * (`--color-error` : 5,74:1 en clair, 6,15:1 en sombre — `--ios-error` n'a
 * aucune redéfinition claire et mesure 2,77:1, `pull-indicator.tsx`).
 */

const TARGET = 44;

/** DEUX tracés LOCAUX — le registre partagé (`components/glyphs*.ts`) n'a ni
 * « calque » ni « réglages », et l'y ajouter toucherait une surface que
 * d'autres lots écrivent en parallèle. Un `<svg>` de huit lignes ici ne coûte
 * rien et ne collisionne avec personne. */
export function LayerMark({ size = 20 }: { readonly size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
      <rect x="3" y="3" width="13" height="13" rx="2.5" />
      <path d="M8 19.5h9a2.5 2.5 0 0 0 2.5-2.5V8" />
    </svg>
  );
}

/** Créer une PAGE (#7684) — cadre 9:16 (la forme d'une scène) + un `+` : le
 * geste du rail droit, distinct d'une porte (« ajouter des images en fond OU
 * en front » pose un OBJET sur la page courante ; celui-ci ajoute une PAGE à
 * la publication, `ComposerTrailingRail.swift:40-45`). */
export function PageMark({ size = 20 }: { readonly size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M9 12h6M12 9v6" />
    </svg>
  );
}

export function SlidersMark({ size = 20 }: { readonly size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="17" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

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
  readonly glyph: GlyphName | 'layer';
  readonly accept: string;
  readonly door: StudioDoor;
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
      {glyph === 'layer' ? <LayerMark size={22} /> : <Glyph name={glyph} size={22} />}
    </label>
  );
}

/** Un bouton du RAIL — la forme partagée par tous les réglages d'objet : une
 * cible de 44 px, l'état PRESSÉ dit par `aria-pressed` et non par la seule
 * couleur (un contraste ne se lit pas au lecteur d'écran). */
export function StudioChip({
  label,
  pressed,
  onPress,
  children,
  style,
  probe,
}: {
  readonly label: string;
  readonly pressed: boolean;
  readonly onPress: () => void;
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
  /** LA PRISE DE MESURE — « un composant sans prise mesurable ne peut être
   * gardé par rien » (leçon 575). Un gate navigateur doit pouvoir désigner CE
   * réglage-ci sans passer par son libellé traduit, qui romprait au premier
   * changement de catalogue. */
  readonly probe?: string;
}) {
  return (
    <button
      type="button"
      {...(probe !== undefined ? { 'data-story-option': probe } : {})}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onPress}
      className="grid shrink-0 place-items-center rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minWidth: TARGET,
        minHeight: TARGET,
        outlineColor: 'var(--color-ios-brand)',
        color: pressed ? '#fff' : 'var(--color-ios-ink)',
        backgroundColor: pressed ? 'var(--color-ios-brand)' : 'var(--color-ios-card)',
        ...style,
      }}
    >
      {children ?? label}
    </button>
  );
}

/**
 * L'état d'un média posé — son NOM (« Fond », « Calque », « Son de fond »), sa
 * montée, sa cause d'échec et ses gestes, chacun nommé pour CE média : deux
 * boutons « Retirer » identiques ne disaient pas au lecteur d'écran lequel des
 * deux ils retiraient.
 *
 * **La LÉGENDE se saisit ICI** (#6944), sur la ligne du média qu'elle
 * qualifie — c'est `PostMedia.caption`, le contenu propre de CETTE image ou
 * de CE son, jamais le `Post.content` de la publication ni le texte de scène.
 */
export function StudioAssetRow({
  lang,
  glyph,
  label,
  removeLabel,
  upload,
  onRetry,
  onRemove,
  caption,
  children,
}: {
  readonly lang: InterfaceLanguage;
  readonly glyph: GlyphName | 'layer';
  readonly label: string;
  readonly removeLabel: string;
  readonly upload: StudioUploadState;
  readonly onRetry: (() => void) | undefined;
  readonly onRemove: () => void;
  /** Absente pour un SON : la passerelle n'accepte `mediaCaption` que par
   * `postMediaId`, et une légende de piste sonore n'a aucune surface où se
   * rendre — l'annoncer serait un contrôle sans effet (loi 4). */
  readonly caption?: { readonly value: string; readonly inputId: string; readonly onChange: (value: string) => void };
  readonly children?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-1" data-asset-phase={upload.phase}>
      <div className="flex items-center gap-2 text-caption">
        {glyph === 'layer' ? (
          <span style={{ color: 'var(--color-ios-ink-2)', display: 'grid' }}>
            <LayerMark size={16} />
          </span>
        ) : (
          <Glyph name={glyph} size={16} style={{ color: 'var(--color-ios-ink-2)' }} />
        )}
        <span className="font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {label}
        </span>
        <span
          role={upload.phase === 'failed' ? 'alert' : 'status'}
          className="min-w-0 flex-1 truncate"
          style={{ color: upload.phase === 'failed' ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}
        >
          {upload.phase === 'uploading'
            ? translate(lang, 'story.studio.upload.progress', { percent: String(Math.round(upload.progress * 100)) })
            : upload.phase === 'ready'
              ? translate(lang, 'story.studio.upload.ready')
              : translate(lang, upload.reasonKey)}
        </span>
        {children}
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
      </div>
      {caption !== undefined ? (
        <>
          <label htmlFor={caption.inputId} className="offscreen">
            {translate(lang, 'story.studio.caption.label', { media: label })}
          </label>
          <input
            id={caption.inputId}
            data-story-caption={caption.inputId}
            type="text"
            dir="auto"
            maxLength={MEDIA_CAPTION_MAX}
            value={caption.value}
            onInput={(event) => caption.onChange(event.currentTarget.value)}
            placeholder={translate(lang, 'story.studio.caption.placeholder')}
            className="w-full rounded-chip px-3 text-caption focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: TARGET,
              color: 'var(--color-ios-ink)',
              backgroundColor: 'var(--color-ios-card)',
              outlineColor: 'var(--color-ios-brand)',
            }}
          />
        </>
      ) : null}
    </li>
  );
}

/** LA BASCULE DE PLAN d'un son (#6943) — deux rôles pour un seul fichier : la
 * bande-son de la scène, ou un son POSÉ que l'élection de fond ignore. */
export function StudioSoundPlaneToggle({
  lang,
  plane,
  onChange,
}: {
  readonly lang: InterfaceLanguage;
  readonly plane: StudioPlane;
  readonly onChange: (plane: StudioPlane) => void;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1" role="group" aria-label={translate(lang, 'story.studio.sound.plane.label')}>
      {(['background', 'foreground'] as const).map((value) => (
        <StudioChip
          key={value}
          label={translate(lang, value === 'background' ? 'story.studio.sound.plane.background' : 'story.studio.sound.plane.foreground')}
          pressed={plane === value}
          onPress={() => onChange(value)}
          style={{ paddingInline: 10 }}
          probe={`sound-plane:${value}`}
        />
      ))}
    </span>
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
