import { useRef, useState } from 'react';

import { Glyph } from './glyph';

/**
 * LE COMPOSEUR.
 *
 * Trois partis d'iOS qu'on ne devine pas :
 *
 * 1. Le MICRO est DANS le champ, a gauche, et DISPARAIT des que le champ prend
 *    le focus. Il ne prend donc aucune place au moment ou l'on ecrit, et reste
 *    a portee immediate quand on hesite.
 * 2. Le bouton d'envoi est INVISIBLE quand il n'y a rien a envoyer
 *    (`opacity: 0`), jamais grise — et sa place est occupee par DEUX emojis
 *    d'envoi rapide. L'emplacement passe donc de 44 a 96 px de large. Griser
 *    un bouton, c'est montrer une porte fermee ; iOS montre une autre porte.
 * 3. Le fond du composeur est TRANSPARENT (aucun materiau, decision #3920) :
 *    ce sont les bandeaux et le champ qui portent leur propre fond.
 */

const QUICK_EMOJIS = ['👍', '❤️'] as const;

export function Composer({
  onSend,
  replyTo,
  onCancelReply,
}: {
  onSend: (text: string) => void;
  /**
   * LA CITATION PRÉ-ADRESSÉE — `language` est la LANGUE DANS LAQUELLE
   * `excerpt` EST SERVI (`served().language`, jamais la langue d'origine du
   * message). Sans elle, un extrait résolu par le Prisme se prononcerait avec
   * la voix du DOCUMENT : le défaut du cycle 122 du `CLAUDE.md` — un résolveur
   * qui élit le bon texte n'a corrigé personne tant que ce qu'il élit n'est
   * pas ANNONCÉ à qui l'affiche. `bubble.tsx:180` et `focal-row.tsx:263`
   * posent déjà `lang={rendered.language}` pour la même raison.
   */
  replyTo?: { author: string; excerpt: string; language?: string };
  onCancelReply?: () => void;
}) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const sendTarget = text.trim().length > 0;

  const send = (value: string) => {
    const own = value.trim();
    if (!own) return;
    onSend(own);
    setText('');
    if (field.current) {
      field.current.style.height = 'auto';
      /* LE CHAMP GARDE LE FOCUS APRÈS UN ENVOI AU DOIGT (revue-correction
         #5813, défaut majeur 8) — le geste NOMINAL sur téléphone. Sans ce
         rappel, le `<button>` d'envoi prenait le focus (la touche Entrée,
         elle, ne le perd jamais : le champ reste la cible de l'événement),
         le clavier se refermait, le micro se remontait et le champ
         RÉTRÉCISSAIT sous le doigt — trois phrases de suite coûtaient trois
         taps de plus et trois sauts de mise en page. iOS tient le champ par
         `@FocusState isTyping` (`ConversationView.swift:314`), qu'aucun
         envoi ne remet à `false`. */
      field.current.focus();
    }
  };

  return (
    <div className="flex flex-col pb-safe">
      {replyTo ? (
        <div
          data-composer-reply
          className="mx-3 mb-1 flex items-center gap-2 rounded-quote px-2.5 py-2"
          style={{ backgroundColor: 'var(--color-ios-card)' }}
        >
          <span className="w-1 self-stretch rounded-full" style={{ backgroundColor: 'var(--accent)' }} aria-hidden />
          <span className="min-w-0 flex-1 text-title">
            <span className="font-semibold" style={{ color: 'var(--accent)' }}>
              {replyTo.author}{' '}
            </span>
            <span
              className="truncate"
              style={{ color: 'var(--color-ios-ink-2)' }}
              {...(replyTo.language ? { lang: replyTo.language } : {})}
            >
              {replyTo.excerpt}
            </span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="grid size-11 shrink-0 place-items-center"
            aria-label="Annuler la réponse"
          >
            <Glyph name="x" size={14} style={{ color: 'var(--color-ios-ink-2)' }} />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-3 px-3 py-2.5">
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-chip transition-transform"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
            color: 'var(--accent)',
          }}
          aria-label="Ajouter une pièce jointe"
        >
          <Glyph name="plus" size={20} />
        </button>

        <div
          className="flex min-w-0 flex-1 items-end transition-all"
          style={{
            minHeight: 44,
            borderRadius: 22,
            backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)',
            border: focused
              ? '1.5px solid color-mix(in srgb, var(--color-i400) 50%, transparent)'
              : '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
            boxShadow: focused ? '0 0 8px color-mix(in srgb, var(--color-i400) 20%, transparent)' : 'none',
          }}
        >
          {!focused && !sendTarget ? (
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center self-end"
              style={{ marginBottom: 4, marginLeft: 4, color: 'var(--color-ios-ink-2)' }}
              aria-label="Enregistrer un message vocal"
            >
              <Glyph name="microphone" size={18} />
            </button>
          ) : null}
          <textarea
            ref={field}
            rows={1}
            value={text}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onInput={(e) => {
              const el = e.currentTarget;
              setText(el.value);
              // Croissance jusqu'a cinq lignes, comme iOS (`lineLimit(1...5)`).
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 5 * 22)}px`;
            }}
            onKeyDown={(e) => {
              // La touche Entree ENVOIE (`.submitLabel(.send)`) ; Maj+Entree
              // insere une ligne.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder="Message…"
            aria-label="Écrire un message"
            className="min-w-0 flex-1 resize-none bg-transparent py-3 text-input leading-[22px] outline-none placeholder:text-ios-ink-3"
            style={{ paddingInlineStart: !focused && !sendTarget ? 2 : 16, paddingInlineEnd: 16 }}
          />
        </div>

        <div
          className="flex shrink-0 items-center justify-end gap-2 transition-all"
          style={{ width: sendTarget ? 44 : 96, height: 44 }}
        >
          {sendTarget ? (
            <button
              type="button"
              /* `preventDefault` sur l'appui EMPÊCHE le bouton de voler le
                 focus au moment même du tap (revue-correction #5813, défaut
                 majeur 8) — sans lui, le champ perdait le focus une image
                 avant que `send()` ne le lui rende, et cette image suffit à
                 voir le micro remonter et le champ rétrécir. */
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => send(text)}
              className="grid size-11 place-items-center rounded-chip"
              style={{
                background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 65%, white))',
              }}
              aria-label="Envoyer"
            >
              <Glyph name="arrowUp" size={20} className="text-white" />
            </button>
          ) : (
            QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => send(emoji)}
                className="grid size-11 place-items-center rounded-chip text-[22px]"
                style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
                aria-label={`Envoyer ${emoji}`}
              >
                <span aria-hidden>{emoji}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
