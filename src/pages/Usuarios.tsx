// auth-kit v0.1 — spa/pages/Usuarios.tsx
import { RequirePage } from "@/auth/guards";
import { UsuariosPerfisManager } from "@/components/usuarios/UsuariosPerfisManager";

export default function Usuarios() {
  return (
    <RequirePage chave="usuarios">
      <UsuariosPerfisManager />
    </RequirePage>
  );
}
