export class OpenRouterError extends Error {
  constructor(message, { status } = {}) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
  }
  get userMessage() { return this.message; }
}

export class InvalidKeyError extends OpenRouterError {
  constructor(message = "API key invalid") {
    super(message, { status: 401 });
    this.name = "InvalidKeyError";
  }
  get userMessage() {
    return "Your API key was rejected. Open settings and check it.";
  }
}

export class ModelUnavailableError extends OpenRouterError {
  constructor(model, message) {
    super(message ?? `Model unavailable: ${model}`, { status: 404 });
    this.name = "ModelUnavailableError";
    this.model = model;
  }
  get userMessage() {
    return `The selected model isn't available${this.model ? ` (${this.model})` : ""}. Pick another from the picker.`;
  }
}

export class RateLimitError extends OpenRouterError {
  constructor(message = "Rate limited") {
    super(message, { status: 429 });
    this.name = "RateLimitError";
  }
  get userMessage() {
    return "Too many requests in a row. Wait a moment and try again.";
  }
}

export class ProviderError extends OpenRouterError {
  constructor(status, message) {
    super(message ?? `Provider error ${status}`, { status });
    this.name = "ProviderError";
  }
  get userMessage() {
    return "OpenRouter or the upstream provider is having a hiccup. Try again in a bit.";
  }
}

export class NetworkError extends OpenRouterError {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
  get userMessage() {
    return "Couldn't reach OpenRouter. Check your connection and try again.";
  }
}

export function fromResponse(response, body) {
  const message = body?.error?.message || `HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) return new InvalidKeyError(message);
  if (response.status === 404) return new ModelUnavailableError(body?.error?.metadata?.model ?? null, message);
  if (response.status === 429) return new RateLimitError(message);
  return new ProviderError(response.status, message);
}
