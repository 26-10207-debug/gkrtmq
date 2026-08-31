export type StoredAttachment = {
  originalName: string;
  contentType: string;
  objectKey: string;
  size: number;
  role?: "source" | "corrected";
  sourceAttachmentIndex?: number;
};

export type PublicAttachment = Pick<StoredAttachment, "originalName" | "contentType" | "size" | "role" | "sourceAttachmentIndex">;

type LegacyAttachment = Pick<StoredAttachment, "originalName" | "contentType" | "objectKey">;

function asString(value: unknown, limit: number) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function asAttachment(value: unknown): StoredAttachment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const originalName = asString(row.originalName, 240);
  const contentType = asString(row.contentType, 160);
  const objectKey = asString(row.objectKey, 600);
  const size = typeof row.size === "number" && Number.isFinite(row.size) && row.size >= 0 ? row.size : 0;
  const role = row.role === "corrected" ? "corrected" as const : row.role === "source" ? "source" as const : undefined;
  const sourceAttachmentIndex = Number.isInteger(row.sourceAttachmentIndex) && Number(row.sourceAttachmentIndex) >= 0 ? Number(row.sourceAttachmentIndex) : undefined;
  return originalName && contentType && objectKey ? { originalName, contentType, objectKey, size, role, sourceAttachmentIndex } : null;
}

export function storedAttachments(raw: string | null | undefined, legacy: LegacyAttachment): StoredAttachment[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (Array.isArray(parsed)) {
      const attachments = parsed.map(asAttachment).filter((item): item is StoredAttachment => Boolean(item));
      if (attachments.length) return attachments;
    }
  } catch {
    // Existing single-file records keep using their original columns.
  }
  return [{ ...legacy, size: 0 }];
}

export function publicAttachments(attachments: StoredAttachment[]): PublicAttachment[] {
  return attachments.map(({ originalName, contentType, size, role, sourceAttachmentIndex }) => ({ originalName, contentType, size, role, sourceAttachmentIndex }));
}
