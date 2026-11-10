import { useEffect, useRef } from "react";

// Un solo IntersectionObserver compartido para todas las tarjetas: liviano aunque haya miles.
let observer: IntersectionObserver | null = null;

function getObserver() {
  if (observer) return observer;
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          (e.target as HTMLElement).dataset["visible"] = "true";
          observer?.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -4% 0px", threshold: 0.05 },
  );
  return observer;
}

/** Marca el elemento con data-visible="true" la primera vez que entra en pantalla. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = getObserver();
    if (!obs) {
      el.dataset["visible"] = "true";
      return;
    }
    obs.observe(el);
    return () => obs.unobserve(el);
  }, []);
  return ref;
}
