import { useEffect, useState, type CSSProperties, type RefObject } from "react";

// Dropdown panels are portaled to document.body and positioned fixed against
// the trigger's own viewport coordinates specifically so they can never be
// clipped by an ancestor's `overflow-hidden` (e.g. a table wrapped in a
// rounded card) — clipping was exactly the earlier "dropdown invisible inside
// the table" bug. Re-anchoring on every scroll/resize is unnecessary for a
// menu this short-lived — closing on either is simpler and still expected.
//
// The scroll listener is registered in the capture phase (scroll events don't bubble,
// so that's the only way to hear an ancestor scroller), which means it also hears the
// dropdown's OWN list scrolling. panelRef exists so those can be ignored — without it
// the list closed the moment you tried to scroll through its options.
export function useDropdownPosition(
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setStyle(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < 240 && rect.top > spaceBelow;
    setStyle(
      flipUp
        ? { position: "fixed", left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 4 }
        : { position: "fixed", left: rect.left, width: rect.width, top: rect.bottom + 4 },
    );

    const closeOnPageScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const closeOnResize = () => onClose();
    window.addEventListener("scroll", closeOnPageScroll, true);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("scroll", closeOnPageScroll, true);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [open, triggerRef, panelRef, onClose]);

  return style;
}
