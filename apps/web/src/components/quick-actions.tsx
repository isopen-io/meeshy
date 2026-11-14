import { useId, useState } from 'react';

import { Glyph } from './glyph';
import { InfoHintButton, InfoHintText, useInfoHint } from './info-hint';
import { SETTINGS_GLYPHS } from './glyphs-settings';
import type { GlyphName } from './glyphs';

/**
 * **Un accès rapide PORTE sa porte — le type l'exige.**
 *
 * iOS peint neuf accès rapides en queue de liste et dans l'état vide
 * (`ConversationListQuickActions`), et son relais `onAction` a une valeur par
 * défaut vide : un hôte qui l'oublie peint neuf boutons muets sans que rien ne
 * rougisse. La v3.1 ne rejoue pas cette forme — `run` n'est PAS optionnel,
 * donc une action sans effet ne se construit pas, donc elle ne peut pas se
 * peindre. C'est la leçon de la revue #5559 — qui avait dû RETIRER deux
 * boutons de l'en-tête faute de porte — portée du correctif au type.
 *
 * `run` rend le message à ANNONCER, ou `null` quand il n'y a rien à dire. Un
 * geste dont l'effet est invisible (copier un lien) a besoin de son retour :
 * sans lui, on ne distingue pas « c'est fait » de « rien ne s'est passé » —
 * la même impasse qu'un bouton inerte, une couche plus loin.
 */
export type QuickAction = {
  readonly key: string;
  readonly label: string;
  /** L'explication, derrière un (i) : lue repliée, ouverte au toucher (épure #18361, règle 1). */
  readonly hint: string;
  /**
   * Le nom accessible du (i) : la QUESTION à laquelle `hint` répond. Seule l'action NOMINALE en porte un ; une porte
   * rangée derrière « Plus » garde son indice en `title`, sans (i) (règle « un (i) n'est pas un dépotoir »).
   */
  readonly hintQuestion?: string;
  readonly glyph: GlyphName;
  /**
   * HÉROS au démarrage — miroir de `ConversationListQuickActions.Action.heroes`
   * (iOS : chercher des membres, ses contacts, ses affiliations). Un héros est
   * un gros bouton pleine largeur tant qu'on démarre, et redevient une tuile
   * ordinaire passé le seuil. Les autres sont des tuiles à tout moment.
   */
  readonly hero?: boolean;
  readonly run: () => Promise<string | null> | string | null;
};

/**
 * **Combien de temps l'app aide-t-elle à DÉMARRER ?** — directive porteur du
 * 2026-09-01, portée d'iOS mot pour mot :
 *
 * > « Les trois lignes ci-dessus de cet empty state doivent toujours s'afficher
 * > tant qu'on n'a pas plus de 10 conversations dans sa liste ! »
 *
 * Ce n'est pas le VIDE qui appelle de l'aide, c'est le DÉMARRAGE : une liste
 * d'une seule conversation en a autant besoin qu'une liste de zéro. Le seuil
 * est INCLUSIF — dix conversations gardent les héros, la onzième les range.
 *
 * Miroir de `ConversationListQuickActions.heroThreshold` / `showsHeroes(_:)`.
 */
export const HERO_THRESHOLD = 10;

export const showsHeroes = (conversationCount: number): boolean => conversationCount <= HERO_THRESHOLD;

type QuickActionsProps = {
  /** Le libellé de « Plus » — là où se rangent les portes qui ne sont pas l'action nominale. */
  readonly moreLabel: string;
  readonly actions: readonly QuickAction[];
  /**
   * Le compte BRUT de conversations, jamais le compte AFFICHÉ.
   *
   * iOS le grave dans son doc-comment, et pour une raison qui se vérifie :
   * « Combien de conversations ai-je ? » ne dépend pas du filtre en cours —
   * sinon activer « Non lus » ferait réapparaître les boutons de démarrage à
   * quelqu'un qui en a deux cents.
   */
  readonly conversationCount: number;
};

/**
 * **UNE ACTION NOMINALE, LE RESTE DERRIÈRE « PLUS »** (épure #18361, règles 2, 4 et 6) — plus de titre ni de sous-titre
 * (« Et maintenant ? » redisait ce que l'action dit déjà), l'explication de l'action est derrière un (i), et les portes
 * ordinaires (story, humeur) se rangent derrière « Plus » : elles restent atteignables, d'un toucher de plus.
 *
 * Tant qu'on DÉMARRE (≤ `HERO_THRESHOLD`), l'action nominale est le gros bouton plein ; passé le seuil, la même action
 * reste là, plus discrète. Rien à proposer ⇒ **rien ne se peint** : un bloc annonçant des issues sans en montrer
 * aucune est la promesse non tenue que cette page a déjà dû corriger.
 */
export function QuickActions({ moreLabel, actions, conversationCount }: QuickActionsProps) {
  const [retour, setRetour] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const moreId = useId();

  if (actions.length === 0) return null;

  const enDemarrage = showsHeroes(conversationCount);
  const principales = actions.filter((a) => a.hero);
  const rangees = actions.filter((a) => !a.hero);

  const lancer = (action: QuickAction) => {
    setRetour(null);
    void Promise.resolve(action.run()).then(setRetour);
  };

  return (
    <section className="grid gap-3 px-2 pt-6">
      {principales.map((action) => (
        <PrimaryAction key={action.key} action={action} quiet={!enDemarrage} onRun={lancer} />
      ))}

      {rangees.length === 0 ? null : (
        <div className="grid justify-items-center gap-2">
          <button
            type="button"
            onClick={() => setOpened((v) => !v)}
            aria-expanded={opened}
            aria-controls={moreId}
            className="min-h-11 rounded-chip px-4 text-title font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {moreLabel}
          </button>
          <ul id={moreId} hidden={!opened} className="grid w-full grid-cols-3 gap-2">
              {rangees.map((action) => (
                <li key={action.key}>
                  <button
                    type="button"
                    onClick={() => lancer(action)}
                    title={action.hint}
                    className="grid w-full place-items-center gap-1.5 rounded-hero px-1 py-3 focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ minHeight: 88, backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)', outlineColor: 'var(--color-ios-brand)' }}
                  >
                    <span
                      className="grid size-11 place-items-center rounded-chip text-ios-on-brand"
                      style={{ background: 'linear-gradient(135deg, var(--color-ios-brand), var(--color-ios-brand-deep))' }}
                    >
                      <Glyph name={action.glyph} size={20} />
                    </span>
                    <span className="text-mini" style={{ color: 'var(--color-ios-ink)' }}>
                      {action.label}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Le retour d'un geste INVISIBLE — annoncé au lecteur d'écran, pas
          seulement peint : `aria-live` porte autant que le pixel. */}
      <p role="status" aria-live="polite" className="px-1 text-mini" style={{ color: 'var(--color-ios-ink-2)', minHeight: 18 }}>
        {retour ?? ''}
      </p>
    </section>
  );
}

function PrimaryAction({ action, quiet, onRun }: { readonly action: QuickAction; readonly quiet: boolean; readonly onRun: (action: QuickAction) => void }) {
  const state = useInfoHint();
  const hint = action.hintQuestion === undefined ? null : { text: action.hint, label: action.hintQuestion, glyph: SETTINGS_GLYPHS.info };
  return (
    <div className="relative grid gap-1" data-quick-action-primary={quiet ? 'quiet' : 'hero'}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onRun(action)}
          className="flex w-full min-w-0 flex-1 items-center gap-3 rounded-hero px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={
            quiet
              ? { minHeight: 44, color: 'var(--color-ios-brand)', border: '1px solid var(--color-edge)', outlineColor: 'var(--color-ios-brand)' }
              : {
                  minHeight: 52,
                  color: 'var(--color-ios-on-brand)',
                  background: 'linear-gradient(135deg, var(--color-ios-brand), var(--color-ios-brand-deep))',
                  outlineColor: 'var(--color-ios-brand)',
                }
          }
        >
          <Glyph name={action.glyph} size={22} />
          <span className="flex-1 text-start">{action.label}</span>
        </button>
        {hint === null ? null : <InfoHintButton hint={hint} state={state} />}
      </div>
      {hint === null ? null : <InfoHintText hint={hint} state={state} className="px-1" />}
    </div>
  );
}
