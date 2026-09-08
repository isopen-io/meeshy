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
  readonly run: () => Promise<string | null> | string | null;
};

type QuickActionsProps = {
  readonly title: string;
  readonly subtitle: string;
  readonly actions: readonly QuickAction[];
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
export function QuickActions({ title, subtitle, actions }: QuickActionsProps) {
  const [retour, setRetour] = useState<string | null>(null);

  if (actions.length === 0) return null;

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

      {actions.map((action) => (
        <div key={action.key} className="grid gap-1">
          <button
            type="button"
            onClick={() => {
              setRetour(null);
              void Promise.resolve(action.run()).then(setRetour);
            }}
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
          <p className="px-1 text-footnote" style={{ color: 'var(--color-ios-ink-3)' }}>
            {action.hint}
          </p>
        </div>
      ))}

      {/* Le retour d'un geste INVISIBLE — annoncé au lecteur d'écran, pas
          seulement peint : `aria-live` porte autant que le pixel. */}
      <p
        role="status"
        aria-live="polite"
        className="px-1 text-footnote"
        style={{ color: 'var(--color-ios-ink-2)', minHeight: 18 }}
      >
        {retour ?? ''}
      </p>
    </section>
  );
}
