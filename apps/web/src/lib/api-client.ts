import type { z } from "zod";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions<TResponse> {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  responseSchema: z.ZodType<TResponse>;
  searchParams?: Record<string, string | undefined>;
}

interface ApiClientConfig {
  baseUrl: string;
  getToken: () => string | null;
  fetch?: typeof fetch;
}

export class ApiClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: ApiClientConfig) {
    this.fetchImpl = config.fetch ?? fetch;
  }

  async request<TResponse>(
    path: string,
    options: RequestOptions<TResponse>
  ): Promise<TResponse | undefined> {
    const url = new URL(path, this.config.baseUrl);
    if (options.searchParams) {
      for (const [k, v] of Object.entries(options.searchParams)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }
    const headers = new Headers();
    const token = this.config.getToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (options.body !== undefined) headers.set("content-type", "application/json");

    const res = await this.fetchImpl(url.toString(), {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: "include"
    });

    if (res.status === 204) {
      return undefined;
    }
    if (!res.ok) {
      const text = await res.text();
      let message = `Request failed with status ${res.status}`;
      try {
        const parsed = JSON.parse(text) as { message?: string };
        if (parsed?.message) message = `${message}: ${parsed.message}`;
      } catch {
        if (text) message = `${message}: ${text.slice(0, 200)}`;
      }
      throw new ApiError(res.status, message);
    }
    const json = await res.json();
    return options.responseSchema.parse(json);
  }
}
