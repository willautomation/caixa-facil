import { redirect } from "next/navigation";
import { AUTH_DISABLED_FOR_TESTS } from "@/lib/auth-flags";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  if (AUTH_DISABLED_FOR_TESTS) {
    redirect("/caixa");
  }
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) redirect("/caixa");
  } catch {
    /* variáveis de ambiente ausentes */
  }
  redirect("/login");
}
