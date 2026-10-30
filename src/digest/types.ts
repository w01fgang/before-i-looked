// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl that parsed.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One job of one night. Times keep the offset from the log.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  night: string;
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that did not parse
  counts: Record<RunStatus, number>; // log lines by status
};

// null: no file for that night (or not a YYYY-MM-DD night). Never throws on a bad line.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
