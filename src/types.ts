export type Phase =
  | "idle"
  | "analysing"
  | "plan"
  | "matching"
  | "running"
  | "analysing-results"
  | "complete"
  | "retesting"
  | "v2-complete";
export type Source = "ai" | "human" | "expert" | "specialist";
export type SessionStatus = "queued" | "starting" | "active" | "completed";
export type Sentiment = "positive" | "negative" | "neutral";
export type Severity = "critical" | "high" | "medium" | "low" | "opportunity";
export interface SessionEvent {
  at: number;
  type: string;
  text: string;
  x: number;
  y: number;
  scroll: number;
  route?: string;
}
export interface Persona {
  patience: string;
  literacy: string;
  trustThreshold: string;
  reading: string;
  device: string;
  behavior: string;
}
export interface Session {
  product?: {
    name: string;
    url: string;
    category: "meetings" | "fintech" | "hiring";
  };
  id: string;
  name: string;
  role: string;
  source: Source;
  initials: string;
  location: string;
  color: string;
  match: number;
  experience: string;
  stage: string;
  tags: string[];
  persona: Persona;
  goal: string;
  startedAt: number;
  duration: number;
  taskResult: "success" | "partial" | "failed";
  comprehension: number;
  usability: number;
  trust: number;
  purchaseIntent: number;
  ctaFound: boolean;
  aiHumanUnderstood: boolean;
  clarity: number;
  comprehensionTime: number;
  quote: string;
  observations: string[];
  findingIds: string[];
  evidenceIds: string[];
  events: SessionEvent[];
}
export interface Evidence {
  id: string;
  sessionId: string;
  findingIds: string[];
  source: Source;
  type: string;
  title: string;
  detail: string;
  at: number;
  sentiment: Sentiment;
  critical: boolean;
}
export interface Finding {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  confidence: number;
  evidenceIds: string[];
  recommendation: string;
  resolvedV2: boolean;
}
export interface Metrics {
  score: number;
  comprehension: number;
  usability: number;
  trust: number;
  purchaseIntent: number;
  clarity: number;
  ctaRate: number;
  confidence: number;
  completed: number;
}
export interface DemoState {
  phase: Phase;
  clock: number;
  speed: number;
  paused: boolean;
  presentation: boolean;
  version: 1 | 2;
  url: string;
  question: string;
}
