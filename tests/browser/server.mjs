import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
const root=resolve(process.env.PLAYWRIGHT_DIST ?? '.pilot-dist');
const base=process.env.PLAYWRIGHT_BASE_PATH ?? '/hiens-nha/';
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');if(!url.pathname.startsWith(base)){res.writeHead(404);res.end();return;}
    let file=resolve(root,decodeURIComponent(url.pathname.slice(base.length)));
    const within=relative(root,file);
    if(within==='..'||within.startsWith('..\\')||within.startsWith('../')||isAbsolute(within))throw Error();if((await stat(file)).isDirectory())file=join(file,'index.html');
    const types={js:'application/javascript',css:'text/css',html:'text/html',json:'application/json',svg:'image/svg+xml',webp:'image/webp',png:'image/png',woff2:'font/woff2'};
    res.writeHead(200,{'content-type':types[file.split('.').pop()]??'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
}).listen(4321,'127.0.0.1');
