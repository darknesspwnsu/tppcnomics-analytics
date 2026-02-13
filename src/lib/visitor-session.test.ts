import crypto from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  VISITOR_COOKIE_NAME,
  VISITOR_COOKIE_TTL_SECONDS,
  createSignedVisitorToken,
  getOrCreateVisitorId,
  isValidVisitorId,
  issueVisitorCookie,
  parseSignedVisitorToken,
} from "@/lib/visitor-session";

function makeRequest({ cookie, headerVisitorId }: { cookie?: string; headerVisitorId?: string } = {}) {
  const headers = new Headers();

  if (cookie) {
    headers.set("cookie", `${VISITOR_COOKIE_NAME}=${cookie}`);
  }

  if (headerVisitorId) {
    headers.set("x-visitor-id", headerVisitorId);
  }

  return new NextRequest("https://example.test/api/test", { headers });
}

function extractCookieValue(setCookieHeader: string, cookieName: string): string {
  const regex = new RegExp(`${cookieName}=([^;]+)`);
  const match = regex.exec(setCookieHeader);
  return match?.[1] || "";
}

describe("visitor-session", () => {
  beforeEach(() => {
    process.env.VISITOR_COOKIE_SECRET = "unit-test-secret";
    delete process.env.VISITOR_COOKIE_REFRESH_SECONDS;
  });

  afterEach(() => {
    delete process.env.VISITOR_COOKIE_SECRET;
    delete process.env.VISITOR_COOKIE_REFRESH_SECONDS;
  });

  it("creates a new visitor when no cookie or recovery header is present", () => {
    const now = 1_800_000_000;
    const session = getOrCreateVisitorId(makeRequest(), now);

    expect(session.source).toBe("new");
    expect(session.shouldIssueCookie).toBe(true);
    expect(session.shouldRefreshCookie).toBe(true);
    expect(isValidVisitorId(session.visitorId)).toBe(true);
  });

  it("keeps existing visitor when signed cookie is valid and recent", () => {
    const visitorId = crypto.randomUUID();
    const now = 1_800_000_000;
    const token = createSignedVisitorToken(visitorId, now - 600);

    const session = getOrCreateVisitorId(makeRequest({ cookie: token }), now);

    expect(session.source).toBe("cookie");
    expect(session.visitorId).toBe(visitorId);
    expect(session.shouldIssueCookie).toBe(false);
    expect(session.shouldRefreshCookie).toBe(false);
  });

  it("marks cookie for refresh when it is older than refresh threshold", () => {
    const visitorId = crypto.randomUUID();
    const now = 1_800_000_000;
    const elevenMonthsSeconds = 60 * 60 * 24 * 335;
    const token = createSignedVisitorToken(visitorId, now - elevenMonthsSeconds);

    const session = getOrCreateVisitorId(makeRequest({ cookie: token }), now);

    expect(session.source).toBe("cookie");
    expect(session.visitorId).toBe(visitorId);
    expect(session.shouldIssueCookie).toBe(false);
    expect(session.shouldRefreshCookie).toBe(true);
  });

  it("rehydrates visitor from x-visitor-id when cookie is missing", () => {
    const visitorId = crypto.randomUUID();

    const session = getOrCreateVisitorId(makeRequest({ headerVisitorId: visitorId }));

    expect(session.source).toBe("header");
    expect(session.visitorId).toBe(visitorId);
    expect(session.shouldIssueCookie).toBe(true);
    expect(session.shouldRefreshCookie).toBe(true);
  });

  it("creates a new visitor when cookie is tampered and ignores recovery header", () => {
    const originalVisitorId = crypto.randomUUID();
    const token = createSignedVisitorToken(originalVisitorId, 1_800_000_000);
    const lastChar = token.at(-1) === "a" ? "b" : "a";
    const tampered = `${token.slice(0, -1)}${lastChar}`;

    const session = getOrCreateVisitorId(
      makeRequest({
        cookie: tampered,
        headerVisitorId: originalVisitorId,
      })
    );

    expect(session.source).toBe("new");
    expect(session.cookieWasValid).toBe(false);
    expect(session.hadCookie).toBe(true);
    expect(session.visitorId).not.toBe(originalVisitorId);
  });

  it("issues secure HttpOnly cookie with rolling TTL", () => {
    const visitorId = crypto.randomUUID();
    const response = NextResponse.json({ ok: true });

    issueVisitorCookie(response, visitorId, {
      refresh: true,
      nowSeconds: 1_800_000_123,
    });

    const setCookie = response.headers.get("set-cookie") || "";
    expect(setCookie).toContain(`${VISITOR_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain(`Max-Age=${VISITOR_COOKIE_TTL_SECONDS}`);

    const cookieValue = extractCookieValue(setCookie, VISITOR_COOKIE_NAME);
    const parsed = parseSignedVisitorToken(cookieValue);
    expect(parsed?.v).toBe(visitorId);
    expect(parsed?.iat).toBe(1_800_000_123);
  });
});
