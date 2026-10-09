import { authHeaders } from "./auth-client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useMvp } from "./store";
import {
  createSandbox,
  exportSandboxMarkdown,
  SANDBOX_LIMITS,
  sandboxToCampaignPrefill,
} from "./sandbox";
import type { Sandbox, SandboxAnalysis, SandboxMessage } from "./sandbox";
import { deleteSandbox, getSandboxes, saveSandbox } from "./sandbox-store";
import { extractSandboxFile } from "./sandbox-files";
import { SandboxValidationPanel } from "./SandboxValidationPanel";
import { MarketTwinPanel } from "./MarketTwinPanel";
import { buildValidationDossier } from "./validation";
import { getTwinJob } from "./twin-client";
import "./research.css";

type Source = SandboxAnalysis["sources"][number];
type Assumption = SandboxAnalysis["assumptions"][number];
type Attachment = NonNullable<SandboxMessage["attachments"]>[number];
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Research could not be completed. Try again.";
const safeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
};
const host = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
};
const date = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
function sourceMap(sandbox: Sandbox) {
  return new Map(
    [
      ...(sandbox.sourceArchive || []),
      ...(sandbox.analysis?.sources || []),
    ].map((source) => [source.id, source]),
  );
}
async function fetchJson(
  url: string,
  init?: RequestInit,
  signal?: AbortSignal,
  timeout = 60_000,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...(await authHeaders()), ...init?.headers },
      signal: controller.signal,
    });
    if (
      !(response.headers.get("content-type") || "").includes("application/json")
    )
      throw new Error("Research is unavailable. Retry the connection.");
    const result = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const error = new Error(
        typeof result.error === "string"
          ? result.error
          : "Research could not be completed. Try again.",
      );
      Object.assign(error, { code: result.code });
      throw error;
    }
    return result;
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (controller.signal.aborted)
      throw new Error("Research took too long. Retry to continue.");
    if (error instanceof TypeError)
      throw new Error(
        "Couldn’t reach research. Check your connection and retry.",
      );
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
function SourceChips({
  ids,
  sources,
}: {
  ids: string[];
  sources: Map<string, Source>;
}) {
  const unique = [...new Set(ids)];
  return unique.length ? (
    <span className="sb-source-chips">
      {unique.map((id) => {
        const source = sources.get(id);
        const url = source && safeUrl(source.url);
        return source && url ? (
          <a
            key={id}
            href={url}
            title={source.title}
            target="_blank"
            rel="noreferrer"
          >
            {host(url)}
            <ExternalLink size={11} />
          </a>
        ) : (
          <span key={id} className="sb-missing-source">
            Source unavailable
          </span>
        );
      })}
    </span>
  ) : null;
}
function ExternalSource({ url, label }: { url: string; label?: string }) {
  const safe = safeUrl(url);
  return safe ? (
    <a
      className="sb-external-link"
      href={safe}
      target="_blank"
      rel="noreferrer"
    >
      {label || host(safe)}
      <ExternalLink size={12} />
    </a>
  ) : null;
}
function TextContent({
  text,
  sources,
  sourceIds = [],
}: {
  text: string;
  sources: Map<string, Source>;
  sourceIds?: string[];
}) {
  const inlineSourceIds = new Set<string>();
  const inline = (value: string) =>
    value.split(/(\*\*[^*]+\*\*|\[[a-zA-Z0-9_-]+\])/g).map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      const sourceId = part.match(/^\[([a-zA-Z0-9_-]+)\]$/)?.[1];
      if (sourceId && sources.has(sourceId)) {
        inlineSourceIds.add(sourceId);
        return <SourceChips key={index} ids={[sourceId]} sources={sources} />;
      }
      return part;
    });
  return (
    <div className="sb-text-content">
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((paragraph, index) => {
          const lines = paragraph.split("\n");
          if (lines.every((line) => /^\s*[-*]\s/.test(line)))
            return (
              <ul key={index}>
                {lines.map((line, i) => (
                  <li key={i}>{inline(line.replace(/^\s*[-*]\s/, ""))}</li>
                ))}
              </ul>
            );
          return (
            <p key={index}>{inline(paragraph.replace(/^#{1,4}\s/gm, ""))}</p>
          );
        })}
      <SourceChips
        ids={sourceIds.filter((id) => !inlineSourceIds.has(id))}
        sources={sources}
      />
    </div>
  );
}
function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <div className="sb-error" role="alert">
      {message}
    </div>
  ) : null;
}
function DeleteDialog({
  title,
  busy,
  onClose,
  onDelete,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  const element = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const controls = () =>
      Array.from(
        element.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) || [],
      );
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const buttons = controls();
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (!element.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keydown);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [busy, onClose]);
  return (
    <div className="sb-dialog-backdrop" onClick={() => !busy && onClose()}>
      <section
        ref={element}
        className="sb-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sb-delete-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="sb-delete-title">Delete sandbox?</h2>
        <p>Delete “{title}” and its conversation from this device?</p>
        <div className="sb-dialog-actions">
          <button className="mvp-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="mvp-btn sb-danger-button"
            onClick={onDelete}
            disabled={busy}
          >
            {busy && <Loader2 size={15} className="sb-spin" />} Delete sandbox
          </button>
        </div>
      </section>
    </div>
  );
}

export function SandboxPage() {
  const { user, data } = useMvp();
  const owner = user?.id || "";
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const sandboxRef = useRef<Sandbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [saveConflict, setSaveConflict] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState("overview");
  const [workspaceView, setWorkspaceView] = useState("validation");
  const [validationBusy, setValidationBusy] = useState(false);
  const [twinBusy, setTwinBusy] = useState(false);
  const [validationRevision, setValidationRevision] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const fileRequest = useRef<AbortController | null>(null);
  const statusRequest = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const fileInput = useRef<HTMLInputElement>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const closeDelete = useCallback(() => setDeleting(false), []);
  const assign = useCallback((value: Sandbox) => {
    sandboxRef.current = value;
    setSandbox(value);
  }, []);
  const abortRequests = useCallback(() => {
    generation.current++;
    request.current?.abort();
    fileRequest.current?.abort();
    statusRequest.current?.abort();
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRequests();
    };
  }, [abortRequests]);
  const checkConnection = useCallback(async () => {
    statusRequest.current?.abort();
    const controller = new AbortController();
    statusRequest.current = controller;
    setChecking(true);
    setConnectionError("");
    try {
      const result = await fetchJson(
        "/api/sandbox",
        undefined,
        controller.signal,
        12_000,
      );
      if (controller.signal.aborted || !mounted.current) return;
      if (typeof result.configured !== "boolean")
        throw new Error("Research is unavailable. Retry the connection.");
      setConfigured(result.configured);
    } catch (e) {
      if (!controller.signal.aborted && mounted.current) {
        setConfigured(null);
        setConnectionError(errorMessage(e));
      }
    } finally {
      if (statusRequest.current === controller && mounted.current)
        setChecking(false);
    }
  }, []);
  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getSandboxes(owner)
      .then((records) => {
        if (!alive) return;
        setSandboxes(records);
        assign(records[0] || createSandbox(owner));
      })
      .catch((e) => {
        if (alive) setError(errorMessage(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [owner, assign]);
  useEffect(() => {
    conversationEnd.current?.scrollIntoView({
      block: "nearest",
      behavior: "instant",
    });
  }, [sandbox?.messages.length, pending]);
  const persist = useCallback(
    (next: Sandbox, token?: number): Promise<Sandbox> => {
      const operation = writes.current
        .catch(() => undefined)
        .then(async () => {
          if (token !== undefined && generation.current !== token)
            throw new DOMException("Cancelled", "AbortError");
          if (mounted.current) setSaving(true);
          const latest = sandboxRef.current;
          const saved = await saveSandbox({
            ...next,
            updatedAt:
              latest?.id === next.id ? latest.updatedAt : next.updatedAt,
          });
          if (mounted.current) {
            setSandboxes((current) =>
              [saved, ...current.filter((item) => item.id !== saved.id)].sort(
                (a, b) => b.updatedAt.localeCompare(a.updatedAt),
              ),
            );
            if (sandboxRef.current?.id === saved.id) {
              assign(saved);
              setUnsaved(false);
              setSaveConflict(false);
            }
          }
          return saved;
        });
      writes.current = operation;
      return operation
        .catch((error) => {
          if (
            mounted.current &&
            /changed in another tab/i.test(errorMessage(error))
          )
            setSaveConflict(true);
          throw error;
        })
        .finally(() => {
          if (mounted.current) setSaving(false);
        });
    },
    [assign],
  );
  const select = (value: Sandbox) => {
    generation.current++;
    request.current?.abort();
    fileRequest.current?.abort();
    assign(value);
    setUnsaved(false);
    setSaveConflict(false);
    setInput("");
    setAttachments([]);
    setExtracting(false);
    setError("");
    setDeleting(false);
    setTab("overview");
  };
  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    if (attachments.length + files.length > 3) {
      setError("Attach up to three files.");
      return;
    }
    fileRequest.current?.abort();
    const controller = new AbortController();
    fileRequest.current = controller;
    setExtracting(true);
    setError("");
    const sandboxId = sandboxRef.current?.id;
    try {
      const extracted: Attachment[] = [];
      for (const file of Array.from(files)) {
        const result = await extractSandboxFile(file, controller.signal);
        if (controller.signal.aborted) return;
        extracted.push(result);
      }
      if (mounted.current && sandboxRef.current?.id === sandboxId)
        setAttachments((current) => [...current, ...extracted]);
    } catch (e) {
      if (!controller.signal.aborted && mounted.current)
        setError(errorMessage(e));
    } finally {
      if (fileRequest.current === controller && mounted.current)
        setExtracting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const send = async (retry?: SandboxMessage) => {
    const current = sandboxRef.current;
    const originalInput = input;
    const originalAttachments = attachments;
    const text =
      retry?.text ||
      input.trim() ||
      (attachments.length ? "Analyze the attached brief." : "");
    const currentAttachments = retry ? retry.attachments || [] : attachments;
    if (
      !current ||
      !text ||
      pending ||
      extracting ||
      saving ||
      recovering ||
      saveConflict
    )
      return;
    if (configured !== true) {
      setError(
        configured === false
          ? "Research is not configured. Retry the connection after setup."
          : "Check the research connection before building your sandbox.",
      );
      return;
    }
    const token = ++generation.current;
    let durablySaved = false;
    const controller = new AbortController();
    request.current = controller;
    const messageId = retry?.id || uuid();
    const userMessage: SandboxMessage = {
      id: messageId,
      role: "user",
      text,
      createdAt: retry?.createdAt || now(),
      sourceIds: [],
      status: "pending",
      ...(currentAttachments.length ? { attachments: currentAttachments } : {}),
    };
    const next: Sandbox = {
      ...current,
      title: current.messages.length
        ? current.title
        : text.split("\n")[0].slice(0, 80),
      initialInput: current.initialInput || text,
      messages: retry
        ? current.messages.map((item) =>
            item.id === retry.id ? userMessage : item,
          )
        : [...current.messages, userMessage],
    };
    assign(next);
    setUnsaved(true);
    setPending(true);
    setError("");
    try {
      const saved = await persist(next, token);
      durablySaved = true;
      if (controller.signal.aborted || generation.current !== token) return;
      if (!retry) {
        setInput("");
        setAttachments([]);
      }
      const history = saved.messages
        .filter(
          (item) =>
            item.id !== messageId &&
            (item.role === "user" ||
              !["pending", "failed", "cancelled"].includes(item.status || "")),
        )
        .slice(-SANDBOX_LIMITS.historyMessages)
        .map((item) => {
          const fullContent = [
            item.text,
            ...(item.attachments || []).map(
              (file) => `Attached brief: ${file.name}\n${file.text}`,
            ),
          ].join("\n\n");
          const marker =
            "\n[Brief excerpt truncated to fit conversation context.]";
          const content =
            fullContent.length > SANDBOX_LIMITS.messageChars
              ? fullContent.slice(
                  0,
                  SANDBOX_LIMITS.messageChars - marker.length,
                ) + marker
              : fullContent;
          return { role: item.role, content };
        });
      while (
        history.reduce((total, item) => total + item.content.length, 0) >
        SANDBOX_LIMITS.historyChars
      )
        history.shift();
      const briefs = saved.messages
        .flatMap((item) => item.attachments || [])
        .slice(-SANDBOX_LIMITS.attachments);
      const result = await fetchJson(
        "/api/sandbox",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history,
            priorAnalysis: saved.analysis,
            sourceReceipt: saved.sourceReceipt,
            attachments: briefs,
          }),
        },
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        generation.current !== token ||
        !mounted.current
      )
        return;
      if (
        typeof result.reply !== "string" ||
        !result.analysis ||
        typeof result.analysis !== "object"
      )
        throw new Error(
          "Research returned an incomplete result. Retry to continue.",
        );
      const analysis = result.analysis as SandboxAnalysis;
      const sourceIds = Array.isArray(analysis.sources)
        ? analysis.sources
            .filter(
              (source) =>
                typeof source?.id === "string" &&
                result.reply &&
                (result.reply as string).includes(`[${source.id}]`),
            )
            .map((source) => source.id)
        : [];
      const latest = sandboxRef.current;
      if (!latest || latest.id !== saved.id) return;
      await persist(
        {
          ...latest,
          title: analysis.product?.name || latest.title,
          analysis,
          sourceReceipt:
            typeof result.sourceReceipt === "string"
              ? result.sourceReceipt
              : undefined,
          messages: [
            ...latest.messages.map((item) =>
              item.id === messageId
                ? { ...item, status: "complete" as const, error: undefined }
                : item,
            ),
            {
              id: uuid(),
              role: "assistant",
              text: result.reply,
              createdAt: now(),
              sourceIds,
              status: "complete",
            },
          ],
        },
        token,
      );
    } catch (e) {
      if (
        controller.signal.aborted ||
        generation.current !== token ||
        !mounted.current
      )
        return;
      if (e instanceof Error && "code" in e && e.code === "SETUP_REQUIRED")
        setConfigured(false);
      const problem = errorMessage(e);
      setError(problem);
      if (!durablySaved) {
        assign(current);
        setInput(originalInput);
        setAttachments(originalAttachments);
        setUnsaved(true);
        return;
      }
      const latest = sandboxRef.current;
      if (latest?.id === current.id) {
        const failed = {
          ...latest,
          messages: latest.messages.map((item) =>
            item.id === messageId
              ? { ...item, status: "failed" as const, error: problem }
              : item,
          ),
        };
        assign(failed);
        setUnsaved(true);
        await persist(failed, token).catch(() => undefined);
      }
    } finally {
      if (generation.current === token && mounted.current) setPending(false);
    }
  };
  const cancel = async () => {
    generation.current++;
    request.current?.abort();
    setPending(false);
    setError("");
    const latest = sandboxRef.current;
    if (!latest) return;
    const cancelled = {
      ...latest,
      messages: latest.messages.map((item) =>
        item.role === "user" && item.status === "pending"
          ? { ...item, status: "cancelled" as const, error: undefined }
          : item,
      ),
    };
    assign(cancelled);
    setUnsaved(true);
    await persist(cancelled).catch((e) => {
      if (mounted.current) setError(errorMessage(e));
    });
  };
  const remove = async () => {
    const current = sandboxRef.current;
    if (!current) return;
    setSaving(true);
    setError("");
    try {
      await deleteSandbox(owner, current.id);
      const remaining = sandboxes.filter((item) => item.id !== current.id);
      setSandboxes(remaining);
      select(remaining[0] || createSandbox(owner));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  const reloadSaved = async () => {
    const current = sandboxRef.current;
    if (!current || pending || saving) return;
    const token = ++generation.current;
    setRecovering(true);
    try {
      const records = await getSandboxes(owner);
      if (!mounted.current || generation.current !== token) return;
      const latest = records.find((record) => record.id === current.id);
      if (!latest)
        throw new Error(
          "This sandbox is no longer saved. Create a new sandbox with your brief.",
        );
      assign(latest);
      setValidationRevision((value) => value + 1);
      setSandboxes((items) =>
        [latest, ...items.filter((item) => item.id !== latest.id)].sort(
          (a, b) => b.updatedAt.localeCompare(a.updatedAt),
        ),
      );
      setUnsaved(false);
      setSaveConflict(false);
      setError("");
    } catch (e) {
      if (mounted.current && generation.current === token)
        setError(errorMessage(e));
    } finally {
      if (mounted.current && generation.current === token) setRecovering(false);
    }
  };
  const download = () => {
    if (!sandbox) return;
    setError("");
    try {
      const url = URL.createObjectURL(
        new Blob([exportSandboxMarkdown(sandbox)], {
          type: "text/markdown;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sandbox.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "sandbox"}.md`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  if (loading)
    return (
      <div className="sb-loading" role="status">
        <Loader2 className="sb-spin" size={19} /> Loading sandboxes
      </div>
    );
  if (!sandbox) return <ErrorNotice message={error} />;
  const sources = sourceMap(sandbox);
  const started = sandbox.messages.length > 0;
  const lastUser = sandbox.messages
    .filter((item) => item.role === "user")
    .at(-1);
  const saved = sandboxes.some((item) => item.id === sandbox.id);
  const busy =
    pending || saving || extracting || recovering || validationBusy || twinBusy;
  const recovery = saveConflict ? (
    <button
      className="sb-reload-button mvp-btn"
      onClick={() => void reloadSaved()}
      disabled={busy}
    >
      {recovering ? (
        <Loader2 className="sb-spin" size={14} />
      ) : (
        <RefreshCw size={14} />
      )}{" "}
      Reload saved sandbox
    </button>
  ) : null;
  const composer = (
    <form
      className={`sb-composer ${started ? "" : "sb-composer-initial"}`}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void send();
      }}
    >
      <label className="sb-sr-only" htmlFor="sb-message">
        {started ? "Message" : "Idea or product URL"}
      </label>
      <textarea
        id="sb-message"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={
          started
            ? "Ask a follow-up or change the brief…"
            : "Describe your idea, paste a product URL or attach a brief."
        }
        rows={started ? 3 : 5}
        maxLength={SANDBOX_LIMITS.messageChars}
        disabled={pending}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            void send();
          }
        }}
      />
      {attachments.length > 0 && (
        <div className="sb-attachments">
          {attachments.map((attachment, index) => (
            <span key={`${attachment.name}:${index}`}>
              <FileText size={13} />
              {attachment.name}
              <button
                type="button"
                aria-label={`Remove attachment ${attachment.name}`}
                onClick={() =>
                  setAttachments((current) =>
                    current.filter((_, i) => i !== index),
                  )
                }
                disabled={pending || extracting}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="sb-composer-footer">
        <div className="sb-composer-tools">
          <input
            ref={fileInput}
            className="sb-sr-only"
            type="file"
            accept=".pdf,.txt,.md,text/plain,text/markdown,application/pdf"
            multiple
            onChange={(event) => void attach(event.target.files)}
            tabIndex={-1}
          />
          <button
            className="sb-attach-button"
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={pending || extracting || attachments.length >= 3}
            aria-label="Attach brief"
          >
            <Paperclip size={18} />
            <span>Attach brief</span>
          </button>
          {extracting && (
            <span className="sb-extracting" role="status">
              <Loader2 size={13} className="sb-spin" /> Reading brief
            </span>
          )}
        </div>
        {pending ? (
          <button
            type="button"
            className="mvp-btn"
            onClick={() => void cancel()}
          >
            <Square size={13} /> Cancel
          </button>
        ) : (
          <button
            type="submit"
            className="mvp-btn mvp-btn-dark"
            disabled={
              saving ||
              recovering ||
              saveConflict ||
              extracting ||
              (!input.trim() && !attachments.length) ||
              configured !== true
            }
          >
            {started ? (
              <>
                <ArrowUp size={16} /> Send
              </>
            ) : (
              <>
                Build sandbox <ArrowRight size={16} />
              </>
            )}
          </button>
        )}
      </div>
    </form>
  );
  const connection =
    configured !== true || connectionError ? (
      <div
        className="sb-connection"
        role={connectionError ? "alert" : "status"}
      >
        {checking ? (
          <>
            <Loader2 size={15} className="sb-spin" />
            <span>Checking research connection</span>
          </>
        ) : (
          <>
            <div>
              <strong>
                {configured === false
                  ? "Research is not configured"
                  : "Research is unavailable"}
              </strong>
              <p>
                {configured === false
                  ? "Add OPENAI_API_KEY to the server environment, then retry."
                  : connectionError || "Retry the connection to continue."}
              </p>
            </div>
            <button
              className="mvp-btn"
              onClick={() => void checkConnection()}
              disabled={checking}
            >
              <RefreshCw size={14} /> Retry connection
            </button>
          </>
        )}
      </div>
    ) : null;
  return (
    <div className="sb-page">
      <header className="sb-page-heading">
        <div>
          <h1>Sandbox</h1>
          {started && <p>{sandbox.title}</p>}
        </div>
        <div className="sb-heading-actions">
          {sandboxes.length > 0 && (
            <label className="sb-sandbox-picker">
              <span className="sb-sr-only">Saved sandboxes</span>
              <select
                aria-label="Saved sandboxes"
                value={saved ? sandbox.id : ""}
                onChange={(event) => {
                  const selected = sandboxes.find(
                    (item) => item.id === event.target.value,
                  );
                  if (selected) select(selected);
                }}
                disabled={busy}
              >
                {!saved && <option value="">New sandbox</option>}
                {sandboxes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          )}
          {sandbox.analysis && workspaceView === "research" && (
            <button className="mvp-btn" onClick={download} disabled={busy}>
              <ArrowDownToLine size={15} /> Export
            </button>
          )}
          <button
            className="mvp-btn"
            onClick={() => select(createSandbox(owner))}
            disabled={busy}
          >
            <Plus size={15} /> New sandbox
          </button>
          {saved && (
            <button
              className="sb-icon-button"
              onClick={() => setDeleting(true)}
              disabled={busy}
              aria-label="Delete sandbox"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </header>
      <nav className="sb-workspace-switch" aria-label="Sandbox workspace">
        <button
          aria-pressed={workspaceView === "twin"}
          disabled={busy}
          onClick={() => setWorkspaceView("twin")}
        >
          Market Twin
        </button>
        <button
          aria-pressed={workspaceView === "validation"}
          disabled={busy}
          onClick={() => setWorkspaceView("validation")}
        >
          Validation
        </button>
        <button
          aria-pressed={workspaceView === "research"}
          disabled={busy}
          onClick={() => setWorkspaceView("research")}
        >
          Research
        </button>
      </nav>
      {workspaceView !== "research" && saveConflict && (
        <div className="sb-error" role="alert">
          This sandbox changed in another tab. Reloading restores its saved
          brief and mission.
          {recovery}
        </div>
      )}
      {workspaceView === "twin" ? (
        <MarketTwinPanel
          key={`${sandbox.id}:${validationRevision}`}
          sandbox={sandbox}
          dossier={buildValidationDossier(sandbox, data)}
          disabled={busy || saveConflict}
          onBusy={setTwinBusy}
          onSave={async (twin) => {
            const current = sandboxRef.current;
            if (!current || current.id !== sandbox.id)
              throw new Error(
                "The selected sandbox changed. Reopen it to save this experiment.",
              );
            await persist({ ...current, twin });
          }}
          onExport={async (format, job) => {
            const { exportTwinDossier } = await import("./twin-export");
            const previous = job.parentJobId
              ? await getTwinJob(job.parentJobId)
              : undefined;
            await exportTwinDossier(format, {
              sandbox,
              job,
              dossier: buildValidationDossier(sandbox, data),
              workspace: sandbox.twin,
              previous,
            });
          }}
        />
      ) : workspaceView === "validation" ? (
        <SandboxValidationPanel
          key={`${sandbox.id}:${validationRevision}`}
          sandbox={sandbox}
          disabled={busy}
          onBusy={setValidationBusy}
          onSave={async (validation) => {
            const current = sandboxRef.current;
            if (!current || current.id !== sandbox.id)
              throw new Error(
                "The selected sandbox changed. Reopen it to save this brief.",
              );
            await persist({
              ...current,
              validation,
              title:
                current.title === "New sandbox"
                  ? `${validation.brief.focus} validation`
                  : current.title,
            });
          }}
        />
      ) : !started ? (
        <div className="sb-start">
          {connection}
          <ErrorNotice message={error} />
          {recovery}
          {composer}
        </div>
      ) : (
        <div className="sb-workspace">
          <section className="sb-chat" aria-label="Conversation">
            <div className="sb-chat-heading">
              <h2>Conversation</h2>
              <span className="sb-autosave">
                {saving ? (
                  <>
                    <Loader2 className="sb-spin" size={12} /> Saving
                  </>
                ) : unsaved ? (
                  "Not saved"
                ) : saved ? (
                  <>
                    <Check size={12} /> Saved
                  </>
                ) : null}
              </span>
            </div>
            <div className="sb-messages" aria-live="polite">
              {sandbox.messages.map((item) => (
                <article
                  key={item.id}
                  className={`sb-message sb-message-${item.role}`}
                >
                  <span className="sb-message-role">
                    {item.role === "user" ? "You" : "Playground"}
                  </span>
                  <TextContent
                    text={item.text}
                    sources={sources}
                    sourceIds={item.sourceIds}
                  />
                  {item.attachments?.length && (
                    <div className="sb-message-files">
                      {item.attachments.map((file, i) => (
                        <span key={`${file.name}:${i}`}>
                          <FileText size={12} />
                          {file.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.role === "user" &&
                    ["failed", "cancelled", "pending"].includes(
                      item.status || "",
                    ) &&
                    item.id === lastUser?.id &&
                    !pending && (
                      <div className="sb-retry-row">
                        <span>
                          {item.status === "cancelled"
                            ? "Cancelled"
                            : item.status === "pending"
                              ? "Not completed"
                              : "Research failed"}
                        </span>
                        <button
                          className="sb-text-button"
                          onClick={() => void send(item)}
                          disabled={busy || configured !== true}
                        >
                          <RefreshCw size={13} /> Retry
                        </button>
                      </div>
                    )}
                </article>
              ))}
              {pending && (
                <div className="sb-pending" role="status">
                  <Loader2 className="sb-spin" size={16} /> Researching…
                </div>
              )}
              <div ref={conversationEnd} />
            </div>
            {connection}
            <ErrorNotice message={error} />
            {recovery}
            {composer}
          </section>
          <section className="sb-results" aria-label="Sandbox results">
            {sandbox.analysis ? (
              <AnalysisWorkspace
                sandbox={sandbox}
                sources={sources}
                tab={tab}
                setTab={setTab}
                previous={["pending", "failed", "cancelled"].includes(
                  lastUser?.status || "",
                )}
              />
            ) : (
              <div className="sb-results-empty">
                {pending ? (
                  <>
                    <Loader2 size={22} className="sb-spin" />
                    <h2>Researching your brief</h2>
                    <p>Results appear when research completes.</p>
                  </>
                ) : (
                  <>
                    <FileText size={23} />
                    <h2>No completed analysis</h2>
                    <p>Retry the request to build this sandbox.</p>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}
      {deleting && (
        <DeleteDialog
          title={sandbox.title}
          busy={saving}
          onClose={closeDelete}
          onDelete={() => void remove()}
        />
      )}
    </div>
  );
}
export { SandboxPage as MarketResearchPage };

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "competitors", label: "Competitors" },
  { id: "news", label: "News" },
  { id: "signals", label: "Customer signals" },
  { id: "plan", label: "Plan" },
  { id: "sources", label: "Sources" },
];
const basisLabels = {
  input: "From your brief",
  sourced: "Sourced",
  inference: "AI inference",
  unknown: "Not established",
};
function AnalysisWorkspace({
  sandbox,
  sources,
  tab,
  setTab,
  previous,
}: {
  sandbox: Sandbox;
  sources: Map<string, Source>;
  tab: string;
  setTab: (tab: string) => void;
  previous: boolean;
}) {
  const analysis = sandbox.analysis!;
  const testHref = (assumption: Assumption) =>
    `/create?${new URLSearchParams({ ...sandboxToCampaignPrefill(sandbox, assumption) })}`;
  const inferenceItems = (
    items: SandboxAnalysis["opportunities"],
    empty: string,
  ) =>
    items.length ? (
      <div className="sb-insight-list">
        {items.map((item, index) => (
          <article className="sb-insight" key={`${item.title}:${index}`}>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <SourceChips ids={item.sourceIds} sources={sources} />
          </article>
        ))}
      </div>
    ) : (
      <p className="sb-empty-note">{empty}</p>
    );
  return (
    <>
      <div className="sb-result-heading">
        <h2>{analysis.product.name}</h2>
        <span>
          {previous
            ? "Previous analysis"
            : `Updated ${date(sandbox.updatedAt)}`}
        </span>
      </div>
      <div
        className="sb-tabs"
        role="tablist"
        aria-label="Sandbox sections"
        onKeyDown={(event) => {
          const position = tabs.findIndex((item) => item.id === tab);
          let next = position;
          if (event.key === "ArrowRight") next = (position + 1) % tabs.length;
          else if (event.key === "ArrowLeft")
            next = (position + tabs.length - 1) % tabs.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = tabs.length - 1;
          else return;
          event.preventDefault();
          setTab(tabs[next].id);
          document.getElementById(`sb-tab-${tabs[next].id}`)?.focus();
        }}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            id={`sb-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`sb-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? "is-active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="sb-result-panel"
        id={`sb-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`sb-tab-${tab}`}
      >
        {tab === "overview" && (
          <>
            <section className="sb-analysis-card">
              <div className="sb-card-heading">
                <h3>Overview</h3>
                <span className="sb-basis">
                  {basisLabels[analysis.product.basis]}
                </span>
              </div>
              <p className="sb-product-description">
                {analysis.product.description}
              </p>
              {analysis.product.url && (
                <ExternalSource url={analysis.product.url} />
              )}
              <dl className="sb-product-details">
                {analysis.product.audience && (
                  <div>
                    <dt>Audience</dt>
                    <dd>{analysis.product.audience}</dd>
                  </div>
                )}
                {analysis.product.valueProposition && (
                  <div>
                    <dt>Value proposition</dt>
                    <dd>{analysis.product.valueProposition}</dd>
                  </div>
                )}
              </dl>
              <SourceChips ids={analysis.product.sourceIds} sources={sources} />
            </section>
            <section className="sb-analysis-card">
              <div className="sb-card-heading">
                <h3>Analysis</h3>
                <span className="sb-basis">
                  {basisLabels[analysis.summaryBasis]}
                </span>
              </div>
              <TextContent
                text={analysis.summary}
                sources={sources}
                sourceIds={analysis.summarySourceIds}
              />
            </section>
            {(analysis.opportunities.length > 0 ||
              analysis.risks.length > 0) && (
              <div className="sb-overview-pair">
                <section className="sb-analysis-card">
                  <div className="sb-card-heading">
                    <h3>Opportunities</h3>
                    <span className="sb-basis">AI inference</span>
                  </div>
                  {inferenceItems(
                    analysis.opportunities,
                    "No opportunities included",
                  )}
                </section>
                <section className="sb-analysis-card">
                  <div className="sb-card-heading">
                    <h3>Risks</h3>
                    <span className="sb-basis">AI inference</span>
                  </div>
                  {inferenceItems(analysis.risks, "No risks included")}
                </section>
              </div>
            )}
          </>
        )}
        {tab === "competitors" &&
          (analysis.competitors.length ? (
            <div className="sb-table-scroll">
              <table className="sb-competitor-table">
                <thead>
                  <tr>
                    <th>Competitor</th>
                    <th>Offer</th>
                    <th>Pricing</th>
                    <th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.competitors.map((item, index) => (
                    <tr key={`${item.url}:${index}`}>
                      <td>
                        <strong>{item.name}</strong>
                        <ExternalSource url={item.url} />
                        <SourceChips ids={item.sourceIds} sources={sources} />
                      </td>
                      <td>{item.offer}</td>
                      <td>
                        {item.pricing || (
                          <span className="sb-muted">Not established</span>
                        )}
                      </td>
                      <td>{item.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="sb-empty-note">
              No competitors included in this research
            </p>
          ))}
        {tab === "news" &&
          (analysis.news.length ? (
            <div className="sb-news-list">
              {analysis.news.map((item, index) => (
                <article
                  className="sb-analysis-card"
                  key={`${item.url}:${index}`}
                >
                  <div className="sb-news-meta">
                    {item.publishedAt ? (
                      <time dateTime={item.publishedAt}>
                        {date(item.publishedAt)}
                      </time>
                    ) : (
                      <span>Publication date unavailable</span>
                    )}
                  </div>
                  <h3>{item.headline}</h3>
                  <p>{item.summary}</p>
                  <ExternalSource url={item.url} label="Read article" />
                  <SourceChips ids={item.sourceIds} sources={sources} />
                </article>
              ))}
            </div>
          ) : (
            <p className="sb-empty-note">No news included in this research</p>
          ))}
        {tab === "signals" &&
          (analysis.signals.length ? (
            <div className="sb-signals-list">
              {analysis.signals.map((item, index) => (
                <article
                  className="sb-analysis-card"
                  key={`${item.kind}:${index}`}
                >
                  <span className={`sb-signal-kind sb-signal-${item.kind}`}>
                    {
                      {
                        pain: "Pain point",
                        interest: "Interest",
                        objection: "Objection",
                        request: "Request",
                      }[item.kind]
                    }
                  </span>
                  <p>{item.claim}</p>
                  <SourceChips ids={item.sourceIds} sources={sources} />
                </article>
              ))}
            </div>
          ) : (
            <p className="sb-empty-note">
              No customer signals included in this research
            </p>
          ))}
        {tab === "plan" && (
          <>
            <section className="sb-plan-section">
              <div className="sb-card-heading">
                <h3>Assumptions to test</h3>
                <span className="sb-basis">AI inference</span>
              </div>
              {analysis.assumptions.length ? (
                <div className="sb-assumption-list">
                  {analysis.assumptions.map((item) => (
                    <article
                      className="sb-analysis-card sb-assumption"
                      key={item.id}
                    >
                      <h3>{item.question}</h3>
                      <p>{item.why}</p>
                      <SourceChips ids={item.sourceIds} sources={sources} />
                      <Link
                        className="mvp-btn mvp-btn-dark"
                        to={testHref(item)}
                      >
                        Create test <ArrowRight size={14} />
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="sb-empty-note">No test questions included</p>
              )}
            </section>
            <section className="sb-plan-section">
              <div className="sb-card-heading">
                <h3>Next steps</h3>
                <span className="sb-basis">Suggested</span>
              </div>
              {analysis.nextSteps.length ? (
                <ol className="sb-next-steps">
                  {analysis.nextSteps.map((item, index) => (
                    <li key={`${item.title}:${index}`}>
                      <div>
                        <h3>{item.title}</h3>
                        <p>{item.detail}</p>
                        <SourceChips ids={item.sourceIds} sources={sources} />
                        {item.method !== "unspecified" && (
                          <span className="sb-testing-method">
                            {
                              {
                                human: "Human test",
                                ai: "AI review",
                                expert: "Expert review",
                              }[item.method]
                            }
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="sb-empty-note">No next steps included</p>
              )}
            </section>
          </>
        )}
        {tab === "sources" &&
          (analysis.sources.length ? (
            <div className="sb-source-list">
              {analysis.sources.map((source) => (
                <article className="sb-analysis-card sb-source" key={source.id}>
                  <h3>
                    <ExternalSource url={source.url} label={source.title} />
                  </h3>
                  <p>{host(source.url)}</p>
                  <div className="sb-source-dates">
                    {source.publishedAt && (
                      <span>Published {date(source.publishedAt)}</span>
                    )}
                    <span>Retrieved {date(source.retrievedAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="sb-empty-note">No sources included</p>
          ))}
      </div>
    </>
  );
}
