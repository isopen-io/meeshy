# Phase 1A Test Plan: P2P Video Calls MVP

**Version:** 1.0
**Date:** 2025-10-28
**Status:** In Progress
**Branch:** `feature/vc-tests-e2e`

## Executive Summary

This test plan defines the comprehensive testing strategy for Phase 1A of the Meeshy video calling feature - a Peer-to-Peer (P2P) MVP supporting up to 2 participants. The plan encompasses unit tests, integration tests, end-to-end tests, and manual validation scenarios to ensure reliability, performance, and user experience quality before progressing to Phase 1B.

**Success Criteria:**
- All automated tests passing with >80% code coverage
- All manual test scenarios executed successfully
- No critical or high-severity bugs
- Performance benchmarks met (connection time <2s, latency <200ms)
- Cross-browser compatibility verified (Chrome, Firefox, Safari)
- Zero console errors or memory leaks

---

## 1. Test Strategy

### 1.1 Testing Pyramid Approach

```
        /\
       /E2E\        <- 15% (Critical user flows)
      /------\
     /  API   \     <- 25% (REST + Socket.IO)
    /----------\
   /   Unit     \   <- 60% (Services, stores, utilities)
  /--------------\
```

### 1.2 Test Layers

#### **Layer 1: Unit Tests (60% of total tests)**

**Backend (Gateway Service)**
- `CallService` class methods
- Socket.IO event handlers
- Database models and queries
- Validation functions
- Utility helpers

**Frontend (Next.js)**
- Zustand call store
- Custom hooks (`useWebRTC`, `useCallControls`)
- UI components (isolated)
- Utility functions
- WebRTC adapter layer

**Target:** 85%+ code coverage

#### **Layer 2: Integration Tests (25% of total tests)**

**Backend API**
- REST endpoints (`POST /api/calls`, `GET /api/calls/:id`, etc.)
- Socket.IO event flows
- Database persistence
- Authentication middleware
- Error handling

**Frontend**
- Store + API client integration
- Component + hook integration
- WebRTC signaling flow
- Socket.IO connection handling

**Target:** All API endpoints covered, all Socket.IO events verified

#### **Layer 3: End-to-End Tests (15% of total tests)**

**Critical User Flows**
- Complete call initiation → acceptance → conversation → hang up
- Call rejection flow
- Audio/video controls during call
- Permission handling
- Error recovery scenarios

**Target:** All critical paths covered, <5 minute execution time

### 1.3 Test Environment Strategy

| Environment | Purpose | Data | Infrastructure |
|-------------|---------|------|----------------|
| **Local Dev** | Unit tests, rapid iteration | Mock data | In-memory DB, mock WebRTC |
| **CI/CD (GitHub Actions)** | Automated test suite | Fixtures | Docker containers, headless browsers |
| **Staging** | Manual testing, E2E validation | Anonymized production-like | Full stack deployed |
| **Production** | Smoke tests only | Real data | Live environment |

---

## 2. Test Scenarios

### 2.1 Functional Test Scenarios

#### **F1: Call Initiation**

| Test ID | Scenario | Expected Result | Priority |
|---------|----------|----------------|----------|
| F1.1 | User A initiates video call from DIRECT conversation | Call session created, User B receives notification | P0 |
| F1.2 | User A initiates audio-only call | Call created with `type: 'audio'` | P1 |
| F1.3 | Attempt to initiate call from PUBLIC conversation | Error: "Calls not supported for PUBLIC conversations" | P0 |
| F1.4 | Attempt to initiate call when already in active call | Error: "Already in an active call" | P1 |
| F1.5 | Initiate call from GROUP conversation (2 members) | Call session created successfully | P0 |
| F1.6 | Initiate call with no internet connection | Error: "Connection failed" with retry option | P2 |

#### **F2: Call Acceptance/Rejection**

| Test ID | Scenario | Expected Result | Priority |
|---------|----------|----------------|----------|
| F2.1 | User B accepts incoming call | Call status → `active`, WebRTC connection established | P0 |
| F2.2 | User B rejects incoming call | Call status → `rejected`, notification dismissed | P0 |
| F2.3 | User B ignores call for 60 seconds | Call times out, status → `missed` | P1 |
| F2.4 | User B's device is offline when call initiated | Call shows as "unreachable" | P2 |
| F2.5 | Accept call with camera permission denied | Call connects audio-only, UI shows camera error | P1 |
| F2.6 | Accept call with microphone permission denied | Error displayed, option to retry with permissions | P1 |

#### **F3: During Call - Audio Controls**

| Test ID | Scenario | Expected Result | Priority |
|---------|----------|----------------|----------|
| F3.1 | User A mutes microphone | Audio stream disabled, User B sees mute indicator | P0 |
| F3.2 | User A unmutes microphone | Audio stream enabled, indicator updated | P0 |
| F3.3 | User A toggles mute 10 times rapidly | State remains consistent, no race conditions | P2 |
| F3.4 | Both users mute simultaneously | Both muted states independent and correct | P2 |

#### **F4: During Call - Video Controls**

| Test ID | Scenario | Expected Result | Priority |
|---------|----------|----------------|----------|
| F4.1 | User A disables video | Video track stopped, User B sees placeholder | P0 |
| F4.2 | User A re-enables video | Video track resumes, User B sees live feed | P0 |
| F4.3 | User A switches camera (mobile) | Video source changes smoothly | P2 |
| F4.4 | Low bandwidth detected | Video quality adapts automatically | P1 |

#### **F5: Call Termination**

| Test ID | Scenario | Expected Result | Priority |
|---------|----------|----------------|----------|
| F5.1 | User A (initiator) hangs up | Call ends for both, status → `ended`, duration recorded | P0 |
| F5.2 | User B (receiver) hangs up | Call ends for both, status → `ended`, duration recorded | P0 |
| F5.3 | User A's browser crashes mid-call | User B sees "Connection lost", call ends after timeout | P1 |
| F5.4 | Network drops mid-call | Reconnection attempt (10s), then call ends | P1 |
| F5.5 | User closes browser tab during call | Call ends gracefully, other user notified | P2 |

#### **F6: Data Persistence**

| Test ID | Scenario | Expected Result | Priority |
|---------|----------|----------------|----------|
| F6.1 | Call initiated → check database | Call record exists with correct conversation ID | P0 |
| F6.2 | Call accepted → check database | Call participants logged with join timestamp | P0 |
| F6.3 | Call ended → check database | Call duration, end timestamp, final status recorded | P0 |
| F6.4 | Query call history API | Returns all calls for conversation, sorted by date | P1 |

#### **F7: Conversation Type Restrictions**

| Test ID | Scenario | Expected Result | Priority |
|---------|----------|----------------|----------|
| F7.1 | DIRECT conversation → call button visible | Button enabled, tooltip shows "Start call" | P0 |
| F7.2 | GROUP conversation (2 users) → call button visible | Button enabled (Phase 1A supports 2 max) | P0 |
| F7.3 | PUBLIC conversation → call button hidden | No call button rendered | P0 |
| F7.4 | GROUP conversation (>2 users) → call button disabled | Button disabled with tooltip "Max 2 participants in Phase 1A" | P1 |

### 2.2 Non-Functional Test Scenarios

#### **NF1: Performance Benchmarks**

| Test ID | Metric | Target | Measurement Method | Priority |
|---------|--------|--------|-------------------|----------|
| NF1.1 | Call initiation time | <2 seconds | Time from button click to ringing | P0 |
| NF1.2 | WebRTC connection time | <3 seconds | Time from accept to video visible | P0 |
| NF1.3 | Audio latency | <200ms | Clap test (audible delay) | P1 |
| NF1.4 | Video latency | <300ms | Hand wave visual delay | P1 |
| NF1.5 | Memory usage during 10-min call | <150MB increase | Chrome DevTools memory profiler | P2 |
| NF1.6 | CPU usage during call | <30% on modern hardware | OS activity monitor | P2 |

#### **NF2: Cross-Browser Compatibility**

| Test ID | Browser | Version | OS | Status | Priority |
|---------|---------|---------|----|---------| ---------|
| NF2.1 | Chrome | Latest stable | macOS | ✅ Must Pass | P0 |
| NF2.2 | Chrome | Latest stable | Windows 11 | ✅ Must Pass | P0 |
| NF2.3 | Firefox | Latest stable | macOS | ✅ Must Pass | P0 |
| NF2.4 | Safari | Latest stable | macOS | ✅ Must Pass | P0 |
| NF2.5 | Edge | Latest stable | Windows 11 | ✅ Should Pass | P1 |
| NF2.6 | Chrome Mobile | Latest | Android 13+ | ✅ Should Pass | P1 |
| NF2.7 | Safari Mobile | Latest | iOS 16+ | ✅ Should Pass | P1 |
| NF2.8 | Firefox | ESR | Linux | ⚠️ Nice to Have | P2 |

#### **NF3: Responsive Design**

| Test ID | Viewport | Expected Layout | Priority |
|---------|----------|----------------|----------|
| NF3.1 | Desktop (1920×1080) | Full call interface, side-by-side video | P0 |
| NF3.2 | Laptop (1366×768) | Compact interface, stacked video | P0 |
| NF3.3 | Tablet (768×1024) | Touch-optimized controls, portrait mode | P1 |
| NF3.4 | Mobile (375×667) | Full-screen video, floating controls | P1 |

#### **NF4: Network Resilience**

| Test ID | Network Condition | Expected Behavior | Priority |
|---------|-------------------|-------------------|----------|
| NF4.1 | 4G LTE (good signal) | Smooth call, HD quality | P0 |
| NF4.2 | 3G (moderate signal) | Call maintained, reduced quality | P1 |
| NF4.3 | WiFi → Cellular handoff | Brief reconnection, call continues | P2 |
| NF4.4 | Packet loss 5% | Slight quality degradation, call stable | P2 |
| NF4.5 | Bandwidth throttled to 256kbps | Audio-only fallback, video disabled | P2 |

#### **NF5: Accessibility**

| Test ID | Requirement | Implementation | Priority |
|---------|-------------|----------------|----------|
| NF5.1 | Screen reader support | ARIA labels on all controls | P1 |
| NF5.2 | Keyboard navigation | Tab order logical, Enter/Space activate | P1 |
| NF5.3 | High contrast mode | Controls visible in Windows High Contrast | P2 |
| NF5.4 | Captions (future) | Infrastructure ready for Phase 2 | P3 |

### 2.3 Error Handling Scenarios

#### **E1: Permission Errors**

| Test ID | Error Type | User Action Required | Recovery Path | Priority |
|---------|-----------|---------------------|---------------|----------|
| E1.1 | Camera permission denied | Grant permission in browser settings | Retry button → re-request permissions | P0 |
| E1.2 | Microphone permission denied | Grant permission in browser settings | Retry button → re-request permissions | P0 |
| E1.3 | Both permissions denied | Grant both permissions | Clear error message with instructions | P1 |
| E1.4 | Permissions granted then revoked | Re-grant permissions | Call terminates gracefully, error shown | P2 |

#### **E2: WebRTC Connection Errors**

| Test ID | Error Type | Possible Causes | User Feedback | Priority |
|---------|-----------|----------------|---------------|----------|
| E2.1 | ICE connection failed | Firewall, no TURN server | "Connection failed. Check firewall settings." | P0 |
| E2.2 | Offer/Answer exchange timeout | Network delay, server issue | "Unable to connect. Please try again." | P1 |
| E2.3 | Peer connection dropped | Network instability | "Connection lost. Reconnecting..." → timeout | P1 |
| E2.4 | Media tracks not received | Browser bug, codec mismatch | "Media error. Try refreshing the page." | P2 |

#### **E3: Server/API Errors**

| Test ID | Error Type | HTTP Status | User Feedback | Priority |
|---------|-----------|------------|---------------|----------|
| E3.1 | Conversation not found | 404 | "Conversation not found" | P0 |
| E3.2 | User not conversation member | 403 | "You don't have permission to call this conversation" | P0 |
| E3.3 | Server unavailable | 503 | "Service temporarily unavailable. Try again later." | P1 |
| E3.4 | Rate limit exceeded | 429 | "Too many call attempts. Wait 1 minute." | P2 |

#### **E4: Edge Cases**

| Test ID | Scenario | Expected Handling | Priority |
|---------|----------|-------------------|----------|
| E4.1 | User B logged out when call initiated | Call fails immediately, User A notified | P1 |
| E4.2 | User A initiates, then immediately hangs up | Call cancelled before User B answers | P1 |
| E4.3 | Both users initiate call simultaneously | One call succeeds (first received), other fails gracefully | P2 |
| E4.4 | Call initiated with 0 conversation members | Validation error: "Invalid conversation" | P2 |

---

## 3. Test Data Requirements

### 3.1 Test User Accounts

| User ID | Email | Role | Purpose |
|---------|-------|------|---------|
| `user-a-test` | user-a@meeshy.test | Standard user | Call initiator |
| `user-b-test` | user-b@meeshy.test | Standard user | Call receiver |
| `user-c-test` | user-c@meeshy.test | Standard user | Group call participant (Phase 1B) |

### 3.2 Test Conversations

| Conversation ID | Type | Participants | Purpose |
|----------------|------|--------------|---------|
| `conv-direct-ab` | DIRECT | user-a, user-b | Primary P2P call testing |
| `conv-group-ab` | GROUP | user-a, user-b | GROUP with 2 members (allowed) |
| `conv-group-abc` | GROUP | user-a, user-b, user-c | GROUP with 3 members (blocked Phase 1A) |
| `conv-public-test` | PUBLIC | user-a, user-b, ... | Verify calls blocked |

### 3.3 Mock Media Streams

**Video Stream:**
- Resolution: 640×480 (VGA)
- Frame rate: 30fps
- Format: Mock canvas stream with blue background

**Audio Stream:**
- Sample rate: 48kHz
- Mock oscillator generating 440Hz tone

**Implementation:** `frontend/__tests__/utils/mock-media-stream.ts`

### 3.4 Test Database Seeds

```sql
-- Seed test users
INSERT INTO users (id, email, username, created_at) VALUES
  ('user-a-test', 'user-a@meeshy.test', 'Alice Test', NOW()),
  ('user-b-test', 'user-b@meeshy.test', 'Bob Test', NOW());

-- Seed test conversations
INSERT INTO conversations (id, type, created_at) VALUES
  ('conv-direct-ab', 'DIRECT', NOW()),
  ('conv-group-ab', 'GROUP', NOW()),
  ('conv-public-test', 'PUBLIC', NOW());

-- Seed conversation members
INSERT INTO conversation_members (conversation_id, user_id, role) VALUES
  ('conv-direct-ab', 'user-a-test', 'member'),
  ('conv-direct-ab', 'user-b-test', 'member'),
  ('conv-group-ab', 'user-a-test', 'admin'),
  ('conv-group-ab', 'user-b-test', 'member');
```

---

## 4. Test Implementation Details

### 4.1 Backend Unit Tests

**File:** `gateway/src/__tests__/call-service.test.ts`

**Framework:** Jest + Supertest
**Coverage Target:** 90%+

**Test Suites:**
- `CallService.initiateCall()` - 8 tests
- `CallService.joinCall()` - 6 tests
- `CallService.leaveCall()` - 5 tests
- `CallService.getCallById()` - 4 tests
- `CallService.getCallHistory()` - 3 tests

**Key Mocks:**
- Database client (Prisma/MongoDB)
- Socket.IO server
- Authentication context

### 4.2 Backend API Integration Tests

**File:** `gateway/src/__tests__/calls-api.test.ts`

**Framework:** Jest + Supertest
**Coverage Target:** 100% of API endpoints

**Test Suites:**
- `POST /api/calls` - 7 tests
- `GET /api/calls/:callId` - 4 tests
- `POST /api/calls/:callId/participants` - 5 tests
- `DELETE /api/calls/:callId/participants/:participantId` - 4 tests
- `GET /api/conversations/:conversationId/calls` - 3 tests

**Key Setup:**
- Express app with real middleware
- In-memory test database
- Mock authentication tokens

### 4.3 Backend Socket.IO Tests

**File:** `gateway/src/__tests__/call-socket.test.ts`

**Framework:** Jest + socket.io-client
**Coverage Target:** 100% of event handlers

**Event Tests:**
- `call:initiate` → `call:initiated`, `call:incoming`
- `call:accept` → `call:accepted`, `call:active`
- `call:reject` → `call:rejected`
- `call:leave` → `call:participant-left`, `call:ended`
- `call:signal` → `call:signal` (WebRTC signaling)
- `call:mute` → `call:participant-muted`
- `call:video-toggle` → `call:participant-video-toggled`

### 4.4 Frontend Unit Tests

**File:** `frontend/__tests__/stores/call-store.test.ts`

**Framework:** Jest + @testing-library/react
**Coverage Target:** 95%+

**Test Suites:**
- Store initialization
- State mutations (setCurrentCall, setInCall, etc.)
- Control toggles (audio, video)
- Remote stream management
- Reset functionality

**File:** `frontend/__tests__/hooks/use-webrtc.test.ts`

**Test Suites:**
- Peer connection creation
- Offer/answer exchange
- ICE candidate handling
- Track handling
- Cleanup on unmount

### 4.5 Frontend Component Tests

**File:** `frontend/__tests__/components/CallInterface.test.tsx`

**Framework:** Jest + @testing-library/react

**Test Cases:**
- Renders local video stream
- Renders remote video stream
- Mute button toggles correctly
- Video toggle button works
- Hang up button ends call
- Shows loading state during connection
- Displays error messages

### 4.6 End-to-End Tests

**File:** `frontend/e2e/video-calls.spec.ts`

**Framework:** Playwright
**Execution Time Target:** <5 minutes

**Test Scenarios:**
1. **Happy Path (P0):** Initiate → Accept → Talk → Hang up
2. **Rejection Flow (P0):** Initiate → Reject → Verify state
3. **Controls (P1):** Test mute/unmute, video on/off
4. **Permissions (P1):** Deny camera → show error
5. **Multi-Browser (P2):** Chrome + Firefox interop

**Configuration:**
```typescript
// playwright.config.ts
export default {
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  use: {
    permissions: ['camera', 'microphone'], // Grant by default
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream', // Skip permission prompts
        '--use-fake-device-for-media-stream', // Mock camera/mic
      ],
    },
  },
};
```

---

## 5. Test Execution Strategy

### 5.1 Local Development

**Run all tests:**
```bash
# Backend
cd gateway
npm run test

# Frontend
cd frontend
npm run test

# E2E
cd frontend
npm run test:e2e
```

**Run specific suites:**
```bash
# Backend unit tests only
npm run test:unit

# API integration tests only
npm run test:integration

# Frontend unit tests only
npm run test:unit

# E2E critical path only
npm run test:e2e:critical
```

### 5.2 CI/CD Pipeline (GitHub Actions)

**Workflow:** `.github/workflows/test-video-calls.yml`

```yaml
name: Test Video Calls

on:
  push:
    branches: [feature/vc-tests-e2e, main]
  pull_request:
    paths:
      - 'gateway/src/services/CallService*'
      - 'gateway/src/routes/calls*'
      - 'gateway/src/socketio/call*'
      - 'frontend/stores/call-store*'
      - 'frontend/components/**/Call*'

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: cd gateway && npm ci
      - run: cd gateway && npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: gateway/coverage/lcov.info

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: cd frontend && npm ci
      - run: cd frontend && npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          files: frontend/coverage/lcov.info

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npx playwright install --with-deps
      - run: docker-compose -f docker-compose.test.yml up -d
      - run: cd frontend && npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: frontend/playwright-report/
```

**Execution Frequency:**
- Unit tests: Every commit
- Integration tests: Every commit
- E2E tests: Every PR + nightly on main

### 5.3 Pre-Release Checklist

Before merging to `main`:

- [ ] All unit tests passing (backend + frontend)
- [ ] All integration tests passing
- [ ] All E2E tests passing (critical path minimum)
- [ ] Code coverage >80% overall
- [ ] Manual testing completed (see checklist)
- [ ] No console errors in browser
- [ ] No memory leaks detected
- [ ] Performance benchmarks met
- [ ] Cross-browser tests passed (Chrome, Firefox, Safari)
- [ ] Mobile responsive tests passed
- [ ] Accessibility audit passed (WCAG AA)

---

## 6. Success Metrics

### 6.1 Quantitative Metrics

| Metric | Target | Measurement | Status |
|--------|--------|-------------|--------|
| **Code Coverage** | >80% overall | Jest/Playwright coverage reports | TBD |
| **Test Pass Rate** | 100% | CI/CD dashboard | TBD |
| **E2E Execution Time** | <5 minutes | Playwright test duration | TBD |
| **Call Connection Time** | <2 seconds | Performance monitoring | TBD |
| **WebRTC Success Rate** | >95% | Analytics tracking | TBD |
| **Zero Critical Bugs** | 0 bugs | Bug tracker | TBD |

### 6.2 Qualitative Metrics

| Metric | Target | Validation Method | Status |
|--------|--------|-------------------|--------|
| **User Experience** | Intuitive, no confusion | Manual testing + feedback | TBD |
| **Error Messages** | Clear, actionable | Review all error scenarios | TBD |
| **Cross-Browser Consistency** | No visual/functional differences | Manual cross-browser testing | TBD |
| **Accessibility** | WCAG AA compliant | Axe DevTools audit | TBD |

### 6.3 Exit Criteria for Phase 1A

**Required (Cannot proceed to Phase 1B without):**
- ✅ All P0 tests passing
- ✅ Code coverage >80%
- ✅ No critical or high bugs
- ✅ Performance benchmarks met
- ✅ Manual testing completed

**Nice to Have:**
- ⚠️ All P1 tests passing (can address in Phase 1B)
- ⚠️ P2 tests passing (can defer)
- ⚠️ Code coverage >90% (aspirational)

---

## 7. Risk Assessment

### 7.1 Technical Risks

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| **WebRTC connection failures in prod** | High | Medium | Implement TURN server, extensive network testing |
| **Browser compatibility issues** | High | Medium | Comprehensive cross-browser testing, polyfills |
| **Flaky E2E tests** | Medium | High | Mock WebRTC in CI, retry logic, test isolation |
| **Poor call quality on slow networks** | Medium | Medium | Adaptive bitrate, fallback to audio-only |
| **Permission denial edge cases** | Low | Medium | Clear error messages, guided recovery |

### 7.2 Process Risks

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| **Tests not keeping pace with development** | High | Medium | Parallel test development, TDD approach |
| **Insufficient manual testing coverage** | Medium | Medium | Dedicated QA time, comprehensive checklist |
| **Regression bugs in Phase 1B** | Medium | Low | Maintain Phase 1A test suite, regression testing |

---

## 8. Test Maintenance Plan

### 8.1 Ongoing Responsibilities

**After Phase 1A:**
- Update tests when API changes
- Add regression tests for any bugs found in production
- Refactor flaky tests
- Monitor test execution time, optimize slow tests
- Review test coverage monthly

### 8.2 Test Code Quality Standards

- All tests must have clear, descriptive names
- Use AAA pattern (Arrange, Act, Assert)
- Minimize test interdependencies
- Clean up resources (close connections, reset state)
- No hardcoded delays (use `waitFor`, `waitUntil`)
- Document complex test scenarios

### 8.3 Continuous Improvement

**Quarterly Review:**
- Analyze test failure trends
- Identify flaky tests, fix or replace
- Review coverage gaps
- Assess test execution time, parallelize if needed
- Incorporate lessons learned into Phase 1B/1C testing

---

## 9. Tools and Technologies

### 9.1 Testing Frameworks

| Component | Framework | Version | Purpose |
|-----------|-----------|---------|---------|
| Backend Unit | Jest | ^29.0 | Service and utility testing |
| Backend Integration | Supertest | ^6.0 | API endpoint testing |
| Socket.IO | socket.io-client | ^4.0 | Real-time event testing |
| Frontend Unit | Jest + RTL | ^29.0 | Component and store testing |
| E2E | Playwright | ^1.40 | Full user flow testing |
| Coverage | Istanbul/nyc | - | Code coverage reporting |

### 9.2 Mock/Stub Libraries

- `@testing-library/react` - Component rendering
- `@testing-library/user-event` - User interaction simulation
- `jest.mock()` - Module mocking
- `msw` (Mock Service Worker) - API mocking
- Custom mock utilities for WebRTC

### 9.3 CI/CD Integration

- **GitHub Actions** - Automated test execution
- **Codecov** - Coverage reporting
- **Playwright Cloud** (optional) - Distributed E2E execution
- **BrowserStack** (optional) - Real device testing

---

## 10. Appendices

### Appendix A: Test Data Fixtures

See: `gateway/src/__tests__/fixtures/calls.json`
See: `frontend/__tests__/fixtures/calls.ts`

### Appendix B: Mock WebRTC Implementation

See: `frontend/__tests__/utils/mock-webrtc.ts`

### Appendix C: Test Environment Setup

See: `docs/video-calls/TEST_ENVIRONMENT_SETUP.md`

### Appendix D: Troubleshooting Guide

See: `docs/video-calls/TEST_TROUBLESHOOTING.md`

---

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-28 | Elite Testing Architect | Initial test plan for Phase 1A |

---

**Document Owner:** Elite Testing Architect
**Reviewers:** Backend Team, Frontend Team, Product Owner
**Next Review Date:** 2025-11-04 (after Phase 1A completion)
