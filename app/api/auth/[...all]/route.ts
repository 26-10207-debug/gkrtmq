import { ensureSchema } from "@/db/runtime";
import { getAuth } from "@/lib/auth";

async function handle(request: Request) {
  await ensureSchema();
  return getAuth().handler(request);
}

export const GET = handle;
export const POST = handle;
