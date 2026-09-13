import { ProgressionPage } from '@/routes/progression-page';
import { AchievementsSection, UNLOCKED_TINT } from '@/routes/progression-parts';

/**
 * LA PAGE DÉDIÉE DES SUCCÈS (#5843) — les succès COMPOSÉS, nommés un par un.
 *
 * Cinq aujourd'hui, et le porteur en veut « bien plus » : un socle écrit à la
 * main plus une grammaire de croisements (#5845). Cette page est le contenant
 * qui les accueillera — elle ne présuppose aucun nombre.
 */
export default function ProgressionSuccesScreen() {
  return (
    <ProgressionPage
      titre="Succès"
      teinte={UNLOCKED_TINT}
      compte={(p) => `${p.achievements.filter((a) => a.unlocked).length} / ${p.achievements.length}`}
    >
      {(progress) => <AchievementsSection progress={progress} />}
    </ProgressionPage>
  );
}
