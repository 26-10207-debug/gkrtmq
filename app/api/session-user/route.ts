import {getChatGPTUser} from "@/app/chatgpt-auth";
export async function GET(){const user=await getChatGPTUser();return Response.json({user:user?{displayName:user.displayName,email:user.email,authMethod:user.authMethod}:null},{headers:{"Cache-Control":"no-store"}});}
