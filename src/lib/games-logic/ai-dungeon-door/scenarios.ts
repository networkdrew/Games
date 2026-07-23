import type { GameState, Outcome, ParsedAction, Scenario } from "./types";

/** True once, the first time this clue is discovered — used to avoid handing out the same clue twice for repeated actions. */
function isNewClue(state: GameState, clueId: string): boolean {
  return !state.clues.includes(clueId);
}

function hasItemContaining(state: GameState, fragment: string): boolean {
  return state.inventory.some((item) => item.toLowerCase().includes(fragment));
}

const GENERIC_FREEFORM: Outcome = {
  kind: "tension-only",
  tensionDelta: 3,
  summary: "The player does something vague and non-committal near the door.",
  fallbackNarration:
    "You hesitate, unsure what that would even accomplish here. The door gives nothing away.",
};

// ---------------------------------------------------------------------------
// 1. Sleeping creature
// ---------------------------------------------------------------------------
const sleepingCreature: Scenario = {
  id: "sleeping-creature",
  name: "The Sleeping Creature",
  doorPersonality:
    "hushed and heavy, as if it's holding its breath along with whatever sleeps behind it",
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
  resolve(action: ParsedAction, state: GameState): Outcome {
    const quietClueFound = state.clues.includes("breathing-is-slow");
    switch (action.intent) {
      case "listen":
        if (isNewClue(state, "breathing-is-slow")) {
          return {
            kind: "clue",
            clueGained: "breathing-is-slow",
            tensionDelta: -4,
            summary:
              "The player listens closely; the breathing beyond the door is slow and even — deeply asleep, not alert.",
            fallbackNarration:
              "You press your ear to the wood. The breathing beyond is slow, even, unbroken — whatever it is sleeps deeply.",
          };
        }
        return {
          kind: "neutral",
          tensionDelta: -1,
          summary: "The player listens again; nothing has changed.",
          fallbackNarration:
            "You listen again. The same slow breathing, undisturbed.",
        };
      case "look-under":
        if (isNewClue(state, "clawed-paw")) {
          return {
            kind: "clue",
            clueGained: "clawed-paw",
            tensionDelta: 5,
            summary:
              "The player looks under the door and sees a huge clawed paw resting inches from the gap.",
            fallbackNarration:
              "You crouch and peer under the door. A clawed paw, easily the size of your torso, rests just inches from the gap.",
          };
        }
        return {
          kind: "neutral",
          summary: "The player looks under the door again.",
          fallbackNarration: "You look again. The paw hasn't moved a hair.",
        };
      case "use-key":
      case "use-item":
        if (action.intent === "use-key" || hasItemContaining(state, "key")) {
          if (quietClueFound && state.tension < 50) {
            return {
              kind: "win",
              summary:
                "The player, knowing the creature sleeps deeply, eases the rusty key into the lock and opens the door without a sound. It never wakes.",
              fallbackNarration:
                "You ease the rusty key into the lock, turning it a hair's breadth at a time. The door swings open in total silence. The creature never stirs, and beyond it, open air and a way forward.",
            };
          }
          return {
            kind: "damage",
            damage: 30,
            tensionDelta: 25,
            summary:
              "The player unlocks the door carelessly; the creaking hinge wakes the creature, which lunges before the player can retreat.",
            fallbackNarration:
              "The key turns, but the hinge groans loudly. Two huge eyes snap open in the dark — and claws rake past you before you can pull the door shut again.",
          };
        }
        return {
          kind: "neutral",
          tensionDelta: 2,
          summary: "The player fumbles with an item that does nothing here.",
          fallbackNarration:
            "You try it against the door. Nothing happens, and the breathing beyond doesn't change.",
        };
      case "knock":
      case "force":
        return {
          kind: "damage",
          damage: 35,
          tensionDelta: 30,
          summary:
            "The player knocks or forces the door loudly, waking the creature, which slams against the door in fury.",
          fallbackNarration:
            "The sound is enormous in the quiet. The breathing stops — replaced by a deep, furious growl and a weight that slams into the door hard enough to nearly knock you off your feet.",
        };
      case "offer":
        return {
          kind: "tension-only",
          tensionDelta: -2,
          summary:
            "The player offers food through the gap, which the sleeping creature ignores entirely.",
          fallbackNarration:
            "You slide a bit of food under the door. It goes untouched. Whatever's in there isn't hungry — it's asleep.",
        };
      case "ask":
        return {
          kind: "tension-only",
          tensionDelta: 4,
          summary:
            "The player asks aloud who's there; a low, sleepy growl answers instead of words.",
          fallbackNarration:
            '"Who\'s there?" you whisper. Something rumbles back — not words, just a low, sleepy growl.',
        };
      case "search-wall":
        if (isNewClue(state, "loose-stone")) {
          return {
            kind: "clue",
            clueGained: "loose-stone",
            tensionDelta: 1,
            summary:
              "The player finds a loose stone in the wall beside the door, hinting at another way past.",
            fallbackNarration:
              "Your fingers catch on a loose stone beside the frame. It wiggles, but won't come free without more time than you have.",
          };
        }
        return {
          kind: "neutral",
          summary: "The player searches the wall again, finding nothing new.",
          fallbackNarration: "The wall gives up nothing else.",
        };
      case "wait":
        return {
          kind: "tension-only",
          tensionDelta: -3,
          summary: "The player waits quietly; the creature sleeps on.",
          fallbackNarration:
            "You wait. The slow breathing continues, undisturbed by your patience.",
        };
      case "inventory":
        return GENERIC_FREEFORM;
      case "freeform":
      default:
        return GENERIC_FREEFORM;
    }
  },
};

// ---------------------------------------------------------------------------
// 2. Trapped adventurer
// ---------------------------------------------------------------------------
const trappedAdventurer: Scenario = {
  id: "trapped-adventurer",
  name: "The Trapped Adventurer",
  doorPersonality:
    "anxious and pleading, carrying a voice that wants to trust you but has been fooled before",
  intro:
    'A voice on the other side begs for help, ragged with thirst. "Please," it says, "the latch is jammed, I can\'t get out."',
  startingInventory: ["rusty key", "waterskin"],
  startingSuggestions: [
    "Ask who is inside",
    "Listen at the door",
    "Use the rusty key",
  ],
  maxTurns: 9,
  maxHealth: 100,
  resolve(action: ParsedAction, state: GameState): Outcome {
    const trustsThem = state.clues.includes("story-checks-out");
    switch (action.intent) {
      case "ask":
        if (isNewClue(state, "story-checks-out")) {
          return {
            kind: "clue",
            clueGained: "story-checks-out",
            tensionDelta: -3,
            summary:
              "The player asks questions; the voice answers with small, consistent, unglamorous details — it sounds like a real trapped person, not a trick.",
            fallbackNarration:
              "You ask questions through the door. The answers come back small and specific — a torn map, a twisted ankle, three days lost. It sounds true.",
          };
        }
        return {
          kind: "neutral",
          summary: "The player asks again; the story stays consistent.",
          fallbackNarration: "The voice repeats itself, just as anxious.",
        };
      case "listen":
        if (isNewClue(state, "jammed-latch")) {
          return {
            kind: "clue",
            clueGained: "jammed-latch",
            tensionDelta: -1,
            summary:
              "The player listens and hears real scraping against a stuck latch, not silence.",
            fallbackNarration:
              "You press an ear to the door. There — the scrape of fingers on a stuck latch, over and over.",
          };
        }
        return {
          kind: "neutral",
          summary: "The player listens again; the scraping continues.",
          fallbackNarration: "The same frantic scraping continues.",
        };
      case "use-key":
      case "use-item":
        if (hasItemContaining(state, "key") || action.intent === "use-key") {
          if (trustsThem) {
            return {
              kind: "win",
              summary:
                "Trusting the consistent story, the player unlocks the door and frees the genuinely trapped adventurer.",
              fallbackNarration:
                "You turn the rusty key. The latch gives, the door swings, and a filthy, grateful adventurer stumbles out, already thanking you between coughs.",
            };
          }
          return {
            kind: "damage",
            damage: 20,
            tensionDelta: 15,
            summary:
              "The player unlocks the door without checking the story first; whoever's inside shoves past roughly in the scramble to get out.",
            fallbackNarration:
              "The door bursts open before you're braced for it. Something shoves past you hard, knocking you into the wall, and is gone before you see its face.",
          };
        }
        if (action.item?.includes("waterskin")) {
          return {
            kind: "tension-only",
            tensionDelta: -3,
            summary:
              "The player slides the waterskin under the door; the voice drinks gratefully.",
            fallbackNarration:
              "You slide the waterskin under the gap. Grateful, ragged gulping follows — a real throat, real thirst.",
          };
        }
        return GENERIC_FREEFORM;
      case "offer":
        return {
          kind: "tension-only",
          tensionDelta: -2,
          summary: "The player offers food or water through the gap.",
          fallbackNarration:
            "You pass something through the gap. A hand — a real hand — takes it with a whispered thanks.",
        };
      case "force":
      case "knock":
        return {
          kind: "damage",
          damage: 15,
          tensionDelta: 10,
          summary:
            "The player forces the door before learning anything; it gives way suddenly and painfully.",
          fallbackNarration:
            "You throw your weight at the door. It gives all at once, and you go down hard with it, something bruised.",
        };
      case "look-under":
        if (isNewClue(state, "torn-map")) {
          return {
            kind: "clue",
            clueGained: "torn-map",
            tensionDelta: 0,
            summary:
              "The player looks under the door and sees a torn map pressed to the gap, matching the voice's story.",
            fallbackNarration:
              "Under the door, fingers press a torn, water-stained map to the gap for you to see. It matches every word so far.",
          };
        }
        return {
          kind: "neutral",
          summary: "Nothing new under the door.",
          fallbackNarration: "The gap shows the same tired fingers.",
        };
      case "search-wall":
        return {
          kind: "neutral",
          tensionDelta: 1,
          summary: "The player searches the wall, finding nothing relevant.",
          fallbackNarration: "The wall around the frame is unremarkable.",
        };
      case "wait":
        return {
          kind: "tension-only",
          tensionDelta: 4,
          summary:
            "The player waits; the voice grows more desperate with each passing minute.",
          fallbackNarration:
            "You wait. The voice grows thinner, more frightened, with every passing minute.",
        };
      case "inventory":
        return GENERIC_FREEFORM;
      default:
        return GENERIC_FREEFORM;
    }
  },
};

// ---------------------------------------------------------------------------
// 3. Mimic
// ---------------------------------------------------------------------------
const mimic: Scenario = {
  id: "mimic",
  name: "The Mimic",
  doorPersonality:
    "too eager to please, oddly warm to the touch, unsettlingly pleasant",
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
  resolve(action: ParsedAction, state: GameState): Outcome {
    const knowsItsAMimic = state.clues.includes("door-is-warm");
    switch (action.intent) {
      case "search-wall":
        if (isNewClue(state, "real-door-nearby")) {
          return {
            kind: "clue",
            clueGained: "real-door-nearby",
            tensionDelta: 2,
            summary:
              "The player searches the wall and finds a second, genuine door hidden behind old ivy a few steps away.",
            fallbackNarration:
              "Your hand brushes old ivy on the wall — and behind it, half-hidden, a second door. A real one, cold stone all around it.",
          };
        }
        return {
          kind: "neutral",
          summary: "Nothing else on the wall.",
          fallbackNarration: "The rest of the wall is unremarkable stone.",
        };
      case "look-under":
      case "listen":
        if (isNewClue(state, "door-is-warm")) {
          return {
            kind: "clue",
            clueGained: "door-is-warm",
            tensionDelta: 6,
            summary:
              "The player notices the door is unnervingly warm and its grain moved — this is not a real door.",
            fallbackNarration:
              "You touch the wood. It's warm — too warm — and for a heartbeat the grain seems to flex, like skin.",
          };
        }
        return {
          kind: "tension-only",
          tensionDelta: 3,
          summary: "The player notices the warmth again.",
          fallbackNarration: "Still warm. Still wrong.",
        };
      case "use-key":
      case "use-item":
        if (
          (action.intent === "use-key" || hasItemContaining(state, "key")) &&
          state.clues.includes("real-door-nearby")
        ) {
          return {
            kind: "win",
            summary:
              "Ignoring the false door entirely, the player uses the rusty key on the real hidden door and escapes cleanly.",
            fallbackNarration:
              "You leave the warm, false door alone and try the key on the real one behind the ivy instead. It turns smoothly, and honest cold air greets you on the other side.",
          };
        }
        if (action.intent === "use-key" || hasItemContaining(state, "key")) {
          return {
            kind: "damage",
            damage: 35,
            tensionDelta: 30,
            summary:
              "The player tries the key on the false door; wooden teeth snap where the keyhole should be.",
            fallbackNarration:
              "You push the key toward the lock. The 'keyhole' snaps shut around your hand like a mouth full of splinters before you wrench free.",
          };
        }
        return GENERIC_FREEFORM;
      case "knock":
      case "force":
        return {
          kind: "damage",
          damage: 30,
          tensionDelta: 25,
          summary:
            "The player strikes the door; it lurches and bites at the offending hand.",
          fallbackNarration:
            "You strike the wood. It lurches toward you with a wet crack, teeth where hinges should be, and you barely pull back in time.",
        };
      case "offer":
        return {
          kind: "damage",
          damage: 10,
          tensionDelta: 15,
          summary:
            "The player offers food to the door, which swallows it and the player's nearby hand.",
          fallbackNarration:
            "You hold out the bread. The 'door' swallows it in one motion — and nearly your hand along with it.",
        };
      case "ask":
        return {
          kind: "tension-only",
          tensionDelta: 5,
          summary:
            "The player asks who's there; the door answers in a voice that's almost, but not quite, human.",
          fallbackNarration:
            '"Who\'s there?" A voice answers — warm, welcoming, and just slightly wrong in its rhythm.',
        };
      case "wait":
        return {
          kind: "tension-only",
          tensionDelta: knowsItsAMimic ? 2 : 6,
          summary: "The player waits, watching the door closely.",
          fallbackNarration:
            "You wait. The door seems to lean toward you, ever so slightly, as if it's waiting too.",
        };
      case "inventory":
        return GENERIC_FREEFORM;
      default:
        return GENERIC_FREEFORM;
    }
  },
};

// ---------------------------------------------------------------------------
// 4. Cursed royal vault
// ---------------------------------------------------------------------------
const cursedVault: Scenario = {
  id: "cursed-vault",
  name: "The Cursed Vault",
  doorPersonality:
    "cold, regal, and quietly furious — a door that remembers being royalty",
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
  resolve(action: ParsedAction, state: GameState): Outcome {
    switch (action.intent) {
      case "search-wall":
        if (isNewClue(state, "silver-first")) {
          return {
            kind: "clue",
            clueGained: "silver-first",
            tensionDelta: -2,
            summary:
              "The player finds worn carvings describing an old rite: silver must be given before the door is touched.",
            fallbackNarration:
              "Faint carvings near the frame, worn but legible: 'Silver first, then hand.' An old warding rite, not a trap.",
          };
        }
        return {
          kind: "neutral",
          summary: "No new carvings.",
          fallbackNarration: "The rest of the carvings are too worn to read.",
        };
      case "listen":
        return {
          kind: "tension-only",
          tensionDelta: 3,
          summary:
            "The player listens; a faint, cold hum comes from beyond the door.",
          fallbackNarration:
            "You listen. A low, cold hum vibrates through the gold leaf — old magic, still awake.",
        };
      case "offer":
        if (action.item?.includes("coin") || action.item?.includes("silver")) {
          if (isNewClue(state, "coin-offered")) {
            return {
              kind: "clue",
              clueGained: "coin-offered",
              tensionDelta: -6,
              summary:
                "The player offers the silver coin to the door first, as the old rite demands; the hum quiets.",
              fallbackNarration:
                "You press the silver coin to the frame. The cold hum fades to nothing, as if something old and tired has been satisfied.",
            };
          }
          return {
            kind: "neutral",
            summary: "The coin is already given.",
            fallbackNarration: "You have nothing more to offer it.",
          };
        }
        return GENERIC_FREEFORM;
      case "use-item":
        if (
          (action.item?.includes("coin") || action.item?.includes("silver")) &&
          isNewClue(state, "coin-offered")
        ) {
          return {
            kind: "clue",
            clueGained: "coin-offered",
            tensionDelta: -6,
            summary:
              "The player presses the silver coin to the frame first, as the old rite demands; the hum quiets.",
            fallbackNarration:
              "You press the silver coin to the frame. The cold hum fades to nothing, as if something old and tired has been satisfied.",
          };
        }
        if (!action.item?.includes("key")) {
          return GENERIC_FREEFORM;
        }
      // eslint-disable-next-line no-fallthrough -- a key item falls through into the same unlock check as "use-key"
      case "use-key":
        if (state.clues.includes("coin-offered")) {
          return {
            kind: "win",
            summary:
              "Having paid the old rite with silver first, the player turns the rusty key and the curse lets the door open freely.",
            fallbackNarration:
              "With the rite satisfied, the rusty key turns without resistance. The vault door swings open, gold leaf catching the torchlight, curse spent and quiet.",
          };
        }
        return {
          kind: "damage",
          damage: 30,
          tensionDelta: 25,
          summary:
            "The player unlocks the door without paying the old rite; the curse lashes out.",
          fallbackNarration:
            "The key turns, and the curse answers first — a cold shock runs up your arm hard enough to drop you to one knee.",
        };
      case "knock":
      case "force":
        return {
          kind: "damage",
          damage: 25,
          tensionDelta: 20,
          summary:
            "The player strikes the cursed door directly; the curse retaliates.",
          fallbackNarration:
            "You strike the door. Cold fire races up your knuckles — this door does not forgive being struck.",
        };
      case "ask":
        return {
          kind: "tension-only",
          tensionDelta: 2,
          summary:
            "The player speaks to the door; only the hum answers, unreadable.",
          fallbackNarration:
            "You speak to the door. Only the hum answers, rising and falling like breath.",
        };
      case "look-under":
        return {
          kind: "neutral",
          summary: "Nothing but old dust under the vault door.",
          fallbackNarration: "Only dust and gold flecks beneath the door.",
        };
      case "wait":
        return {
          kind: "tension-only",
          tensionDelta: 5,
          summary: "The player waits; the hum grows very slightly louder.",
          fallbackNarration: "You wait. The hum climbs, almost imperceptibly.",
        };
      case "inventory":
        return GENERIC_FREEFORM;
      default:
        return GENERIC_FREEFORM;
    }
  },
};

// ---------------------------------------------------------------------------
// 5. Guard demanding a password
// ---------------------------------------------------------------------------
const guardPassword: Scenario = {
  id: "guard-password",
  name: "The Guard's Password",
  doorPersonality:
    "brusque, dutiful, and bored — a voice that has said the same line a thousand times",
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
  resolve(action: ParsedAction, state: GameState): Outcome {
    const clueCount = ["note-fragment", "overheard-word"].filter((c) =>
      state.clues.includes(c),
    ).length;
    switch (action.intent) {
      case "look-under":
        if (isNewClue(state, "note-fragment")) {
          return {
            kind: "clue",
            clueGained: "note-fragment",
            tensionDelta: 0,
            summary:
              "The player reads the half-torn note in their pocket, which shows half of a password.",
            fallbackNarration:
              "You unfold the half-torn note you're carrying. Half a word is legible: '...ARCH'.",
          };
        }
        return {
          kind: "neutral",
          summary: "Nothing new under the door.",
          fallbackNarration: "Just a draft under the door.",
        };
      case "listen":
        if (isNewClue(state, "overheard-word")) {
          return {
            kind: "clue",
            clueGained: "overheard-word",
            tensionDelta: -1,
            summary:
              "The player listens and overhears the guard muttering the other half of the password to themself out of boredom.",
            fallbackNarration:
              "You listen. Bored, the guard mutters the password to themself: 'MID...' — the other half of your note.",
          };
        }
        return {
          kind: "neutral",
          summary: "The guard mutters something unrelated this time.",
          fallbackNarration:
            "This time the guard just grumbles about the draft.",
        };
      case "ask":
        if (clueCount >= 2) {
          return {
            kind: "win",
            summary:
              "Having pieced together both halves of the password, the player states it and the guard lets them through.",
            fallbackNarration:
              '"Midarch," you say. A pause — then the bolt slides back. "...fine. Get on with it."',
          };
        }
        return {
          kind: "tension-only",
          tensionDelta: 8,
          summary:
            "The player guesses at the password without enough information and is refused.",
          fallbackNarration:
            'You offer a guess. "Wrong," the flat voice says, sharper now. "Try again, and you\'re out of tries."',
        };
      case "search-wall":
        return {
          kind: "neutral",
          tensionDelta: 1,
          summary: "The player searches the wall, finding nothing useful.",
          fallbackNarration: "Bare stone, nothing hidden here.",
        };
      case "use-key":
      case "force":
      case "knock":
        return {
          kind: "damage",
          damage: 30,
          tensionDelta: 30,
          summary:
            "The player tries to force or unlock past the guard, who reacts immediately and violently.",
          fallbackNarration:
            "You go for the lock instead of the password. The door flies open on the guard's own terms — spear first.",
        };
      case "offer":
        return {
          kind: "tension-only",
          tensionDelta: -4,
          summary:
            "The player offers a bribe; the guard is unmoved but slightly less bored.",
          fallbackNarration:
            'You slide something under the door. "...Not authorized to accept that," the guard says, but sounds faintly amused.',
        };
      case "wait":
        return {
          kind: "tension-only",
          tensionDelta: 6,
          summary:
            "The player waits; the guard grows suspicious of the silence.",
          fallbackNarration:
            'You wait too long. "Still there?" the guard asks, suspicion creeping into the boredom.',
        };
      case "inventory":
        return GENERIC_FREEFORM;
      default:
        return GENERIC_FREEFORM;
    }
  },
};

// ---------------------------------------------------------------------------
// 6. Chamber filling with water
// ---------------------------------------------------------------------------
const floodingChamber: Scenario = {
  id: "flooding-chamber",
  name: "The Flooding Chamber",
  doorPersonality:
    "urgent and mechanical — less a personality than a countdown",
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
  resolve(action: ParsedAction, state: GameState): Outcome {
    switch (action.intent) {
      case "listen":
        if (isNewClue(state, "water-rising-fast")) {
          return {
            kind: "clue",
            clueGained: "water-rising-fast",
            tensionDelta: 10,
            summary:
              "The player listens and confirms the water is rising fast — there's no time to waste on anything slow.",
            fallbackNarration:
              "You listen. The hiss of water is louder than before — rising fast. Whatever you do, it needs to be quick.",
          };
        }
        return {
          kind: "tension-only",
          tensionDelta: 8,
          summary: "The water sounds even higher now.",
          fallbackNarration: "Higher still. There's no time left to spare.",
        };
      case "use-key":
        return {
          kind: "win",
          summary:
            "The player wastes no time and unlocks the door immediately; the water floods out but the trapped occupant escapes with them.",
          fallbackNarration:
            "You don't hesitate — the key turns, the door bursts open under the pressure, and a soaked, gasping figure spills out past you into dry air.",
        };
      case "use-item":
        if (action.item?.includes("key")) {
          return {
            kind: "win",
            summary:
              "The player wastes no time and unlocks the door immediately; the water floods out but the trapped occupant escapes with them.",
            fallbackNarration:
              "You don't hesitate — the key turns, the door bursts open under the pressure, and a soaked, gasping figure spills out past you into dry air.",
          };
        }
        if (action.item?.includes("bar")) {
          return {
            kind: "win",
            summary:
              "The player wedges the iron bar into the door and forces it open just as the water peaks.",
            fallbackNarration:
              "You wedge the iron bar against the frame and throw your weight behind it. The door bursts, water surging past as someone scrambles out, coughing but alive.",
          };
        }
        return GENERIC_FREEFORM;
      case "force":
      case "knock":
        if (isNewClue(state, "bar-works")) {
          return {
            kind: "clue",
            clueGained: "bar-works",
            tensionDelta: 5,
            summary:
              "The player realizes the iron bar could jimmy the door open faster than the key.",
            fallbackNarration:
              "You throw a shoulder into the door and feel it give slightly at the frame — the iron bar could finish the job.",
          };
        }
        if (hasItemContaining(state, "bar")) {
          return {
            kind: "win",
            summary:
              "The player wedges the iron bar into the weakened frame and wrenches the door open just in time.",
            fallbackNarration:
              "You jam the iron bar into the gap and heave. The frame splits, water roars out around your legs, and the trapped occupant scrambles free.",
          };
        }
        return {
          kind: "damage",
          damage: 15,
          tensionDelta: 10,
          summary:
            "The player forces the door with no real leverage and hurts themself.",
          fallbackNarration:
            "You slam into the door bare-handed. It barely budges, and your shoulder screams in protest.",
        };
      case "search-wall":
      case "look-under":
        return {
          kind: "tension-only",
          tensionDelta: 8,
          summary:
            "The player wastes precious time searching instead of acting.",
          fallbackNarration:
            "You search instead of acting. Water hisses louder — that was time you didn't have to spend.",
        };
      case "ask":
      case "offer":
        return {
          kind: "tension-only",
          tensionDelta: 8,
          summary: "The player talks instead of acting, losing time.",
          fallbackNarration:
            "There's no time for talk. The water doesn't care what you have to say.",
        };
      case "wait":
        return {
          kind: "damage",
          damage: 20,
          tensionDelta: 15,
          summary: "The player waits while the chamber keeps flooding.",
          fallbackNarration:
            "You wait. Water finds the gap under the door and floods over your boots — a bad sign for whoever's still inside.",
        };
      case "inventory":
        return GENERIC_FREEFORM;
      default:
        return {
          kind: "tension-only",
          tensionDelta: 10,
          summary: "The player hesitates while the water keeps rising.",
          fallbackNarration:
            "You hesitate. The hiss of rising water fills the silence where a decision should be.",
        };
    }
  },
};

// ---------------------------------------------------------------------------
// 7. Sound-reactive door
// ---------------------------------------------------------------------------
const soundReactive: Scenario = {
  id: "sound-reactive",
  name: "The Door That Listens",
  doorPersonality:
    "twitchy and reactive, answering every sound with one of its own",
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
  resolve(action: ParsedAction, state: GameState): Outcome {
    const knownPattern = state.clues.includes("three-knock-pattern");
    switch (action.intent) {
      case "listen":
        if (isNewClue(state, "three-knock-pattern")) {
          return {
            kind: "clue",
            clueGained: "three-knock-pattern",
            tensionDelta: 0,
            summary:
              "The player listens and hears the rune hum faintly in a three-beat rhythm — the pattern it wants to hear echoed back.",
            fallbackNarration:
              "You listen closely. The rune hums in a rhythm — three beats, a pause, three beats. It's waiting to hear its own pattern.",
          };
        }
        return {
          kind: "neutral",
          summary: "The rune hums the same rhythm again.",
          fallbackNarration: "The same three-beat hum, patient as ever.",
        };
      case "knock":
        if (knownPattern) {
          return {
            kind: "win",
            summary:
              "The player knocks in the exact three-beat rhythm the rune was listening for, and the door unlocks itself.",
            fallbackNarration:
              "You knock three times, matching the rhythm exactly. The rune above the frame flares gold, and the door clicks open on its own.",
          };
        }
        return {
          kind: "tension-only",
          tensionDelta: 10,
          summary:
            "The player knocks without matching the pattern, and the rune flares in irritation.",
          fallbackNarration:
            "You knock, off the rhythm. The rune flares red and the door rattles hard in its frame, unimpressed.",
        };
      case "use-item":
        if (action.item?.includes("bell")) {
          if (knownPattern) {
            return {
              kind: "win",
              summary:
                "The player rings the small bell in the three-beat pattern, satisfying the rune exactly, and the door opens.",
              fallbackNarration:
                "You ring the little bell three times, matching the rhythm precisely. The rune flares gold and the door swings open with a satisfied chime of its own.",
            };
          }
          return {
            kind: "tension-only",
            tensionDelta: 6,
            summary:
              "The player rings the bell without knowing the right pattern.",
            fallbackNarration:
              "You ring the bell, but off-rhythm. The rune flickers, unconvinced.",
          };
        }
        return GENERIC_FREEFORM;
      case "use-key":
        return {
          kind: "damage",
          damage: 20,
          tensionDelta: 20,
          summary:
            "The player tries the key, which the rune treats as an intrusion.",
          fallbackNarration:
            "You try the key. The rune flares white-hot and a jolt of force snaps back up your arm — this door isn't opened with metal.",
        };
      case "ask":
        return {
          kind: "tension-only",
          tensionDelta: 5,
          summary:
            "The player speaks; the rune flares at the sound but nothing else happens.",
          fallbackNarration:
            "You speak. The rune flares brighter at the sound of your voice, but the door stays shut.",
        };
      case "force":
        return {
          kind: "damage",
          damage: 25,
          tensionDelta: 20,
          summary:
            "The player forces the door; the rune reacts violently to the noise.",
          fallbackNarration:
            "You slam into the door. The rune shrieks a burst of sound back at you, hard enough to ring your ears and stagger you.",
        };
      case "look-under":
      case "search-wall":
        return {
          kind: "neutral",
          tensionDelta: 2,
          summary: "Nothing else of note nearby.",
          fallbackNarration: "Nothing else nearby seems relevant.",
        };
      case "offer":
        return GENERIC_FREEFORM;
      case "wait":
        return {
          kind: "tension-only",
          tensionDelta: 3,
          summary: "The player waits; the rune hums patiently.",
          fallbackNarration:
            "You wait. The rune just keeps humming its rhythm.",
        };
      case "inventory":
        return GENERIC_FREEFORM;
      default:
        return GENERIC_FREEFORM;
    }
  },
};

// ---------------------------------------------------------------------------
// 8. Deceptive spirit
// ---------------------------------------------------------------------------
const deceptiveSpirit: Scenario = {
  id: "deceptive-spirit",
  name: "The Deceptive Spirit",
  doorPersonality:
    "silky, clever, and just a little too helpful — every answer sounds like a trade",
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
  resolve(action: ParsedAction, state: GameState): Outcome {
    const gotTrueClue = state.clues.includes("true-answer");
    switch (action.intent) {
      case "ask":
        if (isNewClue(state, "spirit-lies-sometimes")) {
          return {
            kind: "clue",
            clueGained: "spirit-lies-sometimes",
            tensionDelta: 3,
            summary:
              "The player asks a question and notices the spirit's answer contradicts something it said a moment ago — it isn't always honest.",
            fallbackNarration:
              "You ask a question. The answer half-contradicts something it said before — this voice doesn't always tell the truth.",
          };
        }
        return {
          kind: "tension-only",
          tensionDelta: 2,
          summary: "The spirit answers smoothly, offering another trade.",
          fallbackNarration:
            '"Ask, and I\'ll answer — for a price," it purrs again.',
        };
      case "search-wall":
        if (isNewClue(state, "true-answer")) {
          return {
            kind: "clue",
            clueGained: "true-answer",
            tensionDelta: -2,
            summary:
              "The player finds an old, independent inscription on the wall confirming the door simply isn't locked at all.",
            fallbackNarration:
              "Half-buried in the wall, an older inscription — plain, unpersuasive, clearly not the spirit's words: 'It was never locked.'",
          };
        }
        return {
          kind: "neutral",
          summary: "Nothing else on the wall.",
          fallbackNarration: "The rest of the wall stays silent.",
        };
      case "listen":
        return {
          kind: "tension-only",
          tensionDelta: 1,
          summary:
            "The player listens; only the spirit's smooth voice continues.",
          fallbackNarration:
            "You listen. Only that smooth, patient voice, waiting.",
        };
      case "use-item":
        if (action.item?.includes("coin")) {
          return {
            kind: "damage",
            damage: 15,
            tensionDelta: 15,
            summary:
              "The player pays the spirit's asking price; it takes payment and gives nothing real in return.",
            fallbackNarration:
              "You offer the silver coin. It vanishes from your hand with a delighted little laugh — and no door opens, no secret comes.",
          };
        }
        if (!action.item?.includes("key")) {
          return GENERIC_FREEFORM;
        }
      // eslint-disable-next-line no-fallthrough -- a key item falls through into the same check as "use-key"
      case "use-key":
        if (gotTrueClue) {
          return {
            kind: "win",
            summary:
              "Trusting the older, honest inscription over the spirit, the player finds the door was never locked and simply opens it.",
            fallbackNarration:
              "Ignoring the key entirely, you just push. The door was never locked — the spirit's whole game was convincing you it was.",
          };
        }
        return {
          kind: "damage",
          damage: 20,
          tensionDelta: 20,
          summary:
            "The player pays the spirit's price with the key; it takes the offering and the door stays locked regardless.",
          fallbackNarration:
            'You offer the key as payment. The spirit takes it eagerly — and the door stays exactly as locked as before. "My mistake," it says, not sounding sorry at all.',
        };
      case "offer":
        if (action.item?.includes("coin")) {
          return {
            kind: "damage",
            damage: 15,
            tensionDelta: 15,
            summary:
              "The player pays the spirit's asking price; it takes payment and gives nothing real in return.",
            fallbackNarration:
              "You offer the silver coin. It vanishes from your hand with a delighted little laugh — and no door opens, no secret comes.",
          };
        }
        return GENERIC_FREEFORM;
      case "force":
      case "knock":
        return {
          kind: "damage",
          damage: 20,
          tensionDelta: 20,
          summary:
            "The player attacks the door directly; the spirit takes offense and lashes back with cold force.",
          fallbackNarration:
            "You strike the door. Cold, furious laughter answers, and something unseen shoves back hard enough to knock the wind out of you.",
        };
      case "look-under":
        return {
          kind: "neutral",
          summary: "Nothing under the door but darkness.",
          fallbackNarration: "Only darkness under the gap.",
        };
      case "wait":
        return {
          kind: "tension-only",
          tensionDelta: 4,
          summary: "The player waits; the spirit grows impatient for a trade.",
          fallbackNarration:
            'You wait. "No offer?" the voice asks, a little colder now.',
        };
      case "inventory":
        return GENERIC_FREEFORM;
      default:
        return GENERIC_FREEFORM;
    }
  },
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
