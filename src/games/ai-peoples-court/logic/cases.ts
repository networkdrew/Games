import type { CourtCase } from "./types";

export const courtCases: readonly CourtCase[] = [
  {
    id: "orchid-window",
    docket: "CIV-2041",
    title: "The Orchid and the Open Window",
    claim:
      "A rare orchid died while its owner was away. The owner says her neighbor ignored written care instructions.",
    stakes: "$420 replacement value",
    privateTruth:
      "Ellis opened the studio window after watering the orchid and genuinely forgot to close it. The overnight freeze killed the plant. Mara never gave an explicit window instruction. Ellis initially minimizes this mistake but admits it when pressed about the text message.",
    plaintiff: {
      name: "Mara Venn",
      role: "Orchid collector",
      opening:
        "I trusted Ellis with one simple task: water my moon orchid once and keep the studio window shut. I came home to a frozen plant and an open window.",
      voice:
        "precise, controlled, emotionally attached to the orchid; becomes sharp when Ellis minimizes the loss",
      privateKnowledge:
        "Mara knows her care card omitted the window instruction and is embarrassed by that omission. Her receipt is genuine.",
    },
    defendant: {
      name: "Ellis Rowe",
      role: "Upstairs neighbor",
      opening:
        "I watered it exactly once. The window was already cracked when I arrived, and Mara never told me it had to stay closed.",
      voice:
        "friendly but defensive, speaks in short explanations, blurts corrections when cornered",
      privateKnowledge:
        "Ellis opened the window, sent the text, and forgot it. Ellis first claims it was already open, then can be confronted with the message.",
    },
    witness: {
      name: "Ivo Chen",
      role: "Building superintendent",
      voice: "matter-of-fact, observant, dislikes speculation",
      privateKnowledge:
        "Ivo personally recorded the studio window closed Wednesday afternoon and the freeze overnight Thursday. Ivo did not see who opened it.",
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
    privateTruth:
      "The signed final invoice covered Saturday only and the club declined optional storage. Nia tried twice to warn Tobin before dismantling. Tobin relied on an earlier conditional email without reading the final order.",
    plaintiff: {
      name: "Tobin Bell",
      role: "Lantern Street Club treasurer",
      opening:
        "We paid Juniper Works for a float through Sunday. Saturday's parade was rained out, yet the float was gone before Sunday's rain-date event.",
      voice:
        "earnest, civic-minded, talks quickly and treats assumptions as shared understandings",
      privateKnowledge:
        "Tobin skimmed the final invoice and did not purchase storage, but sincerely believed the early email guaranteed Sunday.",
    },
    defendant: {
      name: "Nia Calder",
      role: "Juniper Works owner",
      opening:
        "The signed order was for Saturday only. Keeping the float another day required storage that the club declined to purchase.",
      voice:
        "calm, contractual, slightly exasperated; interrupts only to correct dates or prices",
      privateKnowledge:
        "Nia left two voicemails before dismantling and has no reason to lie. The early email was explicitly conditional.",
    },
    witness: {
      name: "Pax Moreno",
      role: "Parade coordinator",
      voice: "cheerful but careful, separates club plans from vendor promises",
      privateKnowledge:
        "Pax published the rain-date flyer for the club but never discussed it with Nia or Juniper Works.",
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
    privateTruth:
      "Sela followed the signed copper/orange language and matched the approved vivid sketch. Oren saw the first day's orange paint and stayed silent, hoping later highlights would change it. The work was completed as approved.",
    plaintiff: {
      name: "Sela Finch",
      role: "Independent mural artist",
      opening:
        "The cafe approved my color sketch and watched me paint for two days. Only after completion did they decide the robot was the wrong shade.",
      voice:
        "confident, visual, specific about process; bristles when her professionalism is questioned",
      privateKnowledge:
        "Sela matched the approved sketch and offered only a discounted repaint because she believes the contract was fulfilled.",
    },
    defendant: {
      name: "Oren Pike",
      role: "Owner of Comet Cup Cafe",
      opening:
        "We asked for a dignified copper robot. What we received is bright orange and does not match our interior. That is not what we ordered.",
      voice:
        "polished, image-conscious, hesitant when asked what exactly he approved",
      privateKnowledge:
        "Oren approved the sketch mainly for composition, saw the orange paint on day one, and chose not to object.",
    },
    witness: {
      name: "Lumi Hart",
      role: "Cafe shift manager",
      voice:
        "plainspoken, loyal to the cafe but unwilling to change what she saw",
      privateKnowledge:
        "Lumi heard Oren praise the mural on day one and saw no request for a color change until after completion.",
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
