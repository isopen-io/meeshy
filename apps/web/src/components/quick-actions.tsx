import { useState } from 'react';

import { Glyph } from './glyph';
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
  readonly hint: string;
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
  readonly title: string;
  readonly subtitle: string;
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
 * Rien à proposer ⇒ **rien ne se peint**, titre et sous-titre compris.
 *
 * Un en-tête « Et maintenant ? » suivi du vide est exactement la promesse non
 * tenue qu'on cherche à éliminer : il annonce des issues et n'en montre
 * aucune. C'est le défaut que portait l'état vide de la liste, qui récitait
 * « Un message, une story, un mood, un post — ou invitez vos amis » sous
 * ZÉRO bouton. Le bloc entier est donc conditionné à l'existence d'une porte.
 */
export function QuickActions({ title, subtitle, actions, conversationCount }: QuickActionsProps) {
  const [retour, setRetour] = useState<string | null>(null);

  if (actions.length === 0) return null;

  // Tant qu'on DÉMARRE, les héros sortent de la grille ; passé le seuil, tout
  // le monde redevient une tuile — exactement `Action.tiles(showsHeroes:)`.
  const enDemarrage = showsHeroes(conversationCount);
  const heros = enDemarrage ? actions.filter((a) => a.hero) : [];
  const tuiles = enDemarrage ? actions.filter((a) => !a.hero) : actions;

  const lancer = (action: QuickAction) => {
    setRetour(null);
    void Promise.resolve(action.run()).then(setRetour);
  };

  return (
    <section aria-label={title} className="grid gap-3 px-2 pt-6">
      <div className="grid gap-1">
        <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {title}
        </p>
        <p className="text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
          {subtitle}
        </p>
      </div>

      {heros.map((action) => (
        <div key={action.key} className="grid gap-1">
          <button
            type="button"
            onClick={() => lancer(action)}
            aria-describedby={`${action.key}-indice`}
            className="flex w-full items-center gap-3 rounded-hero px-4 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 52,
              background: 'linear-gradient(135deg, var(--color-ios-brand), var(--color-ios-brand-deep))',
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            <Glyph name={action.glyph} size={22} />
            <span className="flex-1 text-left">{action.label}</span>
          </button>
          <p id={`${action.key}-indice`} className="px-1 text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
            {action.hint}
          </p>
        </div>
      ))}

      {tuiles.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2">
          {tuiles.map((action) => (
            <li key={action.key}>
              <button
                type="button"
                onClick={() => lancer(action)}
                title={action.hint}
                className="grid w-full place-items-center gap-1.5 rounded-hero px-1 py-3 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  minHeight: 88,
                  backgroundColor: 'var(--color-ios-card)',
                  border: '1px solid var(--color-edge)',
                  outlineColor: 'var(--color-ios-brand)',
                }}
              >
                <span
                  className="grid size-11 place-items-center rounded-chip text-white"
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
      ) : null}

      {/* Le retour d'un geste INVISIBLE — annoncé au lecteur d'écran, pas
          seulement peint : `aria-live` porte autant que le pixel. */}
      <p
        role="status"
        aria-live="polite"
        className="px-1 text-mini"
        style={{ color: 'var(--color-ios-ink-2)', minHeight: 18 }}
      >
        {retour ?? ''}
      </p>
    </section>
  );
}
