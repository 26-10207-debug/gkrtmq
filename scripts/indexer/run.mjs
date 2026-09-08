import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createExtractor,PROCESSOR_VERSION} from './extract.mjs';
import {crawlSources} from './sources.mjs';
const args=process.argv.slice(2),command=args[0]||'status',configPath=process.env.DCL_INDEXER_CONFIG||path.resolve('.indexer/config.json');
const config=JSON.parse(await fs.readFile(configPath,'utf8'));const origin=new URL(config.site).origin;
if(!origin.startsWith('https://')&&!/^http:\/\/(127\.0\.0\.1|localhost):/.test(origin))throw new Error('HTTPS 사이트 주소가 필요합니다.');
if(typeof config.token!=='string'||config.token.length<32)throw new Error('처리기 인증을 설정해 주세요.');
const stateDir=path.resolve('.indexer');await fs.mkdir(stateDir,{recursive:true});let stopping=false;process.on('SIGINT',()=>{stopping=true;console.log('현재 구간 저장 후 중지합니다. 다시 run으로 이어갈 수 있습니다.');});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(action,body={},method='POST'){
 const response=await fetch(origin+'/api/indexer'+(method==='GET'?'?action='+action:''),{method,headers:{Authorization:'Bearer '+config.token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify({action,...body})}:{}),signal:AbortSignal.timeout(60000)});
 const result=await response.json().catch(()=>({error:'처리 서버 응답 오류'}));if(!response.ok){const error=new Error(result.error||'처리 서버 오류');error.status=response.status;if([429,507].includes(response.status)||/quota|limit|storage|크기 한도/i.test(error.message))stopping=true;throw error;}return result;
}
if(command==='status'){const status=await api('status',{},'GET');console.log(JSON.stringify({documents:status.documents,jobs:status.jobs,chunks:status.chunks,control:status.control},null,2));}
else if(command==='inventory'){const list=[];let offset=0;do{const r=await fetch(origin+'/api/indexer?action=inventory&offset='+offset,{headers:{Authorization:'Bearer '+config.token}});if(!r.ok)throw new Error('목록 읽기 실패');const data=await r.json();list.push(...data.documents);offset=data.nextOffset;}while(offset!==null);const output=path.join(stateDir,'inventory.json');await fs.writeFile(output,JSON.stringify(list,null,2));console.log('공개 자료 목록 저장: '+output);}
else if(command==='seed'){for(const kind of ['contribution','reference','folder','builtin']){let offset=0;do{const result=await api('seed',{kind,offset});console.log(kind+': '+(offset+result.count));offset=result.nextOffset;}while(offset!==null&&!stopping);}await api('source-seeds');}
else if(command==='activate'||command==='rollback')console.log(await api('activate',{active:command==='activate'}));
else if(command==='pause'||command==='resume')console.log(await api('pause',{paused:command==='pause'}));
else if(command==='retry'){if(!args[1])throw new Error('retry 뒤에 공개 자료 ID를 지정해 주세요.');console.log(await api('retry',{documentId:args[1],processorVersion:PROCESSOR_VERSION}));}
else if(command==='crawl'){await crawlSources({api,stateDir,stop:()=>stopping});}
else if(command==='run'){
 const extractor=await createExtractor({cachePath:path.join(stateDir,'ocr-cache'),ocr:config.ocr||'auto'});await fs.mkdir(path.join(stateDir,'ocr-cache'),{recursive:true});
 try{do{
  const {job,paused}=await api('claim');if(!job){if(args.includes('--watch')&&!stopping){if(!paused&&!args.includes('--no-crawl'))await crawlSources({api,stateDir,stop:()=>stopping});await sleep(30000);continue;}console.log(paused?'서버 처리 대기열이 일시 중지되어 있습니다.':'대기 파일 처리가 끝났습니다.');break;}
  const auth={jobId:job.id,leaseToken:job.leaseToken};let lost=false;const heartbeat=setInterval(()=>{void api('heartbeat',auth).catch(()=>{lost=true})},30000);
  const progress=job.progress?.processorVersion===PROCESSOR_VERSION?job.progress:{};let warnings=Array.isArray(progress.warnings)?progress.warnings:[],supported=Number(progress.supported||0),unsupported=Number(progress.unsupported||0),ordinal=Number(progress.nextOrdinal||0);const hashes=Array.isArray(progress.hashes)?progress.hashes:[];
  console.log('자료 처리 '+job.documentId+' (시도 중; 본문은 로그에 기록하지 않습니다.)');
  try{
   if(!progress.started)await api('page',{...auth,reset:true,sections:[],progress:{started:true,processorVersion:PROCESSOR_VERSION}});
   for(let attachment=0;attachment<job.attachments.length&&!stopping;attachment++){
    if(progress.lastAttachment>attachment&&hashes[attachment])continue;
    if(lost)throw new Error('작업 연결이 변경되었습니다.');
    const file=job.attachments[attachment],url=new URL(file.url,origin);if(url.origin!==origin)throw new Error('원본 주소가 사이트 밖입니다.');
    const response=await fetch(url,{signal:AbortSignal.timeout(120000),redirect:'error'});if(!response.ok)throw new Error('공개 원본 다운로드 실패');const reader=response.body.getReader(),parts=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20*1024*1024){await reader.cancel();throw new Error('파일 20MB 한도');}parts.push(value);}const bytes=Buffer.concat(parts);hashes[attachment]=crypto.createHash('sha256').update(bytes).digest('hex');
    const skipPages=progress.lastAttachment===attachment&&/\.pdf$/i.test(file.originalName)?Number(progress.lastPage||0):0;let sectionNo=skipPages?Number(progress.lastSection)+1:0;for await(const section of extractor.extract(bytes,file.originalName,{skipPages})){
     sectionNo++;if(progress.lastAttachment>attachment||(progress.lastAttachment===attachment&&progress.lastSection>=sectionNo-1)){continue;}
     if(lost)throw new Error('작업 연결이 변경되었습니다.');
     const {previews,...content}=section;warnings.push(...(content.warnings||[]));warnings=[...new Set(warnings)].slice(0,12);if(content.unsupported)unsupported++;else supported++;
     if(previews&&attachment===0&&sectionNo===1){for(const [kind,image]of Object.entries(previews)){const r=await fetch(origin+'/api/indexer/preview?'+new URLSearchParams({jobId:job.id,kind}),{method:'POST',headers:{Authorization:'Bearer '+config.token,'x-job-lease':job.leaseToken,'Content-Type':'image/webp'},body:image,signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error('미리보기 저장 실패');}progress.previewsDone=true;}
     const chars=Array.from(content.text);const count=Math.max(1,Math.ceil(chars.length/14000));
     for(let part=0;part<count;part++){
      const nextProgress={started:true,processorVersion:PROCESSOR_VERSION,nextOrdinal:part===count-1?ordinal+1:Number(progress.nextOrdinal||0),hashes,previewsDone:progress.previewsDone,lastPage:part===count-1?content.page:progress.lastPage,lastAttachment:part===count-1?attachment:(progress.lastAttachment??-1),lastSection:part===count-1?sectionNo-1:(progress.lastSection??-1),warnings,supported,unsupported};
      await api('page',{...auth,resetSection:part===0,sections:[{text:chars.slice(part*14000,part*14000+14180).join(''),attachment,page:content.page,path:content.path,line:content.line===undefined?undefined:content.line+chars.slice(0,part*14000).join('').split('\n').length-1,ordinal:ordinal++,method:content.method,confidence:content.confidence}],progress:nextProgress});if(part===count-1)Object.assign(progress,nextProgress);
     }
     console.log('  첨부 '+(attachment+1)+' · '+(content.page?content.page+'쪽':sectionNo+'구간')+' 저장');
     if(stopping)break;
    }
   }
   if(stopping){await api('release',auth);break;}
   const status=supported===0&&unsupported>0?'unsupported':warnings.length||unsupported?'partial':'completed';
   await api('finish',{...auth,status,message:warnings.join(' · '),hash:crypto.createHash('sha256').update(hashes.join('|')).digest('hex'),processorVersion:PROCESSOR_VERSION});console.log('처리 상태: '+status);
  }catch(error){if(!lost){try{await api('fail',{...auth,message:/quota|limit|storage/i.test(error.message)?'서버 저장·요청 한도: 처리 중지':'파일 처리 실패: '+String(error.message).slice(0,250)})}catch{/* Lost leases must not be written again. */}}console.error('처리 실패 ('+(error.status||'extract')+'): '+String(error.message).slice(0,200));if(error.status===429||stopping)break;await sleep(2000);}
  finally{clearInterval(heartbeat);}
 }while(!stopping);
 if(!stopping&&!args.includes('--no-crawl')){try{await crawlSources({api,stateDir,stop:()=>stopping})}catch{console.log('외부 출처 갱신은 다음 실행에서 다시 확인합니다.');}}
 }finally{await extractor.close();}
}else throw new Error('명령: status | inventory | seed | run | crawl | pause | resume | retry ID | activate | rollback');
