import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const publicUrl = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const publicKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
export function cloudConfigured(): boolean {
  return Boolean(publicUrl && publicKey);
}
export function authConfigurationError(): string {
  if (Boolean(publicUrl) !== Boolean(publicKey))
    return "Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before using the connected workspace.";
  if (publicUrl) {
    try {
      const parsed = new URL(publicUrl);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        throw new Error();
    } catch {
      return "VITE_SUPABASE_URL must be an HTTP(S) Supabase project URL.";
    }
  }
  return "";
}
export const authClient: SupabaseClient | null =
  cloudConfigured() && !authConfigurationError()
    ? createClient(publicUrl, publicKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: "pkce",
          storageKey: "playground-cloud-session",
        },
      })
    : null;
export function getAuthClient(): SupabaseClient {
  if (!authClient)
    throw new Error(
      authConfigurationError() || "The connected workspace is not configured.",
    );
  return authClient;
}
export async function authHeaders(): Promise<Record<string, string>> {
  if (!cloudConfigured()) return {};
  const { data, error } = await getAuthClient().auth.getSession();
  if (error) throw new Error("Your session could not be read. Sign in again.");
  if (!data.session?.access_token) throw new Error("Sign in to continue.");
  return { Authorization: `Bearer ${data.session.access_token}` };
}
export async function authIdentity(): Promise<string | null> {
  if (!cloudConfigured()) return null;
  const { data, error } = await getAuthClient().auth.getSession();
  if (error) throw new Error("Your session could not be read. Sign in again.");
  return data.session?.user.id ?? null;
}
