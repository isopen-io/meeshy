import { NextResponse } from "next/server"

const AASA = {
  applinks: {
    details: [
      {
        appIDs: ["J2LP6UE7JQ.me.meeshy.app"],
        components: [
          { "/": "/join/*", "comment": "Join conversation links" },
          { "/": "/l/*", "comment": "Legacy join links" },
          { "/": "/c/*", "comment": "Conversation links" },
          { "/": "/conversation/*", "comment": "Conversation links" },
          { "/": "/u/*", "comment": "User profile links" },
          { "/": "/me", "comment": "Own profile" },
          { "/": "/links", "comment": "User links hub" },
          { "/": "/auth/magic-link", "comment": "Passwordless auth" },
          { "/": "/share", "comment": "Share content" },
        ],
      },
    ],
  },
  webcredentials: {
    apps: ["J2LP6UE7JQ.me.meeshy.app"],
  },
}

export async function GET() {
  return NextResponse.json(AASA, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
