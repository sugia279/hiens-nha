/** postgres.js serializes jsonb parameters itself; PGlite takes serialized JSON text. */
export function postgresAdapter(sql){return {query:async(query,args=[])=>{
 const values=[...args];for(const match of query.matchAll(/\$(\d+)\s*::\s*jsonb\b/gi)){const at=Number(match[1])-1;if(typeof values[at]==='string')values[at]=JSON.parse(values[at]);}
 return {rows:await sql.unsafe(query,values)};
}};}
