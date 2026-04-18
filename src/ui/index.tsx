import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  useHostContext,
  usePluginAction,
  usePluginData,
  usePluginToast
} from "@paperclipai/plugin-sdk/ui";
import { pinToolbarSlotToEnd } from "./host-toolbar-alignment.js";

interface EditorChoice {
  id: string;
  label: string;
}

interface EditorAvailability {
  available: boolean;
  reason?: string;
  editors: EditorChoice[];
  workspacePath?: string;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);
const PRIMARY_EDITOR_ID = "intellij-idea";
const PRIMARY_EDITOR: EditorChoice = {
  id: PRIMARY_EDITOR_ID,
  label: "IntelliJ IDEA"
};

const containerStyles: React.CSSProperties = {
  display: "inline-flex",
  position: "relative",
  alignItems: "stretch",
  borderRadius: 10,
  overflow: "visible",
  background: "rgba(255, 255, 255, 0.04)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  boxShadow: "0 1px 0 rgba(255, 255, 255, 0.03) inset"
};

const primaryButtonStyles: React.CSSProperties = {
  border: "none",
  padding: "0 9px",
  minWidth: 34,
  height: 32,
  background: "transparent",
  color: "rgba(255, 255, 255, 0.92)",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderTopLeftRadius: 9,
  borderBottomLeftRadius: 9,
  transition: "background-color 120ms ease, color 120ms ease, opacity 120ms ease"
};

const chevronButtonStyles: React.CSSProperties = {
  border: "none",
  borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
  width: 28,
  height: 32,
  padding: 0,
  background: "transparent",
  color: "rgba(255, 255, 255, 0.7)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderTopRightRadius: 9,
  borderBottomRightRadius: 9,
  transition: "background-color 120ms ease, color 120ms ease, opacity 120ms ease"
};

const menuStyles: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  right: 0,
  background: "rgba(18, 18, 18, 0.98)",
  borderRadius: 12,
  padding: 4,
  boxShadow: "0 16px 36px rgba(0, 0, 0, 0.32)",
  border: "1px solid rgba(255,255,255,0.08)",
  zIndex: 10,
  backdropFilter: "blur(14px)"
};

const menuItemStyles: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "rgba(255, 255, 255, 0.92)",
  padding: "7px 10px",
  textAlign: "left",
  width: "100%",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.2,
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 32,
  borderRadius: 8,
  transition: "background-color 120ms ease"
};

const intellijBadgeStyles: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: 4,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto"
};

const intellijIconStyles: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  borderRadius: "inherit",
  overflow: "hidden"
};

const genericBadgeStyles: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: 4,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 auto",
  background: "rgba(255, 255, 255, 0.12)",
  color: "rgba(255, 255, 255, 0.9)",
  fontSize: 8,
  fontWeight: 700,
  letterSpacing: 0.3,
  textTransform: "uppercase"
};

const chevronIconStyles: React.CSSProperties = {
  display: "block",
  width: 14,
  height: 14
};

const menuLabelStyles: React.CSSProperties = {
  whiteSpace: "nowrap"
};

const IDEA_ICON_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clip-path="url(#clip0)">
      <path d="M15.9476 5.81836L4.07215 5.8201C1.82284 5.8201 0 7.64352 0 9.89283V21.3994C0 22.5881 0.519564 23.718 1.42196 24.4918L39.5828 57.2016C40.3212 57.8341 41.2614 58.182 42.2336 58.182H54.1091C56.3584 58.182 58.1818 56.3586 58.1818 54.1093V42.6009C58.1818 41.4123 57.6623 40.2824 56.7599 39.5085L18.599 6.7993C17.8607 6.16629 16.9204 5.81894 15.9476 5.81894V5.81836Z" fill="#FF8100"/>
      <path d="M14.5193 5.81836H4.07273C1.82342 5.81836 0 7.64178 0 9.89109V22.9837C0 23.1763 0.0139636 23.3689 0.0407273 23.5597L5.31782 60.5035C5.60465 62.5101 7.32276 64.0002 9.34982 64.0002H25.0228C27.2727 64.0002 29.0961 62.1762 29.0956 59.9263L29.0909 41.3878C29.0909 40.9503 29.0205 40.5157 28.882 40.1008L18.3825 8.60294C17.8281 6.9401 16.2717 5.81836 14.5187 5.81836H14.5193Z" fill="url(#paint0)"/>
      <path d="M59.9275 0H25.9592C24.3301 0 22.8575 0.971054 22.2157 2.46807L6.14767 39.9587C5.93065 40.4655 5.81836 41.0118 5.81836 41.5633V59.9273C5.81836 62.1766 7.64178 64 9.89109 64H27.8571C28.6617 64 29.4483 63.7615 30.118 63.3146L62.1866 41.9113C63.3189 41.1561 63.9984 39.8848 63.9984 38.5239L64.0002 4.07273C64.0002 1.82342 62.1768 0 59.9275 0Z" fill="url(#paint1)"/>
      <path d="M52 12H12V52H52V12Z" fill="black"/>
      <path d="M17 29.3856H19.9788V19.6144H17V17H25.839V19.6144H22.8602V29.3856H25.839V32H17V29.3856Z" fill="white"/>
      <path d="M27.3389 29.3002H29.4926C29.9281 29.3002 30.3159 29.2074 30.6551 29.0218C30.9943 28.8361 31.2567 28.5737 31.4424 28.2345C31.628 27.8953 31.7208 27.508 31.7208 27.072V17H34.6458V27.2748C34.6458 28.1749 34.4384 28.984 34.0241 29.7019C33.6099 30.4198 33.0386 30.9824 32.3098 31.3892C31.581 31.7966 30.7634 32 29.8564 32H27.3389V29.3002Z" fill="white"/>
      <path d="M33 44H17V47H33V44Z" fill="white"/>
    </g>
    <defs>
      <linearGradient id="paint0" x1="-0.717383" y1="7.62141" x2="24.1455" y2="61.2476" gradientUnits="userSpaceOnUse">
        <stop offset="0.1" stop-color="#FC801D"/>
        <stop offset="0.59" stop-color="#FE2857"/>
      </linearGradient>
      <linearGradient id="paint1" x1="4.22243" y1="60.0186" x2="62.9273" y2="1.31316" gradientUnits="userSpaceOnUse">
        <stop offset="0.21" stop-color="#FE2857"/>
        <stop offset="0.7" stop-color="#007EFF"/>
      </linearGradient>
      <clipPath id="clip0">
        <rect width="64" height="64" fill="white"/>
      </clipPath>
    </defs>
  </svg>`
)}`;

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "Unknown error";
}

export async function copyWorkspacePath(
  workspacePath: string,
  writeText?: (value: string) => Promise<void>
): Promise<string> {
  const trimmedPath = workspacePath.trim();
  if (!trimmedPath) {
    throw new Error("No workspace path is available to copy.");
  }

  if (!writeText) {
    throw new Error("Clipboard access is not available.");
  }

  await writeText(trimmedPath);
  return trimmedPath;
}

export function getEditorBadgeLabel(editor: EditorChoice): string | null {
  if (editor.id === PRIMARY_EDITOR_ID) {
    return null;
  }

  if (editor.id === "vs-code") {
    return "VS";
  }

  const initials = editor.label
    .split(/\s+/)
    .map((word) => word.trim()[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return initials || "ED";
}

function IntelliJBadge(): React.JSX.Element {
  return (
    <span style={intellijBadgeStyles}>
      <img src={IDEA_ICON_DATA_URI} alt="" aria-hidden="true" style={intellijIconStyles} />
    </span>
  );
}

function EditorBadge({ editor }: { editor: EditorChoice }): React.JSX.Element {
  const badgeLabel = getEditorBadgeLabel(editor);
  if (badgeLabel === null) {
    return <IntelliJBadge />;
  }

  return (
    <span style={genericBadgeStyles} aria-hidden="true">
      {badgeLabel}
    </span>
  );
}

function ChevronIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" style={chevronIconStyles}>
      <path
        d="M4 6.25L8 10.25L12 6.25"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EditorIssueToolbarButton(): React.JSX.Element | null {
  const context = useHostContext();
  const { entityType, entityId, companyId } = context;
  const launchAction = usePluginAction("editor.launch");
  const toast = usePluginToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isIssueContext = entityType === "issue" && Boolean(entityId);
  const hostIsLocalhost =
    typeof window !== "undefined" && LOCAL_HOSTNAMES.has(window.location.hostname);
  const hostOrigin = typeof window !== "undefined" ? window.location.origin : "";

  const availabilityParams = useMemo(() => {
    if (!hostIsLocalhost || !isIssueContext || !companyId || !entityId) {
      return {};
    }

    return {
      companyId,
      issueId: entityId,
      hostOrigin
    };
  }, [companyId, entityId, hostIsLocalhost, hostOrigin, isIssueContext]);

  const availabilityResult = usePluginData<EditorAvailability>("editor.availability", availabilityParams);
  const availability = availabilityResult.data;
  const availabilityIsGood = availability?.available ?? false;
  const primaryEditor = availability?.editors.find((editor) => editor.id === PRIMARY_EDITOR_ID) ?? PRIMARY_EDITOR;
  const menuPanelStyles = useMemo<React.CSSProperties>(() => ({
    ...menuStyles,
    minWidth: 220
  }), []);
  const primaryButtonComputedStyles = useMemo<React.CSSProperties>(() => ({
    ...primaryButtonStyles,
    ...(busy
      ? {
          opacity: 0.6,
          cursor: "default"
        }
      : {})
  }), [busy]);
  const chevronButtonComputedStyles = useMemo<React.CSSProperties>(() => ({
    ...chevronButtonStyles,
    ...(menuOpen
      ? {
          background: "rgba(255, 255, 255, 0.06)",
          color: "rgba(255, 255, 255, 0.92)"
        }
      : {}),
    ...(busy
      ? {
          opacity: 0.6,
          cursor: "default"
        }
      : {})
  }), [busy, menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) {
        return;
      }
      if (toggleRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [menuOpen]);

  const shouldRender = isIssueContext && hostIsLocalhost && availabilityIsGood;

  useEffect(() => {
    if (!shouldRender) {
      return undefined;
    }

    return pinToolbarSlotToEnd(rootRef.current);
  }, [shouldRender]);

  if (!shouldRender) {
    return null;
  }

  async function handleLaunch(editor: EditorChoice = primaryEditor) {
    if (busy) {
      return;
    }

    setMenuOpen(false);
    setBusy(true);
    try {
      await launchAction({
        companyId: companyId ?? undefined,
        issueId: entityId ?? undefined,
        editorId: editor.id,
        hostOrigin
      });
      toast({
        title: `Launching ${editor.label}`,
        tone: "success",
        body: availability?.workspacePath ?? undefined,
        dedupeKey: `editor.launch.${editor.id}`
      });
    } catch (error) {
      toast({
        title: `Unable to launch ${editor.label}`,
        tone: "error",
        body: readErrorMessage(error),
        dedupeKey: `editor.launch.${editor.id}:error`
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyPath() {
    if (busy) {
      return;
    }

    setMenuOpen(false);
    setBusy(true);
    try {
      const workspacePath = await copyWorkspacePath(
        availability?.workspacePath ?? "",
        typeof navigator !== "undefined" && navigator.clipboard?.writeText
          ? (value) => navigator.clipboard.writeText(value)
          : undefined
      );
      toast({
        title: "Copied workspace path",
        tone: "success",
        body: workspacePath,
        dedupeKey: "editor.copy-path"
      });
    } catch (error) {
      toast({
        title: "Unable to copy workspace path",
        tone: "error",
        body: readErrorMessage(error),
        dedupeKey: "editor.copy-path:error"
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} style={containerStyles}>
      <button
        type="button"
        style={primaryButtonComputedStyles}
        onClick={() => {
          void handleLaunch(primaryEditor);
        }}
        disabled={busy}
        aria-label={`Open workspace in ${primaryEditor.label}`}
        title={`Open workspace in ${primaryEditor.label}`}
      >
        <EditorBadge editor={primaryEditor} />
      </button>
      <button
        type="button"
        ref={toggleRef}
        style={chevronButtonComputedStyles}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Open editor menu"
        disabled={busy}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <ChevronIcon />
      </button>
      {menuOpen && (
        <div style={menuPanelStyles} role="menu" ref={menuRef}>
          {availability?.editors.map((editor) => (
            <button
              key={editor.id}
              type="button"
              style={menuItemStyles}
              onClick={() => {
                void handleLaunch(editor);
              }}
              role="menuitem"
            >
              <span style={menuLabelStyles}>{editor.label}</span>
            </button>
          ))}
          <button
            type="button"
            style={menuItemStyles}
            onClick={() => {
              void handleCopyPath();
            }}
            role="menuitem"
          >
            <span style={menuLabelStyles}>Copy path to clipboard</span>
          </button>
        </div>
      )}
    </div>
  );
}
