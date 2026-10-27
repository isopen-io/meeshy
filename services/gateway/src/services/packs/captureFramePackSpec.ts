/**
 * Le domaine `capture-frame` du moteur des packs (#10169, lot LC, PP4) : les
 * douze ambiances des cadres de capture (appel vidéo, viseur photo et vidéo),
 * servies par le MÊME moteur que les stickers et les cadres de gloire.
 *
 * Douze packs INTÉGRÉS, installés par défaut et RETIRABLES : retirer une
 * ambiance cache sa puce, jamais le cadre qu'un pair a choisi en direct ni le
 * brouillon qui la porte (les clients résolvent un identifiant sur le
 * catalogue connu, jamais sur l'étagère). Installer ne télécharge rien
 * (#10187) : les cadres sont embarqués, `downloadBytes.story` vaut 0.
 *
 * Aucun pack communautaire, aucune proposition (#10186) : ni `/submissions`,
 * ni `/pending`, ni `/:slug/review`. Aucun `removalGuard` : aucune préférence
 * de compte ne retient une ambiance.
 */
import type { PackDomainSpec } from './PackCatalog';
import type { PackIndex } from './PackIndex';
import { framePackRegistry, framePackSummary, type FramePackDetail, type FramePackSummary } from './gloryFramePackSpec';

export type CaptureFramePackSpecOptions = { readonly index: PackIndex };

export function captureFramePackSpec(options: CaptureFramePackSpecOptions): PackDomainSpec<FramePackSummary, FramePackDetail> {
  return {
    domain: 'capture-frame',
    // Relu à chaque accès : une surcharge d'administration (#11275) s'applique sans redémarrer.
    get registry() {
      return framePackRegistry(options.index, 'capture-frame');
    },
    community: null,
    removalGuard: null,
    toSummary: framePackSummary,
  };
}
