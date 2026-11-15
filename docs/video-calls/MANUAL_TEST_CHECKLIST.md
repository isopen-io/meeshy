# Manual Testing Checklist - Phase 1A: P2P Video Calls

**Version:** 1.0
**Date:** 2025-10-28
**Tester:** ___________________
**Test Date:** ___________________
**Environment:** [ ] Local Dev [ ] Staging [ ] Production

---

## Pre-Test Setup

### Prerequisites
- [ ] Two test devices available (or two browser windows/profiles)
- [ ] Both devices logged in as different test users:
  - Device 1: `user-a@meeshy.test` (Alice)
  - Device 2: `user-b@meeshy.test` (Bob)
- [ ] DIRECT conversation exists between test users
- [ ] GROUP conversation exists with exactly 2 members
- [ ] PUBLIC conversation exists (for negative testing)
- [ ] Both devices have stable internet connection (WiFi or LTE)
- [ ] Browsers updated to latest stable version

### Test Environment Details
- **Gateway API URL:** ___________________
- **Frontend URL:** ___________________
- **Browser 1:** ___________________ (version: ___)
- **Browser 2:** ___________________ (version: ___)
- **OS 1:** ___________________
- **OS 2:** ___________________

---

## Test Execution

### Section 1: Call Initiation (DIRECT Conversation)

#### Test 1.1: Start Call from DIRECT Conversation
**Priority:** P0

**Steps:**
1. On Device 1 (Alice), navigate to DIRECT conversation with Bob
2. Locate and click "Start Call" button
3. Observe UI changes

**Expected Results:**
- [ ] Call interface appears immediately (<1s)
- [ ] Local video stream visible within 1-2 seconds
- [ ] Camera preview shows Alice's video feed
- [ ] Audio/video controls visible (mute, video toggle, hang up)
- [ ] Status shows "Calling..." or "Ringing"
- [ ] No console errors in browser DevTools

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

**Notes:**
___________________________________________________________

---

#### Test 1.2: Verify Call Cannot Be Initiated from PUBLIC Conversation
**Priority:** P0

**Steps:**
1. On Device 1 (Alice), navigate to PUBLIC conversation
2. Look for "Start Call" button

**Expected Results:**
- [ ] "Start Call" button is NOT visible/hidden
- [ ] OR button is disabled with tooltip explaining why

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 1.3: Verify Cannot Start Call While Already in Active Call
**Priority:** P1

**Steps:**
1. Initiate call in Conversation A
2. While call is active, navigate to Conversation B
3. Try to start another call

**Expected Results:**
- [ ] Error message: "Already in an active call"
- [ ] OR "Start Call" button disabled
- [ ] First call remains active

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Section 2: Receiving and Accepting Calls

#### Test 2.1: Receive Incoming Call Notification
**Priority:** P0

**Steps:**
1. From Device 1 (Alice), initiate call to Bob
2. On Device 2 (Bob), observe incoming call notification

**Expected Results:**
- [ ] Notification appears within 1-2 seconds
- [ ] Displays caller name "Alice" (or username)
- [ ] Displays caller avatar/profile picture
- [ ] "Accept" button is visible and prominent
- [ ] "Reject" button is visible
- [ ] Ringtone plays (if implemented) or visual indicator pulses
- [ ] Notification persists until action taken

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 2.2: Accept Incoming Call
**Priority:** P0

**Steps:**
1. Continuing from Test 2.1
2. On Device 2 (Bob), click "Accept" button
3. Observe call interface on both devices

**Expected Results:**
- [ ] Call interface appears on Device 2
- [ ] Local video appears on Device 2 (Bob's camera)
- [ ] Remote video appears on Device 2 (Alice's camera) within 2-3 seconds
- [ ] Remote video appears on Device 1 (Bob's camera) within 2-3 seconds
- [ ] Call status changes to "Connected" on both devices
- [ ] Audio is bidirectional (both can hear each other)
- [ ] No echo or audio feedback

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

**Notes:**
- Connection time (seconds): ___
- Video quality: [ ] Excellent [ ] Good [ ] Fair [ ] Poor
- Audio quality: [ ] Excellent [ ] Good [ ] Fair [ ] Poor

---

#### Test 2.3: Reject Incoming Call
**Priority:** P0

**Steps:**
1. From Device 1 (Alice), initiate call to Bob
2. On Device 2 (Bob), click "Reject" button

**Expected Results:**
- [ ] Notification disappears immediately on Device 2
- [ ] Device 1 shows "Call rejected" or "Bob declined" message
- [ ] Call interface closes on Device 1
- [ ] No call record shows as "active" (only "rejected")
- [ ] Both devices return to normal conversation view

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 2.4: Call Times Out (Unanswered)
**Priority:** P1

**Steps:**
1. From Device 1 (Alice), initiate call to Bob
2. On Device 2 (Bob), do NOT answer for 60 seconds

**Expected Results:**
- [ ] After ~60 seconds, call times out automatically
- [ ] Device 1 shows "No answer" or "Call missed" message
- [ ] Device 2 notification disappears
- [ ] Call status in database: "missed"

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Section 3: Audio Controls During Call

#### Test 3.1: Mute Microphone
**Priority:** P0

**Steps:**
1. Establish active call between Alice and Bob
2. On Device 1 (Alice), click "Mute" button
3. Speak into microphone
4. Observe Device 2 (Bob)

**Expected Results:**
- [ ] Mute button changes state (icon changes, color changes to red/destructive)
- [ ] Tooltip shows "Unmute" when hovering
- [ ] Device 2 does NOT hear Alice's audio
- [ ] Device 2 shows visual indicator that Alice is muted (if implemented)
- [ ] Alice can still hear Bob's audio

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 3.2: Unmute Microphone
**Priority:** P0

**Steps:**
1. Continuing from Test 3.1 (Alice is muted)
2. On Device 1 (Alice), click "Unmute" button
3. Speak into microphone

**Expected Results:**
- [ ] Mute button returns to original state
- [ ] Tooltip shows "Mute"
- [ ] Device 2 hears Alice's audio clearly
- [ ] Mute indicator disappears on Device 2

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 3.3: Rapid Toggle Mute (Stress Test)
**Priority:** P2

**Steps:**
1. During active call, rapidly click mute/unmute 10 times
2. End on "unmuted" state
3. Verify audio works

**Expected Results:**
- [ ] UI remains responsive, no lag
- [ ] Final state is consistent (unmuted)
- [ ] Audio works correctly after toggling
- [ ] No race conditions or state inconsistencies

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 3.4: Both Users Mute Simultaneously
**Priority:** P2

**Steps:**
1. During active call, both Alice and Bob click mute at same time
2. Verify both are muted
3. Both unmute

**Expected Results:**
- [ ] Both users show muted state correctly
- [ ] No audio transmitted in either direction
- [ ] Both can unmute independently
- [ ] Audio resumes correctly

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Section 4: Video Controls During Call

#### Test 4.1: Disable Video
**Priority:** P0

**Steps:**
1. Establish active call with video enabled
2. On Device 1 (Alice), click "Turn off video" button

**Expected Results:**
- [ ] Video toggle button changes state (icon/color changes)
- [ ] Alice's local video stops (black screen or placeholder)
- [ ] Device 2 shows placeholder for Alice's video (e.g., avatar or "Video off")
- [ ] Alice still sees Bob's video
- [ ] Audio continues unaffected

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 4.2: Re-enable Video
**Priority:** P0

**Steps:**
1. Continuing from Test 4.1 (Alice's video is off)
2. On Device 1 (Alice), click "Turn on video" button

**Expected Results:**
- [ ] Video toggle button returns to original state
- [ ] Alice's local video resumes within 1-2 seconds
- [ ] Device 2 sees Alice's video again
- [ ] Video quality is acceptable

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 4.3: Switch Camera (Mobile Only)
**Priority:** P2

**Steps:**
1. On mobile device, establish active call
2. Tap "Switch camera" button (front/back toggle)

**Expected Results:**
- [ ] Camera switches smoothly (front ↔ back)
- [ ] Remote user sees updated video feed
- [ ] No call interruption
- [ ] Video quality maintained

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked [ ] N/A (Desktop)

---

### Section 5: Call Termination

#### Test 5.1: Initiator Hangs Up
**Priority:** P0

**Steps:**
1. Establish active call (Alice initiated)
2. On Device 1 (Alice), click "Hang up" button

**Expected Results:**
- [ ] Call ends immediately on both devices
- [ ] Call interface closes/dismisses
- [ ] Both return to normal conversation view
- [ ] Call status in database: "ended"
- [ ] Call duration is recorded accurately (check DB or API)
- [ ] Media streams are stopped (camera light turns off)

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

**Call Duration (DB):** ___ seconds

---

#### Test 5.2: Receiver Hangs Up
**Priority:** P0

**Steps:**
1. Establish active call (Alice initiated, Bob accepted)
2. On Device 2 (Bob), click "Hang up" button

**Expected Results:**
- [ ] Call ends immediately on both devices
- [ ] Call interface closes on both
- [ ] Call status: "ended"
- [ ] Call duration recorded

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 5.3: Close Browser Tab During Call
**Priority:** P2

**Steps:**
1. Establish active call
2. On Device 1 (Alice), close browser tab (or kill app on mobile)
3. Observe Device 2 (Bob)

**Expected Results:**
- [ ] Within 5-10 seconds, Device 2 shows "Connection lost" or "User disconnected"
- [ ] Call ends gracefully
- [ ] No lingering connections or resources

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Section 6: Network Resilience

#### Test 6.1: Disable WiFi Mid-Call
**Priority:** P1

**Steps:**
1. Establish active call on WiFi
2. On Device 1 (Alice), turn off WiFi
3. Wait 10 seconds
4. Re-enable WiFi

**Expected Results:**
- [ ] UI shows "Connection lost" or "Reconnecting..." message
- [ ] After 10s timeout, call ends OR
- [ ] After WiFi restored, call reconnects automatically (if implemented)
- [ ] No app crash or freeze

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 6.2: Poor Network Quality (3G Simulation)
**Priority:** P2

**Steps:**
1. Use Chrome DevTools to throttle network to "Fast 3G"
2. Establish call

**Expected Results:**
- [ ] Call connects (may take longer)
- [ ] Video quality degrades gracefully
- [ ] Audio remains stable (prioritized over video)
- [ ] No call drop

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Section 7: Permission Handling

#### Test 7.1: Camera Permission Denied
**Priority:** P0

**Steps:**
1. In browser settings, deny camera permission
2. Attempt to start call

**Expected Results:**
- [ ] Error message displayed: "Camera permission denied"
- [ ] Clear instructions provided to grant permission
- [ ] "Retry" button available
- [ ] Call does not proceed without permission (or falls back to audio-only)

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 7.2: Microphone Permission Denied
**Priority:** P0

**Steps:**
1. In browser settings, deny microphone permission
2. Attempt to start call

**Expected Results:**
- [ ] Error message: "Microphone permission denied"
- [ ] Instructions to enable in browser settings
- [ ] "Retry" button available

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 7.3: Both Permissions Denied
**Priority:** P1

**Steps:**
1. Deny both camera and microphone
2. Attempt to start call

**Expected Results:**
- [ ] Combined error message
- [ ] Link to help article or settings guide
- [ ] Call blocked until permissions granted

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 7.4: Grant Permissions via Retry
**Priority:** P1

**Steps:**
1. Start with permissions denied (Test 7.3)
2. Grant both permissions in browser settings
3. Click "Retry" button in app

**Expected Results:**
- [ ] App successfully requests media again
- [ ] Call proceeds normally
- [ ] No page refresh required

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Section 8: Data Persistence

#### Test 8.1: Verify Call Record Created on Initiation
**Priority:** P0

**Steps:**
1. Initiate call
2. Query database or call API: `GET /api/calls?conversationId=xxx`

**Expected Results:**
- [ ] Call record exists with status "ringing" or "pending"
- [ ] Correct conversation ID
- [ ] Initiator user ID correct
- [ ] Timestamp accurate

**API/DB Query:**
___________________________________________________________

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 8.2: Verify Participants Logged on Accept
**Priority:** P0

**Steps:**
1. User B accepts call
2. Query call record: `GET /api/calls/:callId`

**Expected Results:**
- [ ] Call status updated to "active"
- [ ] Participants array includes both users
- [ ] Join timestamps recorded for each participant

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 8.3: Verify Call Duration and End Time Recorded
**Priority:** P0

**Steps:**
1. Complete call (hang up after ~30 seconds)
2. Query call record

**Expected Results:**
- [ ] Call status: "ended"
- [ ] End timestamp recorded
- [ ] Duration calculated correctly (~30 seconds)

**Expected Duration:** 30s
**Actual Duration:** ___s

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 8.4: Query Call History
**Priority:** P1

**Steps:**
1. Complete 3 calls in same conversation
2. Query: `GET /api/conversations/:conversationId/calls`

**Expected Results:**
- [ ] Returns all 3 calls
- [ ] Sorted by most recent first
- [ ] Each call has complete data (participants, duration, status)

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Section 9: Conversation Type Restrictions

#### Test 9.1: DIRECT Conversation - Call Button Visible
**Priority:** P0

**Steps:**
1. Navigate to DIRECT conversation
2. Locate call button

**Expected Results:**
- [ ] "Start Call" button is visible
- [ ] Button is enabled (not disabled)
- [ ] Tooltip shows "Start call" or similar

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 9.2: GROUP Conversation (2 Members) - Call Allowed
**Priority:** P0

**Steps:**
1. Navigate to GROUP conversation with exactly 2 members
2. Locate call button
3. Initiate call

**Expected Results:**
- [ ] "Start Call" button visible and enabled
- [ ] Call proceeds normally (same as DIRECT)

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 9.3: PUBLIC Conversation - Call Button Hidden
**Priority:** P0

**Steps:**
1. Navigate to PUBLIC conversation
2. Look for call button

**Expected Results:**
- [ ] "Start Call" button NOT visible OR
- [ ] Button disabled with tooltip: "Calls not available in public conversations"

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 9.4: GROUP Conversation (3+ Members) - Call Blocked Phase 1A
**Priority:** P1

**Steps:**
1. Navigate to GROUP conversation with 3+ members
2. Locate call button

**Expected Results:**
- [ ] Button visible but disabled OR
- [ ] Tooltip: "Group calls support max 2 participants in Phase 1A"
- [ ] Cannot initiate call

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Section 10: User Experience & UI

#### Test 10.1: Call Interface Layout (Desktop)
**Priority:** P0

**Steps:**
1. Establish call on desktop (1920×1080 resolution)
2. Observe layout

**Expected Results:**
- [ ] Local video in corner or side (picture-in-picture style)
- [ ] Remote video fills main area
- [ ] Controls clearly visible and accessible
- [ ] No overlapping UI elements
- [ ] Responsive to window resize

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 10.2: Call Interface Layout (Mobile)
**Priority:** P1

**Steps:**
1. Establish call on mobile device (375×667 typical)
2. Observe layout

**Expected Results:**
- [ ] Full-screen or nearly full-screen video
- [ ] Controls at bottom or floating
- [ ] Touch targets large enough (min 44×44px)
- [ ] Portrait and landscape orientations work

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 10.3: Loading States
**Priority:** P1

**Steps:**
1. Initiate call
2. Observe UI during connection phase

**Expected Results:**
- [ ] Loading spinner or "Connecting..." message
- [ ] Placeholder for remote video until connected
- [ ] No blank screens or confusion

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 10.4: Error Messages Clarity
**Priority:** P1

**Steps:**
1. Trigger various errors (deny permissions, no network, etc.)
2. Evaluate error messages

**Expected Results:**
- [ ] Error messages are clear and non-technical
- [ ] Actionable instructions provided ("Click here to enable camera")
- [ ] Error UI is noticeable but not alarming

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Section 11: Cross-Browser Compatibility

#### Test 11.1: Chrome (Desktop)
**Priority:** P0

**Browser:** Chrome ___ (version)
**OS:** ___________

**Steps:**
1. Run Tests 2.2 (Accept call), 3.1 (Mute), 4.1 (Video off), 5.1 (Hang up)

**Results:**
- Test 2.2: [ ] Pass [ ] Fail
- Test 3.1: [ ] Pass [ ] Fail
- Test 4.1: [ ] Pass [ ] Fail
- Test 5.1: [ ] Pass [ ] Fail

**Overall Status:** [ ] Pass [ ] Fail

---

#### Test 11.2: Firefox (Desktop)
**Priority:** P0

**Browser:** Firefox ___ (version)
**OS:** ___________

**Steps:**
1. Run Tests 2.2, 3.1, 4.1, 5.1

**Results:**
- Test 2.2: [ ] Pass [ ] Fail
- Test 3.1: [ ] Pass [ ] Fail
- Test 4.1: [ ] Pass [ ] Fail
- Test 5.1: [ ] Pass [ ] Fail

**Overall Status:** [ ] Pass [ ] Fail

---

#### Test 11.3: Safari (Desktop)
**Priority:** P0

**Browser:** Safari ___ (version)
**OS:** macOS ___

**Steps:**
1. Run Tests 2.2, 3.1, 4.1, 5.1

**Results:**
- Test 2.2: [ ] Pass [ ] Fail
- Test 3.1: [ ] Pass [ ] Fail
- Test 4.1: [ ] Pass [ ] Fail
- Test 5.1: [ ] Pass [ ] Fail

**Overall Status:** [ ] Pass [ ] Fail

---

#### Test 11.4: Chrome Mobile (Android)
**Priority:** P1

**Browser:** Chrome Mobile ___
**OS:** Android ___
**Device:** ___________

**Steps:**
1. Run Tests 2.2, 3.1, 4.1, 5.1

**Results:**
- Test 2.2: [ ] Pass [ ] Fail
- Test 3.1: [ ] Pass [ ] Fail
- Test 4.1: [ ] Pass [ ] Fail
- Test 5.1: [ ] Pass [ ] Fail

**Overall Status:** [ ] Pass [ ] Fail

---

#### Test 11.5: Safari Mobile (iOS)
**Priority:** P1

**Browser:** Safari Mobile ___
**OS:** iOS ___
**Device:** ___________

**Steps:**
1. Run Tests 2.2, 3.1, 4.1, 5.1

**Results:**
- Test 2.2: [ ] Pass [ ] Fail
- Test 3.1: [ ] Pass [ ] Fail
- Test 4.1: [ ] Pass [ ] Fail
- Test 5.1: [ ] Pass [ ] Fail

**Overall Status:** [ ] Pass [ ] Fail

---

### Section 12: Performance & Quality

#### Test 12.1: Connection Time Measurement
**Priority:** P0

**Steps:**
1. Start timer when "Start Call" clicked
2. Stop when remote video appears

**Target:** <2 seconds for initiation, <3 seconds for connection

**Results:**
- Call 1: ___ seconds
- Call 2: ___ seconds
- Call 3: ___ seconds
- Average: ___ seconds

**Status:** [ ] Pass (avg < 3s) [ ] Fail

---

#### Test 12.2: Audio Latency (Clap Test)
**Priority:** P1

**Steps:**
1. During call, Device 1 claps hands
2. Device 2 listens for echo/delay

**Target:** <200ms (imperceptible)

**Perceived Latency:**
- [ ] No noticeable delay (<100ms)
- [ ] Slight delay but acceptable (100-200ms)
- [ ] Noticeable delay (200-500ms)
- [ ] Significant delay (>500ms)

**Status:** [ ] Pass [ ] Fail

---

#### Test 12.3: Video Quality
**Priority:** P1

**Steps:**
1. Establish call with good network
2. Evaluate video quality

**Expected:**
- [ ] Clear facial features visible
- [ ] Smooth motion (no stuttering)
- [ ] Acceptable resolution (at least 480p)
- [ ] No pixelation or artifacts

**Actual Resolution:** ___ × ___
**Frame Rate:** ~___ fps (estimated)

**Status:** [ ] Pass [ ] Fail

---

#### Test 12.4: Memory Leak Check
**Priority:** P2

**Steps:**
1. Open Chrome DevTools > Memory
2. Take heap snapshot
3. Conduct 5-minute call
4. Hang up
5. Take second heap snapshot
6. Compare

**Results:**
- Initial heap size: ___ MB
- Final heap size: ___ MB
- Increase: ___ MB

**Status:** [ ] Pass (<150MB increase) [ ] Fail

---

#### Test 12.5: Console Errors
**Priority:** P0

**Steps:**
1. Open DevTools console
2. Conduct full call flow (initiate → accept → controls → hang up)
3. Review console

**Expected:**
- [ ] No errors (red messages)
- [ ] No warnings related to calls (yellow acceptable for other features)

**Actual Errors (if any):**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail

---

### Section 13: Accessibility

#### Test 13.1: Keyboard Navigation
**Priority:** P1

**Steps:**
1. Using only keyboard (no mouse), navigate to conversation
2. Tab to "Start Call" button
3. Press Enter to initiate call
4. Tab through controls, press Space to toggle

**Expected Results:**
- [ ] All interactive elements reachable via Tab
- [ ] Focus indicators clearly visible
- [ ] Enter/Space keys activate buttons
- [ ] Esc key cancels/ends call (if implemented)

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 13.2: Screen Reader Compatibility
**Priority:** P2

**Steps:**
1. Enable screen reader (VoiceOver on Mac, NVDA on Windows)
2. Navigate call interface

**Expected Results:**
- [ ] All buttons announced with clear labels
- [ ] Call status announced ("Connected", "Muted", etc.)
- [ ] Error messages read aloud

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

### Section 14: Edge Cases

#### Test 14.1: Both Users Initiate Call Simultaneously
**Priority:** P2

**Steps:**
1. On Device 1 and Device 2, click "Start Call" at exact same time
2. Observe behavior

**Expected Results:**
- [ ] One call succeeds (first to reach server)
- [ ] Other call fails gracefully with message like "Call already in progress"
- [ ] No duplicate call records

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 14.2: Initiator Hangs Up Before Receiver Answers
**Priority:** P1

**Steps:**
1. Device 1 initiates call
2. Before Device 2 answers, Device 1 clicks "Cancel" or hangs up
3. Observe Device 2

**Expected Results:**
- [ ] Device 2 notification disappears
- [ ] Device 2 shows "Call cancelled" briefly
- [ ] Call status: "cancelled"

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

#### Test 14.3: User Logged Out When Call Initiated
**Priority:** P1

**Steps:**
1. Log out Device 2 (Bob)
2. On Device 1 (Alice), try to call Bob

**Expected Results:**
- [ ] Call fails immediately or shows "User offline"
- [ ] No persistent ringing
- [ ] Clear error message

**Actual Results:**
___________________________________________________________

**Status:** [ ] Pass [ ] Fail [ ] Blocked

---

## Test Summary

### Overall Statistics
- **Total Tests Executed:** ___ / 60
- **Passed:** ___
- **Failed:** ___
- **Blocked:** ___
- **Pass Rate:** ____%

### Priority Breakdown
- **P0 Tests Passed:** ___ / 28
- **P1 Tests Passed:** ___ / 22
- **P2 Tests Passed:** ___ / 10

### Critical Issues Found
1. ___________________________________________________________
2. ___________________________________________________________
3. ___________________________________________________________

### Blocker Issues (Prevent Release)
1. ___________________________________________________________

### High Priority Issues
1. ___________________________________________________________
2. ___________________________________________________________

### Medium/Low Priority Issues
1. ___________________________________________________________

---

## Sign-Off

### Recommendation
- [ ] **APPROVE for Phase 1B** - All P0 tests pass, no blockers
- [ ] **APPROVE with caveats** - Minor issues to be addressed in Phase 1B
- [ ] **DO NOT APPROVE** - Critical issues must be fixed first

### Tester Sign-Off
**Name:** ___________________
**Date:** ___________________
**Signature:** ___________________

### Stakeholder Approval
**Product Owner:** ___________________ Date: ______
**Engineering Lead:** ___________________ Date: ______
**QA Lead:** ___________________ Date: ______

---

## Appendix: Bug Report Template

**Bug ID:** MEESHY-CALL-___
**Severity:** [ ] Critical [ ] High [ ] Medium [ ] Low
**Priority:** [ ] P0 [ ] P1 [ ] P2
**Test Case:** Test X.Y

**Summary:**
___________________________________________________________

**Steps to Reproduce:**
1. ___________________________________________________________
2. ___________________________________________________________
3. ___________________________________________________________

**Expected Result:**
___________________________________________________________

**Actual Result:**
___________________________________________________________

**Screenshots/Video:**
[Attach files]

**Environment:**
- Browser: ___________
- OS: ___________
- Device: ___________

**Console Errors:**
```
[Paste any relevant console errors]
```

**Additional Notes:**
___________________________________________________________
