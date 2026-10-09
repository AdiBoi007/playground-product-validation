import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export interface ExtractedSandboxFile {
  name: string;
  mimeType: string;
  text: string;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARACTERS = 30_000;
const MAX_PDF_PAGES = 50;

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("File import cancelled", "AbortError");
}

function usefulText(value: string) {
  const text = value.replaceAll("\u0000", "").trim();
  if (!text)
    throw new Error(
      "This file has no readable text. Paste the brief or use a PDF with selectable text.",
    );
  if (text.length > MAX_TEXT_CHARACTERS)
    throw new Error("Use a brief with 30,000 characters or fewer.");
  return text;
}

export async function extractSandboxFile(
  file: File,
  signal?: AbortSignal,
): Promise<ExtractedSandboxFile> {
  checkCancelled(signal);
  if (!file.size) throw new Error("This file is empty.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("Choose a file smaller than 5 MB.");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const isPdf = extension === "pdf" || file.type === "application/pdf";
  const isText =
    ["txt", "md", "markdown"].includes(extension || "") ||
    ["text/plain", "text/markdown"].includes(file.type);
  if (!isPdf && !isText)
    throw new Error("Attach a PDF, text file or Markdown brief.");

  if (!isPdf) {
    const text = usefulText(await file.text());
    checkCancelled(signal);
    return {
      name: file.name.slice(0, 200),
      mimeType:
        extension === "txt" || file.type === "text/plain"
          ? "text/plain"
          : "text/markdown",
      text,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  checkCancelled(signal);
  if (!new TextDecoder().decode(bytes.slice(0, 1024)).includes("%PDF-"))
    throw new Error("This file is not a readable PDF.");
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  checkCancelled(signal);
  GlobalWorkerOptions.workerSrc = workerUrl;
  const task = getDocument({
    data: bytes,
    disableFontFace: true,
    useSystemFonts: true,
  });
  let cancelled = false;
  let timedOut = false;
  const cancel = () => {
    cancelled = true;
    void task.destroy();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    void task.destroy();
  }, 20_000);
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PDF_PAGES)
      throw new Error("Attach a PDF with 50 pages or fewer.");
    const pages: string[] = [];
    let count = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      checkCancelled(signal);
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "",
        )
        .join("");
      count += text.length;
      if (count > MAX_TEXT_CHARACTERS)
        throw new Error("Use a brief with 30,000 characters or fewer.");
      pages.push(text.trim());
      page.cleanup();
    }
    checkCancelled(signal);
    return {
      name: file.name.slice(0, 200),
      mimeType: "application/pdf",
      text: usefulText(pages.join("\n\n")),
    };
  } catch (error) {
    if (cancelled || signal?.aborted)
      throw new DOMException("File import cancelled", "AbortError");
    if (timedOut)
      throw new Error(
        "This PDF took too long to read. Use a shorter brief or paste its text.",
      );
    if (error instanceof Error && error.name === "PasswordException")
      throw new Error("Use a PDF without a password, or paste its text.");
    if (
      error instanceof Error &&
      ["InvalidPDFException", "UnknownErrorException"].includes(error.name)
    )
      throw new Error(
        "This PDF could not be read. Try another PDF or paste its text.",
      );
    throw error;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    await task.destroy();
  }
}
