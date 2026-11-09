"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type JobState = {
  id: number;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  maxAttempts: number;
  result: unknown;
  error: string | null;
};

/**
 * Polls /api/jobs/:id every second until the job finishes, then calls onDone.
 * Pass initial ids (e.g. jobs still running after a page reload) to resume polling.
 */
export function useJobs(onDone?: (job: JobState) => void, initial: number[] = []) {
  const [jobs, setJobs] = useState<Record<number, JobState | { id: number; status: "queued" }>>(() =>
    Object.fromEntries(initial.map((id) => [id, { id, status: "queued" as const }])),
  );
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  const poll = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/jobs/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as JobState;
      setJobs((j) => ({ ...j, [id]: data }));
      if (data.status === "queued" || data.status === "running") {
        timers.current.set(id, setTimeout(() => poll(id), 1000));
      } else {
        timers.current.delete(id);
        onDoneRef.current?.(data);
      }
    } catch {
      timers.current.set(id, setTimeout(() => poll(id), 3000));
    }
  }, []);

  const track = useCallback(
    (id: number) => {
      setJobs((j) => ({ ...j, [id]: { id, status: "queued" } }));
      void poll(id);
    },
    [poll],
  );

  useEffect(() => {
    const t = timers.current;
    for (const id of initial) void poll(id);
    return () => {
      for (const timer of t.values()) clearTimeout(timer);
      t.clear();
    };
    // Only on mount: later jobs are added through track().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBusy = (id?: number) => {
    if (id === undefined) return false;
    const s = jobs[id]?.status;
    return s === "queued" || s === "running";
  };

  return { jobs, track, isBusy };
}
