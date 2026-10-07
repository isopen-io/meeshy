import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { GamePhotoFlow } from '@/components/game-photo-flow';
import { ENGAGEMENT_PROGRESS_QUERY_KEY } from '@/lib/api/engagement';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { appPhotoEnv } from '@/lib/game-photo/app-env';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { achievementMoment, type PhotoMoment } from '@/lib/game-photo/moments';
import { visibleRarity, type AchievementRarityMap } from '@/lib/game/rarity';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { ProgressionPage } from '@/routes/progression-page';
import { AchievementsSection, UNLOCKED_TINT } from '@/routes/progression-parts';

import type { EngagementProgress } from '@meeshy/shared/utils/engagement-progress';

/**
 * LA PAGE DÉDIÉE DES SUCCÈS (#5843) — les succès COMPOSÉS, nommés un par un.
 *
 * Cinq aujourd'hui, et le porteur en veut « bien plus » : un socle écrit à la
 * main plus une grammaire de croisements (#5845). Cette page est le contenant
 * qui les accueillera — elle ne présuppose aucun nombre.
 *
 * La RÉVÉLATION d'un succès obtenu se photographie (#7742, conception XII.3) :
 * la même carte que les autres moments, avec le bandeau de parrainage et la
 * Flamme. Le déroulé est celui du jeu (`GamePhotoFlow`), l'environnement est
 * injecté.
 */
export function SuccesBody({
  progress,
  env,
  flameDays = null,
  rarities,
}: {
  readonly progress: EngagementProgress;
  readonly env: PhotoEnv;
  readonly flameDays?: number | null;
  /** La rareté mesurée de chaque succès (#9390) ; absente : l'écran d'avant. */
  readonly rarities?: AchievementRarityMap | undefined;
}) {
  const [taking, setTaking] = useState<PhotoMoment | null>(null);
  return (
    <>
      <AchievementsSection progress={progress} rarities={rarities} onPhoto={(key) => setTaking(achievementMoment(key, visibleRarity(rarities?.[key])))} />
      {taking === null ? null : <GamePhotoFlow moment={taking} env={env} flameDays={flameDays} onClose={() => setTaking(null)} />}
    </>
  );
}

export default function ProgressionSuccesScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  /* Les jours de la Flamme du bandeau : lus dans le cache de Progression, jamais redemandés. */
  const cached = useQueryClient().getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY);
  const flameDays = cached?.game?.flame.days ?? null;
  return (
    <ProgressionPage
      concept="succes"
      titre="Succès"
      teinte={UNLOCKED_TINT}
      compte={(p) => `${p.achievements.filter((a) => a.unlocked).length} / ${p.achievements.length}`}
    >
      {(progress) => <SuccesBody progress={progress} env={appPhotoEnv()} flameDays={flameDays} rarities={(progress as EngagementWithGame).game?.achievementRarities} />}
    </ProgressionPage>
  );
}
