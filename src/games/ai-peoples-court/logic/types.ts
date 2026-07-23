export type PartySide = "plaintiff" | "defendant";

export interface CourtParty {
  name: string;
  role: string;
  opening: string;
}

export interface EvidenceItem {
  id: string;
  title: string;
  summary: string;
  detail: string;
  favors: PartySide | "neutral";
}

export interface CourtQuestion {
  id: string;
  side: PartySide;
  prompt: string;
  answer: string;
}

export interface CourtCase {
  id: string;
  docket: string;
  title: string;
  claim: string;
  stakes: string;
  plaintiff: CourtParty;
  defendant: CourtParty;
  evidence: readonly EvidenceItem[];
  questions: readonly CourtQuestion[];
  correctVerdict: PartySide;
  ruling: string;
}

export interface CourtSession {
  caseId: string;
  inspectedEvidence: readonly string[];
  askedQuestions: readonly string[];
  verdict: PartySide | null;
  score: number | null;
}
