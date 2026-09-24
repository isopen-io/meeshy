import { memo } from 'react';

import { Avatar } from '@/components/avatar';
import { Glyph, GlyphSvg } from '@/components/glyph';
import { GroupedSection, SECTION_CARD_STYLE } from '@/components/grouped-section';
import { PROFILE_GLYPHS } from '@/components/glyphs-profile';
import type { Conversation } from '@/lib/api/types';
import { accentOf } from '@/lib/accent';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { avatarOf, initialsOf, titleOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';
import { BRAND, BRAND_INK, FOCUS, INK, INK_2 } from './user-profile-style';

/**
 * **CE QUE VOUS PARTAGEZ DÉJÀ** (#7124) — l'onglet Conversations d'iOS
 * (`UserProfileSheet+ConversationsTab.swift`, alimenté par
 * `ConversationService.listSharedWith`, `UserProfileSheet.swift:325`), rendu
 * en SECTION EMPILÉE plutôt qu'en onglet.
 *
 * ## Pourquoi pas la barre d'onglets, alors que D-93 la conditionnait à ce lot
 *
 * D-93 donne TROIS raisons d'empiler ; seule la première — « l'onglet
 * Conversations est hors périmètre, et une barre à trois onglets dont un ne
 * mène nulle part est un contrôle qui ment » — tombe avec ce lot. Les deux
 * autres tiennent et sont structurelles : `/me` a posé l'idiome
 * `<section aria-labelledby>` dans la v3.1, et deux profils qui se
 * feuilletteraient différemment feraient sentir un changement d'application
 * (dimension 6) ; iOS porte des onglets parce que sa fiche est une `sheet`
 * sans place — la route web est une page pleine, qui n'a rien à cacher
 * derrière un onglet. La barre est de plus INDISSOCIABLE de la chorégraphie
 * d'en-tête repliable qui l'ÉPINGLE (`pinnedTabBar`, `+Header.swift:204-230`),
 * et cette chorégraphie est un lot à part (#7124, élément 4) : la poser ici
 * sans son épinglage livrerait une moitié que l'autre lot réécrirait.
 *
 * ## Ce que la section rend, et les trois écarts avec iOS
 *
 *  - **le bouton « Envoyer un message » n'est PAS repris** : la fiche l'offre
 *    déjà — « Écrire », dans la section CONNEXION (`actionsFor`). Le reposer
 *    ici serait le doublon que D-11 interdit ; iOS le répète parce que ses
 *    onglets se cachent l'un l'autre, une page pleine n'a pas ce problème ;
 *  - **une rangée est un `<Link>`, pas une zone tapable** : la destination est
 *    une ADRESSE (`/c/:conversation`), et le lecteur doit pouvoir l'ouvrir
 *    dans un onglet, la copier, y revenir ;
 *  - **aucune rangée grisée « interactions désactivées »** : la fiche d'un
 *    compte bloqué ne rend NI publications NI statistiques (`blockedLayout`),
 *    et cette section n'est donc pas montée du tout — un contenu à 35 %
 *    d'opacité reste du contenu servi.
 *
 * L'APERÇU du dernier message n'est pas peint, et c'est délibéré : il
 * demanderait la descente du Prisme, l'horloge, la sourdine, les coches — la
 * ligne de la Lentille entière (`lens-row.tsx`), dans un écran qui répond à
 * « où nous sommes-nous déjà parlé ? ». iOS ne peint que l'avatar et le nom.
 */

const ROW_MIN_HEIGHT = 56;

function ConversationRow({ conversation, viewerId }: { readonly conversation: Conversation; readonly viewerId: string }) {
  const name = titleOf(conversation, viewerId);
  const avatar = avatarOf(conversation, viewerId);
  return (
    <li data-profile-conversation={conversation.id}>
      <Link
        to="thread"
        params={{ conversation: conversation.id }}
        className={`flex items-center gap-3 rounded-card px-3 py-2 ${FOCUS}`}
        style={{ ...SECTION_CARD_STYLE, minHeight: ROW_MIN_HEIGHT, outlineColor: BRAND }}
      >
        <Avatar
          initials={initialsOf(name)}
          color={accentOf(conversation)}
          size={36}
          name={name}
          {...(avatar !== undefined ? { src: avatar } : {})}
        />
        <span className="min-w-0 flex-1 truncate text-body font-medium" style={{ color: INK }}>
          {name}
        </span>
        <span aria-hidden="true" className="shrink-0" style={{ color: INK_2 }}>
          <GlyphSvg glyph={PROFILE_GLYPHS.caretRight} size={14} />
        </span>
      </Link>
    </li>
  );
}

export const ProfileConversationsSection = memo(function ProfileConversationsSection({
  language,
  conversations,
  viewerId,
  loading,
  failed,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly conversations: readonly Conversation[];
  readonly viewerId: string;
  readonly loading: boolean;
  readonly failed: boolean;
  readonly onRetry: () => void;
}) {
  return (
    <GroupedSection
      id="user-profile-conversations"
      title={translate(language, 'userProfile.section.conversations')}
      icon={<GlyphSvg glyph={PROFILE_GLYPHS.chatCircle} size={12} />}
      card={false}
    >
      <ul data-profile-conversations={String(conversations.length)} className="grid list-none gap-2 p-0">
        {failed ? (
          /* UNE PANNE PARTIELLE NE BLANCHIT PAS L'ÉCRAN — même loi que le bloc
             des publications : la section porte son erreur et son geste, le
             reste de la fiche reste peint. */
          <li role="alert" className="grid justify-items-center gap-3 rounded-card px-6 py-6 text-center" style={SECTION_CARD_STYLE}>
            <span style={{ color: 'var(--color-error)' }}>
              <Glyph name="warningCircle" size={24} />
            </span>
            <p className="text-body font-semibold" style={{ color: INK }}>
              {translate(language, 'userProfile.conversations.error')}
            </p>
            <button
              type="button"
              data-profile-conversations-retry
              onClick={onRetry}
              className={`grid place-items-center rounded-chip px-5 text-body font-semibold ${FOCUS} ${BRAND_INK}`}
              style={{ minHeight: 44, outlineColor: BRAND }}
            >
              {translate(language, 'profile.retry')}
            </button>
          </li>
        ) : loading && conversations.length === 0 ? (
          /* SKELETON SUR CACHE VIDE SEULEMENT (Cache-First) : une liste déjà
             servie reste peinte pendant sa revalidation silencieuse. */
          <li aria-busy="true" aria-label={translate(language, 'userProfile.conversations.loading')}>
            <span className="block rounded-card" style={{ ...SECTION_CARD_STYLE, height: ROW_MIN_HEIGHT }} />
          </li>
        ) : conversations.length === 0 ? (
          <li data-profile-conversations-empty className="grid justify-items-center gap-2 rounded-card px-6 py-8 text-center" style={SECTION_CARD_STYLE}>
            <span aria-hidden="true" style={{ color: INK_2 }}>
              <GlyphSvg glyph={PROFILE_GLYPHS.chatCircle} size={22} />
            </span>
            <p className="text-body font-semibold" style={{ color: INK }}>
              {translate(language, 'userProfile.conversations.empty')}
            </p>
            <p className="text-caption" style={{ color: INK_2 }}>
              {translate(language, 'userProfile.conversations.emptyBody')}
            </p>
          </li>
        ) : (
          conversations.map((conversation) => (
            <ConversationRow key={conversation.id} conversation={conversation} viewerId={viewerId} />
          ))
        )}
      </ul>
    </GroupedSection>
  );
});
