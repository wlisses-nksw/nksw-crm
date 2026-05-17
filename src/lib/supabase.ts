import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  return createClient(url, key);
}

export async function uploadFromUrl(url: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/jpeg";

    const supabase = getSupabase();
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
