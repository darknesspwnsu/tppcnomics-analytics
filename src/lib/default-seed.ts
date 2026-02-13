export type SeedAsset = {
  key: string;
  label: string;
  tier: string;
  imageUrl?: string;
};

export type SeedPair = {
  leftKey: string;
  rightKey: string;
  prompt: string;
  featured?: boolean;
};

export const DEFAULT_ASSETS: SeedAsset[] = [
  { key: "Charizard|M", label: "Charizard ♂", tier: "Apex" },
  { key: "Gengar|M", label: "Gengar ♂", tier: "Apex" },
  { key: "Mewtwo|?", label: "Mewtwo ⚲", tier: "Apex" },
  { key: "Dragonite|M", label: "Dragonite ♂", tier: "High" },
  { key: "Garchomp|M", label: "Garchomp ♂", tier: "High" },
  { key: "Lucario|M", label: "Lucario ♂", tier: "High" },
  { key: "Blaziken|M", label: "Blaziken ♂", tier: "Mid" },
  { key: "Metagross|?", label: "Metagross ⚲", tier: "Mid" },
  { key: "Tyranitar|M", label: "Tyranitar ♂", tier: "Mid" },
  { key: "Absol|M", label: "Absol ♂", tier: "Mid" },
  { key: "Gardevoir|F", label: "Gardevoir ♀", tier: "Mid" },
  { key: "Salamence|M", label: "Salamence ♂", tier: "High" },
];

export const DEFAULT_PAIRS: SeedPair[] = [
  {
    leftKey: "Charizard|M",
    rightKey: "Gengar|M",
    prompt: "Which would trade higher this week?",
    featured: true,
  },
  {
    leftKey: "Mewtwo|?",
    rightKey: "Dragonite|M",
    prompt: "Which one would hold value better long-term?",
    featured: true,
  },
  {
    leftKey: "Garchomp|M",
    rightKey: "Lucario|M",
    prompt: "Which has stronger short-term momentum?",
  },
  {
    leftKey: "Blaziken|M",
    rightKey: "Metagross|?",
    prompt: "Which is more likely to trend upward next month?",
  },
  {
    leftKey: "Tyranitar|M",
    rightKey: "Absol|M",
    prompt: "If you had to buy one now, which would you choose?",
  },
  {
    leftKey: "Gardevoir|F",
    rightKey: "Salamence|M",
    prompt: "Which has better cross-event demand?",
  },
];
