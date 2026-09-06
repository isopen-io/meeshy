import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';

import { Avatar } from '@/components/avatar';
import { Bulle } from '@/components/bulle';
import { Composeur } from '@/components/composeur';
import { Glyphe } from '@/components/glyphe';
import { CONVERSATIONS, MESSAGES } from '@/lib/api/fixtures';
import type { Message } from '@/lib/api/modele';
import { avecAccent } from '@/lib/accent';
import { libelleDuJour, place } from '@/lib/groupage';
import { LANGUES_DU_LECTEUR } from '@/lib/lecteur';

/**
 * LE FIL.
 *
 * L'en-tete FLOTTE au-dessus des messages (il n'y a aucune barre de navigation
 * systeme dans l'app iOS) et se REPLIE : au repos il ne montre que le retour,
 * la grappe d'actions et l'avatar ; taper l'avatar DEPLIE le titre et les
 * etiquettes. La bande depliee ne porte AUCUNE action — c'est un arbitrage
 * iOS explicite, et il tient : deux etats, deux roles.
 *
 * Le bouton de retour porte le compte de non-lus des AUTRES conversations.
 */
export default function EcranFil() {
  const { conversation: id } = useParams({ from: '/c/$conversation' });
  const conversation = CONVERSATIONS.find((c) => c.id === id) ?? CONVERSATIONS[0]!;
  const [deplie, setDeplie] = useState(false);
  const [messages, setMessages] = useState<readonly Message[]>(MESSAGES);
  const [frappe] = useState(true);

  const autresNonLus = CONVERSATIONS.filter((c) => c.id !== conversation.id).reduce((s, c) => s + c.nonLus, 0);
  const places = place(messages);

  const envoie = (texte: string) => {
    /**
     * OPTIMISTIC UPDATE : le message apparait AVANT le reseau, en etat
     * « en-attente ». C'est non negociable sur la 3G visee — attendre l'accuse
     * du serveur avant de peindre ferait un composeur qui semble ne rien faire
     * pendant deux secondes.
     */
    setMessages((precedents) => [
      ...precedents,
      {
        id: `local-${Date.now()}`,
        auteur: { id: 'u-moi', nom: 'Vous', initiales: 'VO', teinte: 1, presence: 'en-ligne' },
        deMoi: true,
        contenu: texte,
        langueOriginale: 'fr',
        traductions: [],
        envoyeA: new Date().toISOString(),
        etat: 'en-attente',
      },
    ]);
  };

  return (
    /* `h-dvh` + `overflow-hidden`, et NON `min-h-dvh` : c'est ce qui fait la
       difference entre une PAGE (le document entier defile, le composeur suit)
       et une APPLICATION (seule la zone des messages defile, l'en-tete et le
       composeur sont des bords fixes). Avec `min-h-dvh` le composeur recouvrait
       les derniers messages — le defaut le plus visible du premier rendu. */
    <div className="flex h-dvh flex-col overflow-hidden" style={avecAccent(conversation.teinte)}>
      <header
        className="z-10 shrink-0 backdrop-blur-xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-fond) 80%, transparent)' }}
      >
        <div className="flex items-center gap-2 px-4 py-2">
          <Link
            to="/"
            className="relative grid size-11 shrink-0 place-items-center rounded-pastille"
            style={{ color: 'var(--accent)' }}
            aria-label={autresNonLus > 0 ? `Retour — ${autresNonLus} messages non lus ailleurs` : 'Retour'}
          >
            <Glyphe nom="caretLeft" taille={22} />
            {autresNonLus > 0 ? (
              <span
                className="absolute top-0 right-0 grid min-h-4 min-w-4 place-items-center rounded-pastille px-1 text-[9px] font-semibold text-white"
                style={{ backgroundColor: 'var(--color-erreur)' }}
                aria-hidden
              >
                {autresNonLus}
              </span>
            ) : null}
          </Link>

          {deplie ? (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h1 className="truncate text-titre font-bold" style={{ color: 'var(--color-ios-encre)' }}>
                {conversation.titre}
              </h1>
              <p className="flex items-center gap-1 text-mini" style={{ color: 'var(--color-ios-encre-2)' }}>
                <Glyphe nom="lock" taille={9} style={{ color: 'var(--color-succes)' }} />
                {conversation.estGroupe ? `${conversation.participants} participants` : 'Chiffré de bout en bout'}
              </p>
            </div>
          ) : (
            <>
              <span className="flex-1" />
              <button
                type="button"
                className="grid size-11 place-items-center"
                style={{ color: 'var(--accent)' }}
                aria-label="Appeler"
              >
                <span
                  className="grid size-7 place-items-center rounded-pastille"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
                >
                  <Glyphe nom="phone" taille={13} />
                </span>
              </button>
              <button
                type="button"
                className="grid size-11 place-items-center"
                style={{ color: 'var(--accent)' }}
                aria-label="Rechercher dans la conversation"
              >
                <span
                  className="grid size-7 place-items-center rounded-pastille"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
                >
                  <Glyphe nom="magnifyingGlass" taille={13} />
                </span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setDeplie((v) => !v)}
            aria-expanded={deplie}
            aria-label={deplie ? 'Replier l’en-tête' : 'Déplier l’en-tête'}
            className="shrink-0"
          >
            <Avatar
              initiales={conversation.initiales}
              teinte={conversation.teinte}
              taille={44}
              {...(conversation.estGroupe ? {} : { presence: conversation.presence })}
            />
          </button>
        </div>
      </header>

      <main id="contenu" className="flex flex-1 flex-col justify-end overflow-y-auto px-3.5 pt-2 pb-2">
        <ol>
          {places.map((p) => (
            <li key={p.message.id}>
              {p.ouvreLeJour ? (
                <div className="flex justify-center py-1.5">
                  <span
                    className="rounded-pastille px-3 py-1 text-heure font-semibold backdrop-blur-md"
                    style={{
                      color: 'var(--color-jour-encre)',
                      border: '0.5px solid var(--color-jour-filet)',
                      backgroundColor: 'color-mix(in srgb, var(--color-ios-carte) 70%, transparent)',
                    }}
                  >
                    {libelleDuJour(p.message.envoyeA)}
                  </span>
                </div>
              ) : null}
              <Bulle place={p} langues={LANGUES_DU_LECTEUR} estGroupe={conversation.estGroupe} />
            </li>
          ))}
        </ol>

        {frappe ? (
          /* L'indicateur de frappe est une VRAIE cellule du flux, en queue —
             pas un overlay : il pousse le fil comme le ferait un message, donc
             l'arrivee du vrai message ne fait sauter aucune ligne. */
          <div className="flex items-end gap-1.5 py-1">
            <Avatar initiales="AD" teinte={2} taille={18} />
            <span
              className="flex items-center gap-1.5 rounded-pastille px-3 py-2"
              style={{ backgroundColor: 'var(--color-ios-carte)' }}
            >
              <span className="text-heure" style={{ color: 'var(--color-ios-encre-2)' }}>
                Amina écrit
              </span>
              <span className="flex gap-[3px]" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-[5px] rounded-full"
                    style={{
                      backgroundColor: 'var(--accent)',
                      animation: 'pointFrappe 1s ease-in-out infinite',
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
              </span>
            </span>
          </div>
        ) : null}
      </main>

      <div className="shrink-0">
        <Composeur surEnvoi={envoie} />
      </div>
    </div>
  );
}
