# Quick Start Guide - Video Calls

Get video calls working in your Next.js app in 5 minutes.

## Prerequisites

- Next.js 14+ with App Router
- TypeScript configured
- Socket.IO client installed (`socket.io-client@^4.8.1`)
- Tailwind CSS configured
- Existing authentication system

## Step 1: Import CSS (1 minute)

Add to your root layout or global CSS:

```tsx
// app/layout.tsx
import '@/styles/video-call.css';
```

## Step 2: Add CallManager (2 minutes)

Add the CallManager component to your root layout to listen for incoming calls:

```tsx
// app/layout.tsx
import { CallManager } from '@/components/video-call/CallManager';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <CallManager />
      </body>
    </html>
  );
}
```

**Note**: CallManager handles incoming call notifications and routing. It's already in your codebase at `/components/video-call/CallManager.tsx`.

## Step 3: Start a Call (2 minutes)

### Option A: Direct Link
Navigate users to: `/call/[callId]`

Example:
```tsx
router.push(`/call/${callId}`);
```

### Option B: Programmatic Start
```tsx
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

function startCall(conversationId: string, targetUserId: string) {
  const socket = meeshySocketIOService.getSocket();

  socket.emit('call:initiate', {
    conversationId,
    mode: 'video',
    participants: [targetUserId],
  });
}
```

## That's It!

Your video calls are now working. The implementation handles:
- ✅ Camera/microphone permissions
- ✅ WebRTC connection setup
- ✅ Mobile responsiveness
- ✅ Error handling
- ✅ Connection quality indicators
- ✅ Call duration tracking

## Common Use Cases

### 1. Add "Video Call" Button

```tsx
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ConversationHeader({ conversationId, participants }) {
  const handleVideoCall = () => {
    const socket = meeshySocketIOService.getSocket();

    socket.emit('call:initiate', {
      conversationId,
      mode: 'video',
      participants: participants.map(p => p.id),
    });
  };

  return (
    <Button onClick={handleVideoCall}>
      <Video className="w-4 h-4 mr-2" />
      Video Call
    </Button>
  );
}
```

### 2. Direct Call Page

The route `/app/call/[callId]/page.tsx` is already created. Just navigate users to it:

```tsx
// From anywhere in your app
router.push(`/call/${callId}`);
```

### 3. Embed in Conversation

```tsx
import { VideoCallInterface } from '@/components/video-calls';
import { useCallStore } from '@/stores/call-store';

function ConversationPage() {
  const { currentCall, isInCall } = useCallStore();

  return (
    <div>
      {isInCall && currentCall ? (
        <VideoCallInterface callId={currentCall.id} />
      ) : (
        <ConversationView />
      )}
    </div>
  );
}
```

## Mobile Testing

### iOS Safari
```
https://your-domain.com/call/test-call-id
```

### Android Chrome
```
https://your-domain.com/call/test-call-id
```

**Important**: Must use HTTPS (except on localhost)

## Customization

### Change Video Quality

Edit `/services/webrtc-service.ts`:

```typescript
const DEFAULT_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 1280, max: 1920 },  // Higher quality
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
  },
};
```

### Customize Controls

Edit `/components/video-calls/CallControls.tsx` to add/remove buttons.

### Change Layout

Edit `/components/video-calls/VideoCallInterface.tsx` for different layouts.

## Troubleshooting

### "No socket connection" Error
**Cause**: Socket.IO not initialized

**Fix**: Ensure `meeshySocketIOService` is initialized in your app. Check that authentication is working.

### Black Screen / No Video
**Cause**: Permissions not granted or HTTPS required

**Fix**:
1. Check browser permissions
2. Ensure using HTTPS (not HTTP)
3. Check browser console for errors

### "Call not found" Error
**Cause**: Invalid or expired call ID

**Fix**: Ensure call was initiated via backend before joining

## Backend Requirements

Your backend must handle these Socket.IO events:

```typescript
// Client → Server
socket.on('call:initiate', (data) => {
  // Create call session
  // Emit call:initiated to participants
});

socket.on('call:join', (data) => {
  // Add participant to call
  // Emit call:participant-joined
});

socket.on('call:signal', (data) => {
  // Forward WebRTC signals (offer/answer/ICE)
});

socket.on('call:leave', (data) => {
  // Remove participant
  // Emit call:participant-left
});

socket.on('call:toggle-audio', (data) => {
  // Broadcast audio state
  // Emit call:media-toggled
});

socket.on('call:toggle-video', (data) => {
  // Broadcast video state
  // Emit call:media-toggled
});

// Server → Client
socket.emit('call:initiated', { callId, participants, ... });
socket.emit('call:participant-joined', { callId, participant, ... });
socket.emit('call:participant-left', { callId, participantId, ... });
socket.emit('call:signal', { callId, signal, ... });
socket.emit('call:media-toggled', { callId, participantId, mediaType, enabled });
socket.emit('call:ended', { callId, duration, ... });
socket.emit('call:error', { callId, error, ... });
```

## Complete Example

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { Button } from '@/components/ui/button';
import { Video, Phone } from 'lucide-react';

export default function ContactPage({ userId, conversationId }) {
  const router = useRouter();
  const [isCalling, setIsCalling] = useState(false);

  const startVideoCall = () => {
    setIsCalling(true);

    const socket = meeshySocketIOService.getSocket();

    socket.emit('call:initiate', {
      conversationId,
      mode: 'video',
      participants: [userId],
    });

    // Listen for call initiated
    socket.once('call:initiated', (event) => {
      setIsCalling(false);
      router.push(`/call/${event.callId}`);
    });

    // Handle errors
    socket.once('call:error', (error) => {
      setIsCalling(false);
      console.error('Call error:', error);
    });
  };

  const startAudioCall = () => {
    // Same as video but mode: 'audio'
    // Audio-only calls use same infrastructure
  };

  return (
    <div className="flex gap-2">
      <Button onClick={startVideoCall} disabled={isCalling}>
        <Video className="w-4 h-4 mr-2" />
        {isCalling ? 'Calling...' : 'Video Call'}
      </Button>

      <Button onClick={startAudioCall} disabled={isCalling} variant="outline">
        <Phone className="w-4 h-4 mr-2" />
        Audio Call
      </Button>
    </div>
  );
}
```

## Performance Tips

1. **Limit Participants**: P2P works best with 2-4 participants
2. **Use WiFi**: Better quality than cellular
3. **Close Other Tabs**: Reduce CPU/memory usage
4. **Update Browser**: Latest versions have best WebRTC support
5. **HTTPS Always**: Required for getUserMedia

## Next Steps

- Read full documentation: `/components/video-calls/README.md`
- Review implementation details: `/VIDEO_CALL_IMPLEMENTATION.md`
- Check existing backend events in CallService
- Test on multiple devices and browsers
- Monitor call quality metrics

## Support

For issues or questions:
1. Check browser console for errors
2. Review component documentation
3. Check Socket.IO connection status
4. Verify backend event handlers
5. Test in different browsers

## Resources

- **WebRTC API Docs**: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
- **Socket.IO Docs**: https://socket.io/docs/v4/
- **Next.js App Router**: https://nextjs.org/docs/app
- **TypeScript**: https://www.typescriptlang.org/docs/

---

**Ready to go!** 🚀

Users can now make video calls from anywhere in your app by navigating to `/call/[callId]` or using the programmatic API.
