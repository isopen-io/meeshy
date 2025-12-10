# Phase 1A - Guide de Tests Manuels Rapides

**Date**: October 28, 2025
**Durée estimée**: 30-45 minutes
**Prérequis**: 2 appareils ou navigateurs

---

## 🚀 Setup Rapide

### 1. Démarrer les Services

```bash
# Terminal 1: Gateway
cd gateway
pnpm dev
# → http://localhost:3000

# Terminal 2: Frontend
cd frontend
pnpm dev
# → http://localhost:3001
```

### 2. Préparer 2 Utilisateurs

**Option A: 2 Navigateurs (même machine)**
- Chrome window 1: User A (alice@test.com)
- Chrome window 2: User B (bob@test.com)

**Option B: 2 Appareils (recommandé)**
- Device 1: User A
- Device 2: User B

### 3. Créer Conversation DIRECT

1. User A login
2. Create conversation with User B
3. Type must be DIRECT

---

## ✅ Tests Critiques (Must Pass)

### Test 1: Initier Appel ⭐ CRITIQUE

**User A:**
1. Open DIRECT conversation with User B
2. Click "Start Call" button (video icon)
3. **Expected**: Local video appears immediately
4. **Expected**: "Calling..." notification

**User B:**
5. **Expected**: Incoming call notification
6. Shows User A's name/avatar
7. Accept/Reject buttons visible

**Pass**: ✅ / ❌

---

### Test 2: Accepter Appel ⭐ CRITIQUE

**User B:**
1. Click "Accept" button
2. **Expected**: Permission request (camera/microphone)
3. Grant permissions
4. **Expected**: Local video appears
5. **Expected**: Remote video (User A) appears within 2s

**User A:**
6. **Expected**: Remote video (User B) appears within 2s
7. **Expected**: Both hear each other (clap test)

**Pass**: ✅ / ❌

---

### Test 3: Contrôles Média ⭐ CRITIQUE

**User A:**
1. Click "Mute" button
2. **Expected**: Icon changes to muted
3. **User B**: Cannot hear User A

**User A:**
4. Click "Mute" again (unmute)
5. **User B**: Can hear User A again

**User A:**
6. Click "Video Off" button
7. **Expected**: Icon changes
8. **User B**: Sees black screen (no video)

**User A:**
9. Click "Video On"
10. **User B**: Sees User A's video again

**Pass**: ✅ / ❌

---

### Test 4: Hang Up ⭐ CRITIQUE

**User A:**
1. Click "Hang Up" button (red phone icon)
2. **Expected**: Call ends immediately
3. **Expected**: Return to conversation UI
4. **Expected**: No video streams remain

**User B:**
5. **Expected**: "Call ended" notification
6. **Expected**: Return to conversation UI
7. **Expected**: No video streams remain

**Pass**: ✅ / ❌

---

## 🔍 Tests Additionnels (Important)

### Test 5: Rejeter Appel

**User A:** Initiate call
**User B:** Click "Reject"
- **Expected**: Notification disappears
- **User A**: Sees "Call rejected" message

**Pass**: ✅ / ❌

---

### Test 6: Permissions Refusées

**User A:** Initiate call
**User B:** Accept, but DENY camera/microphone
- **Expected**: Error message "Permission denied"
- **Expected**: Instructions to enable permissions

**Pass**: ✅ / ❌

---

### Test 7: PUBLIC Conversation (Should Fail)

**User A:**
1. Go to PUBLIC conversation
2. **Expected**: NO "Start Call" button
3. OR button is disabled

**Pass**: ✅ / ❌

---

### Test 8: Connection Quality

**During Active Call:**
- **Expected**: No echo/feedback
- **Expected**: Latency < 200ms (clap test)
- **Expected**: Clear audio
- **Expected**: Smooth video (no freezing)

**Pass**: ✅ / ❌

---

## 🌐 Tests Cross-Browser (Si Temps)

### Chrome
- [ ] Initiate call: ✅ / ❌
- [ ] Accept call: ✅ / ❌
- [ ] Controls work: ✅ / ❌

### Firefox
- [ ] Initiate call: ✅ / ❌
- [ ] Accept call: ✅ / ❌
- [ ] Controls work: ✅ / ❌

### Safari
- [ ] Initiate call: ✅ / ❌
- [ ] Accept call: ✅ / ❌
- [ ] Controls work: ✅ / ❌

---

## 📱 Test Mobile (Si Temps)

### iOS Safari
- [ ] Can initiate: ✅ / ❌
- [ ] Can accept: ✅ / ❌
- [ ] Video works: ✅ / ❌

### Android Chrome
- [ ] Can initiate: ✅ / ❌
- [ ] Can accept: ✅ / ❌
- [ ] Video works: ✅ / ❌

---

## 🐛 Bugs Trouvés

### Bug #1
- **Description**:
- **Steps to Reproduce**:
- **Expected**:
- **Actual**:
- **Severity**: Critical / High / Medium / Low

### Bug #2
(Repeat as needed)

---

## ✅ Résultats Finaux

**Tests Critiques (4):**
- Passed: ___ / 4
- Failed: ___ / 4

**Tests Additionnels (4):**
- Passed: ___ / 4
- Failed: ___ / 4

**Cross-Browser:**
- Chrome: ✅ / ❌ / Not Tested
- Firefox: ✅ / ❌ / Not Tested
- Safari: ✅ / ❌ / Not Tested

**Mobile:**
- iOS: ✅ / ❌ / Not Tested
- Android: ✅ / ❌ / Not Tested

---

## 🎯 Critères de Succès Phase 1A

**READY FOR PRODUCTION:**
- ✅ All 4 critical tests pass
- ✅ At least 3/4 additional tests pass
- ✅ Works on Chrome + Firefox (minimum)
- ✅ 0 critical bugs
- ✅ Max 2 high-severity bugs

**NEEDS FIXES:**
- ❌ Any critical test fails
- ❌ More than 1 additional test fails
- ❌ Any critical bug found

---

## 📞 Troubleshooting

### "Cannot find @meeshy/shared types"
```bash
cd frontend && pnpm install
cd gateway && pnpm install
```

### "Camera/Microphone not detected"
- Check browser permissions
- Try Chrome (best WebRTC support)
- Check system settings

### "No video streams"
- Open Chrome DevTools → Console
- Check for WebRTC errors
- Navigate to `chrome://webrtc-internals/`

### "Connection failed"
- Check STUN server config
- Try on same network first
- Check firewall settings

---

**Tester**: ________________
**Date**: ________________
**Build**: feature/video-calls-base (`73c46d71`)

---

**Bonne chance! 🎬**
