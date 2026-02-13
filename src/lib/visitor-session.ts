import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

export const VISITOR_COOKIE_NAME = "tppcnomics_vid";
export const VISITOR_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 365;
export const VISITOR_COOKIE_REFRESH_THRESHOLD_SECONDS_DEFAULT = 60 * 60 * 24;

const DEV_FALLBACK_SECRET = "tppcnomics-dev-secret-change-me";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type VisitorTokenPayload = {
  v: string;
  iat: number;
};

export type VisitorSession = {
  visitorId: string;
  source: "cookie" | "header" | "new";
  hadCookie: boolean;
  cookieWasValid: boolean;
  issuedAtSeconds: number;
  shouldIssueCookie: boolean;
  shouldRefreshCookie: boolean;
};

export type IssueVisitorCookieOptions = {
  refresh: boolean;
  nowSeconds?: number;
};

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function getCookieSecret(): string {
  const explicit = String(process.env.VISITOR_COOKIE_SECRET || "").trim();
  if (explicit) return explicit;

  if (process.env.NODE_ENV !== "production") {
    return DEV_FALLBACK_SECRET;
  }

  throw new Error("VISITOR_COOKIE_SECRET is required in production.");
}

function getRefreshThresholdSeconds(): number {
  const raw = Number(process.env.VISITOR_COOKIE_REFRESH_SECONDS);
  if (!Number.isFinite(raw)) return VISITOR_COOKIE_REFRESH_THRESHOLD_SECONDS_DEFAULT;

  const floored = Math.floor(raw);
  if (floored < 60) return 60;
  return floored;
}

function signPayload(encodedPayload: string): string {
  return crypto.createHmac("sha256", getCookieSecret()).update(encodedPayload).digest("base64url");
}

export function isValidVisitorId(value: string): boolean {
  return UUID_PATTERN.test(String(value || "").trim());
}

export function createSignedVisitorToken(visitorId: string, issuedAtSeconds = nowSeconds()): string {
  const safeVisitorId = String(visitorId || "").trim();
  if (!isValidVisitorId(safeVisitorId)) {
    throw new Error("Invalid visitor ID.");
  }

  const payload: VisitorTokenPayload = {
    v: safeVisitorId,
    iat: Math.max(0, Math.floor(issuedAtSeconds)),
  };

  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

function parsePayload(encodedPayload: string): VisitorTokenPayload | null {
  try {
    const raw = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as Partial<VisitorTokenPayload>;

    const visitorId = String(parsed?.v || "").trim();
    const issuedAt = Number(parsed?.iat);

    if (!isValidVisitorId(visitorId)) return null;
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return null;

    return {
      v: visitorId,
      iat: Math.floor(issuedAt),
    };
  } catch {
    return null;
  }
}

export function parseSignedVisitorToken(token: string): VisitorTokenPayload | null {
  const safe = String(token || "").trim();
  if (!safe) return null;

  const firstDot = safe.indexOf(".");
  if (firstDot <= 0) return null;

  const encoded = safe.slice(0, firstDot);
  const signature = safe.slice(firstDot + 1);
  if (!signature) return null;

  const expectedSignature = signPayload(encoded);

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  return parsePayload(encoded);
}

export function getOrCreateVisitorId(request: NextRequest, currentSeconds = nowSeconds()): VisitorSession {
  const cookieToken = request.cookies.get(VISITOR_COOKIE_NAME)?.value || "";

  if (cookieToken) {
    const parsed = parseSignedVisitorToken(cookieToken);
    if (parsed) {
      const age = Math.max(0, currentSeconds - parsed.iat);
      const refreshThreshold = getRefreshThresholdSeconds();

      return {
        visitorId: parsed.v,
        source: "cookie",
        hadCookie: true,
        cookieWasValid: true,
        issuedAtSeconds: parsed.iat,
        shouldIssueCookie: false,
        shouldRefreshCookie: age >= refreshThreshold,
      };
    }

    return {
      visitorId: crypto.randomUUID(),
      source: "new",
      hadCookie: true,
      cookieWasValid: false,
      issuedAtSeconds: currentSeconds,
      shouldIssueCookie: true,
      shouldRefreshCookie: true,
    };
  }

  const headerVisitorId = String(request.headers.get("x-visitor-id") || "").trim();
  if (isValidVisitorId(headerVisitorId)) {
    return {
      visitorId: headerVisitorId,
      source: "header",
      hadCookie: false,
      cookieWasValid: false,
      issuedAtSeconds: currentSeconds,
      shouldIssueCookie: true,
      shouldRefreshCookie: true,
    };
  }

  return {
    visitorId: crypto.randomUUID(),
    source: "new",
    hadCookie: false,
    cookieWasValid: false,
    issuedAtSeconds: currentSeconds,
    shouldIssueCookie: true,
    shouldRefreshCookie: true,
  };
}

export function issueVisitorCookie(
  response: NextResponse,
  visitorId: string,
  options: IssueVisitorCookieOptions
): void {
  const refresh = Boolean(options?.refresh);
  if (!refresh) return;

  const token = createSignedVisitorToken(visitorId, options?.nowSeconds);

  response.cookies.set(VISITOR_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: VISITOR_COOKIE_TTL_SECONDS,
  });
}
