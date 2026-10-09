export type Role = "founder" | "tester" | "admin";
export type Severity = "blocker" | "major" | "minor";
export interface Profile {
  id: string;
  email: string;
  name: string;
  role: Role;
  expertise: string[];
  device: "desktop" | "mobile" | "both";
  availability: "available" | "busy";
  bio: string;
  createdAt: string;
}
export interface Task {
  id: string;
  title: string;
  instructions: string;
  question: string;
  successCriteria?: string;
}
export interface Campaign {
  id: string;
  founderId: string;
  title: string;
  url: string;
  audience: string;
  objective: string;
  assumption: string;
  tasks: Task[];
  tasksApproved: boolean;
  payment: "unpaid" | "paid";
  paymentReference?: string;
  checkoutExpiresAt?: string;
  priceCents: number;
  currency: string;
  round: number;
  parentCampaignId?: string;
  changes: string;
  createdAt: string;
  updatedAt: string;
}
export interface Assignment {
  id: string;
  campaignId: string;
  testerId: string;
  status:
    "invited" | "accepted" | "declined" | "submitted" | "revision" | "approved";
  invitedAt: string;
  acceptedAt?: string;
}
export interface EvidenceAsset {
  id: string;
  name: string;
  kind: "image" | "video" | "link";
  url: string;
}
export interface TaskResult {
  taskId: string;
  outcome: "success" | "partial" | "blocked";
  answer: string;
  observation: string;
  severity: Severity | "none";
  evidence: EvidenceAsset[];
  durationSeconds?: number;
  executionOutcome?: "failed" | "abandoned" | "assisted";
}
export interface Submission {
  id: string;
  assignmentId: string;
  campaignId: string;
  testerId: string;
  results: TaskResult[];
  overallFeedback: string;
  status: "submitted" | "revision" | "approved";
  qaNote: string;
  createdAt: string;
  updatedAt: string;
  consentConfirmed?: boolean;
  submittedVia?: "workspace" | "portable";
  participantSubmittedAt?: string;
}
export interface ParticipantMissionSnapshot {
  campaignId: string;
  title: string;
  url: string;
  audience: string;
  objective: string;
  tasks: Task[];
}
export interface ParticipantFeedback {
  kind: "playground-participant-feedback";
  schemaVersion: 1;
  assignmentId: string;
  campaignId: string;
  testerId: string;
  mission: ParticipantMissionSnapshot;
  results: TaskResult[];
  overallFeedback: string;
  consentConfirmed: boolean;
  submittedAt: string;
}
export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  description: string;
  recommendation: string;
  sourceIds: string[];
  taskIds: string[];
}
export interface Report {
  id: string;
  campaignId: string;
  summary: string;
  findings: Finding[];
  status: "draft" | "published";
  method: "structured" | "ai";
  generatedAt: string;
  reviewedAt?: string;
  reviewerId?: string;
}
export interface Payout {
  id: string;
  assignmentId: string;
  testerId: string;
  campaignId: string;
  amountCents: number;
  currency: string;
  status: "pending" | "paid";
  reference: string;
  paidAt?: string;
}
export interface WorkspaceData {
  schemaVersion: 1;
  profiles: Profile[];
  campaigns: Campaign[];
  assignments: Assignment[];
  submissions: Submission[];
  reports: Report[];
  payouts: Payout[];
}
export type Command =
  | {
      type: "import-participant-feedback";
      feedback: ParticipantFeedback;
      identityConfirmed: boolean;
    }
  | {
      type: "update-profile";
      profile: Pick<
        Profile,
        "name" | "expertise" | "device" | "availability" | "bio"
      >;
    }
  | {
      type: "create-campaign";
      campaign: Pick<
        Campaign,
        | "title"
        | "url"
        | "audience"
        | "objective"
        | "assumption"
        | "tasks"
        | "tasksApproved"
      >;
    }
  | {
      type: "update-campaign";
      campaignId: string;
      patch: Partial<
        Pick<
          Campaign,
          | "title"
          | "url"
          | "audience"
          | "objective"
          | "assumption"
          | "tasks"
          | "tasksApproved"
        >
      >;
    }
  | { type: "record-payment"; campaignId: string; reference: string }
  | { type: "invite-tester"; campaignId: string; testerId: string }
  | { type: "respond-invite"; assignmentId: string; accept: boolean }
  | {
      type: "submit-feedback";
      assignmentId: string;
      results: TaskResult[];
      overallFeedback: string;
      consentConfirmed?: boolean;
    }
  | {
      type: "review-submission";
      submissionId: string;
      decision: "approved" | "revision";
      note: string;
    }
  | { type: "record-payout"; payoutId: string; reference: string }
  | {
      type: "synthesize-report";
      campaignId: string;
      method?: "structured" | "ai";
    }
  | {
      type: "update-report";
      reportId: string;
      summary: string;
      findings: Finding[];
      method?: "structured" | "ai";
    }
  | { type: "publish-report"; reportId: string }
  | { type: "retest"; campaignId: string; url: string; changes: string };
export interface CommandResult {
  data: WorkspaceData;
  entityId?: string;
}
export type CampaignStage =
  "draft" | "recruiting" | "testing" | "review" | "analysis" | "complete";
export interface StoreValue {
  data: WorkspaceData;
  user: Profile | null;
  mode: "local" | "connected";
  loading: boolean;
  busy: boolean;
  error: string;
  clearError: () => void;
  enterWorkspace: (role: Role, profileId?: string) => Promise<void>;
  addTester: (input: {
    name: string;
    expertise?: string[];
  }) => Promise<Profile>;
  switchLocalAccount: (profileId: string) => void;
  command: (command: Command) => Promise<CommandResult>;
  checkout: (campaignId: string) => Promise<void>;
  cancelCheckout: (campaignId: string) => Promise<void>;
  suggestTasks: (input: {
    url: string;
    audience: string;
    objective: string;
    assumption: string;
  }) => Promise<{ tasks: Task[]; method: "ai" | "template" }>;
  uploadEvidence: (file: File, assignmentId: string) => Promise<EvidenceAsset>;
  refresh: () => Promise<void>;
}
