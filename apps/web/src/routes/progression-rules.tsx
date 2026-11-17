import { useEffect, useRef, useState } from 'react';

import { ONBOARDING_STEPS } from '@meeshy/shared/utils/game/guide';

import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { GameBird } from '@/components/game';
import { GameFold, useOneOpen } from '@/components/game-fold';
import { PRESS } from '@/components/game-press';
import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2 } from '@/components/game-surface';
import { guideBirds } from '@/lib/game-guide/card';
import { formatCount, gameText } from '@/lib/view/game-copy';
import { stepCopy } from '@/lib/view/game-guide-copy';
import { gameRules, RULES_GLOSSARY, rulesGlossary } from '@/lib/view/game-rules-copy';
import { useOptionalRoute } from '@/lib/router';
import { ProgressionShell } from '@/routes/progression-shell';
import { RulesAtlas } from '@/routes/progression-rules-atlas';
import { RulesBadges } from '@/routes/progression-rules-badges';
import { RULES_SECTIONS, rulesSectionValue, rulesTarget, type RulesSection, type RulesTarget } from '@/lib/game/rules-address';

/**
 * « COMMENT ÇA MARCHE » (#9379) — le carnet des règles. Le texte que Mee et Meo
 * disent à l'intégration (conception, partie I : « les règles en une page ») et
 * que le joueur retrouve ici quand il veut, avec les sept cartes de
 * l'intégration en entier : chacune peut se passer, le carnet les garde toutes.
 * Sous les huit règles, « Chaque concept, en clair » (#10540) : aucun concept que
 * Progression affiche n'est absent du carnet.
 *
 * Épure (#17584, #18148) : le carnet ne se déroule plus d'un bloc. Les seize concepts,
 * les neuf familles dessinées, la section des médailles et les sept cartes sont des
 * rangées repliées, un seul concept (ou une seule famille) ouvert à la fois ; la section
 * des médailles s'ouvre par `?section=badges` (« Comprendre les médailles »). Replié, le
 * texte reste dans le document : rien n'est retiré, tout reste atteignable.
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

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const anchorSelector = (target: RulesTarget): string => {
  if (target.kind === 'section') return `[data-rules-section="${target.section}"]`;
  return target.kind === 'rule' ? `[id="regle-${target.index}"]` : `[data-rules-concept="${target.key}"]`;
};

const isTarget = (aim: RulesTarget | undefined, target: RulesTarget): boolean => aim !== undefined && rulesSectionValue(aim) === rulesSectionValue(target);

type Aim = { readonly target: RulesTarget; readonly tick: number; readonly focus: boolean };

const askedTarget = (focus: RulesTarget | undefined, rule: number | undefined, badges: boolean): RulesTarget | undefined => {
  if (focus !== undefined) return focus;
  if (rule !== undefined) return { kind: 'rule', index: rule };
  return badges ? { kind: 'section', section: 'badges' } : undefined;
};

/**
 * LE SOMMAIRE (#18423) — le carnet se parcourt : cinq entrées, dans l'ordre de la
 * page. Toucher une entrée pose sa section à l'écran, ouverte si elle était
 * repliée, et y porte le focus. Les entrées passent à la ligne : rien ne glisse de côté.
 */
function RulesToc({ onGo }: { readonly onGo: (section: RulesSection) => void }) {
  return (
    <nav data-rules-toc="" aria-label={gameText('game.rules.toc.label')} className="flex flex-wrap gap-2">
      {RULES_SECTIONS.map((section) => (
        <button
          key={section}
          type="button"
          data-rules-toc-entry={section}
          onClick={() => onGo(section)}
          className={`${PRESS} rounded-chip px-3 text-body font-semibold`}
          style={{ minHeight: 44, backgroundColor: GAME_CARD, color: GAME_BRAND }}
        >
          {gameText(`game.rules.toc.${section}`)}
        </button>
      ))}
    </nav>
  );
}

/**
 * `focus` est ce qu'une vue du Jeu désigne dans le carnet (`?section=`) : une
 * section, une règle ou un concept. La cible s'ouvre si elle était repliée, se
 * distingue d'un liseré de la marque et vient se poser à l'écran. Le liseré
 * n'anime que l'ombre ; le défilement est instantané quand l'utilisateur limite
 * les animations. `target` et `badges` sont les deux entrées d'avant, gardées.
 */
export function RulesBody({ target, badges = false, focus }: { readonly target?: number; readonly badges?: boolean; readonly focus?: RulesTarget }) {
  const asked = askedTarget(focus, target, badges);
  const askedValue = asked === undefined ? null : rulesSectionValue(asked);
  const root = useRef<HTMLDivElement>(null);
  const concepts = useOneOpen(asked?.kind === 'concept' ? asked.key : null);
  const [badgesOpen, setBadgesOpen] = useState(asked !== undefined && isTarget(asked, { kind: 'section', section: 'badges' }));
  const [stepsOpen, setStepsOpen] = useState(asked !== undefined && isTarget(asked, { kind: 'section', section: 'etapes' }));
  const [aim, setAim] = useState<Aim | undefined>(asked === undefined ? undefined : { target: asked, tick: 0, focus: false });

  const reveal = (next: RulesTarget): void => {
    if (next.kind === 'concept') concepts.open(next.key);
    if (isTarget(next, { kind: 'section', section: 'badges' })) setBadgesOpen(true);
    if (isTarget(next, { kind: 'section', section: 'etapes' })) setStepsOpen(true);
  };
  const go = (next: RulesTarget, moveFocus: boolean): void => {
    reveal(next);
    setAim((current) => ({ target: next, tick: (current?.tick ?? 0) + 1, focus: moveFocus }));
  };

  useEffect(() => {
    if (asked === undefined) return;
    go(asked, false);
    /* La cible ne change qu'avec sa valeur : l'objet, lui, est neuf à chaque rendu. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askedValue]);

  useEffect(() => {
    if (aim === undefined || aim.tick === 0) return;
    const anchor = root.current?.querySelector<HTMLElement>(anchorSelector(aim.target));
    if (anchor === null || anchor === undefined) return;
    anchor.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: aim.target.kind === 'rule' ? 'center' : 'start' });
    if (aim.focus) anchor.querySelector<HTMLElement>('h2 > button[aria-expanded], h2[tabindex]')?.focus({ preventScroll: true });
  }, [aim]);

  const ruleAim = aim?.target.kind === 'rule' ? aim.target.index : undefined;
  const conceptAim = aim?.target.kind === 'concept' ? aim.target.key : undefined;

  return (
    <div ref={root} className="flex flex-col gap-5 px-4 py-3">
      <section className="flex items-end gap-2 px-1">
        <GameBird bird="meeGuide" size={88} />
        <p className="flex-1 pb-2 text-body" style={{ color: GAME_INK }}>
          {gameText('game.rules.intro')}
        </p>
        <GameBird bird="meoGuide" size={88} flip />
      </section>

      <RulesToc onGo={(section) => go({ kind: 'section', section }, true)} />

      <section data-rules-section="regles" aria-labelledby="regles-titre" className="flex scroll-mt-20 flex-col gap-2">
        <h2 id="regles-titre" tabIndex={-1} className="text-title font-bold" style={{ color: GAME_INK }}>
          {gameText('game.rules.section_rules')}
        </h2>
        <ol className="flex flex-col gap-2">
          {gameRules().map((rule) => (
            <li
              key={rule.index}
              id={`regle-${rule.index}`}
              {...(rule.index === ruleAim ? { 'data-game-rule-target': '' } : {})}
              className="flex items-start gap-3 rounded-card px-3 py-3"
              style={{ backgroundColor: GAME_CARD, ...(rule.index === ruleAim ? { boxShadow: `0 0 0 2px ${GAME_BRAND}` } : {}) }}
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

      <section data-rules-section="concepts" aria-labelledby="concepts-titre" className="flex scroll-mt-20 flex-col gap-2">
        <h2 id="concepts-titre" tabIndex={-1} className="text-title font-bold" style={{ color: GAME_INK }}>
          {gameText('game.rules.section_concepts')}
        </h2>
        <ul className="flex flex-col gap-2">
          {rulesGlossary().map((entry) => (
            <li
              key={entry.key}
              data-rules-concept={entry.key}
              {...(entry.key === conceptAim ? { 'data-rules-target': '' } : {})}
              className="scroll-mt-20 rounded-card px-3"
              style={{ backgroundColor: GAME_CARD, ...(entry.key === conceptAim ? { boxShadow: `0 0 0 2px ${GAME_BRAND}` } : {}) }}
            >
              <GameFold id={`concept-${entry.key}`} open={concepts.isOpen(entry.key)} onToggle={() => concepts.toggle(entry.key)} title={entry.name}>
                <p className="text-body" style={{ color: GAME_INK_2 }}>
                  {entry.body}
                </p>
              </GameFold>
            </li>
          ))}
        </ul>
      </section>

      <RulesBadges open={badgesOpen} onToggle={() => setBadgesOpen((open) => !open)} />

      <RulesAtlas />

      <section data-rules-section="etapes" aria-labelledby="etapes-titre" className="scroll-mt-20 rounded-card px-3" style={{ backgroundColor: GAME_CARD }}>
        <GameFold id="etapes" level={2} headingId="etapes-titre" open={stepsOpen} onToggle={() => setStepsOpen((open) => !open)} title={gameText('game.rules.steps_fold')}>
          <ol className="flex flex-col gap-2">
            {ONBOARDING_STEPS.map((step) => (
              <StepCard key={step.key} step={step} />
            ))}
          </ol>
        </GameFold>
      </section>
    </div>
  );
}

export default function ProgressionRulesScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'rules');
  const search = useOptionalRoute()?.search;
  const focus = rulesTarget({ section: search?.get('section') ?? null, regle: search?.get('regle') ?? null }, RULES_GLOSSARY);
  return (
    <ProgressionShell title={gameText('game.rules.page_title')}>
      <RulesBody {...(focus === undefined ? {} : { focus })} />
    </ProgressionShell>
  );
}
