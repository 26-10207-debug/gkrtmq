import {LearningApp} from "./LearningApp";
import {ensureSchema,getRuntimeEnv} from "@/db/runtime";
import {searchReady} from "@/lib/search-service";
export const dynamic="force-dynamic";
export default async function Home(){await ensureSchema();const enabled=await searchReady(getRuntimeEnv().DB);return <LearningApp user={null} searchV2Enabled={enabled}/>;}
