import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { HUB_FAMILIES, LinkFamilyCard } from '@/routes/link-families-parts';
import { LINKS_HUB_TOP_RESERVE, LinksBanner, LinksHeader } from '@/routes/links-parts';

/**
 * **MES LIENS** (#6361, #6408, #6409, #6410) — premier barreau de l'échelle,
 * miroir `LinksHubView.swift` : en-tête avec retour, bannière, puis les QUATRE
 * familles d'iOS dans son ordre — partage, suivi, communauté, parrainage.
 * Chaque carte ouvre sa famille ; « + » ouvre sa création, sauf la communauté,
 * où l'on administre des communautés plutôt que de créer un lien.
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
          {HUB_FAMILIES.map((family) => (
            <LinkFamilyCard key={family} language={language} family={family} />
          ))}
        </div>
      </main>
    </div>
  );
}
