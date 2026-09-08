import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {createCanvas} from '@napi-rs/canvas';
import {createExtractor,safeZip,htmlText} from './extract.mjs';
import fs from 'node:fs/promises';
const extractor=await createExtractor({ocr:'off'});async function read(bytes,name){const result=[];for await(const s of extractor.extract(bytes,name))result.push(s);return result;}
try{
 const word=zipSync({'word/document.xml':strToU8('<w:document xmlns:w="w"><w:body><w:p><w:r><w:t>00123</w:t></w:r></w:p><w:p><w:r><w:t>&#xD55C;&#xAE00; &quot;quote&quot;</w:t></w:r></w:p></w:body></w:document>')});
 assert.equal((await read(word,'sample.docx'))[0].text,'00123\n한글 "quote"\n');
 const code='처음\n'+'ordinary code\n'.repeat(9000)+'AFTER_100K_UNIQUE';assert((await read(strToU8(code),'source.ts'))[0].text.endsWith('AFTER_100K_UNIQUE'));
 assert.equal(htmlText('<h1>제목</h1><script>EVIL()</script><p>관성 내용</p>').includes('EVIL'),false);
 const archive=zipSync({'src/main.js':strToU8('const 관성 = 1;'),'notes.txt':strToU8('돌림힘')});assert.equal((await read(archive,'bundle.zip')).length,2);
 assert.throws(()=>safeZip(zipSync({'../escape.js':strToU8('bad')})));
 const canvas=createCanvas(800,1200),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,1200);ctx.fillStyle='black';ctx.font='42px sans-serif';ctx.fillText('INERTIA 2026',60,120);const bytes=await canvas.encode('png'),image=await read(bytes,'sample.png');assert(image[0].previews.thumbnail.length>0);assert(image[0].unsupported);await fs.mkdir('.indexer/fixtures',{recursive:true});await fs.writeFile('.indexer/fixtures/sample.png',bytes);await fs.writeFile('.indexer/fixtures/sample.docx',word);await fs.writeFile('.indexer/fixtures/bundle.zip',archive);
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',null,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];for(const [i,text]of [[3,'INERTIA text based PDF test page with enough words for text extraction.'],[5,'LAST_PAGE_UNIQUE torque momentum physics exercise.']]){const stream='BT /F1 14 Tf 40 780 Td ('+text+') Tj ET';objects[i]='<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream';}let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}const xref=Buffer.byteLength(pdf);pdf+='xref\n0 8\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';const pdfBytes=Buffer.from(pdf);const pages=await read(pdfBytes,'sample.pdf');assert.equal(pages.length,2);assert(pages[1].text.includes('LAST_PAGE_UNIQUE'));assert(pages[0].previews.thumbnail.length>0);await fs.writeFile('.indexer/fixtures/sample.pdf',pdfBytes);
 console.log(JSON.stringify({passed:true,checks:['Office exact text/entities','long code','HTML script exclusion','ZIP paths','image previews','PDF pages/previews'],fixtureDirectory:'.indexer/fixtures'}));
}finally{await extractor.close();}
