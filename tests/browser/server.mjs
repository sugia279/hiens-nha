import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve } from 'node:path';
const root=resolve('.pilot-dist');
createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');if(!url.pathname.startsWith('/hiens-nha/')){res.writeHead(404);res.end();return;}
    let file=resolve(root,decodeURIComponent(url.pathname.slice('/hiens-nha/'.length)));
    if(file!==root&&!file.startsWith(root+'/'))throw Error();if((await stat(file)).isDirectory())file+='/index.html';
    const types={js:'application/javascript',css:'text/css',html:'text/html',json:'application/json',svg:'image/svg+xml',webp:'image/webp',png:'image/png',woff2:'font/woff2'};
    res.writeHead(200,{'content-type':types[file.split('.').pop()]??'application/octet-stream','cache-control':'no-store'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
}).listen(4321,'127.0.0.1');
