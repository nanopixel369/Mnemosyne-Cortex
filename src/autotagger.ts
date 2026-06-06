// src/autotagger.ts
import { TagWithCount } from "./types.ts";

// Standard stop words (~60 words)
export const STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
  "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from", "further", "had",
  "has", "have", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how",
  "i", "if", "in", "into", "is", "it", "its", "itself", "me", "more", "most", "my", "myself",
  "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "our", "ours", "ourselves",
  "out", "over", "own", "same", "she", "should", "so", "some", "such", "than", "that", "the",
  "their", "theirs", "them", "themselves", "then", "there", "these", "they", "this", "those",
  "through", "to", "too", "under", "until", "up", "very", "was", "we", "were", "what", "when",
  "where", "which", "while", "who", "whom", "why", "with", "would", "you", "your", "yours",
  "yourself", "yourselves"
]);

// Extended stop list (~300 words, spaCy-style)
export const EXTENDED_STOP_WORDS = new Set([
  "about", "above", "across", "after", "afterwards", "again", "against", "all", "almost", "alone",
  "along", "already", "also", "although", "always", "am", "among", "amongst", "amount", "an", "and",
  "another", "any", "anyhow", "anyone", "anything", "anyway", "anywhere", "are", "around", "as", "at",
  "back", "be", "became", "because", "become", "becomes", "becoming", "been", "before", "beforehand",
  "behind", "being", "below", "beside", "besides", "between", "beyond", "both", "bottom", "but", "by",
  "call", "can", "cannot", "ca", "could", "did", "do", "does", "doing", "done", "down", "due", "during",
  "each", "eight", "either", "eleven", "else", "elsewhere", "empty", "enough", "even", "ever", "every",
  "everyone", "everything", "everywhere", "except", "few", "fifteen", "fifty", "first", "five", "for",
  "former", "formerly", "forty", "forward", "four", "from", "front", "full", "further", "get", "give",
  "go", "had", "has", "have", "he", "hence", "her", "here", "hereafter", "hereby", "herein", "hereupon",
  "hers", "herself", "him", "himself", "his", "how", "however", "hundred", "i", "if", "in", "indeed",
  "into", "is", "it", "its", "itself", "keep", "last", "latter", "latterly", "least", "less", "made",
  "make", "many", "may", "me", "meanwhile", "might", "mine", "more", "moreover", "most", "mostly",
  "move", "much", "must", "my", "myself", "name", "namely", "neither", "never", "nevertheless", "next",
  "nine", "no", "nobody", "none", "noone", "nor", "not", "nothing", "now", "nowhere", "of", "off",
  "often", "on", "once", "one", "only", "onto", "or", "other", "others", "otherwise", "our", "ours",
  "ourselves", "out", "over", "own", "part", "per", "perhaps", "please", "put", "quite", "rather", "re",
  "really", "regarding", "same", "say", "see", "seem", "seemed", "seeming", "seems", "serious", "several",
  "she", "should", "show", "side", "since", "sincere", "six", "sixty", "so", "some", "somehow", "someone",
  "something", "sometime", "sometimes", "somewhere", "still", "such", "take", "ten", "than", "that",
  "the", "their", "them", "themselves", "then", "thence", "there", "thereafter", "thereby", "therefore",
  "therein", "thereupon", "these", "they", "this", "those", "though", "three", "through", "throughout",
  "thru", "thus", "to", "together", "too", "top", "toward", "towards", "twelve", "twenty", "two", "under",
  "unless", "until", "up", "upon", "us", "very", "via", "was", "we", "well", "were", "what", "whatever",
  "when", "whence", "whenever", "where", "whereafter", "whereas", "whereby", "wherein", "whereupon",
  "wherever", "whether", "which", "while", "whither", "who", "whoever", "whole", "whom", "whose", "why",
  "will", "with", "within", "without", "would", "yet", "you", "your", "yours", "yourself", "yourselves"
]);

// Levenshtein distance implementation
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;
  
  let prev = Array.from({ length: s2.length + 1 }, (_, i) => i);
  let curr = new Array(s2.length + 1);
  
  for (let i = 0; i < s1.length; i++) {
    curr[0] = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      curr[j + 1] = Math.min(
        curr[j] + 1,       // Insertion
        prev[j + 1] + 1,   // Deletion
        prev[j] + cost     // Substitution
      );
    }
    // Swap row arrays
    const temp = prev;
    prev = curr;
    curr = temp;
  }
  return prev[s2.length];
}

export class AutoTagger {
  private stackSet: Set<string>;
  private fuzzyEnabled: boolean;
  private fuzzyDistance: number;

  constructor(stackSet: Set<string>, fuzzyEnabled = false, fuzzyDistance = 2) {
    this.stackSet = stackSet;
    this.fuzzyEnabled = fuzzyEnabled;
    this.fuzzyDistance = fuzzyDistance;
  }

  // Helper to decode raw bytes
  public static decodeContent(content: Buffer): string {
    try {
      return content.toString("utf-8");
    } catch (_) {
      // Latin-1 fallback
      return content.toString("latin1");
    }
  }

  // Tokenize using regex: \b[\w]+(?:[-_][\w]+)*\b
  public static tokenize(text: string): string[] {
    const regex = /\b[\w]+(?:[-_][\w]+)*\b/g;
    const tokens: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      tokens.push(match[0].toLowerCase());
    }
    return tokens;
  }

  public tagContent(
    content: Buffer,
    options?: {
      autoDiscover?: boolean;
      autoDiscoverThreshold?: number;
      onDiscover?: (tagWord: string) => void;
    }
  ): TagWithCount[] {
    const text = AutoTagger.decodeContent(content);
    const rawTokens = AutoTagger.tokenize(text);

    const counts = new Map<string, number>();
    const unmatchedCounts = new Map<string, number>();

    for (const token of rawTokens) {
      // Filter out stop words and short tokens (< 3 chars)
      if (token.length < 3 || STOP_WORDS.has(token)) {
        continue;
      }

      // Prepend '#' for stack lookup
      const tagWord = `#${token}`;

      if (this.stackSet.has(tagWord)) {
        counts.set(tagWord, (counts.get(tagWord) || 0) + 1);
      } else {
        // Try fuzzy matching if enabled
        let matched = false;
        if (this.fuzzyEnabled) {
          let bestMatch: string | null = null;
          let bestDist = this.fuzzyDistance + 1;

          for (const stackWord of this.stackSet) {
            const dist = levenshteinDistance(tagWord, stackWord);
            if (dist <= this.fuzzyDistance && dist < bestDist) {
              bestMatch = stackWord;
              bestDist = dist;
            }
          }

          if (bestMatch) {
            counts.set(bestMatch, (counts.get(bestMatch) || 0) + 1);
            matched = true;
          }
        }

        if (!matched && options?.autoDiscover) {
          unmatchedCounts.set(token, (unmatchedCounts.get(token) || 0) + 1);
        }
      }
    }

    // Custom Tag Auto-Discovery
    if (options?.autoDiscover) {
      const threshold = options.autoDiscoverThreshold ?? 5;
      for (const [token, count] of unmatchedCounts.entries()) {
        if (
          token.length >= 4 &&
          count >= threshold &&
          !EXTENDED_STOP_WORDS.has(token)
        ) {
          const newTagWord = `#${token}`;
          
          // Promote to permanent custom tag
          options.onDiscover?.(newTagWord);
          
          // Add to matched counts
          counts.set(newTagWord, (counts.get(newTagWord) || 0) + count);
        }
      }
    }

    // Convert to TagWithCount array
    const result: TagWithCount[] = [];
    for (const [tag, count] of counts.entries()) {
      result.push({ tag, count });
    }

    // Sort by count descending, then alphabetically ascending (stability contract)
    result.sort((t1, t2) => {
      if (t1.count !== t2.count) {
        return t2.count - t1.count;
      }
      return t1.tag.localeCompare(t2.tag);
    });

    return result;
  }
}
