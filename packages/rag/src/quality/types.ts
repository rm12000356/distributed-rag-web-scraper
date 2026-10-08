export interface QualityRuleSet {
  name: string;
  domains: string[];
  skipUrlPatterns: Array<{ pattern: RegExp; label: string }>;
  shouldKeepContent?: (params: {
    wordCount: number;
    textHead: string;
    fullText: string;
  }) => { keep: boolean; reason: string; shouldRetryDynamic: boolean };
  boilerplatePatterns: RegExp[];
  skipSectionTitles?: string[];
}
