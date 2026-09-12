import type { Ref } from 'react';

import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { ComposerLanguagePill } from './composer-language-pill';
import { Glyph, GlyphSvg } from './glyph';
import { EPHEMERAL_DURATIONS, characterCounterOf } from '@/lib/send/compose-protection';
import { SENTIMENT_EMOJI, type SentimentLevel } from '@/lib/send/sentiment';

/**
 * LE LIBELLÉ FRANÇAIS DE CHAQUE NIVEAU — PROSE, jamais l'identifiant anglais
 * de `SentimentLevel` (D-13 : le CODE est en anglais, la PROSE reste en
 * français). iOS annonce « Tonalité du message » comme LABEL et l'EMOJI comme
 * VALEUR (`accessibilityLabel`/`accessibilityValue`,
 * `+Toolbar.swift:58-63`) — HTML n'a pas de second canal pour un `<span>`
 * inerte, donc ce libellé COMBINE les deux dans le nom accessible.
 */
const SENTIMENT_LABEL_FR: Readonly<Record<SentimentLevel, string>> = {
  veryNegative: 'très négative',
  negative: 'négative',
  slightlyNegative: 'légèrement négative',
  neutral: 'neutre',
  slightlyPositive: 'légèrement positive',
  positive: 'positive',
  veryPositive: 'très positive',
};

/**
 * LA RANGÉE HAUTE DU COMPOSEUR (#6175) — miroir `topToolbar`
 * (`UniversalComposerBar+Toolbar.swift:25-81`), EXTRAITE de `composer.tsx`
 * pour tenir le budget de 1000–1200 lignes (CLAUDE.md racine).
 *
 * QUATRE occupants à EFFET (éphémère, flou, effets, langue) + UN indicateur
 * PASSIF (tonalité) + UN compteur CONDITIONNEL — pas six contrôles égaux :
 * la capture de référence (`targets/thread.composer-top-row.{light,dark}.png`)
 * et le code source (`showViewOnce: previewMode`, `maxLength == nil` en
 * conversation) corrigent le libellé initial de l'issue #6175. Voir
 * `docs/product/…/composeur-du-fil.md` § 1.2.
 *
 * ORDRE FIXE, jamais réordonné : éphémère · flou · effets · tonalité ·
 * langue · spacer · compteur — le groupe MENANT d'iOS (`targets/README.md`
 * § 1.4).
 */
export function ComposerTopRow({
  ephemeralSeconds,
  ephemeralPickerOpen,
  onToggleEphemeral,
  onSelectEphemeral,
  blurred,
  onToggleBlur,
  effectCount,
  onOpenEffects,
  sentiment,
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
  /** Choix d'une capsule du sélecteur — `undefined` = « Désactivé ». */
  readonly onSelectEphemeral: (seconds: number | undefined) => void;
  readonly blurred: boolean;
  readonly onToggleBlur: () => void;
  /** Nombre d'effets décoratifs actifs — la capsule affiche ce compte,
   * jamais un booléen (miroir `effectsToggleButton`, `+Toolbar.swift`). */
  readonly effectCount: number;
  readonly onOpenEffects: () => void;
  readonly sentiment: SentimentLevel;
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

  return (
    <>
      {ephemeralPickerOpen ? (
        <div
          data-composer-ephemeral-picker
          className="mx-2 mb-1 flex gap-2 overflow-x-auto rounded-[16px] px-3 py-2"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-error) 8%, var(--color-ios-surface))' }}
        >
          <button
            type="button"
            onClick={() => onSelectEphemeral(undefined)}
            aria-pressed={ephemeralSeconds === undefined}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-title font-semibold"
            style={
              ephemeralSeconds === undefined
                ? { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }
                : { color: 'var(--color-ios-ink-2)' }
            }
          >
            Désactivé
          </button>
          {EPHEMERAL_DURATIONS.map((d) => {
            const active = ephemeralSeconds === d.seconds;
            return (
              <button
                key={d.seconds}
                type="button"
                onClick={() => onSelectEphemeral(d.seconds)}
                aria-pressed={active}
                className="flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-title font-semibold"
                style={
                  active
                    ? { backgroundColor: 'var(--color-error)', color: 'white' }
                    : {
                        backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
                        color: 'var(--color-error)',
                      }
                }
              >
                <Glyph name="flameFill" size={12} />
                {d.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div data-composer-toolbar className="flex items-center justify-start gap-1 px-3 pt-1.5">
        <button
          type="button"
          onClick={onToggleEphemeral}
          aria-pressed={ephemeralSeconds !== undefined}
          data-composer-ephemeral
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-chip px-2"
          style={
            ephemeralSeconds !== undefined
              ? { backgroundColor: 'color-mix(in srgb, var(--color-error) 15%, transparent)', color: 'var(--color-error)' }
              : { color: 'var(--color-ios-ink-2)' }
          }
          aria-label={
            ephemeralSeconds === undefined
              ? 'Activer le mode éphémère'
              : `Mode éphémère actif : ${EPHEMERAL_DURATIONS.find((d) => d.seconds === ephemeralSeconds)?.displayLabel ?? ''}`
          }
        >
          <Glyph name={ephemeralSeconds !== undefined ? 'flameFill' : 'timer'} size={16} />
          {ephemeralSeconds !== undefined ? (
            <span className="text-title font-bold">
              {EPHEMERAL_DURATIONS.find((d) => d.seconds === ephemeralSeconds)?.label}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onToggleBlur}
          aria-pressed={blurred}
          data-composer-blur
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-chip px-2"
          style={
            blurred
              ? { backgroundColor: 'color-mix(in srgb, var(--color-i600) 15%, transparent)', color: 'var(--color-i600)' }
              : { color: 'var(--color-ios-ink-2)' }
          }
          aria-label={blurred ? 'Mode flou actif' : 'Activer le mode flou'}
        >
          <Glyph name="eyeSlash" size={16} />
          {blurred ? <span className="text-title font-bold">Flou</span> : null}
        </button>

        <button
          type="button"
          onClick={onOpenEffects}
          data-composer-effects
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-chip px-2"
          style={
            effectCount > 0
              ? { backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)', color: 'var(--accent)' }
              : { color: 'var(--color-ios-ink-2)' }
          }
          aria-label={effectCount > 0 ? `${effectCount} effet(s) actif(s)` : 'Ajouter des effets au message'}
        >
          <GlyphSvg glyph={THREAD_MENU_GLYPHS.magicWand} size={16} />
          {effectCount > 0 ? <span className="text-title font-bold">{effectCount}</span> : null}
        </button>

        {/* TONALITÉ — LECTURE SEULE (§ 1.1 : « c'était un Button dont
            l'action se limitait à un retour haptique… rendu passif »). */}
        <span
          role="img"
          aria-label={`Tonalité du message : ${SENTIMENT_LABEL_FR[sentiment]}`}
          className="grid size-11 shrink-0 place-items-center text-[17px]"
        >
          {SENTIMENT_EMOJI[sentiment]}
        </span>

        <ComposerLanguagePill code={languageCode} onOpen={onOpenLanguage} {...(languagePillRef ? { buttonRef: languagePillRef } : {})} />

        <span className="flex-1" />

        {counter ? (
          <span
            data-composer-counter
            className="shrink-0 pr-1 font-mono text-[11px] font-semibold"
            style={{ color: counter.overflow ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}
          >
            {counter.text}
          </span>
        ) : null}
      </div>
    </>
  );
}
