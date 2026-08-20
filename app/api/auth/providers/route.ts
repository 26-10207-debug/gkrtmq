import { enabledAuthProviders } from "@/lib/auth";

export async function GET() {
  return Response.json(enabledAuthProviders());
}
