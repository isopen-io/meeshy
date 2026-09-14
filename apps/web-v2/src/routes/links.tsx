import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { LINKS_HUB_TOP_RESERVE, LinksBanner, LinksHeader, ShareLinksFamilyCard } from '@/routes/links-parts';

/**
 * **MES LIENS** (#6361) — premier barreau de l'échelle, miroir `LinksHubView.swift` :
 * en-tête avec retour, bannière, puis une carte par famille de liens. Remplace
 * l'écran d'attente de #6214.
 *
 * **Le hub ne montre que les familles servies** (loi 4, D-63). iOS en aligne
 * quatre ; le web sert les liens de PARTAGE (liste, détail, création,
 * désactivation). Les liens de suivi (#6408), d'affiliation (#6409) et de
 * communauté (#6410) arrivent chacun avec leur issue — une carte qui ouvrirait
 * un écran d'attente serait un contrôle qui ment.
 *
 * **Le couloir des disques flottants.** L'en-tête (64) finit au-dessus ; la
 * bannière commence SOUS le couloir 126 → 178 au repos (`LINKS_HUB_TOP_RESERVE`).
 * `scripts/check-links.mjs` le mesure.
 */
export default function LinksScreen() {
  const language = currentInterfaceLanguage();
  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <LinksHeader language={language} back="list" backLabel={translate(language, 'pending.back')} title={translate(language, 'root.menu.links')} />
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto grid max-w-xl gap-4 pb-24" style={{ paddingTop: LINKS_HUB_TOP_RESERVE }}>
          <LinksBanner language={language} />
          <ShareLinksFamilyCard language={language} />
        </div>
      </main>
    </div>
  );
}
