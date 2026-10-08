export const WIKIPEDIA_BOILERPLATE: RegExp[] = [
  /^\d{4}\s+births$/i,
  /^\d{4}\s+deaths$/i,
  /^Alumni of /,
  /^categories?\s*:/i,
  /^Authority control/i,
  /^Content is available under/,
  /hidden categories/i,
  /^Wikipedia:/,
  /^File:Official portrait/,
  /^\s*\w+&nbsp;/,
];

export const RETRIEVAL_BOILERPLATE: RegExp[] = [
  ...WIKIPEDIA_BOILERPLATE,
  /^\s*↑\s/,
  /^\[\d+\]\s*↑/,
  /^\u2514/,
  /^\u251c/,
  /^\u2500/,
];
