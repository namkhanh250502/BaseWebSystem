import { APP_HEADER, type ApiMeta, type ApiResponse, type AppName } from '@base/shared';

/**
 * Mã lỗi khi không nói chuyện được với backend: mất mạng / CORS (NETWORK_ERROR),
 * hoặc proxy/gateway trả 5xx không kèm body JSON của API (SERVICE_UNAVAILABLE).
 */
export const CONNECTIVITY_ERROR_CODES = ['NETWORK_ERROR', 'SERVICE_UNAVAILABLE'] as const;

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    /** Key i18n của lỗi phía server, ví dụ 'twoFactor.tokenInvalid' */
    public readonly key?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** true khi lỗi do không kết nối được backend, không phải lỗi nghiệp vụ */
  get isConnectivity(): boolean {
    return (CONNECTIVITY_ERROR_CODES as readonly string[]).includes(this.code);
  }
}

export interface HttpClientOptions {
  /** Ví dụ: '/api/v1' (đi qua proxy) hoặc 'https://api.example.com/api/v1' */
  baseUrl: string;
  /** App gọi API, server dùng để chọn cookie phiên và link trong email */
  app: AppName;
  /** Ngôn ngữ hiện tại, server trả thông báo lỗi theo ngôn ngữ này */
  getLocale?: () => string;
  /** Gọi khi phiên hết hạn hẳn (refresh thất bại) */
  onSessionExpired?: () => void;
}

export interface RequestOptions {
  body?: unknown;
  /** Giá trị undefined / null / '' sẽ bị bỏ qua */
  query?: object;
  signal?: AbortSignal;
  /** Header bổ sung, ví dụ x-reauth-token */
  headers?: Record<string, string>;
}

export interface HttpResult<T> {
  data: T;
  meta?: ApiMeta;
}

/** Các API không cần access token: lỗi 401 ở đây là lỗi thật, không thử refresh */
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/register',
  '/auth/2fa/',
];

function buildUrl(baseUrl: string, path: string, query?: object) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`;
  if (!query) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}

export function createHttpClient(options: HttpClientOptions) {
  let accessToken: string | null = null;
  let refreshing: Promise<string | null> | null = null;

  async function send(
    method: string,
    path: string,
    { body, query, signal, headers: extra }: RequestOptions,
  ) {
    const headers: Record<string, string> = {
      ...extra,
      Accept: 'application/json',
      [APP_HEADER]: options.app,
    };
    const locale = options.getLocale?.();
    if (locale) headers['x-lang'] = locale;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    try {
      return await fetch(buildUrl(options.baseUrl, path, query), {
        method,
        headers,
        body: payload,
        signal,
        credentials: 'include',
      });
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error;
      throw new ApiClientError(0, 'NETWORK_ERROR', 'Network error');
    }
  }

  /** Gộp các lần refresh đồng thời thành 1 request */
  function refreshAccessToken(): Promise<string | null> {
    refreshing ??= (async () => {
      try {
        const res = await send('POST', '/auth/refresh', {});
        if (!res.ok) return null;
        const json = (await res.json()) as ApiResponse<{ accessToken: string }>;
        accessToken = json.data?.accessToken ?? null;
        return accessToken;
      } catch {
        return null;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function parse<T>(res: Response): Promise<HttpResult<T>> {
    if (res.status === 204) return { data: undefined as T };
    let json: ApiResponse<T> | null = null;
    try {
      json = (await res.json()) as ApiResponse<T>;
    } catch {
      // Response không phải JSON
    }
    if (!res.ok || !json || json.error) {
      const error = json?.error;
      // Backend chết thì proxy (Vite, nginx, Cloudflare) vẫn trả 5xx nhưng body là HTML/rỗng
      // → coi là mất kết nối để UI gộp thông báo, thay vì hiện thô "HTTP 502"
      if (!error && res.status >= 500) {
        throw new ApiClientError(res.status, 'SERVICE_UNAVAILABLE', `HTTP ${res.status}`);
      }
      throw new ApiClientError(
        res.status,
        error?.code ?? 'HTTP_ERROR',
        error?.message ?? `HTTP ${res.status}`,
        error?.key,
        error?.details,
      );
    }
    return { data: json.data as T, meta: json.meta };
  }

  async function request<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<HttpResult<T>> {
    let res = await send(method, path, opts);
    const canRefresh = !NO_REFRESH_PATHS.some((p) => path.startsWith(p));
    if (res.status === 401 && canRefresh) {
      const token = await refreshAccessToken();
      if (token) {
        res = await send(method, path, opts);
      } else {
        options.onSessionExpired?.();
      }
    }
    return parse<T>(res);
  }

  return {
    request,
    setAccessToken: (token: string | null) => {
      accessToken = token;
    },
    getAccessToken: () => accessToken,
    get: <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, opts),
    post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>('POST', path, { ...opts, body }),
    put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>('PUT', path, { ...opts, body }),
    patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>('PATCH', path, { ...opts, body }),
    delete: <T = void>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
  };
}

export type HttpClient = ReturnType<typeof createHttpClient>;

/** Chuyển kết quả có meta thành { items, meta } */
export function toPaginated<T>({ data, meta }: HttpResult<T[]>) {
  return {
    items: data,
    meta: {
      page: meta?.page ?? 1,
      pageSize: meta?.pageSize ?? data.length,
      total: meta?.total ?? data.length,
    },
  };
}
