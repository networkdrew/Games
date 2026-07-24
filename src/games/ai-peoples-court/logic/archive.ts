import type { ArchivedCourtCase, CourtCase, PartySide } from "./types";

const ARCHIVE_KEY = "ai-peoples-court.case-archive.v1";
const MAX_ARCHIVED_CASES = 30;

function isArchivedCase(value: unknown): value is ArchivedCourtCase {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ArchivedCourtCase>;
  return (
    Boolean(candidate.courtCase) &&
    typeof candidate.courtCase?.id === "string" &&
    candidate.courtCase.generation?.version === 1 &&
    typeof candidate.generatedAt === "string" &&
    (candidate.verdict === null ||
      candidate.verdict === "plaintiff" ||
      candidate.verdict === "defendant")
  );
}

export function loadCaseArchive(): ArchivedCourtCase[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ARCHIVE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isArchivedCase) : [];
  } catch {
    return [];
  }
}

function writeArchive(archive: readonly ArchivedCourtCase[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ARCHIVE_KEY,
      JSON.stringify(archive.slice(0, MAX_ARCHIVED_CASES)),
    );
  } catch {
    // Storage can be disabled or full; the current hearing still works.
  }
}

export function archiveGeneratedCase(
  courtCase: CourtCase,
): ArchivedCourtCase[] {
  const archive = loadCaseArchive();
  const withoutDuplicate = archive.filter(
    (entry) => entry.courtCase.id !== courtCase.id,
  );
  const next = [
    {
      courtCase,
      generatedAt: new Date().toISOString(),
      verdict: null,
      completedAt: null,
    },
    ...withoutDuplicate,
  ];
  writeArchive(next);
  return next;
}

export function archiveVerdict(
  courtCase: CourtCase,
  verdict: PartySide,
): ArchivedCourtCase[] {
  const archive = loadCaseArchive();
  const existing = archive.find((entry) => entry.courtCase.id === courtCase.id);
  const completed: ArchivedCourtCase = {
    courtCase,
    generatedAt: existing?.generatedAt ?? new Date().toISOString(),
    verdict,
    completedAt: new Date().toISOString(),
  };
  const next = [
    completed,
    ...archive.filter((entry) => entry.courtCase.id !== courtCase.id),
  ];
  writeArchive(next);
  return next;
}
