import type { Ref } from 'react';

import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { ComposerLanguagePill } from './composer-language-pill';
import { Glyph, GlyphSvg } from './glyph';
import { FlameEyeGlyph } from './flame-eye-glyph';
import { EPHEMERAL_DURATIONS, characterCounterOf, ephemeralDurationLabelOf, isAfterReadChoice } from '@/lib/send/compose-protection';
import { COMPOSER_GLYPHS } from './glyphs-composer';
import { developShots } from '@/lib/media/develop-shots';
import type { ImposedLocks } from '@/lib/send/reply-contagion';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * L'ÉTAT ARMÉ D'UNE BASCULE (revue-correction #6175, défaut majeur) — le
 * LAVIS porte la couleur d'état, l'ENCRE reste `--color-ios-ink` dans les
 * DEUX schémas, et un LISERÉ referme l'identité.
 *
 * C'est la doctrine déjà écrite dans `composer-language-pill.tsx:16-25` et
 * gardée par `check-thread-chrome.mjs § 6` : une encre à la couleur d'état
 * posée sur un lavis de cette MÊME couleur ne tient pas la barre AA. Mesuré
 * au navigateur sur la première forme de cette rangée — « 1min » 4,47:1 en
 * schéma CLAIR (encre `--color-error`) et « Flou » 2,90:1 en schéma SOMBRE
 * (encre `--color-i600`, un indigo foncé sur un fond quasi noir) : chacune ne
 * rougissait que dans UN des deux schémas, exactement ce que « les deux
 * schémas se regardent » existe pour attraper. La capsule « effets » portait
 * la même forme avec `--accent`, donc un contraste qui variait avec la
 * couleur de CHAQUE conversation, sans aucun plancher.
 *
 * Le liseré n'est pas une compensation : c'est la moitié d'iOS que la
 * première forme avait laissée tomber (`+Protections.swift` — « capsule
 * `error` à 15 % ET trait 30 % »).
 */
const armedStyle = (color: string, fill = 15, ring = 30) => ({
  backgroundColor: `color-mix(in srgb, ${color} ${fill}%, transparent)`,
  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} ${ring}%, transparent)`,
  color: 'var(--color-ios-ink)',
});

const NO_LOCKS: ImposedLocks = { blurred: false, ephemeral: false };

/**
 * LA RANGÉE HAUTE DU COMPOSEUR (#6175) — miroir `topToolbar`
 * (`UniversalComposerBar+Toolbar.swift:25-81`), EXTRAITE de `composer.tsx`
 * pour tenir le budget de 1000–1200 lignes (CLAUDE.md racine).
 *
 * CINQ occupants à EFFET (éphémère, flou, vue unique, effets, langue) + UN
 * compteur CONDITIONNEL — et deux PORTES (#9082, directive porteur
 * 2026-10-02) : le sticker à la place de l'ancien indicateur de tonalité, la
 * caméra à l'angle droit du verre, chacune rendue seulement si l'hôte sait
 * l'ouvrir (loi 4) — pas six
 * contrôles égaux : la capture de référence
 * (`targets/thread.composer-top-row.{light,dark}.png`) et le code source
 * (`maxLength == nil` en conversation) corrigent le libellé initial de
 * l'issue #6175. Voir `docs/product/…/composeur-du-fil.md` § 1.2.
 *
 * **« VUE UNIQUE » (#7354, puis #7597)** — TOUJOURS là, d'un seul tap,
 * juste après le flou, comme iOS (#7472 : `hideViewOnce` ne la cache qu'en
 * ÉDITION, que ce composeur n'a pas). #7354 la gatait sur une image en
 * attente ; #7498 a tranché qu'elle vaut pour TOUT ce qu'on envoie, et le
 * porteur l'a constatée absente de la barre (#7597). Le « 1 » cerclé
 * (`1.circle` / `1.circle.fill`) dit l'état : contour au repos, plein armé.
 *
 * ORDRE FIXE, jamais réordonné : éphémère · flou · vue unique · effets ·
 * sticker · langue · spacer · compteur · photothèque · caméra — le groupe MENANT d'iOS
 * (`targets/README.md` § 1.4, `+Protections.swift:161-238` pour le rang de
 * « vue unique » entre flou et effets).
 */
export function ComposerTopRow({
  ephemeralSeconds,
  ephemeralPickerOpen,
  onToggleEphemeral,
  blurred,
  onToggleBlur,
  viewOnce,
  onToggleViewOnce,
  locks = NO_LOCKS,
  effectCount,
  effectsPanelOpen,
  onToggleEffects,
  onOpenStickers,
  onPickLibrary,
  onPickCamera,
  languageCode,
  onOpenLanguage,
  languagePillRef,
  text,
  maxLength,
}: {
  /** `undefined` = désactivé. */
  readonly ephemeralSeconds?: number;
  readonly ephemeralPickerOpen: boolean;
  /** Tap sur la bascule : ARME/désarme si déjà armé, sinon ouvre/ferme le
   * sélecteur (miroir `ephemeralToggleButton`, `+Protections.swift:26-42`). */
  readonly onToggleEphemeral: () => void;
  readonly blurred: boolean;
  readonly onToggleBlur: () => void;
  readonly viewOnce: boolean;
  readonly onToggleViewOnce: () => void;
  /** CE QUE LA CITATION IMPOSE (#8557) — une bascule verrouillée reste
   * armée, ne répond plus au tap et DIT pourquoi. */
  readonly locks?: ImposedLocks;
  /** Nombre d'effets décoratifs actifs — la capsule affiche ce compte,
   * jamais un booléen (miroir `effectsToggleButton`, `+Toolbar.swift`). */
  readonly effectCount: number;
  /** Le panneau d'effets inline est ouvert (#7980) — la baguette le dit. */
  readonly effectsPanelOpen: boolean;
  /** Tap sur la baguette : ouvre/ferme le panneau d'effets (#7980). */
  readonly onToggleEffects: () => void;
  /** La porte de la feuille de stickers (#9082) — absente ⇒ rien. */
  readonly onOpenStickers?: () => void;
  /** La photothèque, juste avant la caméra (#9120) — images ET vidéos ;
   * absente ⇒ rien. */
  readonly onPickLibrary?: (files: FileList | null) => void;
  /** La caméra de l'angle droit (#9082) — mêmes fichiers que la tuile du
   * panneau (`developShots`) ; absente ⇒ rien. */
  readonly onPickCamera?: (files: readonly File[]) => void;
  readonly languageCode: string;
  readonly onOpenLanguage: () => void;
  readonly languagePillRef?: Ref<HTMLButtonElement>;
  /** Le texte COURANT — uniquement pour le compteur conditionnel. */
  readonly text: string;
  /** Absent en conversation (§1.2 point 2 de la spécification #6175) — nul
   * appelant ne le fournit cette itération, faute de source honnête de la
   * limite serveur. */
  readonly maxLength?: number;
}) {
  const counter = characterCounterOf({ text, ...(maxLength === undefined ? {} : { maxLength }) });
  /** LES LIBELLÉS DE L'ÉPHÉMÈRE (#8304) ET DE LA VUE UNIQUE (#7354) passent
   * par le catalogue ; le flou et les effets restent en français en dur,
   * dette antérieure (#6310) que ce lot ne répand pas. */
  const language = currentInterfaceLanguage();
  const armedEphemeral = ephemeralSeconds === undefined ? undefined : ephemeralDurationLabelOf(ephemeralSeconds);
  const ephemeralDuration = armedEphemeral === undefined ? '' : translate(language, armedEphemeral.displayKey);

  return (
    <div data-composer-toolbar className="flex items-center justify-start gap-1 px-3 pt-1.5">
      {/* LA BANDE MENANTE DÉFILE, L'ANGLE DROIT JAMAIS (#9082) — miroir
          `ComposerToolbarStrip` : à 320 px la rangée débordait et la caméra
          sortait de l'écran ; seuls les outils de tête glissent, le compteur
          et la caméra restent à l'angle du verre. */}
      <div data-composer-toolbar-leading className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {/* CIBLES ≥ 44×44 (dimension 5, revue-correction #6175) — `min-w-11`
            AUTANT que `min-h-11`, motif `composer-language-pill.tsx:69`. La
            première forme ne posait que la HAUTEUR : mesurée 32×44 au
            navigateur dans les DEUX schémas, sous la barre en LARGEUR
            pendant que le témoin unitaire, qui ne lisait que la CLASSE
            `min-h-11`, restait vert. */}
        <button
          type="button"
          onClick={onToggleEphemeral}
          disabled={locks.ephemeral}
          aria-pressed={ephemeralSeconds !== undefined}
          aria-expanded={ephemeralPickerOpen}
          data-composer-ephemeral
          {...(locks.ephemeral ? { 'data-imposed': '' } : {})}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-chip px-2 disabled:cursor-not-allowed"
          style={ephemeralSeconds !== undefined ? armedStyle('var(--color-error)') : { color: 'var(--composer-icon)' }}
          aria-label={
            locks.ephemeral
              ? translate(language, 'composer.protection.imposed.ephemeral', { duration: ephemeralDuration })
              : ephemeralSeconds === undefined
                ? translate(language, 'composer.ephemeral.activate')
                : translate(language, 'composer.ephemeral.active', { duration: ephemeralDuration })
          }
        >
          {/* LA FLAMME-ŒIL (#8304) n'a pas de libellé court : son
              pictogramme DIT le choix, comme sur iOS. */}
          {isAfterReadChoice(ephemeralSeconds) ? (
            <span data-glyph="flameEye" className="inline-flex">
              <FlameEyeGlyph size={16} />
            </span>
          ) : (
            <Glyph name={ephemeralSeconds !== undefined ? 'flameFill' : 'timer'} size={16} />
          )}
          {armedEphemeral !== undefined && armedEphemeral.label !== '' ? (
            <span className="text-title font-bold">{armedEphemeral.label}</span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onToggleBlur}
          disabled={locks.blurred}
          aria-pressed={blurred}
          data-composer-blur
          {...(locks.blurred ? { 'data-imposed': '' } : {})}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-chip px-2 disabled:cursor-not-allowed"
          style={blurred ? armedStyle('var(--ios-state-concealed)') : { color: 'var(--composer-icon)' }}
          aria-label={
            locks.blurred
              ? translate(language, 'composer.protection.imposed.blur')
              : blurred
                ? 'Mode flou actif'
                : 'Activer le mode flou'
          }
        >
          <Glyph name="eyeSlash" size={16} />
          {blurred ? <span className="text-title font-bold">Flou</span> : null}
        </button>

        {/* « VUE UNIQUE » (#7597) — sans condition, à côté du flou. Chaque
            protection porte SA couleur (#7667) : flamme rouge d'alerte
            (directive porteur ; décision #7677), « 1 » violet et flou gris
            du fil (#7599) — et le flou et la vue unique sont exclusifs
            (`toggledVeil`). */}
        <button
          type="button"
          onClick={onToggleViewOnce}
          aria-pressed={viewOnce}
          data-composer-view-once
          data-glyph={viewOnce ? 'numberCircleOneFill' : 'numberCircleOne'}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-chip px-2"
          style={viewOnce ? armedStyle('var(--ios-state-view-once)') : { color: 'var(--composer-icon)' }}
          aria-label={translate(language, viewOnce ? 'composer.viewOnce.active' : 'composer.viewOnce.activate')}
        >
          <Glyph name={viewOnce ? 'numberCircleOneFill' : 'numberCircleOne'} size={16} />
          {viewOnce ? <span className="text-title font-bold">{translate(language, 'composer.viewOnce.label')}</span> : null}
        </button>

        <button
          type="button"
          onClick={onToggleEffects}
          aria-expanded={effectsPanelOpen}
          data-composer-effects
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-chip px-2"
          style={effectCount > 0 ? armedStyle('var(--accent)') : { color: 'var(--composer-icon)' }}
          aria-label={effectCount > 0 ? `${effectCount} effet(s) actif(s)` : 'Ajouter des effets au message'}
        >
          <GlyphSvg glyph={THREAD_MENU_GLYPHS.magicWand} size={16} />
          {effectCount > 0 ? <span className="text-title font-bold">{effectCount}</span> : null}
        </button>

        {onOpenStickers === undefined ? null : (
          <button
            type="button"
            onClick={onOpenStickers}
            data-composer-sticker
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-chip px-2"
            style={{ color: 'var(--composer-icon)' }}
            aria-label={translate(language, 'composer.attach.sticker')}
          >
            <GlyphSvg glyph={COMPOSER_GLYPHS.sticker} size={16} />
          </button>
        )}

        <ComposerLanguagePill code={languageCode} onOpen={onOpenLanguage} {...(languagePillRef ? { buttonRef: languagePillRef } : {})} />
      </div>

        {counter ? (
          <span
            data-composer-counter
            className="shrink-0 pe-1 font-mono text-[11px] font-semibold"
            style={{ color: counter.overflow ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}
          >
            {counter.text}
          </span>
        ) : null}

        {/* LA PHOTOTHÈQUE (#9120) — images ET vidéos, à côté de la caméra
            (miroir `ComposerGlassDoors.trailing` → [library, camera, fold]) ;
            sans `capture`, elle ouvre la galerie, jamais l'objectif. */}
        {onPickLibrary === undefined ? null : (
          <label
            data-composer-library
            className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-chip px-2"
            style={{ color: 'var(--composer-icon)' }}
          >
            <Glyph name="image" size={16} />
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="sr-only"
              aria-label={translate(language, 'composer.attach.photo.action')}
              onChange={(e) => {
                onPickLibrary(e.currentTarget.files);
                e.currentTarget.value = '';
              }}
            />
          </label>
        )}

        {onPickCamera === undefined ? null : (
          <label
            data-composer-camera
            className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-chip px-2"
            style={{ color: 'var(--composer-icon)' }}
          >
            <GlyphSvg glyph={COMPOSER_GLYPHS.camera} size={16} />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label={translate(language, 'composer.attach.camera.action')}
              onChange={(e) => {
                void developShots([...(e.currentTarget.files ?? [])]).then(onPickCamera);
                e.currentTarget.value = '';
              }}
            />
          </label>
        )}
    </div>
  );
}

/**
 * LE RAIL DE DURÉE ÉPHÉMÈRE (#6175) — sorti de la rangée haute (#7980) pour
 * que le COMPOSEUR le pose au-dessus de la barre d'outils. Il partage cette
 * place avec le panneau d'effets, les deux s'excluant.
 *
 * 8 px avec le bord haut du verre et sur les côtés (`mt-2 mx-2`, miroir
 * `railTopInset` + `.padding(.horizontal, 8)`, #7966).
 */
export function ComposerEphemeralRail({
  ephemeralSeconds,
  onSelectEphemeral,
}: {
  /** `undefined` = désactivé. */
  readonly ephemeralSeconds?: number;
  /** Choix d'une capsule du sélecteur — `undefined` = « Désactivé ». */
  readonly onSelectEphemeral: (seconds: number | undefined) => void;
}) {
  const language = currentInterfaceLanguage();
  return (
    <div
      data-composer-ephemeral-picker
      role="group"
      aria-label={translate(language, 'composer.ephemeral.rail')}
      className="mx-2 mt-2 flex gap-2 overflow-x-auto rounded-[16px] px-3 py-1"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, var(--color-ios-surface))' }}
    >
      {/* CIBLES ≥ 44 (dimension 5, revue-correction #6175) — `min-h-11`
          sur chaque capsule : la première forme mesurait 32 px de haut au
          navigateur, sous la barre, alors que la rangée voisine venait de
          la tenir. */}
      <button
        type="button"
        onClick={() => onSelectEphemeral(undefined)}
        aria-pressed={ephemeralSeconds === undefined}
        className="min-h-11 shrink-0 rounded-full px-3.5 text-title font-semibold"
        style={
          ephemeralSeconds === undefined
            ? { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }
            : { color: 'var(--color-ios-ink-2)' }
        }
      >
        {translate(language, 'composer.ephemeral.off')}
      </button>
      {EPHEMERAL_DURATIONS.map((d) => {
        const active = ephemeralSeconds === d.seconds;
        return (
          <button
            key={d.seconds}
            type="button"
            onClick={() => onSelectEphemeral(d.seconds)}
            aria-pressed={active}
            aria-label={translate(language, d.displayKey)}
            {...(d.afterRead ? { 'data-ephemeral-after-read': '' } : {})}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3.5 text-title font-semibold"
            style={
              active
                ? armedStyle('var(--color-error)', 32, 100)
                : {
                    backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                    color: 'var(--color-ios-ink)',
                  }
            }
          >
            {d.afterRead ? <FlameEyeGlyph size={16} /> : <Glyph name="flameFill" size={12} />}
            {d.label === '' ? null : d.label}
          </button>
        );
      })}
    </div>
  );
}
