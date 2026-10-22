import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://eyzpkwhpyqoxlpipzwfd.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_bBoQa0sUeG1Id1jQ_VYXag_rbhOx64c";

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);