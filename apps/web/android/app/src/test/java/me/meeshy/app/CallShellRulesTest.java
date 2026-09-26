package me.meeshy.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** Service au premier plan, haptique, refus sans socket (#8049, J2, D16, D19, C11). */
public class CallShellRulesTest {

    @Test
    public void aVoiceCallHoldsTheMicrophoneOnly() {
        assertEquals(CallShellRules.FGS_TYPE_MICROPHONE, CallShellRules.foregroundServiceTypes(false, true, true));
    }

    @Test
    public void aVideoCallHoldsMicrophoneAndCamera() {
        assertEquals(
            CallShellRules.FGS_TYPE_MICROPHONE | CallShellRules.FGS_TYPE_CAMERA,
            CallShellRules.foregroundServiceTypes(true, true, true)
        );
    }

    @Test
    public void aTypeWhosePermissionIsNotGrantedIsNeverRequested() {
        assertEquals(CallShellRules.FGS_TYPE_MICROPHONE, CallShellRules.foregroundServiceTypes(true, true, false));
        assertEquals(CallShellRules.FGS_TYPE_CAMERA, CallShellRules.foregroundServiceTypes(true, false, true));
        assertEquals(0, CallShellRules.foregroundServiceTypes(false, false, true));
    }

    @Test
    public void eachTransitionHasItsOwnShortPattern() {
        assertArrayEquals(new long[] {0, 40}, CallShellRules.hapticPattern("connected"));
        assertArrayEquals(new long[] {0, 30, 80, 30}, CallShellRules.hapticPattern("ended"));
        assertArrayEquals(new long[] {0, 20}, CallShellRules.hapticPattern("reconnecting"));
        assertNull(CallShellRules.hapticPattern("unknown"));
        assertNull(CallShellRules.hapticPattern(null));
    }

    @Test
    public void theDeclineUrlTargetsTheCallWithTheRejectedReason() {
        assertEquals(
            "https://gate.meeshy.me/api/v1/calls/abc?reason=rejected",
            CallShellRules.declineUrl("https://gate.meeshy.me/", "abc")
        );
    }

    @Test
    public void theDeclineUrlEncodesTheCallId() {
        assertEquals(
            "https://gate.meeshy.me/api/v1/calls/a%2Fb%20c?reason=rejected",
            CallShellRules.declineUrl("https://gate.meeshy.me", "a/b c")
        );
    }

    @Test
    public void noDeclineWithoutAnAbsoluteApiBaseOrACallId() {
        assertNull(CallShellRules.declineUrl("", "abc"));
        assertNull(CallShellRules.declineUrl("/api", "abc"));
        assertNull(CallShellRules.declineUrl(null, "abc"));
        assertNull(CallShellRules.declineUrl("https://gate.meeshy.me", " "));
    }

    @Test
    public void anAccountSpeaksInAuthorizationAndAGuestInSessionToken() {
        assertArrayEquals(new String[] {"Authorization", "Bearer jwt"}, CallShellRules.credentialHeader("registered", "jwt"));
        assertArrayEquals(new String[] {"X-Session-Token", "s1"}, CallShellRules.credentialHeader("anonymous", "s1"));
        assertNull(CallShellRules.credentialHeader("registered", ""));
        assertNull(CallShellRules.credentialHeader("other", "x"));
        assertNull(CallShellRules.credentialHeader(null, null));
    }
}
