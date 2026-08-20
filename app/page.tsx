import { LearningApp } from "./LearningApp";
import { getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <LearningApp user={user ? { displayName: user.displayName, email: user.email, authMethod: user.authMethod } : null} />;
}
