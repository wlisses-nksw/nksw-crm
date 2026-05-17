import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function uploadFromUrl(url: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/jpeg";

    const { error } = await supabase.storage
      .from("whatsapp-media")
      .upload(path, buffer, { contentType, upsert: true });

    if (error) {
      console.error("[storage] upload error:", error.message);
      return null;
    }

    const { data } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.error("[storage] uploadFromUrl error:", e);
    return null;
  }
}
