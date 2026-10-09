import type {
  Assignment,
  Campaign,
  EvidenceAsset,
  ParticipantFeedback,
  ParticipantMissionSnapshot,
  Task,
  TaskResult,
} from "./types.js";

export const PARTICIPANT_FEEDBACK_MAX_BYTES = 25 * 1024 * 1024;
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} could not be read.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, minimum = 0): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    value.trim().length < minimum
  )
    throw new Error(`${label} must contain ${minimum} to ${max} characters.`);
  return value.trim();
}
function safeUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function participantMissionSnapshot(
  campaign: Campaign,
): ParticipantMissionSnapshot {
  return {
    campaignId: campaign.id,
    title: campaign.title.trim(),
    url: campaign.url.trim(),
    audience: campaign.audience.trim(),
    objective: campaign.objective.trim(),
    tasks: campaign.tasks.map((task) => ({
      id: task.id,
      title: task.title.trim(),
      instructions: task.instructions.trim(),
      question: task.question.trim(),
      ...(task.successCriteria === undefined
        ? {}
        : { successCriteria: task.successCriteria.trim() }),
    })),
  };
}
function readMission(value: unknown): ParticipantMissionSnapshot {
  const mission = record(value, "Returned mission");
  if (
    !Array.isArray(mission.tasks) ||
    mission.tasks.length < 1 ||
    mission.tasks.length > 8
  )
    throw new Error("Returned mission needs one to eight tasks.");
  return {
    campaignId: text(mission.campaignId, "Mission campaign ID", 200, 1),
    title: text(mission.title, "Mission title", 300, 1),
    url: text(mission.url, "Mission URL", 2000, 1),
    audience: text(mission.audience, "Mission audience", 5000, 1),
    objective: text(mission.objective, "Mission objective", 5000, 1),
    tasks: mission.tasks.map((value): Task => {
      const task = record(value, "Returned task");
      return {
        id: text(task.id, "Task ID", 200, 1),
        title: text(task.title, "Task title", 300, 1),
        instructions: text(task.instructions, "Task instructions", 6000, 1),
        question: text(task.question, "Task question", 3000, 1),
        ...(task.successCriteria === undefined
          ? {}
          : {
              successCriteria: text(
                task.successCriteria,
                "Success criteria",
                3000,
              ),
            }),
      };
    }),
  };
}
export function validateParticipantFeedback(
  value: unknown,
  campaign: Campaign,
  assignment: Assignment,
): ParticipantFeedback {
  const item = record(value, "Participant feedback");
  if (
    item.kind !== "playground-participant-feedback" ||
    item.schemaVersion !== 1
  )
    throw new Error(
      "Choose a Playground participant feedback JSON file (version 1).",
    );
  const assignmentId = text(item.assignmentId, "Assignment ID", 200, 1),
    campaignId = text(item.campaignId, "Campaign ID", 200, 1),
    testerId = text(item.testerId, "Participant ID", 200, 1);
  if (
    assignmentId !== assignment.id ||
    campaignId !== campaign.id ||
    assignment.campaignId !== campaign.id ||
    testerId !== assignment.testerId
  )
    throw new Error(
      "This feedback belongs to another participant or campaign.",
    );
  const mission = readMission(item.mission);
  if (
    JSON.stringify(mission) !==
    JSON.stringify(participantMissionSnapshot(campaign))
  )
    throw new Error(
      "The returned mission differs from the approved campaign. Download the current participant mission and run it again.",
    );
  if (item.consentConfirmed !== true)
    throw new Error(
      "The participant must confirm participation and evidence-sharing consent in the returned mission.",
    );
  if (
    !Array.isArray(item.results) ||
    item.results.length !== campaign.tasks.length
  )
    throw new Error("Return one result for every mission task.");
  const results = item.results.map((value): TaskResult => {
    const result = record(value, "Task result"),
      taskId = text(result.taskId, "Task ID", 200, 1);
    if (!campaign.tasks.some((task) => task.id === taskId))
      throw new Error("Returned feedback contains an unknown task.");
    if (!["success", "partial", "blocked"].includes(result.outcome as string))
      throw new Error("Record a valid task outcome.");
    if (
      !["none", "minor", "major", "blocker"].includes(result.severity as string)
    )
      throw new Error("Record a valid issue severity.");
    if (!Array.isArray(result.evidence) || result.evidence.length > 6)
      throw new Error("Attach up to six evidence items per task.");
    const evidence = result.evidence.map((value): EvidenceAsset => {
      const asset = record(value, "Evidence item");
      const kind = asset.kind as EvidenceAsset["kind"];
      if (!["image", "video", "link"].includes(kind))
        throw new Error("Choose a valid evidence type.");
      const url = text(asset.url, "Evidence URL", 4_300_000, 1);
      const image =
        /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          url,
        );
      if (!(safeUrl(url) || (kind === "image" && image)))
        throw new Error(
          "Evidence must use an HTTP(S) URL without credentials or a supported screenshot.",
        );
      return {
        id: text(asset.id, "Evidence ID", 200, 1),
        name: text(asset.name, "Evidence name", 300, 1),
        kind,
        url,
      };
    });
    const output: TaskResult = {
      taskId,
      outcome: result.outcome as TaskResult["outcome"],
      answer: text(result.answer, "Task answer", 10000, 10),
      observation: text(result.observation, "Task observation", 10000, 10),
      severity: result.severity as TaskResult["severity"],
      evidence,
    };
    if (result.durationSeconds !== undefined) {
      if (
        typeof result.durationSeconds !== "number" ||
        !Number.isFinite(result.durationSeconds) ||
        result.durationSeconds < 0 ||
        result.durationSeconds > 86400
      )
        throw new Error(
          "Task time must be measured seconds between 0 and 86400, or left unrecorded.",
        );
      output.durationSeconds = result.durationSeconds;
    }
    if (result.executionOutcome !== undefined) {
      if (
        !["failed", "abandoned", "assisted"].includes(
          result.executionOutcome as string,
        )
      )
        throw new Error("Record a valid execution outcome.");
      output.executionOutcome =
        result.executionOutcome as TaskResult["executionOutcome"];
      if (
        output.outcome === "success" &&
        output.executionOutcome !== "assisted"
      )
        throw new Error(
          "Failed or abandoned tasks cannot be marked completed.",
        );
    }
    return output;
  });
  if (
    new Set(results.map((result) => result.taskId)).size !==
    campaign.tasks.length
  )
    throw new Error("Return each mission task once.");
  if (!results.some((result) => result.evidence.length))
    throw new Error(
      "Return at least one supporting screenshot, recording or evidence link.",
    );
  const submittedAt = text(
    item.submittedAt,
    "Participant submission date",
    50,
    1,
  );
  if (!Number.isFinite(Date.parse(submittedAt)))
    throw new Error("Participant submission date is invalid.");
  return {
    kind: "playground-participant-feedback",
    schemaVersion: 1,
    assignmentId,
    campaignId,
    testerId,
    mission,
    results,
    overallFeedback: text(item.overallFeedback, "Overall feedback", 10000, 10),
    consentConfirmed: true,
    submittedAt,
  };
}
export function parseParticipantFeedback(
  source: string,
  campaign: Campaign,
  assignment: Assignment,
): ParticipantFeedback {
  if (
    new TextEncoder().encode(source).byteLength > PARTICIPANT_FEEDBACK_MAX_BYTES
  )
    throw new Error("Participant feedback files must be 25 MB or smaller.");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The participant feedback JSON could not be read.");
  }
  return validateParticipantFeedback(value, campaign, assignment);
}
const htmlText = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const scriptJson = (value: unknown) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
export function participantMissionFilename(assignment: Assignment): string {
  return `playground-mission-${assignment.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80)}.html`;
}
export function buildParticipantMissionHtml(
  campaign: Campaign,
  assignment: Assignment,
  participantName = "Participant",
): string {
  if (
    assignment.campaignId !== campaign.id ||
    !campaign.tasksApproved ||
    campaign.payment !== "paid" ||
    !["invited", "accepted", "revision"].includes(assignment.status)
  )
    throw new Error(
      "Download a mission for an invited, accepted or revision participant in a paid, approved campaign.",
    );
  if (!safeUrl(campaign.url))
    throw new Error(
      "The product needs a valid HTTP(S) URL without credentials.",
    );
  const mission = participantMissionSnapshot(campaign),
    ids = {
      campaignId: campaign.id,
      assignmentId: assignment.id,
      testerId: assignment.testerId,
    };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlText(campaign.title)} — Playground mission</title><style>
*{box-sizing:border-box}body{margin:0;background:#f8f7f2;color:#173d3a;font:15px/1.6 system-ui,sans-serif}main{max-width:840px;margin:auto;padding:30px 20px}h1{line-height:1.15}h2{font-size:20px}section,.consent{background:white;border:1px solid #dfe5df;border-radius:16px;padding:22px;margin:20px 0}a{color:#245bce}label{display:block;margin:14px 0;font-weight:600}input,textarea,select,button{font:inherit}textarea,input[type=number],input[type=url],select{width:100%;padding:11px;border:1px solid #bdcac1;border-radius:8px}textarea{min-height:100px}small{font-weight:400;color:#506762}button,.product{display:inline-flex;align-items:center;justify-content:center;background:#173d3a;color:white;border:0;border-radius:8px;padding:10px 16px;cursor:pointer;text-decoration:none}button:disabled{opacity:.55;cursor:default}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}.timer{margin-top:8px;background:#e5ece4;color:#173d3a}.status{color:#9a3b28;white-space:pre-wrap}.assets{font-size:13px}fieldset{border:0;padding:0;margin:0}.consent label{display:flex;align-items:flex-start;gap:12px}.consent input{margin-top:6px}input[type=file]{max-width:100%}@media(max-width:520px){.pair{grid-template-columns:1fr}section{padding:16px}}@media print{button,input[type=file],.product{display:none}}
</style></head><body><main><header><small>PLAYGROUND · PARTICIPANT MISSION · ROUND ${campaign.round}</small><h1>${htmlText(campaign.title)}</h1><p>For ${htmlText(participantName)} · ${htmlText(campaign.objective)}</p><a class="product" href="${htmlText(campaign.url)}" target="_blank" rel="noopener noreferrer">Open product</a><p><small>Attempt the tasks in the real product. This file records your observations; it does not instrument the product or authenticate your identity. Return the downloaded feedback JSON to your test coordinator. Nothing is sent automatically. Keep the file and any evidence private.</small></p></header>
<form id="feedback"><div class="consent"><label><input id="consent" type="checkbox" required><span>I agree to participate and share my written feedback, screenshots and recording links with the founder and Playground reviewers. I have removed personal or confidential information and have permission from anyone shown.</span></label></div>
${mission.tasks.map((task, index) => `<section id="task-${index}"><small>TASK ${index + 1} OF ${mission.tasks.length}</small><h2>${htmlText(task.title)}</h2><p>${htmlText(task.instructions)}</p>${task.successCriteria ? `<p><strong>Success:</strong> ${htmlText(task.successCriteria)}</p>` : ""}<fieldset><label>What happened?<select name="outcome-${index}" required><option value="">Choose an outcome</option><option value="success">Completed without help</option><option value="partial">Partly completed</option><option value="blocked">Blocked</option><option value="failed">Failed</option><option value="abandoned">Abandoned</option><option value="assisted">Completed with help</option></select></label><div class="pair"><label>Time on task (seconds)<input name="seconds-${index}" type="number" min="0" max="86400" step="0.1" placeholder="Not recorded"><small>Enter a measured time, or leave blank if unknown.</small><br><button class="timer" type="button" data-timer="${index}">Start timer</button></label><label>Issue severity<select name="severity-${index}"><option value="none">No issue</option><option value="minor">Minor friction</option><option value="major">Major difficulty</option><option value="blocker">Prevents completion</option></select></label></div><label>${htmlText(task.question)}<textarea name="answer-${index}" required minlength="10" maxlength="10000"></textarea></label><label>What did you notice?<textarea name="observation-${index}" required minlength="10" maxlength="10000" placeholder="Describe what you tried, expected, and what actually happened."></textarea></label><label>Supporting screenshots<input type="file" data-files="${index}" multiple accept="image/png,image/jpeg,image/webp"><small>Up to two screenshots per task, each 450 KB or smaller. Consent is required before attaching.</small></label><p class="assets" id="assets-${index}"></p><label>Recording or evidence link<input type="url" name="link-${index}" placeholder="https://…"><small>Optional. Use a private recording link where possible.</small></label></fieldset></section>`).join("")}
<section><h2>Overall feedback</h2><label>What helped, what got in the way, and what should change?<textarea name="overall" required minlength="10" maxlength="10000"></textarea></label><p><small>Attach at least one screenshot, recording or supporting link. Download your completed feedback and return it to the coordinator, who will check identity and review its quality.</small></p><p class="status" id="status" role="alert"></p><button id="download" type="submit">Download feedback JSON</button></section></form></main><script>
const mission=${scriptJson(mission)},ids=${scriptJson(ids)};const form=document.getElementById('feedback'),status=document.getElementById('status'),consent=document.getElementById('consent');const screenshots={},timers={};const field=(name)=>form.elements.namedItem(name);const setStatus=(message)=>{status.textContent=message};
document.querySelectorAll('[data-timer]').forEach((button)=>button.addEventListener('click',()=>{const index=button.dataset.timer,seconds=field('seconds-'+index);if(timers[index]===undefined){timers[index]=performance.now();seconds.disabled=true;button.textContent='Stop timer';}else{seconds.value=String(Math.round((performance.now()-timers[index])/100)/10);delete timers[index];seconds.disabled=false;button.textContent='Start timer';}}));
document.querySelectorAll('[data-files]').forEach((input)=>input.addEventListener('change',async()=>{const index=input.dataset.files;if(!consent.checked){input.value='';setStatus('Confirm consent before attaching screenshots.');return;}const files=Array.from(input.files);if(files.length>2||files.some((file)=>file.size>450*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))){input.value='';setStatus('Choose up to two PNG, JPEG or WebP screenshots of 450 KB or less per task.');return;}document.getElementById('download').disabled=true;try{screenshots[index]=await Promise.all(files.map((file)=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({id:crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random(),name:file.name,kind:'image',url:reader.result});reader.onerror=()=>reject(new Error('Screenshot could not be read.'));reader.readAsDataURL(file);})));document.getElementById('assets-'+index).textContent=files.map((file)=>file.name).join(', ');setStatus('');}catch(error){setStatus(error.message)}finally{document.getElementById('download').disabled=false;}}));
form.addEventListener('submit',(event)=>{event.preventDefault();setStatus('');try{if(!consent.checked)throw new Error('Confirm participation and evidence-sharing consent.');if(Object.keys(timers).length)throw new Error('Stop each running timer before downloading.');const results=mission.tasks.map((task,index)=>{const chosen=field('outcome-'+index).value,answer=field('answer-'+index).value.trim(),observation=field('observation-'+index).value.trim(),seconds=field('seconds-'+index).value,evidence=[...(screenshots[index]||[])],link=field('link-'+index).value.trim();if(!chosen||answer.length<10||observation.length<10)throw new Error('Complete the outcome, answer and observation for task '+(index+1)+'.');if(link){const url=new URL(link);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Evidence links must use HTTP(S) without credentials.');evidence.push({id:'link-'+index,name:url.hostname,kind:/loom\\.com|youtube\\.com|youtu\\.be|vimeo\\.com|\\.mp4/i.test(link)?'video':'link',url:url.href});}const outcome=chosen==='assisted'?'success':chosen==='failed'?'blocked':chosen==='abandoned'?'partial':chosen;const result={taskId:task.id,outcome,answer,observation,severity:field('severity-'+index).value,evidence};if(['failed','abandoned','assisted'].includes(chosen))result.executionOutcome=chosen;if(seconds!==''){const durationSeconds=Number(seconds);if(!Number.isFinite(durationSeconds)||durationSeconds<0||durationSeconds>86400)throw new Error('Enter measured seconds between0 and86400.');result.durationSeconds=durationSeconds;}return result;});if(!results.some((result)=>result.evidence.length))throw new Error('Attach at least one supporting screenshot, recording or evidence link.');const overallFeedback=field('overall').value.trim();if(overallFeedback.length<10)throw new Error('Add useful overall feedback of at least10characters.');const feedback={kind:'playground-participant-feedback',schemaVersion:1,...ids,mission,results,overallFeedback,consentConfirmed:true,submittedAt:new Date().toISOString()};const blob=new Blob([JSON.stringify(feedback,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='playground-feedback-'+ids.assignmentId.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Feedback downloaded. Return the JSON file to your test coordinator.');}catch(error){setStatus(error.message)}});
</script></body></html>`;
}
