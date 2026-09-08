export function parseRange(header:string|null,size:number):{offset:number;length:number}|null|false{
 if(!header||!header.startsWith('bytes=')||header.includes(','))return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(header);if(!match||(!match[1]&&!match[2]))return null;
 if(size===0)return false;
 let start:number,end:number;
 if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return false;start=Math.max(0,size-suffix);end=size-1;}
 else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=size||start>end)return false;
 return {offset:start,length:end-start+1};
}
export async function serveR2File(request:Request,bucket:R2Bucket,key:string,headers=new Headers(),retry=0):Promise<Response>{
 const meta=await bucket.head(key);if(!meta)return new Response('파일을 찾을 수 없습니다.',{status:404});
 headers.set('ETag',meta.httpEtag);headers.set('Last-Modified',meta.uploaded.toUTCString());headers.set('Accept-Ranges','bytes');headers.set('Content-Length',String(meta.size));
 headers.set('Access-Control-Expose-Headers','Content-Length, Content-Range, Accept-Ranges, ETag');
 // Revalidate visibility at the route on every request, including cached originals.
 headers.set('Cache-Control','private, no-cache');
 const condition=request.headers.get('if-none-match');if(condition?.split(',').some(v=>v.trim()==='*'||v.trim().replace(/^W\//,'')===meta.httpEtag))return new Response(null,{status:304,headers});
 if(request.method==='HEAD')return new Response(null,{headers});
 const ifRange=request.headers.get('if-range'),rangeAllowed=!ifRange||ifRange===meta.httpEtag||(!ifRange.startsWith('W/')&&!ifRange.includes('"')&&Date.parse(ifRange)>=Math.floor(meta.uploaded.getTime()/1000)*1000);
 const range=rangeAllowed?parseRange(request.headers.get('range'),meta.size):null;
 if(range===false){headers.set('Content-Range',`bytes */${meta.size}`);headers.set('Content-Length','0');return new Response(null,{status:416,headers});}
 const object=await bucket.get(key,{onlyIf:{etagMatches:meta.etag},...(range?{range}:{})});
 if(!object)return new Response('파일을 찾을 수 없습니다.',{status:404});
 if(!('body'in object)){if(retry<1)return serveR2File(request,bucket,key,headers,retry+1);return new Response('파일이 변경되었습니다. 다시 열어 주세요.',{status:409});}
 if(range){headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${meta.size}`);headers.set('Content-Length',String(range.length));}
 return new Response(object.body,{status:range?206:200,headers});
}
