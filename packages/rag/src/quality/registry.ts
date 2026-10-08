import type { QualityRuleSet } from "./types.js";

function hostnameMatches(hostname: string, domainPattern: string): boolean {
  if (domainPattern === "*") return true;

  if (domainPattern.startsWith("*.")) {
    const suffix = domainPattern.slice(1);
    return hostname.endsWith(suffix) || hostname === domainPattern.slice(2);
  }

  return hostname.toLowerCase() === domainPattern.toLowerCase();
}

export class QualityRegistry {
  private rules: QualityRuleSet[] = [];
  private defaultRules: QualityRuleSet;

  constructor(defaultRules: QualityRuleSet) {
    this.defaultRules = defaultRules;
  }

  register(rules: QualityRuleSet): void {
    this.rules.push(rules);
  }

  match(hostname: string): QualityRuleSet {
    for (const ruleset of this.rules) {
      for (const domain of ruleset.domains) {
        if (hostnameMatches(hostname, domain)) {
          return ruleset;
        }
      }
    }
    return this.defaultRules;
  }
}
