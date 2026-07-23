import type { CourtCase } from "./types";

export const courtCases: readonly CourtCase[] = [
  {
    id: "orchid-window",
    docket: "CIV-2041",
    title: "The Orchid and the Open Window",
    claim:
      "A rare orchid died while its owner was away. The owner says her neighbor ignored written care instructions.",
    stakes: "$420 replacement value",
    plaintiff: {
      name: "Mara Venn",
      role: "Orchid collector",
      opening:
        "I trusted Ellis with one simple task: water my moon orchid once and keep the studio window shut. I came home to a frozen plant and an open window.",
    },
    defendant: {
      name: "Ellis Rowe",
      role: "Upstairs neighbor",
      opening:
        "I watered it exactly once. The window was already cracked when I arrived, and Mara never told me it had to stay closed.",
    },
    evidence: [
      {
        id: "care-card",
        title: "Care instruction card",
        summary: "A handwritten card left beside the orchid.",
        detail:
          'The card reads: "One cup Wednesday. Do not move from the blue table." It says nothing about the window.',
        favors: "defendant",
      },
      {
        id: "weather-log",
        title: "Building weather log",
        summary: "Temperatures recorded during Mara's trip.",
        detail:
          "The overnight temperature fell below freezing on Thursday. The superintendent logged the studio window as closed during a Wednesday inspection.",
        favors: "plaintiff",
      },
      {
        id: "message",
        title: "Text message",
        summary: "A message Ellis sent after watering the plant.",
        detail:
          'Ellis wrote: "It smells damp in here, so I opened the window a little. Hope that is okay." Mara did not see the message until Friday.',
        favors: "plaintiff",
      },
    ],
    questions: [
      {
        id: "mara-instructions",
        side: "plaintiff",
        prompt: "Did you mention the window before leaving?",
        answer:
          "Not aloud. I thought the care card covered everything, but I now see it only said not to move the plant.",
      },
      {
        id: "mara-value",
        side: "plaintiff",
        prompt: "How did you establish the orchid's value?",
        answer:
          "I have a receipt for $420 from a fictional specialty nursery, dated six months ago.",
      },
      {
        id: "ellis-window",
        side: "defendant",
        prompt: "Why did you open the window?",
        answer:
          "The soil smelled musty after I watered it. I opened the window myself for ventilation and forgot to close it.",
      },
      {
        id: "ellis-warning",
        side: "defendant",
        prompt: "Why did you not wait for permission?",
        answer:
          "I sent a text, but I made the change before Mara replied. I assumed a small opening was harmless.",
      },
    ],
    correctVerdict: "plaintiff",
    ruling:
      "Ellis admits opening the window and forgetting it. The weather log connects that act to the freeze. Even though Mara's instructions were incomplete, Ellis made an unrequested change and is responsible for the resulting loss.",
  },
  {
    id: "parade-float",
    docket: "CIV-2088",
    title: "The Vanishing Parade Float",
    claim:
      "A neighborhood club paid for a parade float that was dismantled before the advertised rain date.",
    stakes: "$650 service refund",
    plaintiff: {
      name: "Tobin Bell",
      role: "Lantern Street Club treasurer",
      opening:
        "We paid Juniper Works for a float through Sunday. Saturday's parade was rained out, yet the float was gone before Sunday's rain-date event.",
    },
    defendant: {
      name: "Nia Calder",
      role: "Juniper Works owner",
      opening:
        "The signed order was for Saturday only. Keeping the float another day required storage that the club declined to purchase.",
    },
    evidence: [
      {
        id: "invoice",
        title: "Signed invoice",
        summary: "The final service order signed by both parties.",
        detail:
          'The invoice lists "Saturday parade display, removal after event." A rain-date line is blank. Storage is listed as an optional $90 charge and is not selected.',
        favors: "defendant",
      },
      {
        id: "flyer",
        title: "Club event flyer",
        summary: "The club's public parade announcement.",
        detail:
          "The flyer advertises a Sunday rain date, but it was created by the club and never names Juniper Works.",
        favors: "neutral",
      },
      {
        id: "estimate",
        title: "Early email estimate",
        summary: "A preliminary message sent before the signed invoice.",
        detail:
          'Nia wrote, "We can probably keep it through the rain date." The same email says final timing and storage will appear on the service order.',
        favors: "defendant",
      },
    ],
    questions: [
      {
        id: "tobin-contract",
        side: "plaintiff",
        prompt: "Did you read the final invoice before signing?",
        answer:
          "I skimmed the total. I relied on the earlier email and did not notice that the rain-date line was blank.",
      },
      {
        id: "tobin-storage",
        side: "plaintiff",
        prompt: "Did the club purchase overnight storage?",
        answer:
          "No. I believed storage through Sunday was already included in the quoted price.",
      },
      {
        id: "nia-notice",
        side: "defendant",
        prompt: "Did you warn the club before dismantling the float?",
        answer:
          "I called twice Saturday afternoon and left a voicemail. The order still required removal after the Saturday event.",
      },
      {
        id: "nia-email",
        side: "defendant",
        prompt: "Why did your early email mention the rain date?",
        answer:
          "It was possible if they reserved storage. That is why I said the final timing would be in the service order.",
      },
    ],
    correctVerdict: "defendant",
    ruling:
      "The signed final order controls the arrangement. It covers Saturday and excludes the optional storage charge. The preliminary email was conditional, so Juniper Works fulfilled the agreement it actually made.",
  },
  {
    id: "robot-mural",
    docket: "CIV-2117",
    title: "The Robot Mural Mix-Up",
    claim:
      "A cafe rejected a commissioned mural because the finished robot was orange instead of the requested copper.",
    stakes: "$900 final payment",
    plaintiff: {
      name: "Sela Finch",
      role: "Independent mural artist",
      opening:
        "The cafe approved my color sketch and watched me paint for two days. Only after completion did they decide the robot was the wrong shade.",
    },
    defendant: {
      name: "Oren Pike",
      role: "Owner of Comet Cup Cafe",
      opening:
        "We asked for a dignified copper robot. What we received is bright orange and does not match our interior. That is not what we ordered.",
    },
    evidence: [
      {
        id: "contract",
        title: "Mural agreement",
        summary: "The parties' short written contract.",
        detail:
          'The design is described as "one retro robot in warm copper/orange tones." It requires a $900 final payment after completion and has no exact paint code.',
        favors: "plaintiff",
      },
      {
        id: "approved-sketch",
        title: "Approved color sketch",
        summary: "A digital sketch approved by Oren.",
        detail:
          'The sketch shows a vivid burnt-orange robot. Oren replied with a thumbs-up and the words, "Great direction—go ahead."',
        favors: "plaintiff",
      },
      {
        id: "paint-photo",
        title: "Day-one photograph",
        summary: "A timestamped photo from the cafe.",
        detail:
          "Oren appears in the background while the same orange body color covers roughly half the robot. No objection was recorded that day.",
        favors: "plaintiff",
      },
    ],
    questions: [
      {
        id: "sela-color",
        side: "plaintiff",
        prompt: "Did the final paint differ from your approved sketch?",
        answer:
          "No. I mixed the wall paint to match the approved sketch as closely as physical paint allowed.",
      },
      {
        id: "sela-fix",
        side: "plaintiff",
        prompt: "Did you offer to change the color?",
        answer:
          "I offered a discounted repaint, but not a free one because the delivered color matched the approval.",
      },
      {
        id: "oren-approval",
        side: "defendant",
        prompt: "What did you mean by 'Great direction—go ahead'?",
        answer:
          "I approved the composition. I assumed the final wall color would look more metallic and less orange.",
      },
      {
        id: "oren-day-one",
        side: "defendant",
        prompt: "Did you object when you saw the first day's paint?",
        answer:
          "No. I was busy and thought the finished highlights might make it appear copper.",
      },
    ],
    correctVerdict: "plaintiff",
    ruling:
      "The written agreement permits copper/orange tones, and the final color matches the expressly approved sketch. The cafe observed the work without objecting. Sela substantially performed and is owed the final payment.",
  },
];

export function getCourtCase(caseId: string): CourtCase {
  const courtCase = courtCases.find((candidate) => candidate.id === caseId);
  if (!courtCase) throw new Error(`Unknown court case: ${caseId}`);
  return courtCase;
}
