export class OpenRouterError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
    this.code = code;
  }
  get userMessage() { return this.message; }
}

export class InvalidKeyError extends OpenRouterError {
  constructor(message = "API key invalid") {
    super(message, { status: 401 });
    this.name = "InvalidKeyError";
  }
  get userMessage() {
    return "API key geçersiz veya yetkisiz. Ayarlardan yeni bir key gir.";
  }
}

export class ModelUnavailableError extends OpenRouterError {
  constructor(model, message) {
    super(message ?? `Model unavailable: ${model}`, { status: 404 });
    this.name = "ModelUnavailableError";
    this.model = model;
  }
  get userMessage() {
    return `Seçili model artık kullanılamıyor${this.model ? ` (${this.model})` : ""}. Modeli değiştir.`;
  }
}

export class RateLimitError extends OpenRouterError {
  constructor(message = "Rate limited") {
    super(message, { status: 429 });
    this.name = "RateLimitError";
  }
  get userMessage() {
    return "Çok hızlı istek attın, biraz bekle ve tekrar dene.";
  }
}

export class ProviderError extends OpenRouterError {
  constructor(status, message) {
    super(message ?? `Provider error ${status}`, { status });
    this.name = "ProviderError";
  }
  get userMessage() {
    return "Sağlayıcı taraflı geçici hata. Birazdan tekrar dene.";
  }
}

export class NetworkError extends OpenRouterError {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
  get userMessage() {
    return "Bağlantı hatası. İnternetini kontrol et ve tekrar dene.";
  }
}

export function fromResponse(response, body) {
  const message = body?.error?.message || `HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) return new InvalidKeyError(message);
  if (response.status === 404) return new ModelUnavailableError(body?.error?.metadata?.model ?? null, message);
  if (response.status === 429) return new RateLimitError(message);
  return new ProviderError(response.status, message);
}
