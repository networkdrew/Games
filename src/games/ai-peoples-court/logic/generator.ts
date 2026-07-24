import type {
  CourtCase,
  CourtParty,
  CourtWitness,
  EvidenceItem,
  PartySide,
} from "./types";

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) throw new Error("Cannot pick from an empty pool");
    return item;
  }

  integer(min: number, max: number) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

const FIRST_NAMES = [
  "Avery",
  "Bryn",
  "Cass",
  "Devon",
  "Emery",
  "Farah",
  "Galen",
  "Hollis",
  "Indra",
  "Jules",
  "Kei",
  "Lena",
  "Micah",
  "Nora",
  "Omar",
  "Pia",
  "Quinn",
  "Rafi",
  "Sage",
  "Talia",
] as const;
const LAST_NAMES = [
  "Arden",
  "Bell",
  "Calder",
  "Dane",
  "Ellery",
  "Finch",
  "Gray",
  "Hart",
  "Ives",
  "Juno",
  "Kade",
  "Lane",
  "Morrow",
  "North",
  "Ortega",
  "Park",
  "Reed",
  "Sol",
  "Vale",
  "Wren",
] as const;
const VOICES = [
  "careful and literal, pausing before important details",
  "warm but defensive, speaking faster when challenged",
  "precise and businesslike, correcting dates immediately",
  "earnest and emotional, using vivid sensory details",
  "dry and skeptical, reluctant to speculate",
  "confident at first, then visibly uncertain around contradictions",
] as const;

function makeName(random: SeededRandom, used: Set<string>) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const name = `${random.pick(FIRST_NAMES)} ${random.pick(LAST_NAMES)}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Person ${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

interface GeneratedParts {
  title: string;
  claim: string;
  stakes: string;
  privateTruth: string;
  plaintiffRole: string;
  defendantRole: string;
  witnessRole: string;
  plaintiffKnowledge: string;
  defendantKnowledge: string;
  witnessKnowledge: string;
  evidence: EvidenceItem[];
  correctVerdict: PartySide;
  ruling: string;
  complexity: string[];
}

interface Archetype {
  id: string;
  build: (
    random: SeededRandom,
    difficulty: CourtCase["difficulty"],
    amount: number,
  ) => GeneratedParts;
}

const OBJECTS = [
  "vintage camera",
  "custom bicycle",
  "ceramic telescope",
  "portable synthesizer",
  "handmade canoe paddle",
  "restored espresso grinder",
] as const;
const SERVICES = [
  "garden redesign",
  "festival sound setup",
  "website launch",
  "costume commission",
  "bakery display installation",
  "community workshop",
] as const;
const DELIVERIES = [
  "rare book set",
  "wedding centerpiece",
  "prototype board game",
  "signed concert poster",
  "antique desk lamp",
  "competition cake",
] as const;

const archetypes: readonly Archetype[] = [
  {
    id: "borrowed-property",
    build(random, difficulty, amount) {
      const object = random.pick(OBJECTS);
      const defendantAtFault = random.next() > 0.42;
      const correctVerdict = defendantAtFault ? "plaintiff" : "defendant";
      return {
        title: `The Case of the Damaged ${object.replace(/\b\w/g, (c) => c.toUpperCase())}`,
        claim: `A borrowed ${object} was returned damaged. The owner says the borrower used it carelessly; the borrower says the defect was already developing.`,
        stakes: `$${amount} repair claim`,
        privateTruth: defendantAtFault
          ? `The borrower ignored a visible warning and caused the damage during unauthorized use. The owner exaggerated how new the ${object} was but did not cause the failure.`
          : `The ${object} had a concealed pre-existing defect. The borrower used it normally and reported the failure promptly. The owner noticed symptoms before the loan but did not disclose them.`,
        plaintiffRole: `${object} owner`,
        defendantRole: "Borrower",
        witnessRole: "Repair technician",
        plaintiffKnowledge: defendantAtFault
          ? "The owner knows the item was not brand new but saw no serious defect before lending it."
          : "The owner noticed an earlier symptom and omitted it when demanding payment.",
        defendantKnowledge: defendantAtFault
          ? "The borrower saw a warning, continued using the item, and initially concealed that choice."
          : "The borrower used the item normally and has a timestamped message reporting the failure.",
        witnessKnowledge:
          difficulty >= 4
            ? "The technician can identify both old wear and a fresh stress mark, requiring careful chronology."
            : defendantAtFault
              ? "The technician found a fresh stress mark consistent with misuse."
              : "The technician found long-term internal wear rather than a fresh impact.",
        evidence: [
          {
            id: "condition-photo",
            title: "Pre-loan photograph",
            summary: `A photo of the ${object} before the loan.`,
            detail: defendantAtFault
              ? "The exterior appears intact, though ordinary age is visible."
              : "A zoomed view shows a faint symptom near the later failure point.",
            favors: correctVerdict,
          },
          {
            id: "message-log",
            title: "Message timeline",
            summary: "Timestamped messages between the parties.",
            detail: defendantAtFault
              ? "The borrower mentions trying an unapproved use shortly before the damage."
              : "The borrower reports failure within minutes of ordinary use and asks how to preserve the item.",
            favors: correctVerdict,
          },
          {
            id: "repair-note",
            title: "Repair assessment",
            summary: "A technician's inspection note.",
            detail:
              difficulty >= 4
                ? "The note identifies old wear plus one fresh mark, leaving causation dependent on testimony."
                : defendantAtFault
                  ? "The failure pattern is consistent with excessive force."
                  : "The failure pattern developed gradually over months.",
            favors: difficulty >= 4 ? "neutral" : correctVerdict,
          },
        ],
        correctVerdict,
        ruling: defendantAtFault
          ? "The fresh damage, warning, and message timeline show the borrower exceeded permitted use and caused the loss."
          : "The repair history and prompt report show a pre-existing defect rather than borrower negligence.",
        complexity: [
          "property condition",
          difficulty >= 3 ? "disputed timeline" : "direct causation",
          difficulty >= 4 ? "mixed old and new damage" : "technical evidence",
        ],
      };
    },
  },
  {
    id: "service-scope",
    build(random, difficulty, amount) {
      const service = random.pick(SERVICES);
      const providerWins = random.next() > 0.5;
      const correctVerdict = providerWins ? "defendant" : "plaintiff";
      return {
        title: `The Unfinished ${service.replace(/\b\w/g, (c) => c.toUpperCase())}`,
        claim: `A customer withheld final payment for a ${service}, saying essential work was unfinished. The provider says the disputed work was outside the signed scope.`,
        stakes: `$${amount} disputed payment`,
        privateTruth: providerWins
          ? "The provider completed every item in the final signed scope. The customer relies on an early conversation that was narrowed before signing."
          : "The final scope includes the disputed deliverable. The provider quietly substituted a cheaper partial result and hoped the customer would accept it.",
        plaintiffRole: "Customer",
        defendantRole: "Independent service provider",
        witnessRole: "Project assistant",
        plaintiffKnowledge: providerWins
          ? "The customer skimmed the final scope and assumed an early promise remained."
          : "The customer has the signed scope and gave the provider a chance to correct the omission.",
        defendantKnowledge: providerWins
          ? "The provider documented the narrowed scope and completed it."
          : "The provider knows the deliverable was included and used a cheaper substitute without written approval.",
        witnessKnowledge:
          difficulty >= 4
            ? "The assistant heard both the early broad promise and the later cost-cutting discussion."
            : providerWins
              ? "The assistant recorded the customer's approval of the narrowed scope."
              : "The assistant was told to use the cheaper substitute.",
        evidence: [
          {
            id: "signed-scope",
            title: "Signed project scope",
            summary: "The final agreement and task list.",
            detail: providerWins
              ? "The disputed deliverable is absent and an earlier draft is marked superseded."
              : "The disputed deliverable appears in the final task list without qualification.",
            favors: correctVerdict,
          },
          {
            id: "progress-thread",
            title: "Progress message thread",
            summary: "Messages sent during the work.",
            detail: providerWins
              ? "The provider reports completion against the final checklist; the customer responds positively."
              : "The provider discusses a substitute internally but never asks the customer to approve it.",
            favors: correctVerdict,
          },
          {
            id: "early-estimate",
            title: "Early estimate",
            summary: "A preliminary scope sent before signing.",
            detail:
              difficulty >= 3
                ? "The early estimate supports the losing party's expectations but says the final signed scope controls."
                : "The estimate is clearly labeled preliminary.",
            favors:
              difficulty >= 3
                ? providerWins
                  ? "plaintiff"
                  : "defendant"
                : "neutral",
          },
        ],
        correctVerdict,
        ruling: providerWins
          ? "The signed final scope controls, and the provider completed the work actually purchased."
          : "The signed scope includes the missing deliverable, and an undisclosed substitute is not full performance.",
        complexity: [
          "contract scope",
          difficulty >= 3 ? "conflicting draft" : "final writing",
          difficulty >= 4
            ? "witness with mixed knowledge"
            : "performance record",
        ],
      };
    },
  },
  {
    id: "delivery-custody",
    build(random, difficulty, amount) {
      const delivery = random.pick(DELIVERIES);
      const courierAtFault = random.next() > 0.48;
      const correctVerdict = courierAtFault ? "plaintiff" : "defendant";
      return {
        title: `The Missing ${delivery.replace(/\b\w/g, (c) => c.toUpperCase())}`,
        claim: `A ${delivery} disappeared after delivery. The recipient says it was left in the wrong place; the courier says the recipient authorized the drop-off.`,
        stakes: `$${amount} replacement claim`,
        privateTruth: courierAtFault
          ? "The courier used a convenient side entrance despite instructions requiring a staffed front desk, then marked it handed to a person."
          : "The recipient sent a last-minute message authorizing the side entrance and later deleted it from a screenshot supplied to the court.",
        plaintiffRole: "Delivery recipient",
        defendantRole: "Independent courier",
        witnessRole: "Building desk attendant",
        plaintiffKnowledge: courierAtFault
          ? "The recipient gave clear front-desk instructions and never authorized the side entrance."
          : "The recipient authorized the side entrance to save time, then omitted that message when making the claim.",
        defendantKnowledge: courierAtFault
          ? "The courier ignored the instruction and falsely selected 'handed to recipient' in the app."
          : "The courier followed the recipient's message and retained a complete notification export.",
        witnessKnowledge:
          difficulty >= 4
            ? "The attendant briefly left the desk and can confirm only parts of the timeline."
            : "The attendant was present and never received the package.",
        evidence: [
          {
            id: "delivery-log",
            title: "Delivery application log",
            summary: "Location, time, and completion status.",
            detail: courierAtFault
              ? "The location is the side entrance, but the courier selected 'handed to person.'"
              : "The log records the side entrance and an instruction update moments earlier.",
            favors: correctVerdict,
          },
          {
            id: "message-export",
            title: "Complete message export",
            summary: "Server timestamps from the delivery conversation.",
            detail: courierAtFault
              ? "The only instruction requires the staffed front desk."
              : "The export contains the recipient's authorization that is absent from their screenshot.",
            favors: correctVerdict,
          },
          {
            id: "camera-gap",
            title: "Building camera report",
            summary: "A security camera coverage report.",
            detail:
              difficulty >= 3
                ? "The side entrance camera was offline, so it cannot establish who removed the package."
                : "The report confirms the package never reached the front desk.",
            favors: difficulty >= 3 ? "neutral" : correctVerdict,
          },
        ],
        correctVerdict,
        ruling: courierAtFault
          ? "The courier disregarded the required delivery point and entered an inaccurate completion status."
          : "The complete message export proves the recipient authorized the chosen drop-off location.",
        complexity: [
          "chain of custody",
          difficulty >= 3 ? "camera gap" : "location record",
          difficulty >= 4
            ? "incomplete witness timeline"
            : "message authenticity",
        ],
      };
    },
  },
];

function party(
  name: string,
  role: string,
  voice: string,
  privateKnowledge: string,
): CourtParty {
  return {
    name,
    role,
    voice,
    privateKnowledge,
    opening: `I am ready to explain my side of this dispute, Your Honor.`,
  };
}

function witness(
  name: string,
  role: string,
  voice: string,
  privateKnowledge: string,
): CourtWitness {
  return { name, role, voice, privateKnowledge };
}

export function generateCourtCase(
  seed: number,
  requestedDifficulty?: number,
): CourtCase {
  const normalizedSeed = Math.abs(Math.trunc(seed)) || 1;
  const random = new SeededRandom(normalizedSeed);
  const difficulty = Math.max(
    1,
    Math.min(5, Math.trunc(requestedDifficulty ?? random.integer(1, 5))),
  ) as CourtCase["difficulty"];
  const archetype = random.pick(archetypes);
  const amount =
    Math.round(
      random.integer(180 + difficulty * 70, 700 + difficulty * 450) / 10,
    ) * 10;
  const parts = archetype.build(random, difficulty, amount);
  const usedNames = new Set<string>();
  const plaintiffName = makeName(random, usedNames);
  const defendantName = makeName(random, usedNames);
  const witnessName = makeName(random, usedNames);
  const docket = `GEN-${String(normalizedSeed % 100000).padStart(5, "0")}`;

  return {
    id: `generated-${normalizedSeed}`,
    docket,
    title: parts.title,
    claim: parts.claim,
    stakes: parts.stakes,
    difficulty,
    complexity: parts.complexity,
    generation: { seed: normalizedSeed, archetypeId: archetype.id, version: 1 },
    privateTruth: parts.privateTruth,
    plaintiff: party(
      plaintiffName,
      parts.plaintiffRole,
      random.pick(VOICES),
      parts.plaintiffKnowledge,
    ),
    defendant: party(
      defendantName,
      parts.defendantRole,
      random.pick(VOICES),
      parts.defendantKnowledge,
    ),
    witness: witness(
      witnessName,
      parts.witnessRole,
      random.pick(VOICES),
      parts.witnessKnowledge,
    ),
    evidence: parts.evidence,
    questions: [],
    correctVerdict: parts.correctVerdict,
    ruling: parts.ruling,
  };
}

export function createCourtSeed() {
  const time = Date.now() >>> 0;
  const entropy = Math.floor(Math.random() * 0xffffffff) >>> 0;
  return (time ^ entropy) >>> 0 || 1;
}
