import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * A value in a list table, cut to two lines with "…" when it's very long. Only a value that
 * is actually cut gets a tooltip with the full text, and a dotted underline that hints at it,
 * so ordinary values stay plain text. Screen readers always get the full text, since it stays
 * in the page.
 */
export function ClampedText({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fullText, setFullText] = useState<string>();

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const check = () => {
      const cut = element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1;
      setFullText(cut ? (element.textContent ?? undefined) : undefined);
    };
    check();
    // Column widths change with the window, and text reflows once the web font arrives.
    void document.fonts?.ready.then(check);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children]);

  const classes = ["cell-text", fullText && "cell-text--cut", className].filter(Boolean).join(" ");
  return (
    <span ref={ref} className={classes} title={fullText}>
      {children}
    </span>
  );
}
