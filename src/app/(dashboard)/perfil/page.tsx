import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PerfilClient } from "./perfil-client";
import { config } from "@/lib/config";

export default async function PerfilPage() {
  const session = await auth();
  if (!session) redirect("/login");
  // En modo integrado el perfil se gestiona en Nómina Xpress.
  if (!config.features.userManagement) redirect("/");

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Mi perfil</h1>
        <p className="text-slate-500 text-sm mt-1">Cambia tu usuario o contraseña.</p>
      </div>
      <PerfilClient
        username={session.user.username}
        name={session.user.name ?? session.user.username}
        role={session.user.role}
      />
    </div>
  );
}
