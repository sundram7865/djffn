import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "./client";

// The data is an immutable snapshot, so cached responses never go stale within a session.
const forever = { staleTime: Infinity, gcTime: 30 * 60_000 } as const;

export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: api.meta, ...forever });

export const useDayForecast = (date: string | undefined, cutoff: string | undefined) =>
  useQuery({
    queryKey: ["forecast", date, cutoff],
    queryFn: () => api.dayForecast(date!, cutoff!),
    enabled: Boolean(date && cutoff),
    placeholderData: keepPreviousData,
    ...forever,
  });

export const useAccuracy = (start?: string, end?: string, cutoff?: string) =>
  useQuery({
    queryKey: ["accuracy", start, end, cutoff],
    queryFn: () => api.accuracy(start!, end!, cutoff!),
    enabled: Boolean(start && end && cutoff),
    placeholderData: keepPreviousData,
    ...forever,
  });

export const useHorizon = (start?: string, end?: string) =>
  useQuery({
    queryKey: ["horizon", start, end],
    queryFn: () => api.horizon(start!, end!),
    enabled: Boolean(start && end),
    placeholderData: keepPreviousData,
    ...forever,
  });

export const useCutoffSweep = (start?: string, end?: string) =>
  useQuery({
    queryKey: ["cutoffs", start, end],
    queryFn: () => api.cutoffs(start!, end!),
    enabled: Boolean(start && end),
    placeholderData: keepPreviousData,
    ...forever,
  });
