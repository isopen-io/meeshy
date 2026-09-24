import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { adminIdentityQueryOptions } from '@/lib/api/admin';
import {
  ADMIN_CONVERSATIONS_PAGE_SIZE,
  adminConversationsQueryKey,
  loadAdminInstanceConversations,
  type AdminInstanceConversation,
} from '@/lib/api/admin-conversations';
import { apiDeps } from '@/lib/api/deps';
import { visibleAdminSections } from '@/lib/admin/sections';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useRoute } from '@/lib/router';
import { AdminDenied, AdminScreenFrame, AdminSkeleton } from '@/routes/admin-parts';
/** `Link` vient de la TABLE, pas du module générique : `createRouter(table)` le
 * fabrique typé sur elle, de sorte que `to` n'accepte qu'une clé réelle et
 * `params` la forme exacte du motif. Même import que `admin-users`. */
import { Link } from '@/routes/route-table';

/**
 * **L'INVENTAIRE DES CONVERSATIONS** (#6862) — la première moitié de la lecture
 * souveraine : on part d'une conversation, au lieu de devoir deviner un membre
 * qui y participe.
 *
 * ## Ce que cet écran NE montre pas
 *
 * Aucun contenu de message, aucun aperçu. `GET /admin/conversations` (#6861)
 * sert des métadonnées, et c'est la frontière que l'écran tient : un titre de
 * conversation n'est pas un message. Le contenu vit derrière la route voisine,
 * son motif écrit et sa trace.
 *
 * ## La garde est LUE, pas héritée
 *
 * `visibleAdminSections(permissions, role)` décide, avec le rôle **servi** par
 * `GET /me/permissions`. On entre sur cette adresse par un lien profond aussi
 * bien que par le hub, et une garde posée seulement à l'étage du dessus ne
 * garde que l'escalier.
 *
 * Le refus a DEUX visages distincts, et les confondre serait mentir :
 * `AdminDenied` pour qui n'a rien à faire ici, et un message propre au rang
 * pour un MODERATOR — qui porte bien `canManageConversations` (matrice
 * centrale) mais n'a pas le rang d'administration. Celui-là n'a pas « pas le
 * droit d'être là », il a « le droit d'être là sans le droit de lire ceci ».
 *
 * Directive porteur du 2026-09-16 : les ADMIN accèdent à ces informations,
 * pour le moment — le seuil est donc BIGBOSS ou ADMIN, jamais MODERATOR.
 *
 * ## Rien de ce qui est lu ici ne touche le disque
 *
 * Les clés de requête descendent d'`ADMIN_SOUVERAIN_PREFIXE`, qu'exclut le
 * filtre de déshydratation de `query-client.ts` (#6862). Ne jamais composer
 * une clé de ce domaine à la main.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

/**
 * **LA LIGNE OUVRE LA CONVERSATION** — sans ce lien, l'écran de lecture est
 * INATTEIGNABLE autrement qu'en tapant son adresse à la main.
 *
 * C'est le défaut que ce composant a porté à sa première livraison : une liste
 * dont les lignes ne mènent nulle part, au-dessus d'un écran de détail écrit,
 * testé et branché. Ni `tsc`, ni les 4449 témoins, ni le gate de poids ne
 * pouvaient le voir — un maillon manquant ne casse rien, il ne relie
 * simplement pas.
 *
 * `cible` vient de l'écran et vaut `admConversation` ou `adminConversation`
 * selon l'espace d'où l'on parcourt la liste : D-76 tient les deux
 * administrations séparées, et mélanger les deux ferait sauter
 * l'administrateur de l'une à l'autre au premier tap.
 *
 * Le lien porte la mise en page, pas le `<li>` : une cible tactile doit être
 * l'élément CLIQUABLE lui-même, sinon le pouce touche la carte sans rien
 * ouvrir sur ses bords. `minHeight: 44` est le plancher du dépôt.
 */
function ConversationRow({
  conversation,
  language,
  cible,
}: {
  readonly conversation: AdminInstanceConversation;
  readonly language: InterfaceLanguage;
  readonly cible: 'adminConversation' | 'admConversation';
}) {
  return (
    <li data-admin-conversation={conversation.id}>
      <Link
        to={cible}
        params={{ conversation: conversation.id }}
        className="flex items-center gap-3 rounded-card px-4 py-3"
        style={{ minHeight: 44, backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)' }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-body" style={{ color: INK }}>
            {/* Un DIRECT n'a pas de titre propre (D-75) : il porte le nom de
                l'autre, que cette route ne sert pas. On montre son identifiant
                plutôt qu'une ligne vide. */}
            {conversation.title ?? conversation.identifier ?? conversation.id}
          </p>
          <p className="truncate text-caption" style={{ color: INK2 }}>
            {conversation.type}
            {' · '}
            {translateAdmin(language, 'admin.convList.members', { count: String(conversation.memberCount) })}
          </p>
        </div>
      </Link>
    </li>
  );
}

export default function AdminConversationsScreen() {
  const language = currentInterfaceLanguage();
  const { key } = useRoute();
  /** On reste dans l'espace d'où l'on vient : `/adm/conversations` ouvre
   * `/adm/conversations/$conversation`, `/admin/…` son jumeau. Mélanger les
   * deux ferait sauter l'administrateur d'une administration à l'autre au
   * premier tap (D-76). */
  const cible = key === 'admConversations' ? ('admConversation' as const) : ('adminConversation' as const);
  const [offset, setOffset] = useState(0);
  const [recherche, setRecherche] = useState('');

  const identite = useQuery(adminIdentityQueryOptions(apiDeps));

  // Le droit d'ENTRER dans la section, rôle compris.
  const autorise = visibleAdminSections(identite.data?.permissions ?? null, identite.data?.role).some(
    (section) => section.id === 'conversations',
  );
  // Le droit d'être dans l'ESPACE, sans le rang — le second visage du refus.
  const dansLEspace = visibleAdminSections(identite.data?.permissions ?? null).length > 0;

  const liste = useQuery({
    queryKey: adminConversationsQueryKey(offset, recherche, ''),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminInstanceConversations({ ...apiDeps, offset, search: recherche, signal });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    enabled: autorise,
    retry: false,
    // Rien de souverain ne se garde : ni sur le disque (le filtre de
    // déshydratation l'exclut), ni en mémoire au-delà de l'écran.
    gcTime: 0,
  });

  const titre = translateAdmin(language, 'admin.nav.conversations');

  if (identite.isPending) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        <AdminSkeleton rows={5} />
      </AdminScreenFrame>
    );
  }

  if (!autorise) {
    return (
      <AdminScreenFrame language={language} title={titre} back="admin">
        {dansLEspace ? (
          <p className="text-caption" style={{ color: INK2 }} data-admin-sovereign-denied>
            {translateAdmin(language, 'admin.convList.sovereign')}
          </p>
        ) : (
          <AdminDenied language={language} />
        )}
      </AdminScreenFrame>
    );
  }

  const page = liste.data;

  return (
    <AdminScreenFrame language={language} title={titre} back="admin">
      <label className="grid gap-1 pb-4">
        <span className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.convList.search')}
        </span>
        <input
          type="search"
          value={recherche}
          data-admin-conversations-search
          onChange={(event) => {
            setRecherche(event.target.value);
            // Toute nouvelle recherche repart de la PREMIÈRE page : garder
            // l'offset rendrait une liste vide sur un filtre qui a pourtant
            // des résultats — un « aucune conversation » qui ment.
            setOffset(0);
          }}
          className="rounded-chip px-4 text-body"
          style={{
            minHeight: 44,
            backgroundColor: 'var(--color-ios-surface)',
            border: '1px solid var(--color-edge)',
            color: INK,
          }}
        />
      </label>

      {liste.isPending ? (
        <AdminSkeleton rows={6} />
      ) : page === undefined ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.convList.unavailable')}
        </p>
      ) : page.conversations.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.convList.empty')}
        </p>
      ) : (
        <>
          <p className="pb-2 text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.convList.count', { count: String(page.total) })}
          </p>
          <ul className="grid gap-2">
            {page.conversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                language={language}
                cible={cible}
              />
            ))}
          </ul>
          <div className="flex justify-between gap-2 pt-4">
            <button
              type="button"
              data-admin-conversations-prev
              disabled={offset === 0}
              onClick={() => setOffset((valeur) => Math.max(0, valeur - ADMIN_CONVERSATIONS_PAGE_SIZE))}
              className="rounded-chip px-4 text-body font-semibold disabled:opacity-40"
              style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK }}
            >
              {translateAdmin(language, 'admin.users.previous')}
            </button>
            <button
              type="button"
              data-admin-conversations-next
              disabled={!page.hasMore}
              onClick={() => setOffset((valeur) => valeur + ADMIN_CONVERSATIONS_PAGE_SIZE)}
              className="rounded-chip px-4 text-body font-semibold disabled:opacity-40"
              style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK }}
            >
              {translateAdmin(language, 'admin.users.next')}
            </button>
          </div>
        </>
      )}
    </AdminScreenFrame>
  );
}
