import type { QualityRuleSet } from "./types.js";

export const defaultRules: QualityRuleSet = {
  name: "default",
  domains: ["*"],
  skipUrlPatterns: [],
  shouldKeepContent({ wordCount }) {
    const MIN_PAGE_WORDS = parseInt(process.env["MIN_PAGE_WORDS"] ?? "50", 10);

    if (wordCount < MIN_PAGE_WORDS) {
      return { keep: false, reason: `stub: ${wordCount} words (min ${MIN_PAGE_WORDS})`, shouldRetryDynamic: true };
    }

    return { keep: true, reason: "", shouldRetryDynamic: false };
  },
  boilerplatePatterns: [
    /Accept cookies/i,
    /Cookie settings/i,
    /Subscribe to our newsletter/i,
  ],
  skipSectionTitles: [],
};
