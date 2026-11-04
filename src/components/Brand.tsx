import { Link } from "@tanstack/react-router";

// Logo provisorio en texto: se reemplazará por el logo oficial cuando se adjunte.
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 min-w-0" aria-label="El Precio Mayorista - inicio">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent font-display text-lg font-black text-accent-foreground">
        $
      </span>
      <span className="leading-none min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">El precio</span>
        <span className={`block font-display font-black uppercase truncate ${small ? "text-base" : "text-lg sm:text-xl"}`}>
          Mayorista
        </span>
      </span>
    </Link>
  );
}
