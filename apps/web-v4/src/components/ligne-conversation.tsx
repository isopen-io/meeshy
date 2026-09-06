import { Link } from '@tanstack/react-router';

import type { Conversation } from '@/lib/api/modele';
import { servi } from '@/lib/api/prisme';
import { avecAccent } from '@/lib/accent';
import { heure } from '@/lib/groupage';

import { Avatar } from './avatar';
import { Glyphe } from './glyphe';

/**
 * UNE LIGNE DE LA LISTE — une CARTE, pas une rangee de tableau.
 *
 * Il n'y a AUCUN separateur : des cartes de rayon 14, espacees de 8 px, avec un
 * lisere de 0,5 px. Poser un separateur ferait un rendu « liste systeme » la ou
 * iOS rend un empilement de cartes — c'est la difference la plus visible entre
 * les deux, et la plus facile a rater.
 *
 * La PRESENCE ne s'affiche qu'en conversation DIRECTE : dans un groupe, la
 * pastille de l'avatar de groupe ne designerait personne.
 */
export function LigneDeConversation({ conversation, langues }: { conversation: Conversation; langues: readonly string[] }) {
  const nonLus = conversation.nonLus > 0;
  const apercu = servi(
    langues,
    conversation.dernierMessage.langueOriginale,
    conversation.dernierMessage.traductions,
    conversation.dernierMessage.contenu,
  );

  return (
    <Link
      to="/c/$conversation"
      params={{ conversation: conversation.id }}
      className="flex items-start gap-3 rounded-[14px] p-3 transition-colors"
      style={avecAccent(conversation.teinte, {
        backgroundColor: 'var(--color-ios-carte)',
        border: '0.5px solid var(--color-liseré)',
      })}
    >
      <Avatar
        initiales={conversation.initiales}
        teinte={conversation.teinte}
        taille={52}
        nom={conversation.titre}
        {...(conversation.estGroupe ? {} : { presence: conversation.presence })}
      />

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-start gap-2">
          <span
            className={`min-w-0 flex-1 text-titre ${nonLus ? 'font-bold' : 'font-semibold'} line-clamp-2`}
            style={{ color: 'var(--color-ios-encre)' }}
          >
            {conversation.titre}
          </span>

          {conversation.estGroupe ? (
            <span
              className="flex shrink-0 items-center gap-1 rounded-pastille px-1.5 py-0.5 text-coche"
              style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)' }}
            >
              <Glyphe nom="users" taille={10} />
              <span className="tabular-nums">{conversation.participants}</span>
              <span className="hors-ecran">participants</span>
            </span>
          ) : null}

          {conversation.enSourdine ? (
            <Glyphe nom="bell" taille={10} titre="En sourdine" style={{ color: 'var(--color-ios-encre-3)' }} />
          ) : null}

          {/* L'heure passe en ROUGE quand il reste des non-lus : c'est le seul
              endroit ou une couleur d'etat entre dans la ligne, et elle porte
              la meme information que la pastille, a l'autre bout du regard. */}
          <time
            className="shrink-0 pt-0.5 text-coche font-medium tabular-nums"
            dateTime={conversation.dernierMessage.a}
            style={{ color: nonLus ? 'var(--color-erreur)' : 'var(--accent)' }}
          >
            {heure(conversation.dernierMessage.a)}
          </time>
        </span>

        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-titre" style={{ color: 'var(--color-ios-encre-2)' }}>
            {conversation.estGroupe ? (
              <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                {conversation.dernierMessage.auteur.split(' ')[0]}{' '}
              </span>
            ) : null}
            <span lang={apercu.langue}>{apercu.texte}</span>
          </span>

          {nonLus ? (
            <span
              className="grid min-h-6 min-w-6 shrink-0 place-items-center rounded-pastille px-1.5 text-coche font-semibold text-white"
              style={{ backgroundColor: 'var(--color-erreur)' }}
            >
              {conversation.nonLus > 99 ? '99+' : conversation.nonLus}
              <span className="hors-ecran">messages non lus</span>
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
