import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brand } from "@/components/Brand";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Ingreso administración | El Precio Mayorista" },
      { name: "description", content: "Acceso al panel de administración de El Precio Mayorista." },
      { property: "og:title", content: "Ingreso administración | El Precio Mayorista" },
      { property: "og:description", content: "Acceso al panel de administración." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/admin" });
      } else {
        const { error } = await supabase.auth.signUp({
          email, password, options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Revisá tu correo para confirmarla y luego ingresá.");
        setMode("in");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      toast.error(msg.includes("Invalid login") ? "Correo o contraseña incorrectos" : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-header text-primary-foreground px-4 py-3"><Brand /></header>
      <main className="mx-auto max-w-sm px-4 py-10">
        <h1 className="text-2xl font-black">{mode === "in" ? "Ingresar a administración" : "Crear cuenta de administración"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "in" ? "Solo para personal de El Precio Mayorista." : "La primera cuenta creada queda como administradora. Las siguientes no tendrán acceso al panel."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border bg-card p-5 shadow-card">
          <div className="space-y-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Contraseña</Label>
            <Input id="pw" type="password" minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? "Procesando…" : mode === "in" ? "Ingresar" : "Crear cuenta"}
          </Button>
        </form>
        <button className="mt-4 text-sm text-primary underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "¿Primera vez? Crear cuenta de administración" : "Ya tengo cuenta, ingresar"}
        </button>
      </main>
    </div>
  );
}
