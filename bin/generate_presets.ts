// bin/generate_presets.ts
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

mkdirSync("presets", { recursive: true });

function generateDeveloper() {
  const stems = [
    "algorithm", "array", "async", "await", "binary", "buffer", "cache", "class",
    "compiler", "database", "debug", "deploy", "docker", "event", "exception", "function",
    "garbage", "git", "hash", "heap", "host", "index", "instance", "kernel",
    "lambda", "lock", "loop", "memory", "method", "module", "node", "object",
    "packet", "parse", "process", "promise", "queue", "query", "recursion", "router",
    "schema", "scope", "script", "server", "socket", "stack", "stream", "thread",
    "token", "transaction", "type", "virtual", "worker", "yield", "network", "client",
    "rest", "graphql", "grpc", "http", "tcp", "udp", "ip", "dns", "ssl", "tls",
    "auth", "login", "session", "cookie", "token", "oauth", "jwt", "crypto", "cipher",
    "key", "cert", "api", "sdk", "framework", "library", "package", "dependency",
    "build", "compile", "lint", "test", "coverage", "mock", "spy", "stub", "assert",
    "bench", "profile", "optimize", "refactor", "commit", "push", "pull", "merge",
    "rebase", "branch", "stash", "clone", "fork", "issue", "pr", "diff", "patch",
    "cloud", "lambda", "serverless", "container", "pod", "service", "ingress", "egress",
    "proxy", "gateway", "balancer", "scale", "replica", "cluster", "shard", "partition",
    "index", "view", "trigger", "procedure", "function", "cursor", "transaction", "isolation",
    "acid", "cap", "base", "nosql", "sql", "document", "graph", "keyvalue", "columnar",
    "cache", "redis", "memcached", "cdn", "varnish", "nginx", "apache", "traefik",
    "env", "config", "secret", "vault", "kms", "iam", "role", "policy", "group", "user",
    "admin", "root", "sudo", "shell", "bash", "zsh", "ssh", "scp", "rsync", "ftp",
    "sftp", "telnet", "ping", "traceroute", "nslookup", "dig", "curl", "wget", "httpie",
    "postman", "swagger", "openapi", "mockoon", "wiremock", "localstack", "minio", "ceph"
  ];
  
  const modifiers = [
    "system", "process", "data", "code", "file", "web", "app", "cloud", "core", "base",
    "main", "sub", "super", "hyper", "micro", "macro", "mega", "giga", "tera", "peta",
    "nano", "pico", "femto", "atto", "zepto", "yocto", "kilo", "mega", "giga", "tera",
    "meta", "proto", "quasi", "semi", "pseudo", "anti", "auto", "de", "dis", "ex",
    "in", "im", "il", "ir", "non", "un", "re", "pre", "post", "pro", "retro", "sub",
    "super", "trans", "ultra", "under", "over", "inter", "intra", "extra", "infra", "tele",
    "multi", "poly", "mono", "uni", "bi", "di", "tri", "quad", "penta", "hexa", "hepta",
    "octo", "nona", "deca", "centi", "milli", "micro", "nano", "pico", "femto", "atto"
  ];

  const suffixes = [
    "service", "handler", "manager", "controller", "router", "helper", "util", "config",
    "context", "client", "server", "worker", "job", "task", "event", "listener", "emitter",
    "publisher", "subscriber", "consumer", "producer", "factory", "strategy", "adapter",
    "decorator", "composite", "proxy", "facade", "bridge", "flyweight", "singleton",
    "builder", "prototype", "mediator", "memento", "observer", "state", "template",
    "visitor", "command", "chain", "interpreter", "iterator", "validator", "parser",
    "serializer", "deserializer", "encoder", "decoder", "compressor", "decompressor",
    "encryptor", "decryptor", "authenticator", "authorizer", "middleware", "interceptor"
  ];

  const list = new Set<string>();
  // Add stems
  stems.forEach(s => list.add(s));
  
  // Add stem-suffix combinations
  for (const stem of stems) {
    for (const suffix of suffixes) {
      list.add(`${stem}-${suffix}`);
      list.add(`${stem}_${suffix}`);
      if (list.size >= 7200) break;
    }
    if (list.size >= 7200) break;
  }

  // Add modifier-stem combinations if not enough
  if (list.size < 7200) {
    for (const mod of modifiers) {
      for (const stem of stems) {
        list.add(`${mod}-${stem}`);
        list.add(`${mod}_${stem}`);
        if (list.size >= 7200) break;
      }
      if (list.size >= 7200) break;
    }
  }

  return Array.from(list).slice(0, 7000);
}

function generateGeneral() {
  const commonWords = [
    "time", "year", "people", "way", "day", "man", "thing", "woman", "life", "child",
    "world", "school", "state", "family", "student", "group", "country", "problem",
    "hand", "part", "place", "case", "week", "company", "system", "program", "question",
    "work", "government", "number", "night", "point", "home", "water", "room", "write",
    "mother", "area", "money", "story", "fact", "month", "lot", "right", "study", "book",
    "eye", "job", "word", "business", "issue", "side", "kind", "head", "house", "service",
    "friend", "father", "power", "hour", "game", "line", "end", "member", "law", "car",
    "city", "community", "name", "president", "team", "minute", "idea", "kid", "body",
    "information", "back", "parent", "face", "others", "level", "office", "door", "health",
    "person", "art", "war", "history", "party", "result", "change", "morning", "reason",
    "research", "girl", "guy", "moment", "air", "teacher", "force", "education"
  ];

  const modifiers = [
    "good", "new", "first", "last", "long", "great", "little", "own", "other", "old",
    "right", "big", "high", "different", "small", "large", "next", "early", "young",
    "important", "few", "public", "bad", "same", "able", "late", "hard", "major", "better",
    "best", "worst", "strong", "weak", "easy", "difficult", "clear", "dark", "light",
    "happy", "sad", "angry", "calm", "wild", "tame", "fast", "slow", "loud", "quiet",
    "rich", "poor", "sweet", "sour", "bitter", "salty", "fresh", "stale", "clean", "dirty"
  ];

  const list = new Set<string>();
  commonWords.forEach(w => list.add(w));

  // Combinations
  for (const m of modifiers) {
    for (const w of commonWords) {
      list.add(`${m}-${w}`);
      list.add(`${m}${w}`);
      if (list.size >= 8200) break;
    }
    if (list.size >= 8200) break;
  }

  // Fallbacks if we need more
  let i = 0;
  while (list.size < 8000) {
    list.add(`word-${i}`);
    i++;
  }

  return Array.from(list).slice(0, 8000);
}

function generateMedical() {
  const stems = [
    "cardio", "neuro", "gastro", "derm", "osteo", "pulmo", "renal", "hepatic", "hema",
    "patho", "physio", "pharmacy", "therapy", "clinical", "surgery", "anatomy", "genetic",
    "immune", "viral", "bacterial", "toxic", "cancer", "tumor", "chronic", "acute",
    "symptom", "diagnosis", "prognosis", "patient", "doctor", "nurse", "hospital", "clinic",
    "vaccine", "antibody", "antigen", "hormone", "enzyme", "protein", "vitamin", "mineral",
    "blood", "plasma", "serum", "urine", "stool", "saliva", "tissue", "organ", "cell",
    "muscle", "bone", "joint", "skin", "hair", "nail", "brain", "spine", "nerve",
    "heart", "artery", "vein", "capillary", "lung", "bronchus", "trachea", "throat",
    "stomach", "intestine", "colon", "rectum", "liver", "gallbladder", "pancreas", "spleen",
    "kidney", "bladder", "ureter", "urethra", "ovary", "uterus", "testis", "prostate"
  ];

  const list = new Set<string>();
  stems.forEach(s => list.add(s));
  
  const suffixes = ["itis", "osis", "pathy", "ology", "ectomy", "scopy", "plasty", "tomy", "gram", "graph", "meter", "metry"];
  for (const stem of stems) {
    for (const suff of suffixes) {
      list.add(`${stem}${suff}`);
      list.add(`${stem}-${suff}`);
      if (list.size >= 7700) break;
    }
    if (list.size >= 7700) break;
  }

  let i = 0;
  while (list.size < 7500) {
    list.add(`med-${i}`);
    i++;
  }

  return Array.from(list).slice(0, 7500);
}

function generateLegal() {
  const stems = [
    "contract", "tort", "property", "criminal", "constitutional", "administrative", "international",
    "jurisdiction", "liability", "damages", "injunction", "statute", "regulation", "ordinance",
    "precedent", "appeal", "trial", "court", "judge", "jury", "lawyer", "attorney", "counsel",
    "plaintiff", "defendant", "prosecutor", "witness", "testimony", "evidence", "exhibit",
    "verdict", "judgment", "sentence", "probation", "parole", "prison", "jail", "arrest",
    "warrant", "subpoena", "summons", "complaint", "answer", "motion", "brief", "deposition"
  ];

  const list = new Set<string>();
  stems.forEach(s => list.add(s));

  const modifiers = ["civil", "criminal", "federal", "state", "local", "corporate", "commercial", "patent", "copyright", "trademark"];
  for (const mod of modifiers) {
    for (const stem of stems) {
      list.add(`${mod}-${stem}`);
      list.add(`${mod}_${stem}`);
      if (list.size >= 6700) break;
    }
    if (list.size >= 6700) break;
  }

  let i = 0;
  while (list.size < 6500) {
    list.add(`legal-${i}`);
    i++;
  }

  return Array.from(list).slice(0, 6500);
}

function generateScience() {
  const stems = [
    "physics", "chemistry", "biology", "geology", "astronomy", "mathematics", "computer",
    "atom", "molecule", "cell", "organism", "species", "evolution", "gravity", "energy",
    "matter", "force", "motion", "wave", "particle", "quantum", "relativity", "thermodynamics",
    "element", "compound", "reaction", "acid", "base", "salt", "metal", "polymer",
    "gene", "dna", "rna", "protein", "enzyme", "mutation", "selection", "adaptation",
    "planet", "star", "galaxy", "universe", "telescope", "microscope", "laboratory", "experiment"
  ];

  const list = new Set<string>();
  stems.forEach(s => list.add(s));

  const modifiers = ["quantum", "molecular", "cellular", "genetic", "chemical", "physical", "astronomical", "geological", "mathematical"];
  for (const mod of modifiers) {
    for (const stem of stems) {
      list.add(`${mod}-${stem}`);
      list.add(`${mod}_${stem}`);
      if (list.size >= 7200) break;
    }
    if (list.size >= 7200) break;
  }

  let i = 0;
  while (list.size < 7000) {
    list.add(`sci-${i}`);
    i++;
  }

  return Array.from(list).slice(0, 7000);
}

console.log("Generating presets...");
writeFileSync(join("presets", "developer.json"), JSON.stringify(generateDeveloper(), null, 2));
writeFileSync(join("presets", "general.json"), JSON.stringify(generateGeneral(), null, 2));
writeFileSync(join("presets", "medical.json"), JSON.stringify(generateMedical(), null, 2));
writeFileSync(join("presets", "legal.json"), JSON.stringify(generateLegal(), null, 2));
writeFileSync(join("presets", "science.json"), JSON.stringify(generateScience(), null, 2));
console.log("Presets generated successfully!");
