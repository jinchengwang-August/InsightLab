import assert from "node:assert/strict";
import test from "node:test";
import { handleCleanupPreview } from "../app/api/admin/cleanup-preview/handler.ts";
import { buildCleanupPreview } from "../app/api/admin/cleanup-preview/core.ts";
import {
  cleanupPreviewCopy,
  CleanupPreviewRequestError,
  requestCleanupPreview,
} from "../app/admin/cleanup-preview-ui.ts";
import { getAdminAccessStatus } from "../app/api/admin/access.ts";

const adminIdentity={email:" admin@example.test "};
const nonAdminIdentity={email:"member@example.test"};
const emptyResources={db:{},bucket:{}};

function dependencies(user,buildPreview=async()=>({readOnly:true,records:{profiles:{total:2,nonAdminOwned:1,affected:1}}})) {
  return {
    getUser:async()=>user,
    getEnvironment:async()=>({
      adminAllowlist:"ADMIN@example.test",
      ...emptyResources,
    }),
    buildPreview,
  };
}

test("shared Admin authorization preserves GET and POST access outcomes",()=>{
  const allowlist=" ADMIN@example.test ";
  assert.equal(getAdminAccessStatus(null,allowlist),401);
  assert.equal(getAdminAccessStatus(nonAdminIdentity,allowlist),403);
  assert.equal(getAdminAccessStatus(adminIdentity,allowlist),200);
});

test("cleanup preview returns 401 without a verified Supabase identity",async()=>{
  const response=await handleCleanupPreview(new Request("http://localhost/api/admin/cleanup-preview"),dependencies(null));
  assert.equal(response.status,401);
  assert.equal(response.headers.get("cache-control"),"no-store");
});

test("cleanup preview returns 403 for a verified non-Admin identity",async()=>{
  const response=await handleCleanupPreview(new Request("http://localhost/api/admin/cleanup-preview?email=admin@example.test"),dependencies(nonAdminIdentity));
  assert.equal(response.status,403);
  assert.equal(response.headers.get("cache-control"),"no-store");
});

test("cleanup preview allows a normalized Admin identity and returns anonymous counts",async()=>{
  const response=await handleCleanupPreview(new Request("http://localhost/api/admin/cleanup-preview"),dependencies(adminIdentity));
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal(body.readOnly,true);
  assert.equal(body.records.profiles.nonAdminOwned,1);
  const serialized=JSON.stringify(body);
  assert.doesNotMatch(serialized,/@example\.test/i);
  assert.doesNotMatch(serialized,/avatars\/|study-files\//i);
  assert.doesNotMatch(serialized,/"(?:email|userId|objectKey|filename)"\s*:/i);
});

class ReadOnlyD1 {
  constructor({tables=[],columns={},profileObjects=[]}={}) {
    this.tables=tables;
    this.columns=columns;
    this.profileObjects=profileObjects;
    this.sql=[];
  }

  prepare(sql) {
    this.sql.push(sql);
    const {tables,columns,profileObjects}=this;
    return {
      bindings:[],
      bind(...values){this.bindings=values;return this;},
      async first(){
        return {count:0};
      },
      async all(){
        if(/sqlite_master/i.test(sql))return {results:tables.map(name=>({name}))};
        const pragma=sql.match(/PRAGMA table_info\("([A-Za-z0-9_]+)"\)/i);
        if(pragma)return {results:(columns[pragma[1]]??[]).map(name=>({name}))};
        if(/SELECT email AS owner, avatar_key AS key FROM profiles/i.test(sql)){
          return {results:profileObjects};
        }
        return {results:[]};
      },
    };
  }
}

class ReadOnlyBucket {
  constructor({existing=[],listed=[],pages={}}={}) {
    this.existing=new Set(existing);
    this.listed=listed;
    this.operations=[];
    this.pages=pages;
  }
  async head(key){
    this.operations.push({method:"head",key});
    return this.existing.has(key)?{key}:null;
  }
  async list({prefix,cursor}){
    this.operations.push({method:"list",prefix,cursor});
    if(this.pages[prefix])return this.pages[prefix][cursor??"first"];
    return {
      objects:this.listed.filter(key=>key.startsWith(prefix)).map(key=>({key})),
      truncated:false,
    };
  }
}

test("cleanup preview handles an empty production database without writes",async()=>{
  const db=new ReadOnlyD1();
  const bucket=new ReadOnlyBucket();
  const preview=await buildCleanupPreview(db,bucket,["admin@example.test"]);
  assert.equal(preview.schema.tableCount,0);
  assert.equal(preview.records.profiles.total,0);
  assert.equal(preview.crossUser.potentialOrphans,0);
  assert.deepEqual(preview.r2,{adminObjects:0,nonAdminObjects:0,metadataMissingObject:0,objectsWithoutOwnership:0});
  assert.equal(preview.incomplete,false);
  assert.ok(db.sql.every(sql=>/^\s*(SELECT|PRAGMA)\b/i.test(sql)));
  assert.ok(bucket.operations.every(operation=>["head","list"].includes(operation.method)));
});

test("R2 discovery follows cursors and marks an invalid truncated listing incomplete",async()=>{
  const pagedBucket=new ReadOnlyBucket({pages:{
    "avatars/":{
      first:{objects:[{key:"avatars/one"}],truncated:true,cursor:"next"},
      next:{objects:[{key:"avatars/two"}],truncated:false},
    },
    "study-files/":{first:{objects:[],truncated:false}},
  }});
  const complete=await buildCleanupPreview(new ReadOnlyD1(),pagedBucket,["admin@example.test"]);
  assert.equal(complete.r2.objectsWithoutOwnership,2);
  assert.equal(complete.incomplete,false);
  assert.deepEqual(pagedBucket.operations.filter(item=>item.prefix==="avatars/").map(item=>item.cursor),[undefined,"next"]);

  const invalidCursorBucket=new ReadOnlyBucket({pages:{
    "avatars/":{first:{objects:[{key:"avatars/one"}],truncated:true}},
    "study-files/":{first:{objects:[],truncated:false}},
  }});
  const incomplete=await buildCleanupPreview(new ReadOnlyD1(),invalidCursorBucket,["admin@example.test"]);
  assert.equal(incomplete.incomplete,true);
  assert.ok(incomplete.warnings.length>0);
});

test("R2 discovery stops at its page safety limit and reports partial counts",async()=>{
  const bucket=new ReadOnlyBucket();
  bucket.list=async({prefix,cursor})=>{
    bucket.operations.push({method:"list",prefix,cursor});
    const page=cursor?Number(cursor):1;
    return {objects:[],truncated:true,cursor:String(page+1)};
  };
  const preview=await buildCleanupPreview(new ReadOnlyD1(),bucket,["admin@example.test"]);
  assert.equal(preview.incomplete,true);
  assert.equal(bucket.operations.filter(item=>item.prefix==="avatars/").length,100);
  assert.equal(bucket.operations.filter(item=>item.prefix==="study-files/").length,100);
});

test("Admin cleanup UI only requests the read-only endpoint when explicitly invoked",async()=>{
  let calls=0;
  const apiFetch=async(input,init)=>{
    calls++;
    assert.equal(input,"/api/admin/cleanup-preview");
    assert.equal(init.method,"GET");
    return Response.json({
      readOnly:true,incomplete:false,warnings:[],schema:{missingExpectedTables:[],otherUserAssociatedTables:[]},
      records:{},crossUser:{},r2:{},
    });
  };
  assert.equal(calls,0);
  const preview=await requestCleanupPreview(apiFetch);
  assert.equal(calls,1);
  assert.equal(preview.readOnly,true);
});

test("Admin cleanup UI preserves 401 and 403 response types without exposing response bodies",async()=>{
  for(const status of [401,403,500]){
    await assert.rejects(
      requestCleanupPreview(async()=>new Response("private details",{status})),
      error=>error instanceof CleanupPreviewRequestError&&error.status===status&&!error.message.includes("private details"),
    );
  }
});

test("Admin cleanup UI provides complete English, Chinese, and Spanish safety copy",()=>{
  for(const locale of ["en","zh","es"]){
    const copy=cleanupPreviewCopy[locale];
    for(const key of ["title","safety","run","rescan","relogin","forbidden","serverError","incomplete"])assert.ok(copy[key]);
  }
  assert.equal(cleanupPreviewCopy.en.title,"User cleanup preview");
  assert.equal(cleanupPreviewCopy.zh.title,"用户清理预览");
  assert.equal(cleanupPreviewCopy.es.title,"Vista previa de limpieza");
});

test("cleanup preview discovers schema drift and counts R2 metadata without leaking keys",async()=>{
  const db=new ReadOnlyD1({
    tables:["profiles","responses","legacy_user_notes"],
    columns:{
      profiles:["id","email","avatar_key"],
      responses:["id"],
      legacy_user_notes:["id","user_email"],
    },
    profileObjects:[
      {owner:"admin@example.test",key:"avatars/admin/private.png"},
      {owner:"member@example.test",key:"avatars/member/private.png"},
      {owner:"member@example.test",key:"avatars/member/missing.png"},
    ],
  });
  const bucket=new ReadOnlyBucket({
    existing:["avatars/admin/private.png","avatars/member/private.png"],
    listed:["avatars/admin/private.png","avatars/member/private.png","avatars/orphan/private.png"],
  });
  const preview=await buildCleanupPreview(db,bucket,["ADMIN@example.test"]);
  assert.equal(preview.schema.tableCount,3);
  assert.equal(preview.records.responses.total,0);
  assert.equal(preview.schema.otherUserAssociatedTables[0].table,"legacy_user_notes");
  assert.equal(preview.r2.adminObjects,1);
  assert.equal(preview.r2.nonAdminObjects,1);
  assert.equal(preview.r2.metadataMissingObject,1);
  assert.equal(preview.r2.objectsWithoutOwnership,1);
  assert.ok(db.sql.every(sql=>/^\s*(SELECT|PRAGMA)\b/i.test(sql)));
  assert.ok(bucket.operations.every(operation=>["head","list"].includes(operation.method)));
  const serialized=JSON.stringify(preview);
  assert.doesNotMatch(serialized,/@example\.test/i);
  assert.doesNotMatch(serialized,/avatars\//i);
});
