import { describe, it, expect } from "vitest";
import {
  fromResponse,
  InvalidKeyError,
  ModelUnavailableError,
  RateLimitError,
  ProviderError,
} from "../src/lib/errors.js";

function res(status) {
  return { status, ok: status >= 200 && status < 300 };
}

describe("fromResponse", () => {
  it("maps 401 to InvalidKeyError with status 401", () => {
    const err = fromResponse(res(401), { error: { message: "bad key" } });
    expect(err).toBeInstanceOf(InvalidKeyError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("bad key");
  });

  it("maps 403 to InvalidKeyError as well", () => {
    const err = fromResponse(res(403), { error: { message: "forbidden" } });
    expect(err).toBeInstanceOf(InvalidKeyError);
  });

  it("maps 404 to ModelUnavailableError and pulls the model id from metadata", () => {
    const err = fromResponse(res(404), {
      error: { message: "not found", metadata: { model: "ghost/abandoned" } },
    });
    expect(err).toBeInstanceOf(ModelUnavailableError);
    expect(err.model).toBe("ghost/abandoned");
    expect(err.status).toBe(404);
  });

  it("maps 404 with no metadata.model to ModelUnavailableError with model=null", () => {
    const err = fromResponse(res(404), { error: { message: "no model" } });
    expect(err).toBeInstanceOf(ModelUnavailableError);
    expect(err.model).toBeNull();
  });

  it("maps 429 to RateLimitError", () => {
    const err = fromResponse(res(429), { error: { message: "slow down" } });
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.status).toBe(429);
  });

  it("maps 5xx to ProviderError", () => {
    const err = fromResponse(res(503), { error: { message: "upstream down" } });
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(503);
  });

  it("maps 4xx-other to ProviderError", () => {
    const err = fromResponse(res(400), { error: { message: "bad request" } });
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.status).toBe(400);
  });

  it("falls back to HTTP <status> when body lacks an error.message", () => {
    const err = fromResponse(res(503), null);
    expect(err.message).toBe("HTTP 503");
  });

  it("every typed error has a non-empty userMessage", () => {
    for (const e of [
      new InvalidKeyError(),
      new ModelUnavailableError("a/b"),
      new RateLimitError(),
      new ProviderError(500),
    ]) {
      expect(e.userMessage).toBeTruthy();
      expect(typeof e.userMessage).toBe("string");
      expect(e.userMessage.length).toBeGreaterThan(0);
    }
  });
});
