/**
 * Exporting an AI Chat conversation to a downloadable Markdown file.
 *
 * The Markdown build and the filename slug are pure so they can be tested
 * without a DOM; `downloadConversationMarkdown` is the thin browser glue that
 * turns them into a download. Kept out of `AiChat.tsx` so that component stays
 * under the module line ceiling and the export format has one tested home.
 *
 * Each reply is signed with the model that wrote it, and a recorded failure is
 * headed as one (ACC-112). The file used to carry one "Model:" line for the
 * whole chat - the chat's latest model, applied to replies other models wrote -
 * and to sign failure notices "Vaelor AI", as if an error were an answer.
 */
import { modelDisplayName } from "./modelIdentity";

/** A conversation turn as this export reads it. */
export interface ExportMessage {
  role: string;
  content: string;
  /** The model that wrote this reply, as stored with it. */
  model?: string;
  /** Set by the client that wrote a failure notice. */
  failed?: boolean;
  /** Set by the appliance on a stored failure notice. */
  metadata?: { failed?: boolean };
}

/** The conversation fields the export needs. */
export interface ExportConversation {
  title: string;
}

/** What `GET /ai-chat/conversations/<id>/export` says about its own reach. */
export interface ExportCoverage {
  total: number;
  limit: number;
  truncated: boolean;
}

/**
 * Authors a stored reply can carry that are not models: a boundary decline,
 * the live-fact refusal (VD-221) and a custom-agent proposal. The store's
 * `_ANSWERED_MODEL` excludes the same three (`rag_chat.AGENT_ROUTER_AUTHOR`,
 * `chat_appliance_scope.APPLIANCE_SCOPE_PROVIDER` and `LIVE_FACTS_PROVIDER`).
 */
const NON_MODEL_AUTHORS = new Set(["agent-router", "appliance-scope", "live-facts"]);

/** The model that wrote a reply, or "" when no model did (or none was recorded). */
export function modelThatWrote(model: string | undefined): string {
  return model && !NON_MODEL_AUTHORS.has(model) ? model : "";
}

/** True when a stored reply was written by Vaelor itself rather than a model. */
export function writtenByVaelor(model: string | undefined): boolean {
  return Boolean(model && NON_MODEL_AUTHORS.has(model));
}

/**
 * The "provider · model" line AI Chat shows after an answer. A reply Vaelor
 * wrote itself (a boundary decline, the VD-221 live-fact refusal) names no
 * model, so it gets no line: the 1.5.5 live check showed "live-facts ·
 * <model>", which read as if a model called live-facts had answered.
 */
export function answeredByLine(provider: string | undefined, model: string | undefined,
                               temporary = false): string {
  if (writtenByVaelor(provider)) return temporary ? "Not saved." : "";
  return `${provider ?? ""} · ${model ?? ""}${temporary ? " · not saved" : ""}`;
}

function heading(message: ExportMessage): string {
  if (message.role === "user") return "You";
  const author = modelThatWrote(message.model);
  const model = author ? ` · ${modelDisplayName(author)}` : "";
  const failed = message.failed === true || message.metadata?.failed === true;
  return failed ? `Failed request${model}` : `Vaelor AI${model}`;
}

/** The exported Markdown: a title, then each turn in order, signed by its author. */
export function conversationExportMarkdown(
  conversation: ExportConversation,
  messages: ExportMessage[],
  coverage?: ExportCoverage,
): string {
  // A bounded export says it is bounded, rather than passing for the whole.
  const cut = coverage?.truncated
    ? [
      `> This export holds the most recent ${coverage.limit.toLocaleString("en-US")} of `
        + `${coverage.total.toLocaleString("en-US")} turns. Earlier turns are not included.`,
      "",
    ]
    : [];
  return [
    `# ${conversation.title}`, "",
    ...cut,
    ...messages.flatMap((message) => [`## ${heading(message)}`, "", message.content, ""]),
  ].join("\n");
}

/** A filesystem-safe download name for a conversation title. */
export function conversationExportFilename(title: string): string {
  const slug = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${slug || "ai-chat"}.md`;
}

/** Build the Markdown for a conversation and hand the browser the download. */
export function downloadConversationMarkdown(
  conversation: ExportConversation,
  messages: ExportMessage[],
  coverage?: ExportCoverage,
): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([conversationExportMarkdown(conversation, messages, coverage)], { type: "text/markdown" }),
  );
  link.download = conversationExportFilename(conversation.title);
  link.click();
  URL.revokeObjectURL(link.href);
}
