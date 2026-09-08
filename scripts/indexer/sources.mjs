import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import robotsParser from 'robots-parser';
import {parse} from 'parse5';
import {XMLParser} from 'fast-xml-parser';

const agent='DumbCanLearnIndexer/2.0',wait=ms=>new Promise(r=>setTimeout(r,ms));
function isPublicIP(address){if(address.includes(':'))return !/^(::|fc|fd|fe8|fe9|fea|feb)/i.test(address)&&!address.includes('.');const a=address.split('.').map(Number);return a[0]>0&&a[0]!==10&&a[0]!==127&&a[0]<224&&!(a[0]===169&&a[1]===254)&&!(a[0]===172&&a[1]>=16&&a[1]<=31)&&!(a[0]===192&&a[1]===168)&&!(a[0]===100&&a[1]>=64&&a[1]<=127);}
function allowed(value,source,robots=false){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!source.hosts.includes(u.hostname)||(!robots&&!source.paths.some(p=>u.pathname.startsWith(p))))throw new Error('허용 목록 밖의 URL');return u;}
async function request(value,source,{robots=false,method='GET'}={}){
 let url=allowed(value,source,robots);for(let redirect=0;redirect<4;redirect++){const addresses=await dns.lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!isPublicIP(a.address)))throw new Error('공개 호스트가 아닙니다.');await wait(2000);const r=await fetch(url,{method,redirect:'manual',headers:{'User-Agent':agent,Accept:robots?'text/plain':'text/html, application/xhtml+xml'},signal:AbortSignal.timeout(20000)});if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();allowed(new URL(r.headers.get('location'),url).href,source,robots);throw new Error('리다이렉트 경로는 최종 주소와 robots 확인 후 출처 설정에 등록해야 합니다.');}if(r.status>=500||r.status===429){await r.body?.cancel();const retry=Math.min(60000,Math.max(5000,(Number(r.headers.get('retry-after'))||5)*1000));await wait(retry);throw new Error('출처 서버 지연: 다음 실행에서 재시도');}if(!r.ok&&!(robots&&r.status===404)){await r.body?.cancel();throw new Error('원문 상태 '+r.status);}return r;}throw new Error('리다이렉트 한도');
}
async function bodyText(r,max=1000000){const reader=r.body?.getReader();if(!reader)return '';const chunks=[];let size=0;for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw new Error('외부 페이지 크기 한도');}chunks.push(value);}return Buffer.concat(chunks).toString('utf8');}
function metadata(html,url){const doc=parse(html),links=[],meta={title:'',description:'',robots:''};function visit(n){const attrs=Object.fromEntries((n.attrs||[]).map(a=>[a.name,a.value]));if(n.tagName==='title')meta.title=(n.childNodes||[]).map(c=>c.value||'').join('');if(n.tagName==='meta'&&['description','og:description'].includes(attrs.name||attrs.property))meta.description=attrs.content||'';if(n.tagName==='meta'&&attrs.name==='robots')meta.robots=attrs.content||'';if(n.tagName==='a'&&attrs.href)try{links.push(new URL(attrs.href,url).href)}catch{/* Missing state or malformed external link. */}for(const c of n.childNodes||[])visit(c);}visit(doc);return {...meta,links};}

export function xmlLinks(text,base){
 if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('외부 XML 엔터티 미지원');
 const tree=new XMLParser({ignoreAttributes:false,processEntities:false,parseTagValue:false,parseAttributeValue:false}).parse(text),links=[];
 function visit(value,key='',depth=0){if(depth>40)throw new Error('피드 중첩 한도');if(Array.isArray(value)){for(const item of value)visit(item,key,depth+1);return;}if(value&&typeof value==='object'){if(key.split(':').pop()==='link'&&value['@_href'])visit(value['@_href'],'link',depth+1);for(const[k,v]of Object.entries(value))visit(v,k,depth+1);return;}if(['loc','link'].includes(key.split(':').pop())&&typeof value==='string'&&links.length<1000){try{links.push(new URL(value.replaceAll('&amp;','&'),base).href)}catch{/* Invalid feed URL. */}}}
 visit(tree);return [...new Set(links)];
}

export async function crawlSources({api,stateDir,stop}){
 const {sources}=await api('sources',{},'GET');let progress={};const stateFile=path.join(stateDir,'crawl-state.json');try{progress=JSON.parse(await fs.readFile(stateFile,'utf8'))}catch{/* Missing state or malformed external link. */}
 async function save(){const temporary=stateFile+'.tmp';await fs.writeFile(temporary,JSON.stringify(progress));await fs.rename(temporary,stateFile);}
 const day=new Date().toISOString().slice(0,10);
 // Sequential requests stay below the two-request ceiling and avoid burdening the PC.
 for(const record of sources){if(stop())break;const source=JSON.parse(record.config_json);if(!record.enabled||progress[source.id]?.day===day&&progress[source.id].done)continue;const previous=progress[source.id]?.day===day?progress[source.id]:{day,count:0,seen:[],pending:[...(progress[source.id]?.pending||[]),...source.seeds]};const queue=Array.isArray(previous.pending)?previous.pending:[...source.seeds],seen=new Set(previous.seen),rules=new Map();let count=previous.count;
  while(queue.length&&count<100&&!stop()){const value=queue.shift();if(seen.has(value))continue;let url;try{url=allowed(value,source)}catch{continue;}seen.add(value);count++;
   try{if(!rules.has(url.origin)){const r=await request(url.origin+'/robots.txt',source,{robots:true});const txt=r.status===404?'':await bodyText(r,300000);rules.set(url.origin,robotsParser(url.origin+'/robots.txt',txt));for(const match of txt.matchAll(/^\s*Sitemap:\s*(\S+)/gim)){try{allowed(match[1],source);queue.unshift(match[1]);}catch{/* Sitemap outside the approved scope. */}}}if(rules.get(url.origin).isAllowed(url.href,agent)===false)throw new Error('robots 규칙으로 본문 수집 제외');
    if(/\.(pdf|zip|hwp|hwpx|docx|pptx|xlsx)$/i.test(url.pathname)){await request(url.href,source,{method:'HEAD'});await api('external',{sourceId:source.id,url:url.href,title:source.title,description:source.note,checkedAt:new Date().toISOString()});}
    else{const r=await request(url.href,source);if(!/xhtml/i.test(r.headers.get('content-type')||'')&&/(?:application|text)\/(?:[a-z.+-]*\+)?xml|rss|atom/i.test(r.headers.get('content-type')||'')){const links=xmlLinks(await bodyText(r),url.href);queue.unshift(...links.filter(v=>{try{allowed(v,source);return true}catch{return false}}));progress[source.id]={day,count,seen:[...seen],pending:queue,done:false};await save();continue;}if(!/text\/html|application\/xhtml/.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw new Error('HTML 안내 페이지가 아닙니다.');}const html=await bodyText(r),meta=metadata(html,url);if(/noindex|none/i.test((r.headers.get('x-robots-tag')||'')+' '+meta.robots)){progress[source.id]={day,count,seen:[...seen],pending:queue,done:false};await save();continue;}await api('external',{sourceId:source.id,url:url.href,title:meta.title||source.title,description:meta.description||source.note,checkedAt:new Date().toISOString()});if(!/noindex|nofollow|none/i.test((r.headers.get('x-robots-tag')||'')+' '+meta.robots)&&!/<meta[^>]+(?:name=["']robots["'])[^>]+content=["'][^"']*nofollow/i.test(html))queue.push(...meta.links.filter(v=>{try{allowed(v,source);return true}catch{return false}}));}
   }catch(error){await api('external',{sourceId:source.id,url:url.href,title:source.title,description:source.note,checkedAt:new Date().toISOString(),error:String(error.message).slice(0,200)}).catch(()=>{});}
   progress[source.id]={day,count,seen:[...seen],pending:queue,done:false};await save();
  }
  progress[source.id]={day,count,seen:[...seen],pending:queue,done:!stop()&&(queue.length===0||count>=100)};await save();console.log('외부 출처 '+source.name+': '+count+'개 확인 (제목·설명·링크)');
 }
}
