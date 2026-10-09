/* global document, window, getComputedStyle */
export const POLICY_VERSION = "langgraph-observe-act-v1";
export const EVALUATOR_VERSION = "observed-rules-axe-v1";

/** Measurements, not user sentiment scores. Source snapshots are stored with the event. */
export async function captureEvaluationSnapshot(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect(),
        style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    };
    const controls = Array.from(
      document.querySelectorAll(
        'button,a,input,select,textarea,[role="button"]',
      ),
    )
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          label: (
            element.getAttribute("aria-label") ||
            element.labels?.[0]?.textContent ||
            element.textContent ||
            element.placeholder ||
            ""
          )
            .trim()
            .slice(0, 120),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          inputType: element.type || "",
          name: element.name || "",
        };
      });
    const links = Array.from(document.querySelectorAll("a[href]"))
      .filter(visible)
      .map((element) => ({
        text: (element.textContent || "").trim().slice(0, 80),
        href: element.href,
      }));
    const forms = Array.from(document.forms)
      .filter(visible)
      .map((form) => ({
        action: form.action,
        method: form.method,
        personalFields: Array.from(form.elements).filter(
          (element) =>
            visible(element) &&
            /email|phone|name|address/i.test(
              `${element.type || ""} ${element.name || ""} ${element.id || ""}`,
            ),
        ).length,
      }));
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      controls: controls.slice(0, 100),
      links: links.slice(0, 100),
      forms: forms.slice(0, 20),
    };
  });
}
export function evaluateUsability(snapshot) {
  const findings = [];
  if (snapshot.documentWidth > snapshot.viewportWidth + 3)
    findings.push({
      title: "Content overflows the browser viewport",
      category: "usability",
      severity: "medium",
      basis: "observed",
      ruleId: "viewport-overflow",
      description: `The page is ${snapshot.documentWidth}px wide in a ${snapshot.viewportWidth}px viewport. Horizontal scrolling is required for some content.`,
      proposedFix:
        "Constrain overflowing elements and repeat the task at the affected viewport width.",
      requiresHumanVerification: true,
    });
  const small = snapshot.controls.filter(
    (x) => ["button", "a"].includes(x.tag) && x.width < 24 && x.height < 24,
  );
  if (small.length)
    findings.push({
      title: "Small interactive targets need review",
      category: "usability",
      severity: "low",
      basis: "observed",
      ruleId: "small-interactive-target",
      description: `${small.length} visible links/buttons measure less than 24px in both dimensions. Spacing and criterion exceptions require manual review.`,
      proposedFix:
        "Inspect the measured controls and provide sufficient target area or spacing; verify with mobile participants.",
      requiresHumanVerification: true,
    });
  return findings;
}
export function evaluateAccessibility(violations) {
  return violations
    .slice(0, 25)
    .map((violation) => ({
      title: violation.help,
      category: "accessibility",
      severity:
        violation.impact === "critical"
          ? "high"
          : violation.impact === "serious"
            ? "medium"
            : "low",
      basis: "observed",
      description: `axe-core ${violation.id}: ${violation.nodes.length} affected elements. ${violation.description}`,
      ruleId: violation.id,
      proposedFix: violation.helpUrl,
      requiresHumanVerification: true,
    }));
}
export function evaluateTrust(snapshot, currentUrl) {
  const findings = [],
    origin = new URL(currentUrl).origin;
  const personal = snapshot.forms.filter((x) => x.personalFields > 0),
    privacy = snapshot.links.some((x) =>
      /privacy|data policy/i.test(x.text + " " + x.href),
    );
  if (personal.length && !privacy)
    findings.push({
      title: "Personal-data form has no visible privacy link",
      category: "trust",
      severity: "medium",
      basis: "observed",
      ruleId: "personal-data-privacy-link",
      description: `${personal.length} visible forms request name, email, phone or address information; the captured page has no visible link labelled as a privacy/data policy. User trust effects have not been measured.`,
      proposedFix:
        "Explain why the information is requested and provide a relevant privacy link near the form; validate whether users understand it.",
      requiresHumanVerification: true,
    });
  const external = snapshot.forms.filter((x) => {
    try {
      return new URL(x.action).origin !== origin;
    } catch {
      return false;
    }
  });
  if (external.length)
    findings.push({
      title: "Form sends data to a different origin",
      category: "trust",
      severity: "high",
      basis: "observed",
      ruleId: "external-form-action",
      description: `${external.length} visible form actions point outside the current product origin. The worker prevents unapproved destinations; review whether the destination is intended and disclosed.`,
      proposedFix:
        "Check the form destination, explain any external processor and approve only the intended staging origin.",
      requiresHumanVerification: true,
    });
  return findings;
}
export function evaluateConversion(task, result, mode) {
  if (
    result.outcome === "success" ||
    result.outcome === "unknown" ||
    result.outcome === "blocked"
  )
    return [];
  return [
    {
      title: `${task.title}: completion criterion not reached`,
      category: "conversion",
      severity: "high",
      basis: mode === "functional" ? "observed" : "inferred",
      ruleId: `configured-task-completion:${task.id}`,
      description:
        mode === "functional"
          ? "The approved functional task did not reach its observable completion criteria. This is a technical workflow result, not a real customer conversion measurement."
          : "This configured synthetic profile did not reach the task completion criteria. The implied risk to real user conversion requires human validation.",
      proposedFix:
        "Review the recorded journey and failed assertions, fix a reproducible workflow problem, and verify the effect with relevant human testers.",
      requiresHumanVerification: true,
    },
  ];
}
