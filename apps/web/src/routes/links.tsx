import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useStore } from 'zustand/react';

import { communityLinksQueryOptions, summarizeCommunityLinks } from '@/lib/api/community-links';
import { apiDeps } from '@/lib/api/deps';
import { shareLinksQueryOptions } from '@/lib/api/links';
import { myAddressesQueryOptions } from '@/lib/api/my-addresses';
import { trackingLinksSummaryQueryOptions } from '@/lib/api/my-tracking-links';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { profileShareUrl } from '@/lib/feed/share-url';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { hubFigure, hubFigureCaption, type CountedFamily } from '@/lib/links/hub-face';
import { useUrlSharing } from '@/lib/links/use-url-sharing';
import { openSendSheet } from '@/lib/send/send-sheet-store';
import { profileSendRequest } from '@/lib/view/profile-share';
import { HUB_FAMILIES, LinkFamilyCard, type LinkFamily } from '@/routes/link-families-parts';
import { LinksAddresses } from '@/routes/links-addresses';
import { LinksCodeSheet } from '@/routes/links-code-sheet';
import { LINKS_HUB_TOP_RESERVE, LinksAnnouncement, LinksHeader } from '@/routes/links-parts';
import { LinksProfileTicket } from '@/routes/links-profile-ticket';

const isCounted = (family: LinkFamily): family is CountedFamily => family !== 'affiliate';

/**
 * **MES LIENS — LA FACE LIENS** (#6361, #6408–#6410, #18880) — premier barreau de l'échelle,
 * miroir `LinksHubView.swift` : en-tête avec retour, le billet de MON LIEN DE PROFIL (adresse
 * canonique, QR, copier / QR / envoyer), « Mes adresses » quand le serveur en sert, puis les
 * QUATRE familles d'iOS dans son ordre — partage, suivi, communauté, parrainage — chacune avec
 * son chiffre quand il est connu. « + » ouvre la création, sauf la communauté, où l'on administre
 * des communautés plutôt que de créer un lien. Chaque carte dit, sous son nom, à quoi sert la
 * famille (#17641).
 *
 * **Cache d'abord, rien ne bloque.** Chaque lecture (partage, suivi, communautés, adresses) est
 * persistée et se revalide en fond ; un chiffre qui manque ne s'écrit pas (jamais un zéro
 * inventé), une section d'adresses vide n'apparaît pas, et la panne d'une lecture ne touche
 * pas les autres.
 *
 * **Le couloir des disques flottants.** L'en-tête (64) finit au-dessus ; la
 * première carte commence SOUS le couloir 126 → 178 au repos (`LINKS_HUB_TOP_RESERVE`).
 * `scripts/check-links.mjs` le mesure.
 */
export default function LinksScreen() {
  const language = currentInterfaceLanguage();
  const user = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user : null));
  const enabled = apiDeps.source === 'fixtures' || user !== null;
  const share = useInfiniteQuery({ ...shareLinksQueryOptions(apiDeps), enabled }, appQueryClient);
  const tracking = useQuery({ ...trackingLinksSummaryQueryOptions(apiDeps), enabled }, appQueryClient);
  const communities = useQuery({ ...communityLinksQueryOptions(apiDeps), enabled }, appQueryClient);
  const addresses = useQuery({ ...myAddressesQueryOptions(apiDeps), enabled }, appQueryClient);
  const sharing = useUrlSharing(language);
  const [codeOpen, setCodeOpen] = useState(false);
  const closeCode = useCallback(() => setCodeOpen(false), []);

  const counts: Readonly<Record<CountedFamily, number | null>> = {
    share: share.data?.pages[0]?.summary?.totalUses ?? null,
    tracking: tracking.data?.totalClicks ?? null,
    community: communities.data === undefined ? null : summarizeCommunityLinks(communities.data).communities,
  };
  const figureOf = (family: LinkFamily) => {
    if (!isCounted(family)) return undefined;
    const count = counts[family];
    const value = hubFigure(language, count);
    return value === null || count === null ? undefined : { value, caption: hubFigureCaption(language, family, count) };
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <LinksHeader language={language} back="list" backLabel={translate(language, 'pending.back')} title={translate(language, 'root.menu.links')} />
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto grid max-w-xl grid-cols-[minmax(0,1fr)] gap-4 pb-24" style={{ paddingTop: LINKS_HUB_TOP_RESERVE }}>
          {user === null ? null : (
            <LinksProfileTicket
              language={language}
              username={user.username}
              onCopy={() => sharing.copy('profile', profileShareUrl(user.username))}
              onOpenCode={() => setCodeOpen(true)}
              onSend={() => openSendSheet(profileSendRequest({ id: user.id, username: user.username, name: user.displayName ?? user.username, avatar: user.avatar ?? null }))}
            />
          )}
          <LinksAddresses language={language} addresses={addresses.data ?? null} />
          {HUB_FAMILIES.map((family) => (
            <LinkFamilyCard key={family} language={language} family={family} figure={figureOf(family)} />
          ))}
        </div>
      </main>
      {user !== null && codeOpen ? <LinksCodeSheet language={language} url={profileShareUrl(user.username)} onClose={closeCode} /> : null}
      <LinksAnnouncement text={sharing.announcer.text} />
    </div>
  );
}
