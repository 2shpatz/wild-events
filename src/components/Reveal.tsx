import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "./ui";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Variant = "up" | "scale" | "start" | "end" | "fade";

const HIDDEN: Record<Variant, string> = {
  up: "opacity-0 translate-y-10",
  scale: "opacity-0 scale-90",
  start: "opacity-0 translate-x-12", // RTL: start = right side → slides in from the right
  end: "opacity-0 -translate-x-12",
  fade: "opacity-0",
};

/**
 * Reveal-on-scroll (skill gsap/ux: viewport-enter, 300-700ms, content stays in DOM reading order;
 * under reduced motion it renders in its final state immediately).
 */
export function Reveal({
  children,
  variant = "up",
  delay = 0,
  className,
  style,
  as: Tag = "div",
}: {
  children: ReactNode;
  variant?: Variant;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "li" | "section" | "figure";
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(reduced);
  useEffect(() => {
    if (shown || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return (
    <Tag
      ref={ref as never}
      className={cx("transition-[opacity,translate,scale] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]", !shown && HIDDEN[variant], className)}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </Tag>
  );
}

/** One rAF-throttled scroll listener: page progress (0..1) + hero parallax offset. */
export function useScrollProgress() {
  const [state, setState] = useState({ progress: 0, y: 0 });
  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        setState({ progress: max > 0 ? window.scrollY / max : 0, y: window.scrollY });
      });
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return state;
}

export const prefersReducedMotion = reduced;
