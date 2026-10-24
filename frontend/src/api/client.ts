import type { Accuracy, CutoffSweep, DayForecast, Horizon, Meta } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => e[1] !== undefined),
  ).toString();
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}${qs ? `?${qs}` : ""}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and retry.", 0);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  meta: () => get<Meta>("/api/meta"),
  dayForecast: (date: string, cutoff: string) =>
    get<DayForecast>("/api/forecast", { date, cutoff }),
  accuracy: (start: string, end: string, cutoff: string) =>
    get<Accuracy>("/api/accuracy", { start, end, cutoff }),
  horizon: (start: string, end: string, bucketH = 3) =>
    get<Horizon>("/api/horizon", { start, end, bucket_h: String(bucketH) }),
  cutoffs: (start: string, end: string) => get<CutoffSweep>("/api/cutoffs", { start, end }),
};
