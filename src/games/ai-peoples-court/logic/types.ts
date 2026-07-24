export type PartySide = "plaintiff" | "defendant";

export interface CourtParty {
  name: string;
  role: string;
  opening: string;
  voice: string;
  privateKnowledge: string;
}

export interface CourtWitness {
  name: string;
  role: string;
  voice: string;
  privateKnowledge: string;
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
  privateTruth: string;
  plaintiff: CourtParty;
  defendant: CourtParty;
  witness: CourtWitness;
  evidence: readonly EvidenceItem[];
  questions: readonly CourtQuestion[];
  correctVerdict: PartySide;
  ruling: string;
}

export interface CourtSession {
  caseId: string;
  transcript: readonly TranscriptMessage[];
  memorySummary: string;
  memoryFacts: readonly string[];
  turnNumber: number;
  verdict: PartySide | null;
}

export type CourtSpeaker =
  "judge" | "bailiff" | "clerk" | "plaintiff" | "defendant" | "witness";

export interface TranscriptMessage {
  id: string;
  speaker: CourtSpeaker;
  name: string;
  text: string;
  interrupted?: boolean;
}
