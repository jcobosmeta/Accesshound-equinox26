// Top-level tabs for the navigation bar. Mística's own sections take only a text title and open
// their menus at a fixed 184px width, which clips anything richer. These keep the same look
// (full-height tab, brand underline when selected) and add a real dropdown with a chevron.

import { Text3, skinVars } from "@telefonica/mistica";
import IconChevronDownRegular from "@telefonica/mistica-icons/icon-chevron-down-regular";
import * as React from "react";

const tabStyle = (selected: boolean, height: number): React.CSSProperties => ({
  height,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "0 8px",
  background: "none",
  border: "none",
  borderBottom: `2px solid ${selected ? skinVars.colors.brand : "transparent"}`,
  borderTop: "2px solid transparent",
  color: skinVars.colors.textPrimary,
  cursor: "pointer",
  whiteSpace: "nowrap",
  font: "inherit",
});

export function NavTab({ label, selected, height, onPress }: { label: string; selected: boolean; height: number; onPress: () => void }) {
  return (
    <button type="button" style={tabStyle(selected, height)} aria-current={selected ? "page" : undefined} onClick={onPress}>
      <Text3 regular color="inherit">
        {label}
      </Text3>
    </button>
  );
}

/** A tab that opens a panel underneath. Closes on outside click, Escape, or when `close()` is called. */
export function NavDropdown({
  label,
  selected,
  height,
  width = 380,
  children,
}: {
  label: string;
  selected: boolean;
  height: number;
  width?: number;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const panelId = React.useId();
  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={buttonRef}
        type="button"
        style={tabStyle(selected, height)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Text3 regular color="inherit">
          {label}
        </Text3>
        <span
          aria-hidden
          style={{ display: "inline-flex", transition: "transform .2s ease", transform: open ? "rotate(180deg)" : "none" }}
        >
          <IconChevronDownRegular size={20} color="currentColor" />
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          style={{
            position: "absolute",
            top: height - 4,
            left: 0,
            width: `min(${width}px, calc(100vw - 24px))`,
            background: skinVars.colors.backgroundContainer,
            border: `1px solid ${skinVars.colors.border}`,
            borderRadius: 12,
            boxShadow: "0 16px 40px rgba(0, 0, 0, 0.5)",
            padding: "8px 0",
            zIndex: 1000,
            animation: "ah-menu-in .16s ease-out",
          }}
        >
          <style>{`@keyframes ah-menu-in { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: none } }`}</style>
          {children(close)}
        </div>
      )}
    </div>
  );
}
