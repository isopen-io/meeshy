import { NextResponse } from "next/server"

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: "J2LP6UE7JQ.me.meeshy.app",
        paths: [
          "/join/*",
          "/l/*",
          "/c/*",
          "/conversation/*",
          "/u/*",
          "/me",
          "/links",
          "/auth/magic-link",
          "/share",
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
