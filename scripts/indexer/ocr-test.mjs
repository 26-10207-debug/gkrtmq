import {createExtractor} from './extract.mjs';
import fs from 'node:fs/promises';
const start=performance.now(),extractor=await createExtractor({cachePath:'.indexer/ocr-cache',ocr:'auto'});await fs.mkdir('.indexer/ocr-cache',{recursive:true});
try{const bytes=await fs.readFile('.indexer/fixtures/sample.png');for await(const result of extractor.extract(bytes,'sample.png')){const passed=/INERTIA/i.test(result.text)&&/2026/.test(result.text);console.log(JSON.stringify({passed,confidence:result.confidence,elapsedMs:Math.round(performance.now()-start),languages:['kor','eng']}));if(!passed)process.exitCode=1;}}finally{await extractor.close();}
