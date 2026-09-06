import { useState } from 'react';

import { Avatar } from '@/components/avatar';
import { Glyphe } from '@/components/glyphe';
import { LigneDeConversation } from '@/components/ligne-conversation';
import { CONVERSATIONS } from '@/lib/api/fixtures';
import { LANGUES_DU_LECTEUR } from '@/lib/lecteur';

/**
 * L'ECRAN DE LISTE.
 *
 * Anatomie reprise d'iOS (`ConversationListView`) : un en-tete FLOTTANT (il n'y
 * a aucune barre de navigation systeme dans l'app iOS), un rail de stories, une
 * rangee de filtres, l'empilement de cartes, et une barre de recherche EN BAS —
 * pas en haut. Ce dernier point est le plus contre-intuitif pour qui vient du
 * web, et c'est un choix d'accessibilite : sur un telephone tenu d'une main, le
 * haut de l'ecran est hors de portee du pouce.
 */

const FILTRES = ['Tous', 'Non lus', 'Groupes', 'Directs', 'Épinglés'] as const;

export default function EcranListe() {
  const [filtre, setFiltre] = useState<string>('Tous');
  const [recherche, setRecherche] = useState('');

  const visibles = CONVERSATIONS.filter((c) => {
    if (filtre === 'Non lus' && c.nonLus === 0) return false;
    if (filtre === 'Groupes' && !c.estGroupe) return false;
    if (filtre === 'Directs' && c.estGroupe) return false;
    if (recherche && !c.titre.toLowerCase().includes(recherche.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <h1
          className="flex-1 text-grand-titre font-bold"
          style={{
            background: 'linear-gradient(90deg, var(--color-marque), var(--color-marque-profonde))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Meeshy Chats
        </h1>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-pastille"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-marque) 12%, transparent)', color: 'var(--color-marque)' }}
        >
          <Glyphe nom="linkSimple" taille={18} titre="Créer un lien de partage" />
        </button>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-pastille"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-marque) 12%, transparent)', color: 'var(--color-marque)' }}
        >
          <Glyphe nom="plus" taille={18} titre="Nouvelle conversation" />
        </button>
      </header>

      {/* Le rail de stories : avatars 88 px, anneau de marque quand non vues. */}
      <section aria-label="Stories" className="shrink-0 overflow-x-auto pb-1">
        <ul className="flex gap-3 px-4 py-2">
          {CONVERSATIONS.map((c) => (
            <li key={c.id} className="flex w-[88px] shrink-0 flex-col items-center gap-1.5">
              <span
                className="grid place-items-center rounded-pastille p-[2.5px]"
                style={{
                  background:
                    c.nonLus > 0
                      ? 'var(--color-marque)'
                      : 'color-mix(in srgb, var(--color-ios-encre-3) 40%, transparent)',
                }}
              >
                <Avatar initiales={c.initiales} teinte={c.teinte} taille={72} nom={c.titre} />
              </span>
              <span className="w-full truncate text-center text-coche" style={{ color: 'var(--color-ios-encre-2)' }}>
                {c.titre}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <nav aria-label="Filtres" className="shrink-0 overflow-x-auto">
        <ul className="flex gap-2 px-4 py-1.5">
          {FILTRES.map((f) => {
            const actif = f === filtre;
            return (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => setFiltre(f)}
                  aria-pressed={actif}
                  className="rounded-pastille px-3 py-1.5 text-titre font-medium whitespace-nowrap transition-colors"
                  style={
                    actif
                      ? { backgroundColor: 'var(--color-marque)', color: 'white' }
                      : {
                          backgroundColor: 'var(--color-ios-carte)',
                          color: 'var(--color-ios-encre-2)',
                          border: '0.5px solid var(--color-liseré)',
                        }
                  }
                >
                  {f}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <ul id="contenu" className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pt-2 pb-2">
        {visibles.map((c) => (
          <li key={c.id}>
            <LigneDeConversation conversation={c} langues={LANGUES_DU_LECTEUR} />
          </li>
        ))}
        {visibles.length === 0 ? (
          /* Etat vide : jamais un spinner, jamais une phrase seule — un
             contour pointille de CONTROLE, un glyphe, une phrase, une sortie. */
          <li
            className="mx-2 mt-8 grid place-items-center gap-3 rounded-heros p-6 text-center"
            style={{ border: '2px dashed color-mix(in srgb, var(--color-marque) 40%, transparent)' }}
          >
            <Glyphe nom="magnifyingGlass" taille={40} style={{ color: 'var(--color-ios-encre-3)' }} />
            <p className="text-corps" style={{ color: 'var(--color-ios-encre)' }}>
              Aucune conversation ne correspond à « {recherche || filtre} ».
            </p>
            <button
              type="button"
              onClick={() => {
                setRecherche('');
                setFiltre('Tous');
              }}
              className="rounded-pastille px-5 text-corps font-semibold text-white"
              style={{ backgroundColor: 'var(--color-marque)', minHeight: 44 }}
            >
              Tout afficher
            </button>
          </li>
        ) : null}
      </ul>

      {/* La barre de recherche EN BAS — a portee du pouce (cf. doc-comment). */}
      <div
        className="shrink-0 px-4 pt-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
      >
        <div
          className="flex items-center gap-3 px-4 py-3 backdrop-blur-xl"
          style={{
            borderRadius: 22,
            backgroundColor: 'color-mix(in srgb, var(--color-ios-carte) 85%, transparent)',
            border: '1px solid var(--color-liseré)',
          }}
        >
          <Glyphe nom="magnifyingGlass" taille={16} style={{ color: 'var(--color-ios-encre-2)' }} />
          <input
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.currentTarget.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher une conversation"
            className="min-w-0 flex-1 bg-transparent text-bulle outline-none placeholder:text-ios-encre-3"
          />
          {recherche ? (
            <button type="button" onClick={() => setRecherche('')} className="grid size-6 place-items-center">
              <Glyphe nom="x" taille={14} titre="Effacer" style={{ color: 'var(--color-erreur)' }} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
