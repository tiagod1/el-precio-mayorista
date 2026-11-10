import { Link } from "@tanstack/react-router";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5 min-w-0" aria-label="El Precio Mayorista - inicio">
      <img
        src="/logo-empresa.jpeg"
        alt=""
        className="h-10 w-10 shrink-0 rounded-full bg-card object-cover ring-2 ring-highlight ring-offset-2 ring-offset-primary transition-transform duration-300 group-hover:rotate-[-6deg] sm:h-11 sm:w-11"
      />
      <span className="leading-none min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-highlight">El precio</span>
        <span className={`block font-display font-black uppercase tracking-tight truncate ${small ? "text-base" : "text-lg sm:text-xl"}`}>
          Mayorista
        </span>
      </span>
    </Link>
  );
}
