package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class OnboardingRootRulesTest {

    @Test
    fun `le chrome flottant se masque tant que le calque d'onboarding couvre la racine`() {
        assertThat(floatingChromeVisible(Routes.CONVERSATIONS, isOnboardingPresented = true)).isFalse()
        assertThat(floatingChromeVisible(Routes.CONVERSATIONS, isOnboardingPresented = false)).isTrue()
    }

    @Test
    fun `le calque couvre la racine tant qu'il est present, sauf devant le composeur de story`() {
        assertThat(OnboardingRootRules.coversRoot(isPresented = true, currentRoute = Routes.CONVERSATIONS)).isTrue()
        assertThat(OnboardingRootRules.coversRoot(isPresented = true, currentRoute = Routes.STORY_COMPOSER_ROUTE)).isFalse()
        assertThat(OnboardingRootRules.coversRoot(isPresented = false, currentRoute = Routes.CONVERSATIONS)).isFalse()
    }

    @Test
    fun `un lien profond qui mene ailleurs que les onglets fait attendre le calque`() {
        assertThat(OnboardingRootRules.isRoutedElsewhere(Routes.CONVERSATIONS)).isFalse()
        assertThat(OnboardingRootRules.isRoutedElsewhere(Routes.chat("abc"))).isTrue()
        assertThat(OnboardingRootRules.isRoutedElsewhere(null)).isFalse()
    }

    @Test
    fun `le composeur de story se reconnait a sa route, argument inclus`() {
        assertThat(OnboardingRootRules.isStoryComposer(Routes.STORY_COMPOSER_ROUTE)).isTrue()
        assertThat(OnboardingRootRules.isStoryComposer(Routes.STORY_COMPOSER)).isTrue()
        assertThat(OnboardingRootRules.isStoryComposer(Routes.FEED)).isFalse()
        assertThat(OnboardingRootRules.isStoryComposer(null)).isFalse()
    }

    @Test
    fun `l'ecran d'appel passe devant le calque, comme sa presentation modale sur iOS`() {
        assertThat(OnboardingRootRules.isCallOpen(CallRoute.PATTERN)).isTrue()
        assertThat(OnboardingRootRules.isCallOpen(Routes.CONVERSATIONS)).isFalse()
        assertThat(OnboardingRootRules.isCallOpen(null)).isFalse()
        assertThat(OnboardingRootRules.coversRoot(isPresented = true, currentRoute = CallRoute.PATTERN)).isFalse()
    }
}
