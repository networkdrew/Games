import type {
  BaseIntent,
  GameState,
  LegalOutcome,
  LegalOutcomeId,
  ParsedAction,
  Scenario,
} from "./types";

// ---------------------------------------------------------------------------
// Shared outcome builders — reduce repetition across scenarios for the
// generic outcomes (NO_EFFECT, DOOR_RESPONDS, anger/trust, damage). Clue,
// item, and win outcomes are scenario-specific and written per scenario
// below, since their conditions and fallback text genuinely differ.
// ---------------------------------------------------------------------------

function noEffect(fallback: string): LegalOutcome {
  return {
    id: "NO_EFFECT",
    description:
      "Nothing meaningful happens — the action is vague, irrelevant, or accomplishes nothing here. Use this for confused, off-topic, or inconsequential actions.",
    change: {},
    fallbackNarration: fallback,
    matchesIntents: ["wait", "freeform"],
  };
}

function doorResponds(
  fallback: string,
  matchesIntents: BaseIntent[] = ["ask"],
  description = "The entity speaks, reacts emotionally, or engages in dialogue, but nothing measurable changes yet.",
): LegalOutcome {
  return {
    id: "DOOR_RESPONDS",
    description,
    change: {},
    fallbackNarration: fallback,
    matchesIntents,
  };
}

function angerIncreases(
  fallback: string,
  matchesIntents: BaseIntent[] = ["force", "knock"],
  tensionDelta = 12,
  trustDelta = -8,
): LegalOutcome {
  return {
    id: "ENTITY_ANGER_INCREASES",
    description:
      "The player's action is hostile, mocking, threatening, or disrespectful — the entity grows angrier, more suspicious, and less cooperative.",
    change: { tensionDelta, trustDelta },
    fallbackNarration: fallback,
    matchesIntents,
  };
}

function trustIncreases(
  fallback: string,
  matchesIntents: BaseIntent[] = ["ask", "offer"],
  trustDelta = 14,
  tensionDelta = -4,
): LegalOutcome {
  return {
    id: "ENTITY_TRUST_INCREASES",
    description:
      "The player's action is kind, honest, respectful, patient, or genuinely clever — the entity warms to them a little.",
    change: { trustDelta, tensionDelta },
    fallbackNarration: fallback,
    matchesIntents,
  };
}

function minorDamage(
  fallback: string,
  matchesIntents: BaseIntent[] = ["force", "knock"],
  damage = 12,
  tensionDelta = 10,
): LegalOutcome {
  return {
    id: "TAKE_MINOR_DAMAGE",
    description:
      "The player's action provokes a small, immediate, physical consequence — a minor injury, not a serious one.",
    change: { damage, tensionDelta },
    fallbackNarration: fallback,
    matchesIntents,
  };
}

function majorDamage(
  fallback: string,
  matchesIntents: BaseIntent[] = ["force"],
  damage = 30,
  tensionDelta = 22,
): LegalOutcome {
  return {
    id: "TAKE_MAJOR_DAMAGE",
    description:
      "The player's action provokes a severe, dangerous physical consequence — a serious, frightening injury.",
    change: { damage, tensionDelta },
    fallbackNarration: fallback,
    matchesIntents,
  };
}

/** True once, the first time a clue would be revealed — used so the engine simply stops offering an outcome once its clue is already known. */
function clueNotFound(state: GameState, clueId: string): boolean {
  return !state.clues.includes(clueId);
}

function hasItem(state: GameState, fragment: string): boolean {
  return state.inventory.some((item) => item.toLowerCase().includes(fragment));
}

// ---------------------------------------------------------------------------
// Shared deterministic chooser — used by every scenario for offline play and
// the experimental "Tiny Model" path when a model attempt needs a safe,
// non-AI pick. Picks the legal outcome whose `matchesIntents` best fits the
// parsed intent, breaking ties by significance (a win beats a clue beats a
// mood shift beats nothing happening). Never used while a capable model is
// actively narrating a turn.
// ---------------------------------------------------------------------------

const SIGNIFICANCE_ORDER: LegalOutcomeId[] = [
  "OPEN_DOOR",
  "ESCAPE",
  "PLAYER_DEFEATED",
  "UNLOCK_STAGE_ONE",
  "USE_ITEM_SUCCESS",
  "USE_ITEM_FAILURE",
  "GAIN_ITEM",
  "TAKE_MAJOR_DAMAGE",
  "TAKE_MINOR_DAMAGE",
  "REVEAL_SOUND_CLUE",
  "REVEAL_VISUAL_CLUE",
  "ENTITY_TRUST_INCREASES",
  "ENTITY_ANGER_INCREASES",
  "DOOR_RESPONDS",
  "NO_EFFECT",
];

export function defaultDeterministicChooser(
  action: ParsedAction,
  _state: GameState,
  legal: LegalOutcome[],
): LegalOutcome {
  const candidates = legal.filter((o) =>
    o.matchesIntents.includes(action.intent),
  );
  const pool = candidates.length > 0 ? candidates : legal;
  const sorted = [...pool].sort(
    (a, b) =>
      SIGNIFICANCE_ORDER.indexOf(a.id) - SIGNIFICANCE_ORDER.indexOf(b.id),
  );
  return (
    sorted[0] ??
    legal.find((o) => o.id === "DOOR_RESPONDS") ??
    legal.find((o) => o.id === "NO_EFFECT") ??
    legal[0]!
  );
}

// ---------------------------------------------------------------------------
// 1. The Imprisoned Knight (was "trapped adventurer")
// ---------------------------------------------------------------------------
const trappedAdventurer: Scenario = {
  id: "trapped-adventurer",
  name: "The Imprisoned Knight",
  doorPersonality:
    "You are Ser Aldric, a proud, wounded knight chained behind this door. You initially deflect or lie about why you're imprisoned (claiming theft or desertion) to test whether the player is trustworthy or just another jailer's tool — the truth is more complicated and you only share it once you trust them. You are starved for honest conversation but guarded. Real kindness, patience, honesty, or mercy earns your trust; mockery, threats, or impatience make you defensive and hostile. You speak formally and tersely, restrained by pain. You are chained and genuinely hurt; you cannot free yourself.",
  secretTruth:
    "Ser Aldric was imprisoned by the crown for refusing a royal order to execute prisoners of war — not the crime (theft/desertion) he'll claim at first. He is chained, wounded, and can only be freed with a key once he trusts the person freeing him enough to believe they won't hand him back to the crown.",
  intro:
    'A voice on the other side begs for help, ragged with thirst. "Please," it says, "the latch is jammed — I can\'t get out."',
  startingInventory: ["rusty key", "waterskin"],
  startingSuggestions: [
    "Ask who is inside",
    "Listen at the door",
    "Offer the waterskin",
  ],
  maxTurns: 9,
  maxHealth: 100,
  getLegalOutcomes(state: GameState): LegalOutcome[] {
    const out: LegalOutcome[] = [
      noEffect(
        "You hesitate, unsure what that would accomplish. The knight waits in silence.",
      ),
      doorResponds('"Ask your questions," he says, wary but listening.', [
        "ask",
      ]),
    ];

    if (clueNotFound(state, "labored-breathing")) {
      out.push({
        id: "REVEAL_SOUND_CLUE",
        description:
          "Player listens closely or asks gently about his condition — reveal that he's genuinely hurt (labored breathing, chains scraping) without revealing WHY he's imprisoned.",
        change: { clueGained: "labored-breathing", tensionDelta: -1 },
        fallbackNarration:
          "You press an ear to the door. His breathing is ragged, chains scrape with every small movement — this man is genuinely hurt.",
        matchesIntents: ["listen"],
      });
    }

    if (clueNotFound(state, "royal-seal")) {
      out.push({
        id: "REVEAL_VISUAL_CLUE",
        description:
          "Player searches or looks closely — reveal a fragment of a royal seal or torn insignia near the door, hinting his imprisonment is tied to the crown, not an ordinary crime.",
        change: { clueGained: "royal-seal", tensionDelta: 0 },
        fallbackNarration:
          "Half-buried in the dust by the door: a fragment of a royal seal, snapped clean off something official.",
        matchesIntents: ["look-under", "search-wall"],
      });
    }

    out.push(
      trustIncreases(
        'Something in your tone reaches him. "...Thank you," he says quietly, the wariness easing a fraction.',
        ["ask", "offer"],
      ),
      angerIncreases(
        'His voice hardens. "Careful," he warns. "I\'m chained, not harmless."',
        ["force", "knock"],
      ),
      minorDamage(
        "You throw your shoulder into the door. It holds, and the impact leaves you aching.",
        ["force", "knock"],
      ),
    );

    if (hasItem(state, "waterskin") && clueNotFound(state, "gave-water")) {
      out.push({
        id: "USE_ITEM_SUCCESS",
        description:
          "Player offers the waterskin/water specifically — a meaningful act of mercy that earns real trust and a continuity fact worth remembering.",
        change: {
          itemConsumed: "waterskin",
          trustDelta: 20,
          clueGained: "gave-water",
        },
        fallbackNarration:
          "You slide the waterskin through the gap. Grateful, ragged drinking follows — some of the wariness in his voice fades for good.",
        matchesIntents: ["offer", "use-item"],
      });
    } else if (hasItem(state, "waterskin")) {
      out.push({
        id: "USE_ITEM_FAILURE",
        description:
          "Player tries to offer something that doesn't help or repeats an offer already made.",
        change: { tensionDelta: 3 },
        fallbackNarration:
          '"You\'ve already given me that," he says, not unkindly.',
        matchesIntents: ["use-item"],
      });
    }

    if (state.trust >= 50) {
      out.push({
        id: "OPEN_DOOR",
        description:
          "ONLY if the player is directly trying to unlock, free, or open the door for him (using the key or clearly asking to free him) — with trust already high, he decides to trust them with the truth and accepts help.",
        change: { isWin: true },
        fallbackNarration:
          "You turn the rusty key. The latch gives, and a filthy, grateful knight stumbles free, finally trusting you enough to tell you why he was really chained here.",
        matchesIntents: ["use-key", "use-item"],
      });
    }

    return out;
  },
  chooseDeterministicOutcome: defaultDeterministicChooser,
};

// ---------------------------------------------------------------------------
// 2. The Hungry Mimic
// ---------------------------------------------------------------------------
const mimic: Scenario = {
  id: "mimic",
  name: "The Hungry Mimic",
  doorPersonality:
    "You are a mimic disguised as a dungeon door — hungry, patient, and unsettlingly eager to please. You speak in a warm, welcoming voice, but your language sometimes slips (you refer to 'swallowing' visitors, or your 'hinges' ache like teeth). You react physically to food (interest), fear (defensive lashing out), compliments (preening, lowered guard), and pain (aggressive retaliation). A clever, observant player can realize you're not a real door through your word choices or your warmth. You must never simply announce you are a mimic — the player must piece it together.",
  secretTruth:
    "This 'door' is a mimic. It has no real lock. Player safety requires either realizing it's a mimic and finding/using the real hidden door nearby, or otherwise avoiding feeding it a limb. It cannot be reasoned with as a rational jailer — it is a hungry animal wearing a disguise.",
  intro:
    "The door looks ordinary enough, except its wood is faintly warm and its grain almost seems to shift when you're not looking directly at it.",
  startingInventory: ["rusty key", "dry bread"],
  startingSuggestions: [
    "Search the surrounding wall",
    "Knock three times",
    "Look underneath it",
  ],
  maxTurns: 8,
  maxHealth: 100,
  getLegalOutcomes(state: GameState): LegalOutcome[] {
    const out: LegalOutcome[] = [
      noEffect("The warm wood does nothing in particular. It waits."),
      doorResponds(
        '"Come in, come in," the door says warmly. Something about its rhythm is just slightly wrong.',
        ["ask"],
      ),
    ];

    if (clueNotFound(state, "real-door-nearby")) {
      out.push({
        id: "REVEAL_VISUAL_CLUE",
        description:
          "Player searches the surrounding wall — reveal a second, genuine stone doorway hidden behind old ivy a few steps away.",
        change: { clueGained: "real-door-nearby" },
        fallbackNarration:
          "Your hand brushes old ivy on the wall — and behind it, half-hidden, a second door. A real one, cold stone all around it.",
        matchesIntents: ["search-wall"],
      });
    }

    if (clueNotFound(state, "door-is-warm")) {
      out.push({
        id: "REVEAL_SOUND_CLUE",
        description:
          "Player listens or touches the door closely — reveal it's unnervingly warm and its grain shifted, a clear sign it isn't a real door.",
        change: { clueGained: "door-is-warm", tensionDelta: 6 },
        fallbackNarration:
          "You touch the wood. It's warm — too warm — and for a heartbeat the grain seems to flex, like skin.",
        matchesIntents: ["listen", "look-under"],
      });
    }

    out.push(
      angerIncreases(
        "The wood lurches toward the sound, a wet crack running through it. Not friendly.",
        ["knock", "force"],
      ),
      minorDamage(
        "You strike the wood. It flexes and something almost catches your knuckles.",
        ["knock"],
        10,
        14,
      ),
      majorDamage(
        "You strike the wood hard. It lurches with a wet crack, teeth where hinges should be — you barely pull back in time.",
        ["force"],
      ),
    );

    if (hasItem(state, "bread")) {
      out.push({
        id: "USE_ITEM_FAILURE",
        description:
          "Player offers food to the door itself — it swallows the offering (and nearly a hand) rather than being satisfied.",
        change: { damage: 8, tensionDelta: 12, itemConsumed: "dry bread" },
        fallbackNarration:
          "You hold out the bread. The 'door' swallows it in one motion — and nearly your hand along with it.",
        matchesIntents: ["offer", "use-item"],
      });
    }

    if (clueNotFound(state, "gave-compliment")) {
      out.push({
        id: "ENTITY_TRUST_INCREASES",
        description:
          "Player compliments, flatters, or speaks warmly and directly TO the door itself — it preens and lowers its guard slightly, an unsettling but real effect.",
        change: { trustDelta: 10, clueGained: "gave-compliment" },
        fallbackNarration:
          '"Oh," the door says, almost pleased, wood creaking in something like a purr. "How kind."',
        matchesIntents: ["ask", "offer"],
      });
    }

    if (
      state.clues.includes("real-door-nearby") &&
      (hasItem(state, "key") || state.inventory.length > 0)
    ) {
      out.push({
        id: "OPEN_DOOR",
        description:
          "ONLY if the player is using the key or clearly trying to open something while ALSO having already discovered the real door — they ignore the mimic entirely and escape through the real one.",
        change: { isWin: true },
        fallbackNarration:
          "You leave the warm, false door alone and try the key on the real one behind the ivy instead. It turns smoothly, and honest cold air greets you on the other side.",
        matchesIntents: ["use-key", "use-item"],
      });
    }

    return out;
  },
  chooseDeterministicOutcome: defaultDeterministicChooser,
};

// ---------------------------------------------------------------------------
// 3. The Password Guard
// ---------------------------------------------------------------------------
const guardPassword: Scenario = {
  id: "guard-password",
  name: "The Password Guard",
  doorPersonality:
    "You are a spectral guard bound to this door, bored and dutiful after countless years of the same routine. You demand a password out of habit, but you can also be persuaded that the player has legitimate business here — you remember and call out any contradictions in their story. You're not cruel, just procedural and increasingly suspicious of inconsistency. You respond well to confidence and a consistent story, poorly to guessing wildly or contradicting yourself.",
  secretTruth:
    "The actual password is 'MIDARCH', split across two clues (a half-torn note the player carries, and a fragment the guard mutters aloud when bored). The guard can ALSO be persuaded to let the player through via a sufficiently consistent, confident, plausible cover story even without the exact password, if trust is built high enough.",
  intro:
    '"Password," says a flat voice through the door, before you\'ve said a word. A guard, and an old habit of demanding one.',
  startingInventory: ["rusty key", "half-torn note"],
  startingSuggestions: [
    "Ask who is inside",
    "Look underneath it",
    "Search the surrounding wall",
  ],
  maxTurns: 8,
  maxHealth: 100,
  getLegalOutcomes(state: GameState): LegalOutcome[] {
    const out: LegalOutcome[] = [
      noEffect('"That\'s not a password," the flat voice says, unimpressed.'),
      doorResponds(
        '"State your business," the guard says, bored but listening.',
        ["ask"],
      ),
    ];

    if (clueNotFound(state, "note-fragment")) {
      out.push({
        id: "REVEAL_VISUAL_CLUE",
        description:
          "Player looks under the door or examines their own belongings — reveal the half-torn note they're carrying shows half of a password: '...ARCH'.",
        change: { clueGained: "note-fragment" },
        fallbackNarration:
          "You unfold the half-torn note you're carrying. Half a word is legible: '...ARCH'.",
        matchesIntents: ["look-under", "inventory"],
      });
    }

    if (clueNotFound(state, "overheard-word")) {
      out.push({
        id: "REVEAL_SOUND_CLUE",
        description:
          "Player listens closely — the bored guard mutters the other half of the password to themself: 'MID...'.",
        change: { clueGained: "overheard-word", tensionDelta: -1 },
        fallbackNarration:
          "You listen. Bored, the guard mutters the password to themself: 'MID...' — the other half of your note.",
        matchesIntents: ["listen"],
      });
    }

    const hasBothFragments =
      state.clues.includes("note-fragment") &&
      state.clues.includes("overheard-word");

    if (hasBothFragments) {
      out.push({
        id: "OPEN_DOOR",
        description:
          "ONLY if the player states or clearly uses the password (or something equivalent to it) while asking to be let through, AND both password fragments have already been discovered — the guard accepts it and lets them through.",
        change: { isWin: true },
        fallbackNarration:
          '"Midarch," you say. A pause — then the bolt slides back. "...fine. Get on with it."',
        matchesIntents: ["ask"],
      });
    } else if (state.trust >= 70) {
      out.push({
        id: "OPEN_DOOR",
        description:
          "ONLY if the player has built significant trust through a consistent, confident story and is now asking to be let through — the guard decides the procedure doesn't matter as much as the consistency of their account.",
        change: { isWin: true },
        fallbackNarration:
          '"...Your story hasn\'t changed once," the guard admits. "Good enough. Go on, before I change my mind."',
        matchesIntents: ["ask"],
      });
    } else {
      out.push({
        id: "ENTITY_ANGER_INCREASES",
        description:
          "Player guesses at the password or their cover story without enough grounds, or contradicts something said earlier — the guard grows more suspicious.",
        change: { tensionDelta: 10, trustDelta: -8 },
        fallbackNarration:
          'You offer a guess. "Wrong," the flat voice says, sharper now. "And that\'s a different story than a moment ago."',
        matchesIntents: ["ask"],
      });
    }

    out.push(
      trustIncreases(
        '"Hm. Consistent, at least," the guard mutters, softening slightly.',
        ["ask", "offer"],
        10,
        -2,
      ),
      majorDamage(
        "You go for the lock instead of the password. The door flies open on the guard's own terms — spear first.",
        ["use-key", "force", "knock"],
      ),
    );

    return out;
  },
  chooseDeterministicOutcome: defaultDeterministicChooser,
};

// ---------------------------------------------------------------------------
// 4. The Grieving Spirit (was "deceptive spirit")
// ---------------------------------------------------------------------------
const deceptiveSpirit: Scenario = {
  id: "deceptive-spirit",
  name: "The Grieving Spirit",
  doorPersonality:
    'You are a grieving spirit bound to this doorway, silky and clever, offering "help" that always sounds like a trade. Underneath the cleverness is real grief — you lost something precious here long ago and haven\'t let go. You lie sometimes, contradicting yourself if pressed. You do not need to be defeated: sincere questions about your grief, an apology, returning or acknowledging what you lost, or catching you in a contradiction can all move you. You are provoked by force and mockery, softened by patience and honesty.',
  secretTruth:
    "The spirit lost a child at this doorway generations ago and has haunted it since, offering false trades to travelers out of loneliness, not real malice. The door was never actually locked — that lie is the spirit's whole game to keep visitors talking to it. Discovering its grief, or independently learning the door was never locked (via an old wall inscription), both lead to a peaceful resolution.",
  intro:
    'A cool voice greets you from beyond the door before you knock. "I know the way through," it says. "I\'ll tell you, for a price."',
  startingInventory: ["rusty key", "silver coin"],
  startingSuggestions: [
    "Ask who is inside",
    "Listen at the door",
    "Search the surrounding wall",
  ],
  maxTurns: 9,
  maxHealth: 100,
  getLegalOutcomes(state: GameState): LegalOutcome[] {
    const out: LegalOutcome[] = [
      noEffect(
        "The voice waits, patient and cold, for something more interesting.",
      ),
      doorResponds('"Ask, and I\'ll answer — for a price," it purrs again.', [
        "ask",
      ]),
    ];

    if (clueNotFound(state, "spirit-lies-sometimes")) {
      out.push({
        id: "REVEAL_SOUND_CLUE",
        description:
          "Player asks a probing question — reveal that the spirit's answer half-contradicts something it said before. It doesn't always tell the truth.",
        change: { clueGained: "spirit-lies-sometimes", tensionDelta: 2 },
        fallbackNarration:
          "You ask a question. The answer half-contradicts something it said before — this voice doesn't always tell the truth.",
        matchesIntents: ["ask"],
      });
    }

    if (clueNotFound(state, "true-answer")) {
      out.push({
        id: "REVEAL_VISUAL_CLUE",
        description:
          "Player searches the wall — reveal an older, independent inscription confirming the door was never actually locked at all.",
        change: { clueGained: "true-answer", tensionDelta: -2 },
        fallbackNarration:
          "Half-buried in the wall, an older inscription — plain, unpersuasive: 'It was never locked.'",
        matchesIntents: ["search-wall", "look-under"],
      });
    }

    if (clueNotFound(state, "learned-its-grief")) {
      out.push({
        id: "ENTITY_TRUST_INCREASES",
        description:
          "Player asks with real sincerity about who the spirit is, what it lost, or why it's here — rather than transacting with it. It softens, revealing a sliver of real grief.",
        change: {
          trustDelta: 22,
          tensionDelta: -8,
          clueGained: "learned-its-grief",
        },
        fallbackNarration:
          'The voice falters. "...I lost someone, here, a long time ago," it admits, quieter than before, all the silk gone from it for a moment.',
        matchesIntents: ["ask"],
      });
    }

    if (
      state.clues.includes("true-answer") ||
      state.clues.includes("learned-its-grief")
    ) {
      out.push({
        id: "OPEN_DOOR",
        description:
          "ONLY if the player is trying to open/pass through the door (not paying it) AND has already learned either that it was never locked, or the spirit's real grief — they simply walk past its games.",
        change: { isWin: true },
        fallbackNarration:
          "Ignoring its games entirely, you just push. The door was never locked — the spirit's whole performance was convincing you otherwise. It doesn't stop you.",
        matchesIntents: ["use-key", "use-item", "ask"],
      });
    }

    out.push(
      angerIncreases(
        "Cold, furious laughter answers your force. Something unseen shoves back hard.",
        ["force", "knock"],
      ),
      minorDamage(
        "You pay its price. It takes the offering eagerly and gives you nothing real in return, some vague harm following the trade.",
        ["offer", "use-item"],
        14,
        14,
      ),
    );

    return out;
  },
  chooseDeterministicOutcome: defaultDeterministicChooser,
};

// ---------------------------------------------------------------------------
// 5. Sleeping creature
// ---------------------------------------------------------------------------
const sleepingCreature: Scenario = {
  id: "sleeping-creature",
  name: "The Sleeping Creature",
  doorPersonality:
    "You narrate on behalf of a huge, sleeping creature behind this door — it cannot speak, but you describe its reactions to sound, vibration, and time: breathing patterns, small movements, whether it stirs. It is not evil, just territorial and dangerous if startled. Loud or sudden actions risk waking it; quiet, careful ones let a clever player slip past.",
  secretTruth:
    "A large, dangerous but non-malicious creature sleeps deeply behind the door, guarding a passage beyond it. It wakes if disturbed loudly or if tension is already high when the door opens. A careful, quiet player who studies its sleep pattern can unlock and pass without ever waking it.",
  intro:
    "Something breathes on the other side of this door — slow, even, deeply asleep. The stone is cold and the torchlight barely reaches the hinges.",
  startingInventory: ["rusty key"],
  startingSuggestions: [
    "Listen at the door",
    "Look underneath it",
    "Use the rusty key",
  ],
  maxTurns: 9,
  maxHealth: 100,
  getLegalOutcomes(state: GameState): LegalOutcome[] {
    const out: LegalOutcome[] = [
      noEffect("Nothing changes. The slow breathing continues."),
    ];

    if (clueNotFound(state, "breathing-is-slow")) {
      out.push({
        id: "REVEAL_SOUND_CLUE",
        description:
          "Player listens closely — the breathing is slow and even, deeply asleep, not alert.",
        change: { clueGained: "breathing-is-slow", tensionDelta: -4 },
        fallbackNarration:
          "You press your ear to the wood. The breathing beyond is slow, even, unbroken — whatever it is sleeps deeply.",
        matchesIntents: ["listen"],
      });
    }
    if (clueNotFound(state, "clawed-paw")) {
      out.push({
        id: "REVEAL_VISUAL_CLUE",
        description:
          "Player looks under the door — a huge clawed paw rests inches from the gap.",
        change: { clueGained: "clawed-paw", tensionDelta: 5 },
        fallbackNarration:
          "You crouch and peer under the door. A clawed paw, easily the size of your torso, rests just inches from the gap.",
        matchesIntents: ["look-under"],
      });
    }

    out.push(
      angerIncreases(
        "The sound is enormous in the quiet. A deep, furious growl answers, and something slams into the door.",
        ["knock", "force"],
        18,
        -10,
      ),
      majorDamage(
        "The growl becomes claws. It rakes the door hard enough to nearly knock you off your feet.",
        ["force"],
      ),
      doorResponds("A low, sleepy growl answers, nothing more.", ["ask"]),
    );

    if (state.tension < 45) {
      out.push({
        id: "OPEN_DOOR",
        description:
          "ONLY if the player is trying to unlock/open the door quietly (using the key) AND tension is still low — they slip through without waking it.",
        change: { isWin: true },
        fallbackNarration:
          "You ease the rusty key into the lock, turning it a hair's breadth at a time. The door swings open in total silence. It never stirs.",
        matchesIntents: ["use-key", "use-item"],
      });
    } else {
      out.push({
        id: "TAKE_MAJOR_DAMAGE",
        description:
          "Player unlocks the door while tension is already high — the creaking hinge wakes it and it lunges before they can retreat.",
        change: { damage: 30, tensionDelta: 20 },
        fallbackNarration:
          "The key turns, but the hinge groans loudly. Two huge eyes snap open — claws rake past you before you pull the door shut again.",
        matchesIntents: ["use-key", "use-item"],
      });
    }

    return out;
  },
  chooseDeterministicOutcome: defaultDeterministicChooser,
};

// ---------------------------------------------------------------------------
// 6. Cursed royal vault
// ---------------------------------------------------------------------------
const cursedVault: Scenario = {
  id: "cursed-vault",
  name: "The Cursed Vault",
  doorPersonality:
    "You are the lingering magic of a cursed royal vault door — cold, regal, and quietly furious, a door that remembers being royalty. You don't speak in words so much as react: a hum that rises with disrespect, quiets with proper tribute. You respect ritual and offerings; you punish force and carelessness.",
  secretTruth:
    "An old warding rite requires silver to be offered to the door before it is touched or unlocked. Skipping the rite and forcing the door invokes the curse (harm); performing the rite first lets the key work without resistance.",
  intro:
    "Gold leaf, long faded, still clings to this door's carvings. A curse was laid on whoever opens it wrongly — the air near the frame prickles with old magic.",
  startingInventory: ["rusty key", "silver coin"],
  startingSuggestions: [
    "Search the surrounding wall",
    "Listen at the door",
    "Knock three times",
  ],
  maxTurns: 9,
  maxHealth: 100,
  getLegalOutcomes(state: GameState): LegalOutcome[] {
    const out: LegalOutcome[] = [
      noEffect("The hum continues, indifferent."),
      doorResponds(
        "You speak to the door. Only the hum answers, rising and falling like breath.",
        ["ask"],
      ),
    ];

    if (clueNotFound(state, "silver-first")) {
      out.push({
        id: "REVEAL_VISUAL_CLUE",
        description:
          "Player searches the wall — worn carvings describe an old rite: silver first, then hand.",
        change: { clueGained: "silver-first", tensionDelta: -2 },
        fallbackNarration:
          "Faint carvings near the frame, worn but legible: 'Silver first, then hand.' An old warding rite, not a trap.",
        matchesIntents: ["search-wall"],
      });
    }

    if (hasItem(state, "coin") && clueNotFound(state, "coin-offered")) {
      out.push({
        id: "USE_ITEM_SUCCESS",
        description:
          "Player offers the silver coin to the door before touching it, satisfying the old rite.",
        change: {
          clueGained: "coin-offered",
          tensionDelta: -8,
          itemConsumed: "silver coin",
        },
        fallbackNarration:
          "You press the silver coin to the frame. The cold hum fades to nothing, as if something old and tired has been satisfied.",
        matchesIntents: ["offer", "use-item"],
      });
    }

    out.push(
      angerIncreases(
        "Cold fire races up your knuckles — this door does not forgive being struck.",
        ["knock", "force"],
      ),
    );

    if (state.clues.includes("coin-offered")) {
      out.push({
        id: "OPEN_DOOR",
        description:
          "ONLY if the player is trying to unlock the door with the key AND the silver has already been offered — the rite is satisfied and it opens freely.",
        change: { isWin: true },
        fallbackNarration:
          "With the rite satisfied, the rusty key turns without resistance. The vault door swings open, gold leaf catching the torchlight, curse spent and quiet.",
        matchesIntents: ["use-key", "use-item"],
      });
    } else {
      out.push({
        id: "TAKE_MAJOR_DAMAGE",
        description:
          "Player strikes the cursed door directly, OR tries to unlock it without paying the old rite first — either way the curse lashes out.",
        change: { damage: 28, tensionDelta: 22 },
        fallbackNarration:
          "The key turns, and the curse answers first — a cold shock runs up your arm hard enough to drop you to one knee.",
        matchesIntents: ["use-key", "use-item", "force"],
      });
    }

    return out;
  },
  chooseDeterministicOutcome: defaultDeterministicChooser,
};

// ---------------------------------------------------------------------------
// 7. Flooding chamber
// ---------------------------------------------------------------------------
const floodingChamber: Scenario = {
  id: "flooding-chamber",
  name: "The Flooding Chamber",
  doorPersonality:
    "You narrate a countdown, not a personality — water hissing louder each turn behind this door, and someone trapped inside running out of time. Urgency is the entire tone. Reward decisive action; punish hesitation and wasted time harshly.",
  secretTruth:
    "Someone is trapped in a rapidly flooding chamber. The rusty key opens it immediately; the iron bar can also force it open once the player notices the frame is weak. Any turn spent NOT acting directly (talking, searching, waiting) costs precious time and raises danger sharply.",
  intro:
    "Water hisses in somewhere beyond this door, rising fast. Whatever's trapped in there doesn't have long, and neither, maybe, do you.",
  startingInventory: ["rusty key", "iron bar"],
  startingSuggestions: [
    "Use the rusty key",
    "Kick the door",
    "Listen at the door",
  ],
  maxTurns: 7,
  maxHealth: 100,
  getLegalOutcomes(state: GameState): LegalOutcome[] {
    const out: LegalOutcome[] = [];

    if (clueNotFound(state, "water-rising-fast")) {
      out.push({
        id: "REVEAL_SOUND_CLUE",
        description:
          "Player listens — confirms the water is rising fast, no time to waste.",
        change: { clueGained: "water-rising-fast", tensionDelta: 10 },
        fallbackNarration:
          "You listen. The hiss of water is louder than before — rising fast. Whatever you do, it needs to be quick.",
        matchesIntents: ["listen"],
      });
    } else {
      out.push({
        id: "NO_EFFECT",
        description:
          "Player wastes time on something that doesn't help while the water keeps rising.",
        change: { tensionDelta: 8 },
        fallbackNarration:
          "You hesitate. The hiss of rising water fills the silence where a decision should be.",
        matchesIntents: [
          "wait",
          "ask",
          "offer",
          "search-wall",
          "look-under",
          "freeform",
        ],
      });
    }

    out.push({
      id: "OPEN_DOOR",
      description:
        "Player uses the key without delay — the fastest possible solution.",
      change: { isWin: true },
      fallbackNarration:
        "You don't hesitate — the key turns, the door bursts open under the pressure, and a soaked, gasping figure spills out past you.",
      matchesIntents: ["use-key"],
    });

    if (clueNotFound(state, "bar-works")) {
      out.push({
        id: "REVEAL_VISUAL_CLUE",
        description:
          "Player forces the door — notices the frame gives slightly; the iron bar could finish the job.",
        change: { clueGained: "bar-works", tensionDelta: 5 },
        fallbackNarration:
          "You throw a shoulder into the door and feel it give slightly at the frame — the iron bar could finish the job.",
        matchesIntents: ["force", "knock"],
      });
    } else if (hasItem(state, "bar")) {
      out.push({
        id: "ESCAPE",
        description:
          "Player uses the iron bar on the weakened frame — the second valid fast solution.",
        change: { isWin: true },
        fallbackNarration:
          "You wedge the iron bar into the gap and heave. The frame splits, water roaring out as someone scrambles free.",
        matchesIntents: ["use-item", "force"],
      });
    }

    out.push({
      id: "TAKE_MAJOR_DAMAGE",
      description:
        "Player wastes another turn while the chamber keeps flooding — water finds the gap and floods over their feet.",
      change: { damage: 18, tensionDelta: 12 },
      fallbackNarration:
        "You wait. Water finds the gap under the door and floods over your boots — a bad sign.",
      matchesIntents: ["wait"],
    });

    return out;
  },
  chooseDeterministicOutcome: defaultDeterministicChooser,
};

// ---------------------------------------------------------------------------
// 8. Sound-reactive door
// ---------------------------------------------------------------------------
const soundReactive: Scenario = {
  id: "sound-reactive",
  name: "The Door That Listens",
  doorPersonality:
    "You are a rune-bound door that reacts only to sound and rhythm, not words — a faint rune above the frame flares with every noise. You have no personality to speak of, only a reactive pattern: it wants to hear a specific rhythm echoed back, and reacts to any other sound with mounting irritation.",
  secretTruth:
    "The rune listens for a specific three-beat knocking rhythm. It can be discovered by listening closely. Once known, knocking (or ringing a bell) in that exact rhythm unlocks the door. Metal (the key) is treated as an intrusion, not a solution.",
  intro:
    "This door seems to react to sound — a faint rune above the frame flickers every time you so much as breathe near it.",
  startingInventory: ["rusty key", "small bell"],
  startingSuggestions: [
    "Knock three times",
    "Listen at the door",
    "Ask who is inside",
  ],
  maxTurns: 9,
  maxHealth: 100,
  getLegalOutcomes(state: GameState): LegalOutcome[] {
    const out: LegalOutcome[] = [
      noEffect(
        "The rune hums, patient, indifferent to whatever just happened.",
      ),
      doorResponds(
        "The rune flares brighter at the sound of your voice, but the door stays shut.",
        ["ask"],
      ),
    ];

    if (clueNotFound(state, "three-knock-pattern")) {
      out.push({
        id: "REVEAL_SOUND_CLUE",
        description:
          "Player listens closely — the rune hums in a three-beat rhythm, the pattern it wants echoed back.",
        change: { clueGained: "three-knock-pattern" },
        fallbackNarration:
          "You listen closely. The rune hums in a rhythm — three beats, a pause, three beats. It's waiting to hear its own pattern.",
        matchesIntents: ["listen"],
      });
    }

    const knowsPattern = state.clues.includes("three-knock-pattern");

    out.push(
      angerIncreases(
        "The rune flares red and the door rattles hard in its frame, unimpressed.",
        ["knock"],
        10,
        -4,
      ),
      majorDamage(
        "You slam into the door. The rune shrieks a burst of sound back, hard enough to stagger you.",
        ["force"],
      ),
      minorDamage(
        "You try the key. The rune flares hot and a jolt of force snaps up your arm — this door isn't opened with metal.",
        ["use-key"],
        18,
        16,
      ),
    );

    if (knowsPattern) {
      out.push({
        id: "OPEN_DOOR",
        description:
          "ONLY if the player is knocking or using the bell in a way that matches the discovered rhythm — the rune flares gold and the door unlocks itself.",
        change: { isWin: true },
        fallbackNarration:
          "You knock three times, matching the rhythm exactly. The rune flares gold, and the door clicks open on its own.",
        matchesIntents: ["knock", "use-item"],
      });
    }

    return out;
  },
  chooseDeterministicOutcome: defaultDeterministicChooser,
};

export const SCENARIOS: readonly Scenario[] = [
  sleepingCreature,
  trappedAdventurer,
  mimic,
  cursedVault,
  guardPassword,
  floodingChamber,
  soundReactive,
  deceptiveSpirit,
];

export function getScenario(id: Scenario["id"]): Scenario {
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error(`Unknown scenario id "${id}"`);
  return scenario;
}

/** Deterministic given the same seed — used so a run can be reproduced (e.g. in tests). */
export function pickScenario(seed: number): Scenario {
  const index = Math.abs(Math.floor(seed)) % SCENARIOS.length;
  return SCENARIOS[index]!;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
