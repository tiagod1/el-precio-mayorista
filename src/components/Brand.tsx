import { Link } from "@tanstack/react-router";
import logo from "@/assets/logo-empresa.jpeg.asset.json";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 min-w-0" aria-label="El Precio Mayorista - inicio">
      <img src={logo.url} alt="" className="h-10 w-10 shrink-0 rounded-full bg-card object-cover" />
      <span className="leading-none min-w-0">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] opacity-80">El precio</span>
        <span className={`block font-display font-black uppercase truncate ${small ? "text-base" : "text-lg sm:text-xl"}`}>
          Mayorista
        </span>
      </span>
    </Link>
  );
}
