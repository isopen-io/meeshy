import SwiftUI

/// **Un écran qui recouvre tout et qui doit DISPARAÎTRE sans se retirer**
/// (#4363).
///
/// ## Le défaut qu'il ferme
///
/// L'écran de lancement vivait derrière un `if showSplash`, avec une transition
/// de retrait (`.opacity.combined(with: .scale)`). Symptôme observé et
/// enregistré au simulateur : la liste des conversations s'affiche pleinement —
/// donc la condition est retombée à `false` — pendant que le splash reste
/// dessiné en fantôme par-dessus, et **avale tous les gestes**. L'app n'est ni
/// gelée ni plantée : le log ne montre rien, le processus vit, le réseau
/// continue. Elle est simplement inatteignable.
///
/// La cause : **une transition de retrait interrompue laisse la vue ATTACHÉE**,
/// et une vue attachée teste toujours les touches.
///
/// ## Pourquoi « fiabiliser la transition » n'est pas le correctif
///
/// Une interruption est un état que le framework peut atteindre pour des
/// raisons qu'on ne contrôle pas — changement de `scenePhase`, seconde animation
/// dans la même transaction, réévaluation en vol. Tant que la disparition PASSE
/// PAR un retrait, l'écran peut rester accroché. Ce qui ferme la classe est de
/// ne jamais le retirer : monté en permanence, il n'a plus de transition à
/// interrompre.
///
/// ## Et pourquoi `allowsHitTesting` seul n'aurait rien fait
///
/// Pendant un retrait, SwiftUI rend la DERNIÈRE version évaluée de la vue —
/// celle où la condition valait encore `true`, donc celle qui teste les touches.
/// Le modificateur ne mord QUE sur une vue qui reste évaluée, c'est-à-dire
/// précisément sur la forme retenue ici.
///
/// `accessibilityHidden` suit la même condition : un écran invisible resté dans
/// l'arbre VoiceOver enfermerait le lecteur dessus, exactement comme il
/// enfermait le doigt.
extension View {
    func fullScreenGate(isPresented: Bool) -> some View {
        self
            .opacity(isPresented ? 1 : 0)
            .scaleEffect(isPresented ? 1 : 1.1)
            .allowsHitTesting(isPresented)
            .accessibilityHidden(!isPresented)
    }
}
