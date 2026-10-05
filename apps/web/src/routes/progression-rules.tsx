import { ONBOARDING_STEPS } from '@meeshy/shared/utils/game/guide';

import { Glyph } from '@/components/glyph';
import { GameBird } from '@/components/game';
import { GlassBack } from '@/components/glass-surface';
import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2 } from '@/components/game-surface';
import { guideBirds } from '@/lib/game-guide/card';
import { GAME_RULES, stepCopy } from '@/lib/view/game-guide-copy';
import { Link } from '@/routes/route-table';

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
          Étape {step.index} sur {ONBOARDING_STEPS.length}
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

export function RulesBody() {
  return (
    <div className="flex flex-col gap-5 px-4 py-3">
      <section className="flex items-end gap-2 px-1">
        <GameBird bird="meeGuide" size={88} />
        <p className="flex-1 pb-2 text-body" style={{ color: GAME_INK }}>
          Huit règles, et tout le jeu tient dedans. Meo les explique, Mee te montre le geste.
        </p>
        <GameBird bird="meoGuide" size={88} flip />
      </section>

      <section aria-labelledby="regles-titre" className="flex flex-col gap-2">
        <h2 id="regles-titre" className="text-title font-bold" style={{ color: GAME_INK }}>
          Les règles en une page
        </h2>
        <ol className="flex flex-col gap-2">
          {GAME_RULES.map((rule) => (
            <li key={rule.index} className="flex items-start gap-3 rounded-card px-3 py-3" style={{ backgroundColor: GAME_CARD }}>
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

      <section aria-labelledby="etapes-titre" className="flex flex-col gap-2">
        <h2 id="etapes-titre" className="text-title font-bold" style={{ color: GAME_INK }}>
          Les sept étapes
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
  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="glass z-10 shrink-0">
        <div className="flex items-center gap-2 px-4 py-2">
          <Link to="progression" className="grid size-11 shrink-0 place-items-center" style={{ color: GAME_BRAND }} aria-label="Retour à la progression">
            <GlassBack label="Retour à la progression">
              <Glyph name="caretLeft" size={22} className="rtl:-scale-x-100" />
            </GlassBack>
          </Link>
          <h1 className="flex-1 truncate text-title font-bold" style={{ color: GAME_INK }}>
            Comment ça marche
          </h1>
        </div>
      </header>
      <main id="contenu" className="flex-1 overflow-y-auto pb-safe">
        <RulesBody />
      </main>
    </div>
  );
}
