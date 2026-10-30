package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.auth.RegistrationIdentity.UsernameRefusal
import org.junit.Test

class RegistrationIdentityTest {

    @Test
    fun `un pseudo commence a trois caracteres et un nom a deux, rognes`() {
        assertThat(RegistrationIdentity.PSEUDO_MIN).isEqualTo(3)
        assertThat(RegistrationIdentity.NAME_MIN).isEqualTo(2)
        assertThat(RegistrationIdentity.usernameRefusal("Al")).isEqualTo(UsernameRefusal.TOO_SHORT)
        assertThat(RegistrationIdentity.usernameRefusal("Ali")).isNull()
        assertThat(RegistrationIdentity.isNameLongEnough("A")).isFalse()
        assertThat(RegistrationIdentity.isNameLongEnough("  A  ")).isFalse()
        assertThat(RegistrationIdentity.isNameLongEnough("Al")).isTrue()
        assertThat(RegistrationIdentity.isNameLongEnough(" Li ")).isTrue()
        assertThat(RegistrationIdentity.isNameLongEnough("")).isFalse()
    }

    @Test
    fun `un nom compte ses caracteres VISIBLES, comme la passerelle`() {
        listOf("😀😀", "🇫🇷🇨🇲", "A😀", "Ét", "E\u0301t", "👨‍👩‍👧Al").forEach {
            assertWithMessage(it).that(RegistrationIdentity.isNameLongEnough(it)).isTrue()
            assertWithMessage(it).that(RegistrationIdentity.isNameTooShort(it)).isFalse()
        }
        listOf("😀", "🇫🇷", "👨‍👩‍👧", "A\u200E", "A\u2060", "A\u00AD", "E\u0301", "A\u3164", "A<b></b>", "A\u200B").forEach {
            assertWithMessage(it).that(RegistrationIdentity.isNameLongEnough(it)).isFalse()
            assertWithMessage(it).that(RegistrationIdentity.isNameTooShort(it)).isTrue()
        }
    }

    @Test
    fun `le pseudo d'un invite se mesure sur ce que la passerelle en sert`() {
        assertThat(RegistrationIdentity.isGuestNicknameLongEnough("Ali")).isTrue()
        assertThat(RegistrationIdentity.isGuestNicknameLongEnough(" a.b ")).isTrue()
        assertThat(RegistrationIdentity.isGuestNicknameLongEnough("Al#")).isFalse()
        assertThat(RegistrationIdentity.isGuestNicknameLongEnough("Zoé")).isFalse()
        assertThat(RegistrationIdentity.isGuestNicknameLongEnough("")).isFalse()
    }

    @Test
    fun `un pseudo derive d'une adresse fait toujours trois caracteres au moins`() {
        assertThat(RegistrationIdentity.pseudoRacine(displayName = null, email = "al@x.com"))
            .isEqualTo(RegistrationIdentity.PSEUDO_DE_SECOURS)
        assertThat(RegistrationIdentity.pseudoRacine(displayName = "Al", email = "ali@x.com")).isEqualTo("ali")
        assertThat(RegistrationIdentity.pseudoRacine(displayName = null, email = "ada@x.com").length)
            .isAtLeast(RegistrationIdentity.PSEUDO_MIN)
    }

    @Test
    fun `capitalizeName respecte les composes`() {
        assertThat(RegistrationIdentity.capitalizeName("jean-pierre")).isEqualTo("Jean-Pierre")
        assertThat(RegistrationIdentity.capitalizeName("  o'BRIEN ")).isEqualTo("O'Brien")
        assertThat(RegistrationIdentity.capitalizeName("3john")).isEqualTo("3john")
    }

    @Test
    fun `pseudoSlug replie accents espaces et separateurs`() {
        assertThat(RegistrationIdentity.pseudoSlug("Léa Müller")).isEqualTo("lea-muller")
        assertThat(RegistrationIdentity.pseudoSlug("a ! b")).isEqualTo("a-b")
        assertThat(RegistrationIdentity.pseudoSlug("__a__b__")).isEqualTo("a-b")
        assertThat(RegistrationIdentity.pseudoSlug("a_b")).isEqualTo("a_b")
        assertThat(RegistrationIdentity.pseudoSlug("李雷")).isEmpty()
    }

    @Test
    fun `pseudoSlug tronque apres avoir rogne les bords, comme le TypeScript`() {
        assertThat(RegistrationIdentity.pseudoSlug("abcdefghijklmno pqrstuv")).isEqualTo("abcdefghijklmno-")
        assertThat(RegistrationIdentity.pseudoSlug("abcdefghijklmn pqrstuv")).isEqualTo("abcdefghijklmn-p")
    }

    @Test
    fun `adresse longue est tronquee a 16`() {
        assertThat(RegistrationIdentity.slugDAdresse("prenom.nom.tres.long.vraiment@x.com").length).isAtMost(16)
    }

    @Test
    fun `sous-adressage et point d'adresse`() {
        assertThat(RegistrationIdentity.partieLocale("jean+meeshy@x.com")).isEqualTo("jean")
        assertThat(RegistrationIdentity.slugDAdresse("jean.dupont@x.com")).isEqualTo("jean-dupont")
        assertThat(RegistrationIdentity.partieLocale(null)).isEmpty()
    }

    @Test
    fun `displayNameDepuisEmail lit l'adresse comme un nom`() {
        assertThat(RegistrationIdentity.displayNameDepuisEmail("jean.dupont@x.com")).isEqualTo("Jean Dupont")
        assertThat(RegistrationIdentity.displayNameDepuisEmail("jean42@x.com")).isEqualTo("Jean")
        assertThat(RegistrationIdentity.displayNameDepuisEmail("a@x.com")).isEmpty()
        assertThat(RegistrationIdentity.displayNameDepuisEmail("élodie@x.com")).isEqualTo("Elodie")
    }

    @Test
    fun `pseudoRacine prefere le nom puis l'adresse puis le recours`() {
        assertThat(RegistrationIdentity.pseudoRacine("Ada Lovelace", "x@y.com")).isEqualTo("ada-lovelace")
        assertThat(RegistrationIdentity.pseudoRacine("李雷", "li.lei@y.com")).isEqualTo("li-lei")
        assertThat(RegistrationIdentity.pseudoRacine(null, "1@y.com")).isEqualTo("user")
    }

    @Test
    fun `usernameRefusal dit le motif en direct`() {
        assertThat(RegistrationIdentity.usernameRefusal("a")).isEqualTo(UsernameRefusal.TOO_SHORT)
        assertThat(RegistrationIdentity.usernameRefusal("a".repeat(17))).isEqualTo(UsernameRefusal.TOO_LONG)
        assertThat(RegistrationIdentity.usernameRefusal("josé")).isEqualTo(UsernameRefusal.INVALID_CHARACTERS)
        assertThat(RegistrationIdentity.usernameRefusal("a b")).isEqualTo(UsernameRefusal.INVALID_CHARACTERS)
        assertThat(RegistrationIdentity.usernameRefusal("ok_name-1")).isNull()
        assertThat(RegistrationIdentity.usernameRefusal("a".repeat(16))).isNull()
    }
}
