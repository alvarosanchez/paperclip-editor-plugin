export interface ToolbarAlignmentElement {
  parentElement: ToolbarAlignmentElement | null;
  style: {
    marginInlineStart: string;
  };
}

export function pinToolbarSlotToEnd(rootElement: ToolbarAlignmentElement | null): () => void {
  const hostWrapper = rootElement?.parentElement;
  if (!hostWrapper) {
    return () => {};
  }

  const previousMarginInlineStart = hostWrapper.style.marginInlineStart;
  hostWrapper.style.marginInlineStart = "auto";

  return () => {
    hostWrapper.style.marginInlineStart = previousMarginInlineStart;
  };
}
