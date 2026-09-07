import { useRef, useState } from 'react';

import { Glyphe } from './glyphe';

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

const EMOJIS_RAPIDES = ['👍', '❤️'] as const;

export function Composeur({
  surEnvoi,
  reponseA,
  surAnnulationDeReponse,
}: {
  surEnvoi: (texte: string) => void;
  reponseA?: { auteur: string; extrait: string };
  surAnnulationDeReponse?: () => void;
}) {
  const [texte, setTexte] = useState('');
  const [focalise, setFocalise] = useState(false);
  const champ = useRef<HTMLTextAreaElement>(null);
  const aQuoiEnvoyer = texte.trim().length > 0;

  const envoie = (valeur: string) => {
    const propre = valeur.trim();
    if (!propre) return;
    surEnvoi(propre);
    setTexte('');
    if (champ.current) champ.current.style.height = 'auto';
  };

  return (
    <div className="flex flex-col" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
      {reponseA ? (
        <div
          className="mx-3 mb-1 flex items-center gap-2 rounded-citation px-2.5 py-2"
          style={{ backgroundColor: 'var(--color-ios-carte)' }}
        >
          <span className="w-1 self-stretch rounded-full" style={{ backgroundColor: 'var(--accent)' }} aria-hidden />
          <span className="min-w-0 flex-1 text-titre">
            <span className="font-semibold" style={{ color: 'var(--accent)' }}>
              {reponseA.auteur}{' '}
            </span>
            <span className="truncate" style={{ color: 'var(--color-ios-encre-2)' }}>
              {reponseA.extrait}
            </span>
          </span>
          <button
            type="button"
            onClick={surAnnulationDeReponse}
            className="grid size-11 shrink-0 place-items-center"
            aria-label="Annuler la réponse"
          >
            <Glyphe nom="x" taille={14} style={{ color: 'var(--color-ios-encre-2)' }} />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-3 px-3 py-2.5">
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-pastille transition-transform"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
            color: 'var(--accent)',
          }}
          aria-label="Ajouter une pièce jointe"
        >
          <Glyphe nom="plus" taille={20} />
        </button>

        <div
          className="flex min-w-0 flex-1 items-end transition-all"
          style={{
            minHeight: 44,
            borderRadius: 22,
            backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)',
            border: focalise
              ? '1.5px solid color-mix(in srgb, var(--color-i400) 50%, transparent)'
              : '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
            boxShadow: focalise ? '0 0 8px color-mix(in srgb, var(--color-i400) 20%, transparent)' : 'none',
          }}
        >
          {!focalise && !aQuoiEnvoyer ? (
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center self-end"
              style={{ marginBottom: 4, marginLeft: 4, color: 'var(--color-ios-encre-2)' }}
              aria-label="Enregistrer un message vocal"
            >
              <Glyphe nom="microphone" taille={18} />
            </button>
          ) : null}
          <textarea
            ref={champ}
            rows={1}
            value={texte}
            onFocus={() => setFocalise(true)}
            onBlur={() => setFocalise(false)}
            onInput={(e) => {
              const el = e.currentTarget;
              setTexte(el.value);
              // Croissance jusqu'a cinq lignes, comme iOS (`lineLimit(1...5)`).
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 5 * 22)}px`;
            }}
            onKeyDown={(e) => {
              // La touche Entree ENVOIE (`.submitLabel(.send)`) ; Maj+Entree
              // insere une ligne.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                envoie(texte);
              }
            }}
            placeholder="Message…"
            aria-label="Écrire un message"
            className="min-w-0 flex-1 resize-none bg-transparent py-3 text-saisie leading-[22px] outline-none placeholder:text-ios-encre-3"
            style={{ paddingInlineStart: !focalise && !aQuoiEnvoyer ? 2 : 16, paddingInlineEnd: 16 }}
          />
        </div>

        <div
          className="flex shrink-0 items-center justify-end gap-2 transition-all"
          style={{ width: aQuoiEnvoyer ? 44 : 96, height: 44 }}
        >
          {aQuoiEnvoyer ? (
            <button
              type="button"
              onClick={() => envoie(texte)}
              className="grid size-11 place-items-center rounded-pastille"
              style={{
                background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 65%, white))',
              }}
              aria-label="Envoyer"
            >
              <Glyphe nom="arrowUp" taille={20} className="text-white" />
            </button>
          ) : (
            EMOJIS_RAPIDES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => envoie(emoji)}
                className="grid size-11 place-items-center rounded-pastille text-[22px]"
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
