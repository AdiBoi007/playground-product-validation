import { evidence, findings, sessions, specialistSession } from "../data/demo";
import { buildExperiment } from "../intelligence/experiments";
import { decisionStore } from "../intelligence/store";
import type { Evidence, Metrics, Session, SessionStatus } from "../types";

export function getSessionCohort(version: 1 | 2 = 1): Session[] {
  return version === 1
    ? sessions
    : buildExperiment(decisionStore.getSnapshot().committedActionIds).sessions;
}

export function getSpecialistSession(version: 1 | 2 = 1): Session {
  return version === 1
    ? specialistSession
    : buildExperiment(decisionStore.getSnapshot().committedActionIds)
        .specialist;
}

export function getEvidenceCohort(version: 1 | 2 = 1): Evidence[] {
  return version === 1
    ? evidence
    : buildExperiment(decisionStore.getSnapshot().committedActionIds).evidence;
}

export function getFindingsForVersion(version: 1 | 2 = 1) {
  return version === 1
    ? findings
    : buildExperiment(decisionStore.getSnapshot().committedActionIds).findings;
}

export function getSessionStatus(
  session: Session,
  clock: number,
): SessionStatus {
  if (clock >= session.startedAt + session.duration) return "completed";
  if (clock >= session.startedAt) return "active";
  if (clock >= session.startedAt - 1) return "starting";
  return "queued";
}

export function getCurrentEvidence(clock: number = 50, version: 1 | 2 = 1) {
  return getEvidenceCohort(version).filter((item) => item.at <= clock);
}

const evidenceTimeCache = new WeakMap<Evidence[], Map<string, number>>();

function aggregateMetrics(
  cohort: Session[],
  items: Evidence[],
  clock: number,
  retest: boolean,
): Metrics {
  const behavior = cohort.filter(
    (session) => session.source === "ai" || session.source === "human",
  );
  const completed = behavior.filter(
    (session) => getSessionStatus(session, clock) === "completed",
  );
  const observationIndices = retest
    ? {
        comprehension: [0, 0],
        usability: [2, 2],
        trust: [3, 3],
        purchaseIntent: [3, 3],
        clarity: [1, 1],
      }
    : {
        comprehension: [2, 0],
        usability: [3, 2],
        trust: [4, 2],
        purchaseIntent: [5, 3],
        clarity: [2, 1],
      };
  let times = evidenceTimeCache.get(items);
  if (!times) {
    times = new Map(items.map((item) => [item.id, item.at]));
    evidenceTimeCache.set(items, times);
  }
  const observed = (key: keyof typeof observationIndices) =>
    behavior.filter((session) => {
      const id =
        session.evidenceIds[
          observationIndices[key][session.source === "human" ? 1 : 0]
        ];
      return clock >= (times.get(id) ?? Infinity);
    });
  const mean = (key: keyof typeof observationIndices) => {
    const sample = observed(key);
    return sample.length
      ? sample.reduce((sum, session) => sum + session[key], 0) / sample.length
      : 0;
  };
  const comprehension = mean("comprehension");
  const usability = mean("usability");
  const trust = mean("trust");
  const purchaseIntent = mean("purchaseIntent");
  const clarity = mean("clarity");
  const expertCount = cohort.filter(
    (session) =>
      session.source === "expert" &&
      getSessionStatus(session, clock) === "completed",
  ).length;
  const ctaSample = observed("usability");
  const signalSamples = Object.keys(observationIndices).reduce(
    (sum, key) => sum + observed(key as keyof typeof observationIndices).length,
    0,
  );
  return {
    score: Math.round(
      comprehension * 0.4 +
        usability * 0.28 +
        trust * 0.12 +
        purchaseIntent * 0.1 +
        clarity * 0.1,
    ),
    comprehension: Math.round(comprehension),
    usability: Math.round(usability),
    trust: Math.round(trust),
    purchaseIntent: Math.round(purchaseIntent),
    clarity: Math.round(clarity),
    ctaRate: ctaSample.length
      ? Math.round(
          (ctaSample.filter((session) => session.ctaFound).length /
            ctaSample.length) *
            100,
        )
      : 0,
    confidence: Math.min(
      97,
      Math.round(
        (signalSamples /
          (behavior.length * Object.keys(observationIndices).length)) *
          86 +
          expertCount * 5.5,
      ),
    ),
    completed: completed.length,
  };
}

export function getMetrics(clock: number = 50, version: 1 | 2 = 1): Metrics {
  if (version === 1) return aggregateMetrics(sessions, evidence, clock, false);
  const experiment = buildExperiment(
    decisionStore.getSnapshot().committedActionIds,
  );
  return aggregateMetrics(
    experiment.sessions,
    experiment.evidence,
    clock,
    experiment.actionIds.length > 0,
  );
}

export function getProjectedMetrics(actionIds: readonly string[]): Metrics {
  const experiment = buildExperiment(actionIds);
  return aggregateMetrics(
    experiment.sessions,
    experiment.evidence,
    50,
    experiment.actionIds.length > 0,
  );
}

export function getProjectedFindings(actionIds: readonly string[]) {
  return buildExperiment(actionIds).findings;
}

export function getCounts(clock: number = 50, version: 1 | 2 = 1) {
  const cohort = getSessionCohort(version);
  const statusCounts = { queued: 0, starting: 0, active: 0, completed: 0 };
  cohort.forEach((session) => {
    statusCounts[getSessionStatus(session, clock)] += 1;
  });
  return {
    total: cohort.length,
    ...statusCounts,
    ai: cohort.filter((session) => session.source === "ai").length,
    human: cohort.filter((session) => session.source === "human").length,
    expert: cohort.filter((session) => session.source === "expert").length,
    specialist: 1,
    specialistStatus: getSessionStatus(getSpecialistSession(version), clock),
  };
}

export function getSignals(clock: number = 50, version: 1 | 2 = 1) {
  return getCurrentEvidence(clock, version)
    .filter(
      (item) => item.type !== "Page view" && item.type !== "Review started",
    )
    .slice()
    .reverse();
}

export function getFindingSupport(
  findingId: string,
  clock: number = 50,
  version: 1 | 2 = 1,
) {
  const items = getCurrentEvidence(clock, version).filter((item) =>
    item.findingIds.includes(findingId),
  );
  const sessionIds = [...new Set(items.map((item) => item.sessionId))];
  return { evidence: items, sessionIds, count: sessionIds.length };
}
