import type { QualityRuleSet } from "./types.js";
import { WIKIPEDIA_BOILERPLATE } from "./boilerplate.js";

export const wikipediaRules: QualityRuleSet = {
  name: "wikipedia",
  domains: ["*.wikipedia.org"],
  skipUrlPatterns: [
    { pattern: /\/Special:/i, label: "namespace:Special" },
    { pattern: /\/File:/i, label: "namespace:File" },
    { pattern: /\/Category:/i, label: "namespace:Category" },
    { pattern: /\/Talk:/i, label: "namespace:Talk" },
    { pattern: /\/User:/i, label: "namespace:User" },
    { pattern: /\/Wikipedia:/i, label: "namespace:Wikipedia" },
    { pattern: /\/Help:/i, label: "namespace:Help" },
    { pattern: /\/Portal:/i, label: "namespace:Portal" },
    { pattern: /\/Template:/i, label: "namespace:Template" },
    { pattern: /\/List_of_/i, label: "list page" },
    { pattern: /\(disambiguation\)/i, label: "disambiguation" },
  ],
  shouldKeepContent({ wordCount, textHead, fullText }) {
    const MIN_PAGE_WORDS = parseInt(process.env["MIN_PAGE_WORDS"] ?? "50", 10);

    if (wordCount < MIN_PAGE_WORDS) {
      return { keep: false, reason: `stub: ${wordCount} words (min ${MIN_PAGE_WORDS})`, shouldRetryDynamic: true };
    }

    if (/may refer to:|could refer to:/i.test(textHead)) {
      return { keep: false, reason: "disambiguation page", shouldRetryDynamic: false };
    }

    const linkCount = (fullText.match(/https?:\/\/\S+/g)?.length ?? 0)
      + (fullText.match(/\/wiki\/\S+/g)?.length ?? 0);
    const linkRatio = linkCount / Math.max(wordCount, 1);
    if (linkRatio > 0.4) {
      return { keep: false, reason: `link farm: ${Math.round(linkRatio * 100)}% links`, shouldRetryDynamic: false };
    }

    return { keep: true, reason: "", shouldRetryDynamic: false };
  },
  boilerplatePatterns: WIKIPEDIA_BOILERPLATE,
  skipSectionTitles: [
    "References",
    "External links",
    "See also",
    "Notes",
    "Further reading",
    "Bibliography",
    "Citations",
    "Works cited",
    "Footnotes",
    "Sources",
    "Related pages",
  ],
};
