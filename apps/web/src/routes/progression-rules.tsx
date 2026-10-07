import { useEffect } from 'react';

import { ONBOARDING_STEPS } from '@meeshy/shared/utils/game/guide';

import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { GameBird } from '@/components/game';
import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2 } from '@/components/game-surface';
import { guideBirds } from '@/lib/game-guide/card';
import { formatCount, gameText } from '@/lib/view/game-copy';
import { stepCopy } from '@/lib/view/game-guide-copy';
import { gameRules } from '@/lib/view/game-rules-copy';
import { useOptionalRoute } from '@/lib/router';
import { ProgressionShell } from '@/routes/progression-shell';
import { RulesAtlas } from '@/routes/progression-rules-atlas';

/**
 * « COMMENT ÇA MARCHE » (#9379) — le carnet des règles. Le texte que Mee et Meo
 * disent à l'intégration (conception, partie I : « les règles en une page ») et
 * que le joueur retrouve ici quand il veut, avec les sept cartes de
 * l'intégration en entier : chacune peut se passer, le carnet les garde toutes.
 *
 * Une page qui EXPLIQUE, sans geste : aucun bouton n'y agit, rien n'y est
 * promis qui ne soit dit ailleurs. Pas de lecture réseau : elle s'ouvre
 * instantanément, hors ligne comme en ligne.
 */

function StepCard({ step }: { readonly step: (typeof ONBOARDING_STEPS)[number] }) {
  const copy = stepCopy(step);
  const birds = guideBirds(step.speaker, step.mood);
  return (
    <li className="flex items-start gap-3 rounded-card px-3 py-3" style={{ backgroundColor: GAME_CARD }}>
      <div className="flex shrink-0 items-end">
        {birds.mee === undefined ? null : <GameBird bird={birds.mee} size={step.speaker === 'duo' ? 40 : 52} />}
        {birds.meo === undefined ? null : <GameBird bird={birds.meo} size={step.speaker === 'duo' ? 40 : 52} flip />}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
          {gameText('game.guide.step_of', { index: formatCount(step.index), total: formatCount(ONBOARDING_STEPS.length) })}
        </p>
        <p className="text-body font-bold" style={{ color: GAME_INK }}>
          {copy.what}
        </p>
        <p className="text-body" style={{ color: GAME_INK }}>
          {copy.means}
        </p>
        <p className="text-body font-semibold" style={{ color: GAME_INK }}>
          {copy.next}
        </p>
      </div>
    </li>
  );
}

const RULES_COUNT = 8;

/** La règle que l'adresse désigne (`?regle=1`) : un entier de 1 à 8, sinon aucune. */
export function ruleTarget(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const index = Number(value);
  return index >= 1 && index <= RULES_COUNT ? index : undefined;
}

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * `target` est la règle qu'une puce du héros désigne : elle se distingue d'un
 * liseré de la marque et vient se poser à l'écran. Le liseré n'anime que
 * l'ombre ; le défilement est instantané quand l'utilisateur limite les
 * animations.
 */
export function RulesBody({ target }: { readonly target?: number }) {
  useEffect(() => {
    if (target === undefined) return;
    document.getElementById(`regle-${target}`)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
  }, [target]);

  return (
    <div className="flex flex-col gap-5 px-4 py-3">
      <section className="flex items-end gap-2 px-1">
        <GameBird bird="meeGuide" size={88} />
        <p className="flex-1 pb-2 text-body" style={{ color: GAME_INK }}>
          {gameText('game.rules.intro')}
        </p>
        <GameBird bird="meoGuide" size={88} flip />
      </section>

      <section aria-labelledby="regles-titre" className="flex flex-col gap-2">
        <h2 id="regles-titre" className="text-title font-bold" style={{ color: GAME_INK }}>
          {gameText('game.rules.section_rules')}
        </h2>
        <ol className="flex flex-col gap-2">
          {gameRules().map((rule) => (
            <li
              key={rule.index}
              id={`regle-${rule.index}`}
              {...(rule.index === target ? { 'data-game-rule-target': '' } : {})}
              className="flex items-start gap-3 rounded-card px-3 py-3"
              style={{ backgroundColor: GAME_CARD, ...(rule.index === target ? { boxShadow: `0 0 0 2px ${GAME_BRAND}` } : {}) }}
            >
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-chip text-body font-bold"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 16%, transparent)', color: GAME_BRAND }}
              >
                {rule.index}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-body font-bold" style={{ color: GAME_INK }}>
                  {rule.title}
                </p>
                <p className="text-body" style={{ color: GAME_INK_2 }}>
                  {rule.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <RulesAtlas />

      <section aria-labelledby="etapes-titre" className="flex flex-col gap-2">
        <h2 id="etapes-titre" className="text-title font-bold" style={{ color: GAME_INK }}>
          {gameText('game.rules.section_steps')}
        </h2>
        <ol className="flex flex-col gap-2">
          {ONBOARDING_STEPS.map((step) => (
            <StepCard key={step.key} step={step} />
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function ProgressionRulesScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'rules');
  const target = ruleTarget(useOptionalRoute()?.search.get('regle') ?? null);
  return (
    <ProgressionShell title={gameText('game.rules.page_title')} back={{ to: 'progression', label: gameText('game.page.back') }}>
      <RulesBody {...(target === undefined ? {} : { target })} />
    </ProgressionShell>
  );
}
